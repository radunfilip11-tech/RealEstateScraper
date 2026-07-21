/**
 * Patch Scraper — targeted re-scrape of pages missed by the county page-carry bug.
 *
 * Instead of re-running the full scrape, this script:
 * 1. For each category × county, loads page 1
 * 2. If page 1 has ANY new (unknown) listings → scrapes pages 1, 2, 3… until
 *    it hits 2 consecutive all-known pages, then moves to the next county
 * 3. If page 1 is all-known → skips the county entirely (already scraped)
 *
 * This is MUCH faster than a full re-run because it only touches the
 * missing early pages that were skipped due to the page carry-over bug.
 *
 * Usage:
 *   npx tsx scripts/patch-scrape.ts
 *   npx tsx scripts/patch-scrape.ts --category stanovi
 */

import {
  CATEGORIES,
  NJUSKALO_BASE,
  parseListingsFromSearchJSON,
  parseListingsFromHTML,
  randomDelay,
} from "../src/lib/scraper/njuskalo";

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { getSupabaseServerClient } from "../src/lib/supabase/server";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ---------------------------------------------------------------------------
// Counties (Njuškalo URL slugs)
// ---------------------------------------------------------------------------
const COUNTIES = [
  "zagreb", "zagrebacka", "splitsko-dalmatinska", "primorsko-goranska",
  "istarska", "zadarska", "sibensko-kninska", "dubrovacko-neretvanska",
  "osjecko-baranjska", "varazdinska", "bjelovarsko-bilogorska", "brodsko-posavska",
  "karlovacka", "koprivnicko-krizevacka", "krapinsko-zagorska", "licko-senjska",
  "medimurska", "pozesko-slavonska", "sisacko-moslavacka", "viroviticko-podravska",
  "vukovarsko-srijemska"
];

// ---------------------------------------------------------------------------
// Bandwidth saver
// ---------------------------------------------------------------------------
const BLOCKED_RESOURCE_TYPES = ["image", "stylesheet", "font", "media", "other"];
const BLOCKED_AD_HOSTS = [
  "googletagmanager.com", "google-analytics.com", "googlesyndication.com",
  "doubleclick.net", "googleadservices.com", "adservice.google.com",
  "analytics.tiktok.com", "connect.facebook.net", "facebook.com/tr",
  "criteo.com", "taboola.com", "outbrain.com", "privacy-center.org",
  "dotmetrics.net", "static.njuskalo.hr/dist/",
];

async function applyBandwidthSaver(pg: any): Promise<void> {
  await pg.route("**/*", (route: any) => {
    const request = route.request();
    const resourceType = request.resourceType();
    if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) return route.abort();
    const url = request.url();
    if (BLOCKED_AD_HOSTS.some((host) => url.includes(host))) return route.abort();
    return route.continue();
  });
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/125.0.0.0 Safari/537.36",
];

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------
interface PatchProgress {
  tasks: { category: string; county: string; status: "pending" | "done" | "skipped" }[];
  totalInserted: number;
  lastUpdated: string;
}

const PROGRESS_FILE = path.resolve(__dirname, "patch-scrape-progress.json");

function loadProgress(categoryKeys: string[]): PatchProgress {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    } catch { /* fall through */ }
  }
  // Generate all tasks
  const tasks: PatchProgress["tasks"] = [];
  for (const cat of categoryKeys) {
    for (const county of COUNTIES) {
      tasks.push({ category: cat, county, status: "pending" });
    }
  }
  return { tasks, totalInserted: 0, lastUpdated: new Date().toISOString() };
}

