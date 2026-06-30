/**
 * Continuous Njuškalo Real Estate Monitor
 * 
 * Runs as a long-lived background process. Cycles through all 10 real estate
 * categories, detecting new ads and checking if they are private
 * ("Korisnik nije trgovac") via fast HTTP fetch of detail pages.
 * 
 * Usage: npm run monitor -- --worker-id 1
 * 
 * Architecture:
 *   1. A single Playwright browser stays alive across all cycles.
 *   2. For each category, we load page 1 (Playwright, needed for JS rendering).
 *   3. We compare the external_ids against the database to find truly new ads.
 *   4. For each new ad, we use raw HTTP fetch (with stolen Playwright cookies)
 *      to instantly load the detail page and check for "Korisnik nije trgovac".
 *   5. New ads are saved to Supabase. Private ones are flagged.
 *   6. After all categories, we rest and repeat.
 * 
 * Multi-Worker Mode:
 *   Each worker gets a unique ID (1, 2, 3). Categories are shuffled based on
 *   the worker ID so that workers scan different categories at different times,
 *   maximizing coverage and reducing duplicate work.
 */

import {
  CATEGORIES,
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
const CATEGORY_DELAY_MS = { min: 6500, max: 9000 }; // 10-15s between categories
const CYCLE_REST_MS = { min: 9000, max: 15000 };    // 30-45s rest between full cycles
const BLOCKED_BACKOFF_MS = 600000;                       // 10 min backoff if blocked

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];

// ---------------------------------------------------------------------------
// Shuffle categories based on worker ID (deterministic)
// Each worker gets a different starting order so they scan different
// categories at different times, maximizing overall throughput.
// ---------------------------------------------------------------------------
function shuffleCategories(keys: string[], workerId: number): string[] {
  const shuffled = [...keys];
  // Rotate the array by (workerId - 1) * floor(length / 3) positions
  // Worker 1: starts at position 0 (stanovi, kuce, ...)
  // Worker 2: starts at position 3 (poslovni_prostori, vikendice, ...)
  // Worker 3: starts at position 6 (novogradnja, najam_stanova, ...)
  const offset = ((workerId - 1) * Math.floor(shuffled.length / 3)) % shuffled.length;
  return [...shuffled.slice(offset), ...shuffled.slice(0, offset)];
}

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
  await dbLog(`Monitoring ${Object.keys(CATEGORIES).length} categories.`, "info");
  await dbLog(`Mode: TEST (Saving ONLY Private ads)`, "warning");
  await dbLog(`Category delay: ${CATEGORY_DELAY_MS.min / 1000}-${CATEGORY_DELAY_MS.max / 1000}s`, "info");
  await dbLog(`Cycle rest: ${CYCLE_REST_MS.min / 1000}-${CYCLE_REST_MS.max / 1000}s`, "info");

  // Prepare shuffled category order for this worker
  const categoryKeys = shuffleCategories(Object.keys(CATEGORIES), WORKER_ID);
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

    // Pre-fetch all known external_ids from the database once per cycle
    const { data: existingData, error: existingError } = await supabase
      .from("listings")
      .select("external_id");

    if (existingError) {
      await dbLog(`Failed to fetch existing listings: ${existingError.message}`, "error");
      await randomDelay(30000, 60000);
      continue;
    }

    const knownIds = new Set<string>(
      (existingData || []).map((row: any) => row.external_id)
    );
    await dbLog(`Database has ${knownIds.size} known listings.`, "info");

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
          await dbLog(`[${category}] 🆕 ${newListings.length} NEW ads detected on page 1! Checking details...`, "info");

          // Extract cookies from the Playwright session for fast HTTP fetches
          const cookies = await context.cookies();
          const privateListingsToSave = [];

          // Fetch detail pages for each new ad using fast HTTP
          for (const listing of newListings) {
            if (!listing.url) continue;

            try {
              // Small delay between detail fetches to not look like a bot
              await randomDelay(500, 1500);

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
                await dbLog(
                  `[${category}]    Agency  | ${listing.title?.substring(0, 50)} | ${listing.price || "N/A"}`,
                  "info"
                );
              }
            } catch (err) {
              await dbLog(`[${category}] Failed to fetch detail for ${listing.external_id}: ${(err as Error).message}`, "warning");
              // We won't save it if we can't fetch detail to confirm it's private
            }

            // Mark this ID as known so we don't re-process it in subsequent categories
            knownIds.add(listing.external_id);
          }

          // Save ONLY private listings to Supabase
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
          } else {
            await dbLog(`[${category}] No private ads found in this batch.`, "info");
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
      const rest = CYCLE_REST_MS.min + Math.floor(Math.random() * (CYCLE_REST_MS.max - CYCLE_REST_MS.min));
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
