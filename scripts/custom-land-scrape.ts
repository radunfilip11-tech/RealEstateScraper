import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import * as dotenv from "dotenv";
import * as path from "path";
import { getSupabaseServerClient } from "../src/lib/supabase/server";
import {
  parseListingsFromSearchJSON,
  parseListingsFromHTML,
  fetchDetailPagePlaywright,
  randomDelay,
} from "../src/lib/scraper/njuskalo";
import type { ListingInsert } from "../src/lib/supabase/types";

dotenv.config({ path: path.resolve(__dirname, "../.env.production.local") });

chromium.use(stealth());

async function run() {
  const supabase = getSupabaseServerClient();
  const category = "zemljista";

  console.log(`[Custom Scrape] Launching browser...`);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  for (let pageNum = 1; pageNum <= 7; pageNum++) {
    const targetUrl = `https://www.njuskalo.hr/prodaja-zemljista/kastela?landTypeId=235&page=${pageNum}`;
    console.log(`\n[Custom Scrape] Loading target: ${targetUrl}`);
    
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await randomDelay(2000, 4000);

    const html = await page.content();
    let listings = parseListingsFromSearchJSON(html, category);
    if (listings.length === 0) {
      listings = parseListingsFromHTML(html, category);
    }

    console.log(`[Custom Scrape] Found ${listings.length} listings on page ${pageNum}.`);

    for (const listing of listings) {
    console.log(`\nProcessing: ${listing.external_id} - ${listing.title}`);
    try {
      await randomDelay(1500, 3000);
      const detail = await fetchDetailPagePlaywright(page, listing.url);
      
      listing.land_type = detail.landType || "Građevinsko"; // We know it's 235 (Građevinsko)
      if (detail.sizeM2) listing.size_m2 = detail.sizeM2;

      console.log(`  -> Land Type: ${listing.land_type}, Size: ${listing.size_m2} m2`);

      const { error } = await (supabase as any).from("listings").upsert([listing], { onConflict: "external_id" });
      if (error) {
        console.error(`  -> Insert Error:`, error.message);
      } else {
        console.log(`  -> Saved to DB successfully.`);
      }
    } catch (err: any) {
      console.error(`  -> Error fetching detail: ${err.message}`);
    }
  }
  }

  console.log("\n[Custom Scrape] Finished.");
  await browser.close();
}

run().catch(console.error);
