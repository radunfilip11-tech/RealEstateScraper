/**
 * Continuous Njuškalo Real Estate Monitor
 * 
 * Runs as a long-lived background process. Cycles through assigned real estate
 * categories, detecting new ads and saving ALL ads (private + agency) to the
 * listings table. Users filter by advertiser_type in the UI.
 * 
 * Usage: npm run monitor -- --worker-id 1
 * 
 * Architecture:
 *   1. A single Playwright browser stays alive across all cycles.
 *   2. For each category, we load page 1 (Playwright, needed for JS rendering).
 *   3. We compare the external_ids against the listings table to find truly new ads.
 *   4. Classification (private/agency) is done from the search-page JSON
 *      (isOwnerResidentialSeller) — no detail pages needed.
 *   5. ALL ads are saved to the listings table.
 *   6. After all categories, we rest and repeat.
 * 
 * Weighted Load Balancing (2 workers):
 *   Worker 1: High-traffic sprint — only 4 categories (~1min cycle).
 *             stanovi, kuce, zemljista, najam_stanova.
 *   Worker 2: Full coverage — all 17 categories (~4-5min cycle).
 *             High-traffic categories interleaved for even spacing.
 *   Combined: high-traffic scanned every ~50s, low-traffic every ~4-5min.
 */

import {
  CATEGORIES,
  WORKER_CATEGORIES,
  NJUSKALO_BASE,
  scrapeSearchPageOnly,
  scrapeSearchPagesUntilKnown,
  randomDelay,
  fetchDetailPagePlaywright,
} from "../src/lib/scraper/njuskalo";
import { runNotificationPoll } from "../src/lib/notifications/poll";
import { DEFAULT_SCRAPER_CONFIG, type ScraperConfig } from "../src/lib/supabase/types";

// ---------------------------------------------------------------------------
// Supabase client via server helper (service role key, Node 20 ws transport).
// ---------------------------------------------------------------------------
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { getSupabaseServerClient } from "../src/lib/supabase/server";


// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ---------------------------------------------------------------------------
// Parse CLI arguments for worker ID
// ---------------------------------------------------------------------------
function parseArgs(): { workerId: number; site: "njuskalo" | "oglasnik" } {
  const args = process.argv.slice(2);
  let workerId = 1;
  let site: "njuskalo" | "oglasnik" = "njuskalo";
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--worker-id" && args[i + 1]) {
      const id = parseInt(args[i + 1], 10);
      if (!isNaN(id) && id > 0) workerId = id;
      i++;
    } else if (args[i] === "--site" && args[i + 1]) {
      const s = args[i + 1].toLowerCase();
      if (s === "njuskalo" || s === "oglasnik") {
        site = s;
      }
      i++;
    }
  }
  return { workerId, site };
}

const { workerId: WORKER_ID, site: SITE } = parseArgs();
const WORKER_TAG = `[W${WORKER_ID}${SITE === "oglasnik" ? "-O" : ""}]`;

// Define PID file path (per-worker)
const PID_FILE = path.resolve(__dirname, `../monitor-${WORKER_ID}.pid`);

