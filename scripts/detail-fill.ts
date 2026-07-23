/**
 * detail-fill.ts — Fetch detail pages for listings with null size_m2
 * and update the database with the extracted size.
 *
 * Usage:
 *   npx tsx scripts/detail-fill.ts --worker 1 --total-workers 4 [--reset] [--batch 50]
 *
 * Each worker takes every Nth listing (round-robin by index) so they
 * don't overlap. Progress is tracked per-worker in a JSON file.
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { getSupabaseServerClient } from "../src/lib/supabase/server";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let workerId = 1;
  let totalWorkers = 1;
  let reset = false;
  let batchSize = 100; // how many listings to fetch per run before saving

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--worker" && args[i + 1]) {
      workerId = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (args[i] === "--total-workers" && args[i + 1]) {
      totalWorkers = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (args[i] === "--reset") {
      reset = true;
    } else if (args[i] === "--batch" && args[i + 1]) {
      batchSize = parseInt(args[i + 1], 10) || 100;
      i++;
    }
  }

  return { workerId, totalWorkers, reset, batchSize };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
interface DetailProgress {
  processedIds: string[];
  totalUpdated: number;
  totalSkipped: number;
  totalErrors: number;
  lastUpdated: string;
}

function getProgressFile(workerId: number): string {
  return path.resolve(__dirname, `detail-fill-progress-worker${workerId}.json`);
}

// Helper to log to console AND Supabase for live UI monitoring
async function dbLog(supabase: any, workerId: number, message: string, level: "info" | "success" | "warning" | "error" = "info") {
  const taggedMessage = `[DetailFill-W${workerId}] ${message}`;
  console.log(taggedMessage);
  if (supabase) {
    try {
      await supabase.from("scraper_console_logs").insert({ message: taggedMessage, level });
    } catch { /* ignore */ }
  }
}

function loadProgress(workerId: number): DetailProgress {
  const file = getProgressFile(workerId);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      console.error("[DetailFill] Error reading progress, starting fresh.");
    }
  }
  return {
    processedIds: [],
    totalUpdated: 0,
    totalSkipped: 0,
    totalErrors: 0,
    lastUpdated: new Date().toISOString(),
  };
}