function saveProgress(progress: PatchProgress): void {
  progress.lastUpdated = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function runPatchScrape() {
  const args = process.argv.slice(2);
  let singleCategory: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category" && args[i + 1]) {
      singleCategory = args[i + 1];
      i++;
    }
  }

  const allCategoryKeys = Object.keys(CATEGORIES);
  const categoryKeys = singleCategory
    ? (CATEGORIES[singleCategory] ? [singleCategory] : (() => { console.error(`Unknown category: ${singleCategory}`); process.exit(1); return []; })())
    : allCategoryKeys;

  // Load known IDs from database
  let supabase: ReturnType<typeof getSupabaseServerClient>;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    console.error("[PatchScrape] Missing Supabase env vars.");
    process.exit(1);
  }

  console.log("[PatchScrape] Loading existing external_ids from database...");
  const knownIds = new Set<string>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("listings")
      .select("external_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error("[PatchScrape] DB error:", error.message); break; }
    if (!data || data.length === 0) break;
    data.forEach((row: any) => knownIds.add(row.external_id));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`[PatchScrape] Database has ${knownIds.size} existing listings.\n`);

  // Load or create progress
  const progress = loadProgress(categoryKeys);
  const pendingTasks = progress.tasks.filter(t => t.status === "pending");
  const alreadyDone = progress.tasks.filter(t => t.status !== "pending").length;
  console.log(`[PatchScrape] ${pendingTasks.length} tasks remaining (${alreadyDone} already done/skipped).`);

  if (pendingTasks.length === 0) {
    console.log("[PatchScrape] Nothing to do! All tasks already completed.");
    return;
  }

  // Launch browser
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright-extra");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  chromium.use(StealthPlugin());

  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  console.log("[PatchScrape] Launching headless browser...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    userAgent,
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: { "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7" },
  });
  const page = await context.newPage();
  await applyBandwidthSaver(page);

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[PatchScrape] Shutting down: ${reason}`);
    saveProgress(progress);
    console.log(`[PatchScrape] Progress saved. Total inserted: ${progress.totalInserted}`);
    try { await context.close(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  let consecutiveBlocks = 0;

  // ---------------------------------------------------------------------------
  // Process each pending task
  // ---------------------------------------------------------------------------
  for (const task of pendingTasks) {
    if (shuttingDown) break;

    const categoryPath = CATEGORIES[task.category];
    const countyPath = `/${task.county}`;
    const label = `${task.category}${countyPath}`;

    // STEP 1: Probe page 1 to see if this county has missing listings
    const probeUrl = `${NJUSKALO_BASE}${categoryPath}${countyPath}?page=1`;
    console.log(`\n[PatchScrape] [${label}] Probing page 1: ${probeUrl}`);

    try {
      await page.goto(probeUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

      // Check for bot protection
      const title = await page.title();
      if (title.includes("ShieldSquare") || title.includes("Captcha")) {
        consecutiveBlocks++;
        console.error(`[PatchScrape] ⚠️ Bot protection! (${consecutiveBlocks}/3)`);
        if (consecutiveBlocks >= 3) {
          await shutdown("too many blocks");
          return;
        }
        console.log("[PatchScrape] Pausing 15 minutes...");
        await new Promise(r => setTimeout(r, 15 * 60 * 1000));
        continue; // Retry this task
      }
      consecutiveBlocks = 0;

      // Wait for listing cards
      try {
        await page.waitForSelector('article[class*="entity-body"]', { timeout: 15000 });
      } catch {
        // No listings in this county for this category
        console.log(`[PatchScrape] [${label}] No listings found — skipping.`);
        task.status = "skipped";
        saveProgress(progress);
        await randomDelay(2000, 4000);
        continue;
      }

      // Parse page 1
      const html = await page.content();
      let listings = parseListingsFromSearchJSON(html, task.category);
      if (listings.length === 0) listings = parseListingsFromHTML(html, task.category);

      if (listings.length === 0) {
        console.log(`[PatchScrape] [${label}] 0 listings parsed — skipping.`);
        task.status = "skipped";
        saveProgress(progress);
        await randomDelay(2000, 4000);
        continue;
      }

      const newOnPage1 = listings.filter(l => !knownIds.has(l.external_id));

      if (newOnPage1.length === 0) {
        // Page 1 is all known → this county was already scraped correctly
        console.log(`[PatchScrape] [${label}] Page 1 all known (${listings.length} listings) — already scraped, skipping.`);
        task.status = "skipped";
        saveProgress(progress);
        await randomDelay(2000, 4000);
        continue;
      }

      // STEP 2: This county has missing listings! Scrape them.
      console.log(`[PatchScrape] [${label}] ✨ Found ${newOnPage1.length} NEW listings on page 1! Scraping missing pages...`);

      // Save page 1 results
      let taskInserted = 0;
      const { error: insertErr } = await (supabase as any)
        .from("listings")
        .upsert(newOnPage1, { onConflict: "external_id", ignoreDuplicates: true });
      if (insertErr) {
        console.error(`[PatchScrape] [${label}] Insert error:`, insertErr.message);
      } else {
        taskInserted += newOnPage1.length;
        newOnPage1.forEach((l: any) => knownIds.add(l.external_id));
      }

      // Continue to page 2, 3, … until we hit 2 consecutive all-known pages
      let consecutiveAllKnown = 0;
      for (let pageNum = 2; pageNum <= 999; pageNum++) {
        if (shuttingDown) break;

        const url = `${NJUSKALO_BASE}${categoryPath}${countyPath}?page=${pageNum}`;
        console.log(`[PatchScrape] [${label}] Page ${pageNum}: ${url}`);

        await randomDelay(8000, 15000);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

        // Check redirect (end of pagination)
        const currentUrl = page.url();
        if (!currentUrl.includes(`page=${pageNum}`)) {
          console.log(`[PatchScrape] [${label}] Redirected — end of pagination.`);
          break;
        }

        // Bot check
        const pgTitle = await page.title();
        if (pgTitle.includes("ShieldSquare") || pgTitle.includes("Captcha")) {
          consecutiveBlocks++;
          if (consecutiveBlocks >= 3) { await shutdown("too many blocks"); return; }
          console.log("[PatchScrape] Pausing 15 minutes...");
          await new Promise(r => setTimeout(r, 15 * 60 * 1000));
          pageNum--; continue;
        }
        consecutiveBlocks = 0;

        // Parse
        try {
          await page.waitForSelector('article[class*="entity-body"]', { timeout: 15000 });
        } catch {
          break; // No more listings
        }

        const pageHtml = await page.content();
        let pageListings = parseListingsFromSearchJSON(pageHtml, task.category);
        if (pageListings.length === 0) pageListings = parseListingsFromHTML(pageHtml, task.category);
        if (pageListings.length === 0) break;

        const newListings = pageListings.filter(l => !knownIds.has(l.external_id));
        console.log(`[PatchScrape] [${label}] Parsed ${pageListings.length}, ${newListings.length} new.`);

        if (newListings.length > 0) {
          consecutiveAllKnown = 0;
          const { error: err2 } = await (supabase as any)
            .from("listings")
            .upsert(newListings, { onConflict: "external_id", ignoreDuplicates: true });
          if (!err2) {
            taskInserted += newListings.length;
            newListings.forEach((l: any) => knownIds.add(l.external_id));
          }
        } else {
          consecutiveAllKnown++;
          if (consecutiveAllKnown >= 2) {
            console.log(`[PatchScrape] [${label}] 2 consecutive all-known pages — done with this county.`);
            break;
          }
        }
      }

      const privateCount = taskInserted; // simplified
      console.log(`[PatchScrape] [${label}] ✅ Patched ${taskInserted} new listings.`);
      progress.totalInserted += taskInserted;
      task.status = "done";
      saveProgress(progress);

    } catch (error: any) {
      console.error(`[PatchScrape] [${label}] Error:`, error.message);
      // Don't mark as done — will retry on next run
      saveProgress(progress);
      await randomDelay(10000, 20000);
    }
  }

  // Summary
  const done = progress.tasks.filter(t => t.status === "done").length;
  const skipped = progress.tasks.filter(t => t.status === "skipped").length;
  const remaining = progress.tasks.filter(t => t.status === "pending").length;

  console.log(`\n${"═".repeat(60)}`);
  console.log("[PatchScrape] 🏁 PATCH COMPLETE!");
  console.log(`[PatchScrape]   Patched: ${done} counties (new ads inserted)`);
  console.log(`[PatchScrape]   Skipped: ${skipped} counties (already complete)`);
  console.log(`[PatchScrape]   Remaining: ${remaining}`);
  console.log(`[PatchScrape]   Total new listings inserted: ${progress.totalInserted}`);
  console.log(`${"═".repeat(60)}\n`);

  await context.close();
  await browser.close();
}

runPatchScrape().catch((err) => {
  console.error("[PatchScrape] Fatal error:", err);
  process.exit(1);
});
