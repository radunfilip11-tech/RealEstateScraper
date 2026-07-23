/**
 * Full Database Population Scraper
 *
 * One-off script to populate the database with ALL active NjuÅ¡kalo ads
 * (both private and agency) across all 17 categories.
 *
 * Runs locally without proxy â€” uses slow, human-like delays to avoid
 * bot detection on your home IP. Saves progress to a local JSON file
 * so you can stop/resume at any time.
 *
 * Usage:
 *   npx tsx scripts/full-scrape.ts                        # Resume or start fresh
 *   npx tsx scripts/full-scrape.ts --reset                # Wipe progress, start over
 *   npx tsx scripts/full-scrape.ts --worker 1             # Run only Worker 1's categories
 *   npx tsx scripts/full-scrape.ts --worker 2 --reset     # Reset and run Worker 2 categories
 *   npx tsx scripts/full-scrape.ts --category stanovi     # Scrape one category only
 *   npx tsx scripts/full-scrape.ts --max-pages 50         # Cap pages per category
 */

import {
  randomDelay,
} from "../src/lib/scraper/njuskalo";

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { getSupabaseServerClient } from "../src/lib/supabase/server";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(): {
  reset: boolean;
  category: string | null;
  maxPages: number;
  splitCounties: boolean;
  skipKnown: number;
  sortOld: boolean;
  site: "njuskalo" | "oglasnik";
  workerId: number | null;
  customCounties: string[] | null;
} {
  const args = process.argv.slice(2);
  let reset = false;
  let category: string | null = null;
  let maxPages = 999; // effectively unlimited
  let splitCounties = false;
  let skipKnown = 0; // 0 = disabled; N = skip to next county/category after N consecutive all-known pages
  let sortOld = false;
  let site: "njuskalo" | "oglasnik" = "njuskalo";
  let workerId: number | null = null;
  let customCounties: string[] | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--reset") {
      reset = true;
    } else if (args[i] === "--category" && args[i + 1]) {
      category = args[i + 1];
      i++;
    } else if (args[i] === "--max-pages" && args[i + 1]) {
      maxPages = parseInt(args[i + 1], 10) || 999;
      i++;
    } else if (args[i] === "--split-counties") {
      splitCounties = true;
    } else if (args[i] === "--skip-known" && args[i + 1]) {
      skipKnown = parseInt(args[i + 1], 10) || 3;
      i++;
    } else if (args[i] === "--sort-old") {
      sortOld = true;
    } else if (args[i] === "--site" && args[i + 1]) {
      const s = args[i + 1].toLowerCase();
      if (s === "njuskalo" || s === "oglasnik") {
        site = s;
      }
      i++;
    } else if (args[i] === "--worker" && args[i + 1]) {
      workerId = parseInt(args[i + 1], 10) || null;
      i++;
    } else if (args[i] === "--counties" && args[i + 1]) {
      customCounties = args[i + 1].split(",").map((s) => s.trim());
      i++;
    }
  }

  return { reset, category, maxPages, splitCounties, skipKnown, sortOld, site, workerId, customCounties };
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------
interface Progress {
  currentCategoryIndex: number;
  currentCountyIndex: number;
  currentPage: number;
  completedCategories: string[];
  totalInserted: number;
  totalSkipped: number;
  lastUpdated: string;
}

function getProgressFile(sortOld: boolean, site: string, workerId?: number | null): string {
  const suffix = workerId ? `-worker${workerId}` : "";
  if (site === "oglasnik") {
    return path.resolve(__dirname, sortOld ? `full-scrape-oglasnik-old${suffix}.json` : `full-scrape-oglasnik${suffix}.json`);
  }
  return path.resolve(__dirname, sortOld ? `full-scrape-progress-old${suffix}.json` : `full-scrape-progress${suffix}.json`);
}