function saveProgress(progress: DetailProgress, workerId: number) {
  progress.lastUpdated = new Date().toISOString();
  fs.writeFileSync(getProgressFile(workerId), JSON.stringify(progress, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Size extraction from detail page HTML
// ---------------------------------------------------------------------------
function extractSizeFromDetail(html: string): number | null {
  // Pattern 1: "Površina zemljišta: 1.800,00 m²" or "Površina: 830 m²"
  const patterns = [
    /Povr[šs]ina\s*(?:zemlji[šs]ta)?\s*[:.]?\s*([\d.\s]+(?:,\d+)?)\s*m[²2]/gi,
    /Zemlji[šs]na\s*povr[šs]ina\s*[:.]?\s*([\d.\s]+(?:,\d+)?)\s*m[²2]/gi,
    /Veli[čc]ina\s*[:.]?\s*([\d.\s]+(?:,\d+)?)\s*m[²2]/gi,
    /Ukupna\s*povr[šs]ina\s*[:.]?\s*([\d.\s]+(?:,\d+)?)\s*m[²2]/gi,
  ];

  for (const pattern of patterns) {
    const matches = [...html.matchAll(pattern)];
    for (const m of matches) {
      const raw = m[1].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 50_000_000) {
        return parsed;
      }
    }
  }

  // Pattern 2: Look in structured data tables - match rows like:
  //   <th>Površina zemljišta</th><td>1.800 m²</td>
  const tablePattern = /(?:Povr[šs]ina|Zemlji[šs]na|Veli[čc]ina)[^<]*<\/(?:th|td|dt|span|div)>\s*<(?:td|dd|span|div)[^>]*>\s*([\d.\s]+(?:,\d+)?)\s*m[²2]/gi;
  const tableMatches = [...html.matchAll(tablePattern)];
  for (const m of tableMatches) {
    const raw = m[1].replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 50_000_000) {
      return parsed;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Land type extraction from detail page HTML
// ---------------------------------------------------------------------------
function extractLandTypeFromDetail(html: string, title?: string): string | null {
  // Check for specific type badges or text in HTML
  if (/gra[đd]evinsk/i.test(html)) return "Građevinsko";
  if (/poljoprivredn/i.test(html)) return "Poljoprivredno";
  if (/[šs]umsk/i.test(html)) return "Šumsko";

  if (title) {
    if (/gra[đd]evinsk/i.test(title)) return "Građevinsko";
    if (/poljoprivredn/i.test(title)) return "Poljoprivredno";
    if (/[šs]umsk/i.test(title)) return "Šumsko";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bandwidth saver
// ---------------------------------------------------------------------------
const BLOCKED_RESOURCE_TYPES = ["image", "stylesheet", "font", "media", "other"];
const BLOCKED_AD_HOSTS = [
  "googletagmanager.com", "google-analytics.com", "googlesyndication.com",
  "doubleclick.net", "googleadservices.com", "adservice.google.com",
  "analytics.tiktok.com", "connect.facebook.net", "facebook.com",
  "criteo.com", "taboola.com", "outbrain.com", "privacy-center.org",
  "dotmetrics.net", "static.njuskalo.hr/dist/",
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { workerId, totalWorkers, reset, batchSize } = parseArgs();

  console.log(`[DetailFill] Worker ${workerId}/${totalWorkers}, batch=${batchSize}, reset=${reset}`);

  // Load progress
  const progress = reset
    ? { processedIds: [], totalUpdated: 0, totalSkipped: 0, totalErrors: 0, lastUpdated: new Date().toISOString() }
    : loadProgress(workerId);

  if (!reset && progress.processedIds.length > 0) {
    console.log(`[DetailFill] Resuming. Already processed ${progress.processedIds.length} listings.`);
    console.log(`[DetailFill]   Updated: ${progress.totalUpdated}, Skipped: ${progress.totalSkipped}, Errors: ${progress.totalErrors}`);
  }

  // Supabase
  let supabase: any;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    console.error("[DetailFill] Missing Supabase env vars.");
    process.exit(1);
  }

  // Fetch all land listings with null size_m2
  console.log("[DetailFill] Fetching land listings with null size_m2...");
  const allListings: { external_id: string; url: string; title: string }[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("listings")
      .select("external_id, url, title")
      .like("url", "%zemljist%")
      .is("size_m2", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("[DetailFill] DB error:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allListings.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`[DetailFill] Found ${allListings.length} land listings with null size_m2.`);

  // Filter out already processed
  const processedSet = new Set(progress.processedIds);
  const remaining = allListings.filter((l) => !processedSet.has(l.external_id));
  console.log(`[DetailFill] Remaining after filtering processed: ${remaining.length}`);

  // Split by worker (round-robin)
  const myListings = remaining.filter((_, idx) => idx % totalWorkers === workerId - 1);
  console.log(`[DetailFill] This worker's share: ${myListings.length} listings`);

  if (myListings.length === 0) {
    console.log("[DetailFill] Nothing to do. Exiting.");
    return;
  }

  // Launch browser
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright-extra");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  chromium.use(StealthPlugin());

  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();
  await applyBandwidthSaver(page);

  console.log(`[DetailFill] Browser launched. UA: ${userAgent.substring(0, 60)}...`);

  let consecutiveBlocks = 0;
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[DetailFill] Shutting down, saving progress...");
    saveProgress(progress, workerId);
    console.log(`[DetailFill] Progress saved. Updated: ${progress.totalUpdated}, Skipped: ${progress.totalSkipped}, Errors: ${progress.totalErrors}`);
  };
  process.on("SIGINT", () => { shutdown(); process.exit(0); });
  process.on("SIGTERM", () => { shutdown(); process.exit(0); });

  const toProcess = myListings.slice(0, batchSize);
  console.log(`[DetailFill] Will process ${toProcess.length} listings this run.\n`);

  for (let i = 0; i < toProcess.length; i++) {
    if (shuttingDown) break;

    const listing = toProcess[i];
    const { external_id, url, title } = listing;

    console.log(`[DetailFill] [${i + 1}/${toProcess.length}] ${external_id}: ${title?.substring(0, 60) || "?"}`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      const pageTitle = await page.title();
      if (pageTitle.includes("ShieldSquare") || pageTitle.includes("Captcha")) {
        consecutiveBlocks++;
        console.error(`[DetailFill]   ⚠️  Bot protection! (${consecutiveBlocks}/3)`);
        if (consecutiveBlocks >= 3) {
          console.error("[DetailFill]   🛑 Too many blocks. Saving and exiting.");
          break;
        }
        console.log("[DetailFill]   Waiting 5 minutes before retrying...");
        await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
        i--; // retry
        continue;
      }
      consecutiveBlocks = 0;

      const html = await page.content();
      const sizeM2 = extractSizeFromDetail(html);
      const landType = extractLandTypeFromDetail(html, title);

      const updateData: Record<string, any> = {};
      if (sizeM2 !== null) updateData.size_m2 = sizeM2;
      if (landType !== null) updateData.land_type = landType;

      if (Object.keys(updateData).length > 0) {
        // Update the DB
        const { error: updateError } = await supabase
          .from("listings")
          .update(updateData)
          .eq("external_id", external_id);

        if (updateError) {
          await dbLog(supabase, workerId, `❌ DB update error for ${external_id}: ${updateError.message}`, "error");
          progress.totalErrors++;
        } else {
          const logDetails = [
            sizeM2 !== null ? `size_m2 = ${sizeM2} m²` : null,
            landType !== null ? `land_type = ${landType}` : null,
          ].filter(Boolean).join(", ");
          await dbLog(supabase, workerId, `✅ ${external_id}: Updated ${logDetails} (${title?.substring(0, 35) || ""})`, "success");
          progress.totalUpdated++;
        }
      } else {
        await dbLog(supabase, workerId, `⏭️ ${external_id}: No size or land type found on detail page (${title?.substring(0, 35) || ""})`, "warning");
        progress.totalSkipped++;
      }

      progress.processedIds.push(external_id);

      // Save progress every 10 listings
      if ((i + 1) % 10 === 0) {
        saveProgress(progress, workerId);
        await dbLog(supabase, workerId, `📊 Progress: ${i + 1}/${toProcess.length}. Updated: ${progress.totalUpdated}, Skipped: ${progress.totalSkipped}`, "info");
      }

      // Random delay between detail page fetches (3-7 seconds)
      const delay = 3000 + Math.floor(Math.random() * 4000);
      await new Promise((r) => setTimeout(r, delay));

    } catch (err: any) {
      console.error(`[DetailFill]   ❌ Error: ${err.message}`);
      progress.totalErrors++;
      progress.processedIds.push(external_id);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Final save
  saveProgress(progress, workerId);

  console.log(`\n${"═".repeat(60)}`);
  console.log("[DetailFill] 🏁 RUN COMPLETE");
  console.log(`[DetailFill]   Updated: ${progress.totalUpdated}`);
  console.log(`[DetailFill]   Skipped (no size on page): ${progress.totalSkipped}`);
  console.log(`[DetailFill]   Errors: ${progress.totalErrors}`);
  console.log(`[DetailFill]   Total processed: ${progress.processedIds.length}`);
  console.log(`${"═".repeat(60)}\n`);

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error("[DetailFill] Fatal error:", err);
  process.exit(1);
});