let supabase: ReturnType<typeof getSupabaseServerClient>;
try {
  supabase = getSupabaseServerClient();
} catch (err) {
  console.error(`${WORKER_TAG} Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CATEGORY_DELAY_MS = { min: 6000, max: 17000 }; // 15-45s between categories (human browsing pace)
const CYCLE_REST_MS = { min: 10000, max: 20000 };      // 30-90s rest between full cycles
const BLOCKED_BACKOFF_MS = 600000;                      // 10 min backoff if blocked

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];

// ---------------------------------------------------------------------------
// Proxy configuration (IPRoyal residential — ALL Njuškalo traffic)
// Sticky format: password_country-XX_session-XXXXXXXX_lifetime-30m
// Docs: session ID MUST be exactly 8 alphanumeric chars, or sticky is ignored.
// ---------------------------------------------------------------------------
const PROXY_HOST = process.env.PROXY_HOST || "";
const PROXY_PORT = process.env.PROXY_PORT || "";
const PROXY_USER = process.env.PROXY_USER || "";
const PROXY_PASS = process.env.PROXY_PASS || "";
const PROXY_ENABLED = !!(PROXY_HOST && PROXY_PORT && PROXY_USER && PROXY_PASS);

/** Strip prior sticky tags so we never duplicate _session/_lifetime on rotate. */
function stripStickyTags(pass: string): string {
  return pass
    .replace(/_session-[a-zA-Z0-9]+/g, "")
    .replace(/_lifetime-[0-9]+[smhd]/gi, "");
}

/** IPRoyal requires exactly 8 alphanumeric characters for sticky sessions. */
function makeSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Build sticky-session password. Same sessionId = same residential IP.
 * Lifetime 30m covers a full cycle + backoff without mid-cycle IP flips.
 */
function proxySessionPass(sessionId: string): string {
  const base = stripStickyTags(PROXY_PASS);
  return `${base}_session-${sessionId}_lifetime-30m`;
}

/** Heavy assets to abort on ALL proxy pages — listing HTML/JS is enough to scrape. */
const BLOCKED_RESOURCE_TYPES = ["image", "stylesheet", "font", "media", "other"];

/**
 * Third-party ad/analytics hosts — measured to be ~99% of a "lean" (no
 * images/CSS/fonts) search page's bytes (1105 KB -> 8 KB with these blocked,
 * same card count parsed). These add zero scraping value. Substring match
 * against the full request URL, independent of resourceType (GTM is
 * "script", analytics beacons are "xhr"/"ping"/"image", etc).
 */
const BLOCKED_AD_HOSTS = [
  "googletagmanager.com",
  "google-analytics.com",
  "googlesyndication.com",
  "doubleclick.net",
  "googleadservices.com",
  "adservice.google.com",
  "analytics.tiktok.com",
  "connect.facebook.net",
  "facebook.com/tr",
  "criteo.com",
  "taboola.com",
  "outbrain.com",
  "privacy-center.org",
  "dotmetrics.net",
  "static.njuskalo.hr/dist/",
];

/**
 * Apply bandwidth saver to a page. Blocks images/CSS/fonts/media AND known
 * ad/analytics hosts. Keeps njuskalo.hr document/script/xhr so Vue can still
 * render listing cards.
 */
async function applyBandwidthSaver(pg: any): Promise<void> {
  await pg.route("**/*", (route: any) => {
    const request = route.request();
    const resourceType = request.resourceType();
    if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
      return route.abort();
    }
    const url = request.url();
    if (BLOCKED_AD_HOSTS.some((host) => url.includes(host))) {
      return route.abort();
    }
    return route.continue();
  });
}

// Helper to log to both console and Supabase
async function dbLog(message: string, level: "info" | "success" | "warning" | "error" = "info") {
  const taggedMessage = `${WORKER_TAG} ${message}`;
  console.log(taggedMessage);
  await (supabase as any).from("scraper_console_logs").insert({ message: taggedMessage, level });
}

/**
 * Fetch dynamic scraper settings from Supabase `scraper_config` table.
 * Falls back to DEFAULT_SCRAPER_CONFIG if table is missing or query fails.
 */
async function fetchScraperConfig(): Promise<ScraperConfig> {
  const config: ScraperConfig = { ...DEFAULT_SCRAPER_CONFIG };
  try {
    const { data, error } = await (supabase as any)
      .from("scraper_config")
      .select("key, value");

    if (!error && data) {
      for (const row of data) {
        if (row.key in config) {
          try {
            (config as any)[row.key] =
              typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          } catch {
            (config as any)[row.key] = row.value;
          }
        }
      }
    }
  } catch (err) {
    /* fallback to defaults */
  }
  return config;
}

/**
 * Sleep helper that breaks early if PID file is deleted or shuttingDown flag is set.
 */
async function interruptibleSleep(ms: number): Promise<void> {
  const checkInterval = 2000;
  let elapsed = 0;
  while (elapsed < ms) {
    if (!fs.existsSync(PID_FILE)) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(checkInterval, ms - elapsed)));
    elapsed += checkInterval;
  }
}


// ---------------------------------------------------------------------------
// Bandwidth metering — approximate bytes transferred per cycle (via
// Content-Length response headers). No CDP needed; resets every cycle so
// scrape_runs.proxy_bytes reflects one cycle's traffic for the dashboard.
// ---------------------------------------------------------------------------
let cycleProxyBytes = 0;

function attachByteCounter(pg: any): void {
  pg.on("response", (res: any) => {
    try {
      const len = res.headers()["content-length"];
      if (len) cycleProxyBytes += parseInt(len, 10) || 0;
    } catch {
      /* ignore — best-effort metering only */
    }
  });
}


// ---------------------------------------------------------------------------
// Stats tracking
// ---------------------------------------------------------------------------
let totalCycles = 0;
let totalNewAds = 0;
let totalPrivateAds = 0;
const startTime = Date.now();

function formatUptime(): string {
  const ms = Date.now() - startTime;
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

// ---------------------------------------------------------------------------
// Main monitor loop
// ---------------------------------------------------------------------------
async function runMonitor() {
  // Write PID file to signal that the monitor is running
  fs.writeFileSync(PID_FILE, process.pid.toString(), "utf-8");

  await dbLog("╔══════════════════════════════════════════════════╗", "success");
  await dbLog(`║  Njuškalo Monitor — Worker ${WORKER_ID} Starting Up       ║`, "success");
  await dbLog("╚══════════════════════════════════════════════════╝", "success");
  // Get categories for this worker (fallback to all if not defined)
  const categoryKeys = WORKER_CATEGORIES[WORKER_ID] || Object.keys(CATEGORIES);
  await dbLog(`Monitoring ${categoryKeys.length} categories (Worker ${WORKER_ID}).`, "info");
  await dbLog(`Mode: All ads (private + agency) saved to listings`, "info");
  await dbLog(`Category delay: ${CATEGORY_DELAY_MS.min / 1000}-${CATEGORY_DELAY_MS.max / 1000}s`, "info");
  await dbLog(`Cycle rest: ${CYCLE_REST_MS.min / 1000}-${CYCLE_REST_MS.max / 1000}s`, "info");
  await dbLog(`Category order: ${categoryKeys.join(" → ")}`, "info");
  await dbLog("", "info");

  // Launch Playwright with stealth (stays alive across all cycles)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright-extra");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  chromium.use(StealthPlugin());

  const BROWSER_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
  ];

  const BASE_CONTEXT_OPTS = {
    locale: "hr-HR" as const,
    timezoneId: "Europe/Zagreb",
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: {
      "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  };

  /**
   * Single proxy context + two pages (search + detail).
   * Same context = shared cookies + same sticky residential IP.
   * Previous dual-context setup used different sessions → different IPs and
   * no shared ShieldSquare cookies → instant re-blocks.
   */
  async function createProxyBundle(
    br: any,
    ua: string,
    sessionId: string,
  ): Promise<{ ctx: any; searchPage: any; detailPage: any; sessionId: string } | null> {
    if (!PROXY_ENABLED) return null;

    const ctx = await br.newContext({
      ...BASE_CONTEXT_OPTS,
      userAgent: ua,
      proxy: {
        server: `http://${PROXY_HOST}:${PROXY_PORT}`,
        username: PROXY_USER,
        password: proxySessionPass(sessionId),
      },
    });

    const searchPg = await ctx.newPage();
    const detailPg = await ctx.newPage();

    // Block heavy assets on BOTH pages — search thumbnails were burning GBs.
    // Scripts/XHR still load so Vue listing cards can render for parsing.
    await applyBandwidthSaver(searchPg);
    await applyBandwidthSaver(detailPg);
    attachByteCounter(searchPg);
    attachByteCounter(detailPg);

    return { ctx, searchPage: searchPg, detailPage: detailPg, sessionId };
  }

  /** Verify egress IP through the sticky session (fails loud if proxy broken). */
  async function verifyProxyEgress(pg: any): Promise<string | null> {
    try {
      const resp = await pg.goto("https://ipv4.icanhazip.com", {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      // IPRoyal returns 402 when the account has no traffic credit left
      if (resp && resp.status() === 402) {
        await dbLog(
          `❌ Proxy HTTP 402 Payment Required — IPRoyal account has no credit/bandwidth. Top up at dashboard.iproyal.com`,
          "error",
        );
        return null;
      }
      const ip = ((await pg.textContent("body")) || "").trim();
      // Tunnel failures sometimes land on empty/error pages
      if (!ip || ip.length > 45 || /error|denied|payment/i.test(ip)) {
        await dbLog(`Proxy IP check returned unexpected body: "${ip.slice(0, 80)}"`, "error");
        return null;
      }
      return ip;
    } catch (err) {
      const msg = (err as Error).message || "";
      if (/ERR_TUNNEL|ERR_PROXY|402/.test(msg)) {
        await dbLog(
          `❌ Proxy tunnel failed (${msg.split("\n")[0]}). Check IPRoyal balance + credentials.`,
          "error",
        );
      } else {
        await dbLog(`Proxy IP check failed: ${msg}`, "error");
      }
      return null;
    }
  }

  let browser = await chromium.launch({
    headless: true,
    args: BROWSER_ARGS,
  });

  let userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  let stickySessionId = makeSessionId();

  // Native-IP fallback context (only used when PROXY_* not set)
  let context = await browser.newContext({
    ...BASE_CONTEXT_OPTS,
    userAgent,
  });
  let page = await context.newPage();
  attachByteCounter(page);

  let proxyBundle = await createProxyBundle(browser, userAgent, stickySessionId);
  let searchPage = proxyBundle?.searchPage || page;
  let detailPage = proxyBundle?.detailPage || page;

  await dbLog(`Browser launched. User-Agent: ${userAgent.substring(0, 50)}...`, "info");
  if (PROXY_ENABLED && proxyBundle) {
    await dbLog(
      `🌐 Proxy ENABLED: ${PROXY_HOST}:${PROXY_PORT} (sticky session ${stickySessionId})`,
      "success",
    );
  } else {
    await dbLog(`⚠️  Proxy NOT configured — all traffic via native IP`, "warning");
  }

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await dbLog("Shutting down gracefully...", "warning");
    try { if (proxyBundle) await proxyBundle.ctx.close(); } catch { /* ignore */ }
    try { await context.close(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
    await dbLog(`Final stats: ${totalCycles} cycles, ${totalNewAds} new ads found, ${totalPrivateAds} private ads. Uptime: ${formatUptime()}`, "success");

    // Remove PID file
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Verify proxy BEFORE scraping — never fall through to native IP when PROXY_* is set
  if (PROXY_ENABLED && proxyBundle) {
    const egressIp = await verifyProxyEgress(searchPage);
    if (egressIp) {
      await dbLog(`🌐 Egress IP: ${egressIp}`, "success");
    } else {
      await dbLog(
        `🛑 Proxy dead at startup — refusing to scrape on native IP (would burn it). Fix IPRoyal billing, then restart.`,
        "error",
      );
      await shutdown();
      return;
    }
  }
  await dbLog("", "info");

  // -----------------------------------------------------------------------
  // Infinite loop
  // -----------------------------------------------------------------------
  while (!shuttingDown) {
    // Check if PID file was deleted by the UI
    if (!fs.existsSync(PID_FILE)) {
      await dbLog("PID file missing. UI requested shutdown.", "warning");
      await shutdown();
      break;
    }

    // Fetch dynamic scraper config from Supabase
    const activeConfig = await fetchScraperConfig();

    // Check if workers are remotely disabled
    if (!activeConfig.workers_enabled) {
      await dbLog("⚠️ Workers remotely disabled via UI config. Pausing 60s...", "warning");
      await interruptibleSleep(60000);
      continue;
    }

    // Check Night Window (Croatia Time)
    const croatiaTimeStr = new Date().toLocaleString("en-US", { timeZone: "Europe/Zagreb" });
    const croatiaHour = new Date(croatiaTimeStr).getHours();
    const nightStart = activeConfig.night_start_hour;
    const nightEnd = activeConfig.night_end_hour;
    const inNightWindow =
      nightStart < nightEnd
        ? croatiaHour >= nightStart && croatiaHour < nightEnd
        : croatiaHour >= nightStart || croatiaHour < nightEnd;

    if (inNightWindow) {
      await dbLog(
        `🌙 Noćni radni režim (aktivna pauza od ${nightStart}:00 do ${nightEnd}:00 sati po HR vremenu). Spavanje 15 minuta...`,
        "info"
      );
      await interruptibleSleep(15 * 60 * 1000);
      continue;
    }

    totalCycles++;
    const cycleStart = Date.now();
    let cycleNewAds = 0;
    let cyclePrivateAds = 0;
    let blocked = false;
    cycleProxyBytes = 0;

    const workerIntervalMin =
      WORKER_ID === 1 ? activeConfig.w1_interval_min : activeConfig.w2_interval_min;

    await dbLog(`\n${"═".repeat(60)}`, "info");
    await dbLog(
      `Cycle #${totalCycles} starting — ${new Date().toLocaleString("hr-HR")} (Period: ${workerIntervalMin} min, Max pages: ${activeConfig.max_pages_per_category})`,
      "info"
    );
    await dbLog(`${"═".repeat(60)}`, "info");

    // Pre-fetch all known external_ids from listings table for dedup
    const fetchAllExternalIds = async (table: string): Promise<string[]> => {
      const ids: string[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select("external_id")
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        ids.push(...data.map((row: any) => row.external_id));
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      return ids;
    };

    let listingIds: string[] = [];
    try {
      listingIds = await fetchAllExternalIds("listings");
    } catch (err: any) {
      await dbLog(`Failed to fetch known IDs: ${err.message}`, "error");
      await interruptibleSleep(30000);
      continue;
    }

    const knownIds = new Set<string>(listingIds);
    await dbLog(`Database has ${knownIds.size} known listings.`, "info");

    // Cycle through all categories
    for (let i = 0; i < categoryKeys.length; i++) {
      if (shuttingDown) break;

      if (!fs.existsSync(PID_FILE)) {
        await dbLog("PID file missing. Stopping mid-cycle.", "warning");
        await shutdown();
        break;
      }

      const category = categoryKeys[i];
      await dbLog(`\n── Category ${i + 1}/${categoryKeys.length}: ${category} ──`, "info");

      // Incremental scan: scrape pages 1..N until an entire page of known ads is reached
      const result = await scrapeSearchPagesUntilKnown(
        searchPage,
        category,
        knownIds,
        activeConfig.max_pages_per_category
      );

      let softMiss = false;

      if (result.blocked) {
        const reason = result.blockReason || "unknown";
        const isProxyDead = /ERR_TUNNEL|ERR_PROXY|402|tunnel/i.test(reason);
        const isSoftMiss = reason === "no-cards-timeout" || reason === "zero-listings-parsed";

        if (isProxyDead) {
          await dbLog(
            `🛑 Proxy tunnel dead mid-run (${reason}). Stopping worker — top up IPRoyal, then restart.`,
            "error"
          );
          await shutdown();
          break;
        }

        if (isSoftMiss) {
          softMiss = true;
          await dbLog(`[${category}] ⚠️ Soft miss (${reason}) — skipping category.`, "warning");
        } else {
          await dbLog(
            `⚠️ BLOCKED (${reason})! Rotating sticky IP + backing off ${BLOCKED_BACKOFF_MS / 60000} min...`,
            "error"
          );
          blocked = true;

          try { if (proxyBundle) await proxyBundle.ctx.close(); } catch { /* ignore */ }
          try { await context.close(); } catch { /* ignore */ }
          try { await browser.close(); } catch { /* ignore */ }
          proxyBundle = null;

          await interruptibleSleep(BLOCKED_BACKOFF_MS);

          userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
          stickySessionId = makeSessionId();
          browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
          context = await browser.newContext({ ...BASE_CONTEXT_OPTS, userAgent });
          page = await context.newPage();
          attachByteCounter(page);
          proxyBundle = await createProxyBundle(browser, userAgent, stickySessionId);
          searchPage = proxyBundle?.searchPage || page;
          detailPage = proxyBundle?.detailPage || page;

          await dbLog(
            `Browser restarted — UA: ${userAgent.substring(0, 40)}... session: ${stickySessionId}`,
            "info"
          );
          if (proxyBundle) {
            const egressIp = await verifyProxyEgress(searchPage);
            if (egressIp) await dbLog(`🌐 New egress IP: ${egressIp}`, "success");
          }
          break;
        }
      }

      if (softMiss) {
        // Fall through
      } else if (result.listings.length === 0) {
        await dbLog(`[${category}] No new listings found (${result.pagesScanned} page(s) checked).`, "info");
      } else {
        const uniqueNewListings = result.listings.filter((l, index, self) =>
          index === self.findIndex((t) => t.external_id === l.external_id)
        );

        await dbLog(
          `[${category}] 🆕 ${uniqueNewListings.length} NEW ads detected across ${result.pagesScanned} page(s)!`,
          "info"
        );

        for (const listing of uniqueNewListings) {
          // If it's land, check detail page to be absolutely sure of the type and size
          if (category === "zemljista" || category === "najam_zemljista") {
            try {
              await randomDelay(1500, 3000);
              await dbLog(`[${category}] Fetching detail page for land type: ${listing.external_id}`, "info");
              const detail = await fetchDetailPagePlaywright(detailPage, listing.url);
              if (detail.landType) {
                listing.land_type = detail.landType;
              }
              if (detail.sizeM2) {
                listing.size_m2 = detail.sizeM2;
              }
            } catch (err: any) {
              await dbLog(`[${category}] Failed detail fetch for ${listing.external_id}: ${err.message}`, "warning");
            }
          }

          const isPrivate = listing.advertiser_type === "Privatni";
          if (isPrivate) {
            cyclePrivateAds++;
            await dbLog(
              `[${category}] 🔑 PRIVATE | ${listing.title?.substring(0, 50)} | ${listing.price || "N/A"}`,
              "success"
            );
          } else {
            await dbLog(
              `[${category}]    Agency  | ${listing.title?.substring(0, 50)} | ${listing.price || "N/A"}`,
              "info"
            );
          }
          knownIds.add(listing.external_id);
        }

        if (uniqueNewListings.length > 0) {
          const { error: insertError } = await (supabase as any)
            .from("listings")
            .upsert(uniqueNewListings, { onConflict: "external_id", ignoreDuplicates: true });

          if (insertError) {
            await dbLog(`[${category}] Insert error: ${insertError.message}`, "error");
          } else {
            const privateCount = uniqueNewListings.filter((l: any) => l.advertiser_type === "Privatni").length;
            const agencyCount = uniqueNewListings.length - privateCount;
            await dbLog(
              `[${category}] ✅ Saved ${uniqueNewListings.length} listings (${privateCount} private, ${agencyCount} agency).`,
              "success"
            );
            cycleNewAds += uniqueNewListings.length;
          }
        }
      }

      await (supabase as any).from("category_scans").insert({
        category: category,
        worker_id: WORKER_ID,
      });

      if (i < categoryKeys.length - 1 && !shuttingDown) {
        const delay = CATEGORY_DELAY_MS.min + Math.floor(Math.random() * (CATEGORY_DELAY_MS.max - CATEGORY_DELAY_MS.min));
        await dbLog(`Waiting ${Math.round(delay / 1000)}s before next category...`, "info");
        await interruptibleSleep(delay);
      }
    }

    // Cycle summary
    totalNewAds += cycleNewAds;
    totalPrivateAds += cyclePrivateAds;
    const cycleDuration = Math.round((Date.now() - cycleStart) / 1000);
    const cycleMB = cycleProxyBytes / (1024 * 1024);

    await dbLog(`\n${"─".repeat(60)}`, "info");
    await dbLog(`Cycle #${totalCycles} complete in ${cycleDuration}s`, "info");
    await dbLog(`  This cycle: ${cycleNewAds} ads saved (${cyclePrivateAds} private)`, "success");
    await dbLog(`  All time:   ${totalNewAds} ads saved (${totalCycles} cycles)`, "info");
    await dbLog(`  Proxy traffic: ${cycleMB.toFixed(1)} MB (approx)`, "info");
    await dbLog(`${"─".repeat(60)}`, "info");

    await (supabase as any).from("scrape_runs").insert({
      source: "njuskalo",
      status: blocked ? "error" : "success",
      listings_found: cycleNewAds,
      new_listings: cycleNewAds,
      error_message: blocked ? "Bot protection detected — browser restarted" : null,
      worker_id: WORKER_ID,
      cycle_duration_s: cycleDuration,
      proxy_bytes: cycleProxyBytes,
    });

    // Integrated Notification Poller
    try {
      await dbLog(`[Notify] Checking notification filters for new matches...`, "info");
      await runNotificationPoll();
    } catch (notifyErr: any) {
      await dbLog(`[Notify] Error running notification poll: ${notifyErr.message}`, "warning");
    }

    // Periodical Rest Scheduling
    if (!shuttingDown) {
      const elapsedMs = Date.now() - cycleStart;
      const targetIntervalMs = workerIntervalMin * 60 * 1000;
      const remainingSleepMs = Math.max(5000, targetIntervalMs - elapsedMs);

      await dbLog(
        `[Schedule] Worker ${WORKER_ID} target period: ${workerIntervalMin} min. Cycle took ${cycleDuration}s. Resting ${Math.round(remainingSleepMs / 1000)}s until next scan...\n`,
        "info"
      );
      await interruptibleSleep(remainingSleepMs);

      // Periodic Browser Restart (every 50 cycles)
      if (totalCycles > 0 && totalCycles % 50 === 0) {
        await dbLog(`[Periodic Restart] Reached ${totalCycles} cycles. Rotating sticky IP...`, "info");
        try { if (proxyBundle) await proxyBundle.ctx.close(); } catch { /* ignore */ }
        try { await context.close(); } catch { /* ignore */ }
        try { await browser.close(); } catch { /* ignore */ }

        userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        stickySessionId = makeSessionId();
        browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
        context = await browser.newContext({ ...BASE_CONTEXT_OPTS, userAgent });
        page = await context.newPage();
        attachByteCounter(page);
        proxyBundle = await createProxyBundle(browser, userAgent, stickySessionId);
        searchPage = proxyBundle?.searchPage || page;
        detailPage = proxyBundle?.detailPage || page;

        await dbLog(
          `Browser restarted — UA: ${userAgent.substring(0, 40)}... session: ${stickySessionId}`,
          "info"
        );
        if (proxyBundle) {
          const egressIp = await verifyProxyEgress(searchPage);
          if (egressIp) await dbLog(`🌐 New egress IP: ${egressIp}`, "success");
        }
      }
    }
  }
}

// Start the monitor
runMonitor().catch(async (err) => {
  console.error(`${WORKER_TAG} Fatal error:`, err);
  await dbLog(`Fatal error: ${err.message}`, "error");
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  process.exit(1);
});