function loadProgress(sortOld: boolean, site: string, workerId?: number | null): Progress {
  const file = getProgressFile(sortOld, site, workerId);
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const p = JSON.parse(raw);
      // Migrate old progress files
      if (p.currentCountyIndex === undefined) p.currentCountyIndex = 0;
      return p;
    } catch (e) {
      console.error("[FullScrape] Error reading progress file, starting fresh.");
    }
  }
  return {
    currentCategoryIndex: 0,
    currentCountyIndex: 0,
    currentPage: 1,
    completedCategories: [],
    totalInserted: 0,
    totalSkipped: 0,
    lastUpdated: new Date().toISOString(),
  };
}

function saveProgress(progress: Progress, sortOld: boolean, site: string, workerId?: number | null) {
  progress.lastUpdated = new Date().toISOString();
  fs.writeFileSync(getProgressFile(sortOld, site, workerId), JSON.stringify(progress, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Bandwidth saver (same pattern as monitor.ts)
// ---------------------------------------------------------------------------
const BLOCKED_RESOURCE_TYPES = ["image", "stylesheet", "font", "media", "other"];
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

// ---------------------------------------------------------------------------
// User agents
// ---------------------------------------------------------------------------
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];

async function runFullScrape() {
  const { reset, category: singleCategory, maxPages, splitCounties, skipKnown, sortOld, site, workerId, customCounties } = parseArgs();
  
  // Use correct config based on site
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const njuskaloConfig = require("../src/lib/scraper/njuskalo");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const oglasnikConfig = require("../src/lib/scraper/oglasnik");
  
  const currentCategories = site === "oglasnik" ? oglasnikConfig.OGLASNIK_CATEGORIES : njuskaloConfig.CATEGORIES;
  const currentBase = site === "oglasnik" ? oglasnikConfig.OGLASNIK_BASE : njuskaloConfig.NJUSKALO_BASE;
  
  const allCategoryKeys = Object.keys(currentCategories);

  const DEFAULT_COUNTIES = [
    "zagreb", "zagrebacka", "splitsko-dalmatinska", "primorsko-goranska",
    "istarska", "zadarska", "sibensko-kninska", "dubrovacko-neretvanska",
    "osjecko-baranjska", "varazdinska", "bjelovarsko-bilogorska", "brodsko-posavska",
    "karlovacka", "koprivnicko-krizevacka", "krapinsko-zagorska", "licko-senjska",
    "medimurska", "pozesko-slavonska", "sisacko-moslavacka", "viroviticko-podravska",
    "vukovarsko-srijemska"
  ];
  const COUNTIES = customCounties || DEFAULT_COUNTIES;

  // Determine which categories to scrape
  let categoryKeys: string[];
  if (singleCategory) {
    if (!currentCategories[singleCategory]) {
      console.error(`[FullScrape] Unknown category: ${singleCategory}`);
      console.error(`[FullScrape] Available: ${allCategoryKeys.join(", ")}`);
      process.exit(1);
    }
    categoryKeys = [singleCategory];
  } else if (workerId && njuskaloConfig.WORKER_CATEGORIES[workerId] && site === "njuskalo") {
    // Use pre-defined worker category subset
    categoryKeys = njuskaloConfig.WORKER_CATEGORIES[workerId] as string[];
    console.log(`[FullScrape] Worker ${workerId} categories: ${categoryKeys.join(", ")}`);
  } else {
    categoryKeys = allCategoryKeys;
  }

  // Load or reset progress
  const progress = reset ? {
    currentCategoryIndex: 0,
    currentCountyIndex: 0,
    currentPage: 1,
    completedCategories: [],
    totalInserted: 0,
    totalSkipped: 0,
    lastUpdated: new Date().toISOString(),
  } : loadProgress(sortOld, site, workerId);

  if (!reset && (progress.completedCategories.length > 0 || progress.currentPage > 1)) {
    console.log(`[FullScrape] Resuming from category index ${progress.currentCategoryIndex}, page ${progress.currentPage}`);
    console.log(`[FullScrape] Previously completed: ${progress.completedCategories.join(", ") || "none"}`);
    console.log(`[FullScrape] Total inserted so far: ${progress.totalInserted}`);
  }

  // Supabase client
  let supabase: ReturnType<typeof getSupabaseServerClient>;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    console.error("[FullScrape] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  // Pre-fetch all known external_ids for dedup
  console.log("[FullScrape] Fetching existing external_ids from database...");
  const knownIds = new Set<string>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("listings")
      .select("external_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("[FullScrape] Error fetching existing IDs:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    data.forEach((row: any) => knownIds.add(row.external_id));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`[FullScrape] Database has ${knownIds.size} existing listings.`);

  // Launch Playwright with stealth
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright-extra");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  chromium.use(StealthPlugin());

  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  console.log("[FullScrape] Launching headless browser (no proxy, native IP)...");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const context = await browser.newContext({
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    userAgent,
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: {
      "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  const page = await context.newPage();
  await applyBandwidthSaver(page);

  console.log(`[FullScrape] User-Agent: ${userAgent.substring(0, 60)}...`);
  console.log(`[FullScrape] Categories to scrape: ${categoryKeys.length}`);
  console.log(`[FullScrape] Max pages per category: ${maxPages}`);
  console.log(`[FullScrape] Split by county: ${splitCounties ? "YES" : "NO"}`);
  if (skipKnown > 0) {
    console.log(`[FullScrape] Skip-known: skip to next section after ${skipKnown} consecutive all-known pages`);
  }
  if (sortOld) {
    console.log(`[FullScrape] Sort: OLDEST FIRST (?sort=old)`);
  }
  console.log("");

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[FullScrape] Shutting down: ${reason}`);
    saveProgress(progress, sortOld, site, workerId);
    console.log(`[FullScrape] Progress saved. Total inserted so far: ${progress.totalInserted}`);
    try { await context.close(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT received"));
  process.on("SIGTERM", () => shutdown("SIGTERM received"));

  let consecutiveBlocks = 0;
  const MAX_CONSECUTIVE_BLOCKS = 3;

  // ---------------------------------------------------------------------------
  // Category loop
  // ---------------------------------------------------------------------------
  for (let catIdx = progress.currentCategoryIndex; catIdx < categoryKeys.length; catIdx++) {
    if (shuttingDown) break;

    const category = categoryKeys[catIdx];
    const categoryPath = currentCategories[category];

    // Skip already completed categories (when resuming)
    if (progress.completedCategories.includes(category)) {
      console.log(`[FullScrape] Skipping already completed category: ${category}`);
      continue;
    }

    progress.currentCategoryIndex = catIdx;

    console.log(`\n${"â•".repeat(60)}`);
    console.log(`[FullScrape] Category ${catIdx + 1}/${categoryKeys.length}: ${category} (${categoryPath})`);
    console.log(`${"â•".repeat(60)}`);

    const countiesToScrape = splitCounties ? COUNTIES : [""];
    const startCountyIdx = catIdx === progress.currentCategoryIndex ? progress.currentCountyIndex : 0;

    for (let countyIdx = startCountyIdx; countyIdx < countiesToScrape.length; countyIdx++) {
      if (shuttingDown) break;
      
      const county = countiesToScrape[countyIdx];
      
      const countyPath = county ? `/${county}` : "";
      if (splitCounties) {
        console.log(`\n[FullScrape] -> Scanning county: ${county || "ALL COUNTIES (Base)"}`);
      }

      // Determine start page (for resume) â€” must check BEFORE updating progress.currentCountyIndex
      const isResumedCounty = (catIdx === progress.currentCategoryIndex && countyIdx === progress.currentCountyIndex);
      const startPage = isResumedCounty ? progress.currentPage : 1;

      // Now update progress to reflect we're working on this county
      progress.currentCountyIndex = countyIdx;
      if (!isResumedCounty) {
        progress.currentPage = 1;
      }

      let emptyPages = 0;
      let consecutiveAllKnown = 0;

      // -------------------------------------------------------------------------
      // Page loop
      // -------------------------------------------------------------------------
      for (let pageNum = startPage; pageNum <= maxPages; pageNum++) {
        if (shuttingDown) break;

        let url = `${currentBase}${categoryPath}${countyPath}?page=${pageNum}`;
        if (sortOld) {
          url += "&sort=old";
        }
        
        console.log(`[FullScrape] [${category}${countyPath}] Page ${pageNum}: ${url}`);

        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });

          const currentUrl = page.url();
          if (pageNum > 1 && !currentUrl.includes(`page=${pageNum}`)) {
            console.log(`[FullScrape] [${category}${countyPath}] Redirected away from page ${pageNum} to ${currentUrl}. Reached the end of pagination for this section.`);
            break; // Stop paginating this section
          }

          // Check for bot protection
          const title = await page.title();
          if (title.includes("ShieldSquare") || title.includes("Captcha")) {
            consecutiveBlocks++;
            console.error(`[FullScrape] âš ï¸  Bot protection detected! (${consecutiveBlocks}/${MAX_CONSECUTIVE_BLOCKS})`);

            if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
              console.error("[FullScrape] ðŸ›‘ Too many consecutive blocks. Saving progress and exiting.");
              progress.currentPage = pageNum;
              await shutdown("too many blocks");
              return;
            }

            // Pause and retry
            console.log("[FullScrape] Pausing 15 minutes before retrying...");
            await new Promise((resolve) => setTimeout(resolve, 15 * 60 * 1000));
            pageNum--; // Retry the same page
            continue;
          }

          // Reset block counter on success
          consecutiveBlocks = 0;

          // Wait for Vue/React to render listing cards
          if (site === "njuskalo") {
            try {
              await page.waitForSelector('article[class*="entity-body"]', {
                timeout: 20000,
              });
            } catch {
              // No cards â€” end of category
              emptyPages++;
              console.log(`[FullScrape] [${category}] No cards on page ${pageNum} (empty page ${emptyPages}/2).`);
              if (emptyPages >= 2) {
                console.log(`[FullScrape] [${category}] 2 consecutive empty pages â€” category done.`);
                break;
              }
              // Save progress and continue to next page
              progress.currentPage = pageNum + 1;
              saveProgress(progress, sortOld, site, workerId);
              await njuskaloConfig.randomDelay(8000, 15000);
              continue;
            }
          } else if (site === "oglasnik") {
            try {
              await page.waitForSelector('a[href*="-oglas-"]', {
                timeout: 20000,
              });
            } catch {
              // No cards
              emptyPages++;
              console.log(`[FullScrape] [${category}] No cards on page ${pageNum} (empty page ${emptyPages}/2).`);
              if (emptyPages >= 2) {
                break;
              }
              progress.currentPage = pageNum + 1;
              saveProgress(progress, sortOld, site, workerId);
              await njuskaloConfig.randomDelay(3000, 5000);
              continue;
            }
          }

          // Reset empty page counter on success
          emptyPages = 0;

          // Human-like scroll
          await page.evaluate(() => {
            window.scrollBy(0, Math.floor(Math.random() * 500) + 300);
          });
          await njuskaloConfig.randomDelay(300, 600);

          // Parse listings
          const html = await page.content();
          let pageListings: any[] = [];
          
          if (site === "oglasnik") {
            const txType = category.includes("najam") ? "Najam" : "Prodaja";
            pageListings = await oglasnikConfig.parseOglasnikPage(page, categoryPath);
          } else {
            pageListings = njuskaloConfig.parseListingsFromSearchJSON(html, category);
            if (pageListings.length === 0) {
              pageListings = njuskaloConfig.parseListingsFromHTML(html, category);
            }
          }

          if (pageListings.length === 0) {
            emptyPages++;
            console.log(`[FullScrape] [${category}] 0 listings parsed on page ${pageNum} (empty ${emptyPages}/2).`);
            if (emptyPages >= 2) {
              console.log(`[FullScrape] [${category}] 2 consecutive empty pages â€” category done.`);
              break;
            }
            progress.currentPage = pageNum + 1;
            saveProgress(progress, sortOld, site, workerId);
            await njuskaloConfig.randomDelay(8000, 15000);
            continue;
          }

          console.log(`[FullScrape] [${category}] Parsed ${pageListings.length} listings on page ${pageNum}.`);

          // Upsert all parsed listings (this updates existing records with newly scraped fields like room_count, yard_size_m2, etc.)
          if (pageListings.length > 0) {
            const BATCH_SIZE = 50;
            let batchInserted = 0;

            for (let i = 0; i < pageListings.length; i += BATCH_SIZE) {
              const batch = pageListings.slice(i, i + BATCH_SIZE);
              const { error: insertError } = await (supabase as any)
                .from("listings")
                .upsert(batch, { onConflict: "external_id" });

              if (insertError) {
                console.error(`[FullScrape] [${category}] Batch upsert error:`, insertError.message);
              } else {
                batchInserted += batch.length;
              }
            }

            const privateCount = pageListings.filter((l) => l.advertiser_type === "Privatni").length;
            const agencyCount = pageListings.length - privateCount;
            console.log(`[FullScrape] [${category}]   ✅ Processed & Updated ${batchInserted} listings (${privateCount} private, ${agencyCount} agency).`);

            progress.totalInserted += batchInserted;
          }

          // Save progress after each page
          progress.currentPage = pageNum + 1;
          saveProgress(progress, sortOld, site, workerId);

          // Delay between pages (8-15 seconds)
          const delay = 8000 + Math.floor(Math.random() * 7000);
          console.log(`[FullScrape] Waiting ${Math.round(delay / 1000)}s before next page...`);
          await new Promise((resolve) => setTimeout(resolve, delay));

        } catch (error: any) {
          console.error(`[FullScrape] [${category}${countyPath}] Loop error on page ${pageNum}:`, error.message);
          console.log("[FullScrape] Waiting 30s before continuing...");
          await new Promise((resolve) => setTimeout(resolve, 30000));
          progress.currentPage = pageNum + 1;
        }
      } // End page loop
      
      if (shuttingDown) break;
    } // End county loop

    // Mark category as completed
    if (!shuttingDown) {
      if (!progress.completedCategories.includes(category)) {
        progress.completedCategories.push(category);
      }
      progress.currentCountyIndex = 0;
      progress.currentPage = 1;
      progress.currentCategoryIndex = catIdx + 1;
      saveProgress(progress, sortOld, site, workerId);

      console.log(`[FullScrape] âœ… Category "${category}" complete.`);
      console.log(`[FullScrape] Running total: ${progress.totalInserted} inserted, ${progress.totalSkipped} skipped.`);

      // Longer delay between categories (30-60 seconds)
      if (catIdx < categoryKeys.length - 1) {
        const catDelay = 30000 + Math.floor(Math.random() * 30000);
        console.log(`[FullScrape] Waiting ${Math.round(catDelay / 1000)}s before next category...\n`);
        await new Promise((resolve) => setTimeout(resolve, catDelay));
      }
    }
  }

  // Final summary
  console.log(`\n${"â•".repeat(60)}`);
  console.log("[FullScrape] ðŸ FULL SCRAPE COMPLETE!");
  console.log(`[FullScrape]   Total inserted: ${progress.totalInserted}`);
  console.log(`[FullScrape]   Total skipped (already known): ${progress.totalSkipped}`);
  console.log(`[FullScrape]   Categories completed: ${progress.completedCategories.length}/${categoryKeys.length}`);
  console.log(`${"â•".repeat(60)}\n`);

  await context.close();
  await browser.close();
}

// Start
runFullScrape().catch((err) => {
  console.error("[FullScrape] Fatal error:", err);
  process.exit(1);
});
