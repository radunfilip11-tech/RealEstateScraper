/**
 * Continuous Njuškalo Real Estate Monitor
 * 
 * Runs as a long-lived background process. Cycles through assigned real estate
 * categories, detecting new ads and checking if they are private
 * ("Korisnik nije trgovac") via fast HTTP fetch of detail pages.
 * 
 * Usage: npm run monitor -- --worker-id 1
 * 
 * Architecture:
 *   1. A single Playwright browser stays alive across all cycles.
 *   2. For each category, we load page 1 (Playwright, needed for JS rendering).
 *   3. We compare the external_ids against both the listings table (private ads)
 *      and seen_listings table (agency ads we've already checked) to find truly new ads.
 *   4. For each new ad, we use raw HTTP fetch (with stolen Playwright cookies)
 *      to instantly load the detail page and check for "Korisnik nije trgovac".
 *   5. Private ads are saved to the listings table. Agency ads are tracked in
 *      seen_listings to prevent redundant detail-page fetches in future cycles.
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
  fetchDetailPageHTTP,
  randomDelay,
} from "../src/lib/scraper/njuskalo";

// ---------------------------------------------------------------------------
// Supabase client (direct, not using the Next.js server helper which requires
// Next.js runtime). We use the service role key for full write access.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ---------------------------------------------------------------------------
// Parse CLI arguments for worker ID
// ---------------------------------------------------------------------------
function parseWorkerId(): number {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--worker-id");
  if (idx !== -1 && args[idx + 1]) {
    const id = parseInt(args[idx + 1], 10);
    if (!isNaN(id) && id > 0) return id;
  }
  return 1; // Default to worker 1
}

const WORKER_ID = parseWorkerId();
const WORKER_TAG = `[W${WORKER_ID}]`;

// Define PID file path (per-worker)
const PID_FILE = path.resolve(__dirname, `../monitor-${WORKER_ID}.pid`);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(`${WORKER_TAG} Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CATEGORY_DELAY_MS = { min: 1600, max: 2600 }; // 1.6-2.3s between categories
const CYCLE_REST_MS = { min: 1600, max: 3500 };    // 1.4-2.3s rest between full cycles
const BLOCKED_BACKOFF_MS = 600000;                 // 10 min backoff if blocked

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];

// Helper to log to both console and Supabase
async function dbLog(message: string, level: "info" | "success" | "warning" | "error" = "info") {
  const taggedMessage = `${WORKER_TAG} ${message}`;
  console.log(taggedMessage);
  await (supabase as any).from("scraper_console_logs").insert({ message: taggedMessage, level });
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
  await dbLog(`Mode: Private ads only (agency ads tracked in seen_listings)`, "info");
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

  let browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  let context = await browser.newContext({
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    userAgent,
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: {
      "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  let page = await context.newPage();

  await dbLog(`Browser launched. User-Agent: ${userAgent.substring(0, 50)}...`, "info");
  await dbLog("", "info");

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await dbLog("Shutting down gracefully...", "warning");
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

    totalCycles++;
    const cycleStart = Date.now();
    let cycleNewAds = 0;
    let cyclePrivateAds = 0;
    let blocked = false;

    await dbLog(`\n${"═".repeat(60)}`, "info");
    await dbLog(`Cycle #${totalCycles} starting — ${new Date().toLocaleString("hr-HR")} (Uptime: ${formatUptime()})`, "info");
    await dbLog(`${"═".repeat(60)}`, "info");

    // Pre-fetch all known external_ids from both listings and seen_listings
    // Supabase default limit is 1000 rows — we need ALL rows for dedup
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
    let seenIds: string[] = [];
    try {
      [listingIds, seenIds] = await Promise.all([
        fetchAllExternalIds("listings"),
        fetchAllExternalIds("seen_listings"),
      ]);
    } catch (err: any) {
      await dbLog(`Failed to fetch known IDs: ${err.message}`, "error");
      await randomDelay(30000, 60000);
      continue;
    }

    const knownIds = new Set<string>([...listingIds, ...seenIds]);
    await dbLog(`Database has ${knownIds.size} known listings (${listingIds.length} full, ${seenIds.length} seen).`, "info");

    // Cycle through all categories (in shuffled order for this worker)
    for (let i = 0; i < categoryKeys.length; i++) {
      if (shuttingDown) break;

      // Check if PID file was deleted mid-cycle
      if (!fs.existsSync(PID_FILE)) {
        await dbLog("PID file missing. Stopping mid-cycle.", "warning");
        await shutdown();
        break;
      }

      const category = categoryKeys[i];
      await dbLog(`\n── Category ${i + 1}/${categoryKeys.length}: ${category} ──`, "info");

      // Scrape search page
      const result = await scrapeSearchPageOnly(page, category);

      if (result.blocked) {
        await dbLog(`⚠️  BLOCKED by ShieldSquare! Backing off for ${BLOCKED_BACKOFF_MS / 60000} minutes...`, "error");
        blocked = true;

        // Restart browser with a new identity
        try { await context.close(); } catch { /* ignore */ }
        try { await browser.close(); } catch { /* ignore */ }

        await randomDelay(BLOCKED_BACKOFF_MS, BLOCKED_BACKOFF_MS + 60000);

        // Relaunch with a new user agent
        const newUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        browser = await chromium.launch({
          headless: true,
          args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
        });
        context = await browser.newContext({
          locale: "hr-HR",
          timezoneId: "Europe/Zagreb",
          userAgent: newUA,
          viewport: { width: 1920, height: 1080 },
          extraHTTPHeaders: { "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7" },
        });
        page = await context.newPage();
        await dbLog(`Browser restarted with new UA: ${newUA.substring(0, 50)}...`, "info");
        break; // Restart the cycle
      }

      if (result.listings.length === 0) {
        await dbLog(`[${category}] No listings found, skipping.`, "info");
      } else {
        // Find truly new ads
        const newListings = result.listings.filter(
          (l) => !knownIds.has(l.external_id)
        );

        if (newListings.length === 0) {
          await dbLog(`[${category}] All ${result.listings.length} listings already known.`, "info");
        } else {
          // Dedupe newListings by external_id (in case same ad appears multiple times on page)
          const seenInBatch = new Set<string>();
          const uniqueNewListings = newListings.filter((l) => {
            if (seenInBatch.has(l.external_id)) return false;
            seenInBatch.add(l.external_id);
            return true;
          });

          await dbLog(`[${category}] 🆕 ${uniqueNewListings.length} NEW ads detected on page 1! Checking details...`, "info");

          // Extract cookies from the Playwright session for fast HTTP fetches
          const cookies = await context.cookies();
          const privateListingsToSave = [];
          const seenListingsToSave = [];

          // Fetch detail pages for each new ad using fast HTTP
          for (const listing of uniqueNewListings) {
            if (!listing.url) continue;

            try {
              // Small delay between detail fetches to not look like a bot
              await randomDelay(500, 1400);

              const detail = await fetchDetailPageHTTP(listing.url, cookies, userAgent);

              // Enrich the listing with detail page data
              if (detail.price) {
                listing.price = detail.price;
                listing.price_numeric = detail.priceNumeric;
              }
              if (detail.location) {
                listing.location = detail.location;
                listing.location_county = detail.locationCounty;
                listing.location_city = detail.locationCity;
                listing.location_neighborhood = detail.locationNeighborhood;
              }
              if (detail.sizeM2) {
                listing.size_m2 = detail.sizeM2;
              }
              if (detail.advertiserType) {
                listing.advertiser_type = detail.advertiserType;
              }
              // Promoted & published date from detail page
              listing.is_promoted = listing.is_promoted || detail.isPromoted;
              if (detail.publishedAt) {
                listing.published_at = detail.publishedAt;
              }

              const isPrivate = listing.advertiser_type === "Privatni";

              if (isPrivate) {
                cyclePrivateAds++;
                privateListingsToSave.push(listing);
                await dbLog(
                  `[${category}] 🔑 PRIVATE | ${listing.title?.substring(0, 50)} | ${listing.price || "N/A"}`,
                  "success"
                );
              } else {
                // Save agency/non-private ads to seen_listings for skip tracking
                seenListingsToSave.push({
                  external_id: listing.external_id,
                  advertiser_type: listing.advertiser_type || "Agencija",
                  worker_id: WORKER_ID,
                });
                await dbLog(
                  `[${category}]    Agency  | ${listing.title?.substring(0, 50)} | ${listing.price || "N/A"}`,
                  "info"
                );
              }
            } catch (err) {
              await dbLog(`[${category}] Failed to fetch detail for ${listing.external_id}: ${(err as Error).message}`, "warning");
            }

            // Mark this ID as known so we don't re-process it in subsequent categories
            knownIds.add(listing.external_id);
          }

          // Save ONLY private listings to the main listings table
          if (privateListingsToSave.length > 0) {
            const { error: insertError } = await (supabase as any)
              .from("listings")
              .upsert(privateListingsToSave, { onConflict: "external_id", ignoreDuplicates: true });

            if (insertError) {
              await dbLog(`[${category}] Insert error: ${insertError.message}`, "error");
            } else {
              await dbLog(`[${category}] ✅ Saved ${privateListingsToSave.length} PRIVATE listings to database.`, "success");
              cycleNewAds += privateListingsToSave.length;
            }
          }

          // Save agency ads to seen_listings for skip tracking
          if (seenListingsToSave.length > 0) {
            const { error: seenError } = await (supabase as any)
              .from("seen_listings")
              .upsert(seenListingsToSave, { onConflict: "external_id", ignoreDuplicates: true });

            if (seenError) {
              await dbLog(`[${category}] Error saving seen listings: ${seenError.message}`, "error");
            } else {
              await dbLog(`[${category}] 📝 Tracked ${seenListingsToSave.length} agency ads in seen_listings.`, "info");
            }
          }

          if (privateListingsToSave.length === 0 && seenListingsToSave.length === 0) {
            await dbLog(`[${category}] No ads to save (all detail fetches failed).`, "warning");
          }
        }
      }

      // Log this category scan to the database for stats tracking
      await (supabase as any).from("category_scans").insert({
        category: category,
        worker_id: WORKER_ID,
      });

      // Wait between categories (looks human)
      if (i < categoryKeys.length - 1 && !shuttingDown) {
        const delay = CATEGORY_DELAY_MS.min + Math.floor(Math.random() * (CATEGORY_DELAY_MS.max - CATEGORY_DELAY_MS.min));
        await dbLog(`Waiting ${Math.round(delay / 1000)}s before next category...`, "info");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Cycle summary
    totalNewAds += cycleNewAds;
    totalPrivateAds += cyclePrivateAds;
    const cycleDuration = Math.round((Date.now() - cycleStart) / 1000);

    await dbLog(`\n${"─".repeat(60)}`, "info");
    await dbLog(`Cycle #${totalCycles} complete in ${cycleDuration}s`, "info");
    await dbLog(`  This cycle: ${cycleNewAds} private ads saved`, "success");
    await dbLog(`  All time:   ${totalNewAds} private ads saved (${totalCycles} cycles)`, "info");
    await dbLog(`${"─".repeat(60)}`, "info");

    // Log scrape run to database (includes worker_id and cycle_duration_s for stats)
    await (supabase as any).from("scrape_runs").insert({
      source: "njuskalo",
      status: blocked ? "error" : "success",
      listings_found: cycleNewAds,
      new_listings: cycleNewAds,
      error_message: blocked ? "Bot protection detected — browser restarted" : null,
      worker_id: WORKER_ID,
      cycle_duration_s: cycleDuration,
    });

    // Rest between full cycles
    if (!shuttingDown) {
      let rest = CYCLE_REST_MS.min + Math.floor(Math.random() * (CYCLE_REST_MS.max - CYCLE_REST_MS.min));
      
      const croatiaTime = new Date().toLocaleString("en-US", { timeZone: "Europe/Zagreb" });
      const croatiaHour = new Date(croatiaTime).getHours();
      // "Night shift" from 1 AM to 6 AM (Assuming '1pm' was a typo, using 1 to 6)
      const isNightShift = croatiaHour >= 1 && croatiaHour < 6;

      let targetDuration = 60;
      if (isNightShift) {
        if (WORKER_ID === 1) {
          targetDuration = 480 + Math.floor(Math.random() * 120); // 8 to 10 mins
        } else if (WORKER_ID === 2) {
          targetDuration = 1200 + Math.floor(Math.random() * 300); // 20 to 25 mins
        }
      } else {
        if (WORKER_ID === 1) {
          targetDuration = 100 + Math.floor(Math.random() * 151); // random between 100s and 250s
        } else if (WORKER_ID === 2) {
          targetDuration = 200 + Math.floor(Math.random() * 301); // random between 200s and 500s
        }
      }

      if (cycleDuration < targetDuration) {
        const extraWait = (targetDuration - cycleDuration) * 1000;
        rest += extraWait;
        const msgType = isNightShift ? "Night shift active" : "Fast cycle detected";
        await dbLog(`${msgType} (cycle took ${cycleDuration}s). Enforcing ${targetDuration}s minimum cycle duration. Adding ${Math.round(extraWait / 1000)}s wait.`, "warning");
      }

      await dbLog(`Resting ${Math.round(rest / 1000)}s before next cycle...\n`, "info");
      await new Promise((resolve) => setTimeout(resolve, rest));
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
