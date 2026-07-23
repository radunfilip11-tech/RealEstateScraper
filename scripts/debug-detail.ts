/**
 * Debug script: Open a specific Njuškalo listing detail page and dump
 * all the structured data fields we can find (especially size/površina).
 */
import "dotenv/config";

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright-extra");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  chromium.use(StealthPlugin());

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Block images/css/fonts/media
  await page.route("**/*", (route: any) => {
    const rt = route.request().resourceType();
    if (["image", "stylesheet", "font", "media", "other"].includes(rt)) {
      return route.abort();
    }
    return route.continue();
  });

  // Use a listing that has NO size in its title
  const url = "https://www.njuskalo.hr/nekretnine/atraktivno-zemljiste-investitore-oglas-49828443";
  console.log(`Fetching detail page: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  const title = await page.title();
  console.log(`Page title: ${title}`);

  if (title.includes("ShieldSquare") || title.includes("Captcha")) {
    console.log("BLOCKED by bot protection.");
    await browser.close();
    return;
  }

  const html = await page.content();

  // Look for any structured data table or property specs
  // Njuškalo detail pages typically have a ClassifiedDetailBasicDetails component
  // or a table with property attributes

  // 1. Check for "Površina" or "površina zemljišta" in the page
  const surfacePatterns = [
    /površina[^<]*?(\d[\d.\s,]*)\s*m[²2]/gi,
    /Površina zemljišta[^<]*?(\d[\d.\s,]*)\s*m[²2]/gi,
    /Veličina[^<]*?(\d[\d.\s,]*)\s*m[²2]/gi,
    /land.*?area[^<]*?(\d[\d.\s,]*)\s*m[²2]/gi,
  ];

  console.log("\n--- Searching for size patterns in HTML ---");
  for (const pat of surfacePatterns) {
    const matches = html.matchAll(pat);
    for (const m of matches) {
      // Show context around the match
      const idx = m.index!;
      const context = html.substring(Math.max(0, idx - 100), Math.min(html.length, idx + 200));
      console.log(`\nPattern match: ${m[0]}`);
      console.log(`Context: ...${context}...`);
    }
  }

  // 2. Look for any "ClassifiedDetail" data sections
  console.log("\n--- Looking for data-table / spec sections ---");
  const dataTableMatches = html.match(/class="[^"]*(?:ClassifiedDetail|property-details|attribute|spec|feature)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi);
  if (dataTableMatches) {
    console.log(`Found ${dataTableMatches.length} detail sections.`);
    for (let i = 0; i < Math.min(5, dataTableMatches.length); i++) {
      console.log(`\n[${i+1}]: ${dataTableMatches[i].substring(0, 300)}`);
    }
  }

  // 3. Look for any key-value pair containing m²
  console.log("\n--- All m² mentions ---");
  const m2mentions = html.match(/[^<]{0,50}\d[\d.\s,]*\s*m[²2][^<]{0,20}/gi);
  if (m2mentions) {
    for (const mention of m2mentions.slice(0, 15)) {
      console.log(`  ${mention.trim()}`);
    }
  }

  // 4. Look for the specific data items in structured sections
  console.log("\n--- Looking for table-like data rows ---");
  const rows = html.match(/<li[^>]*>[\s\S]*?<\/li>/gi);
  if (rows) {
    const relevantRows = rows.filter((r: string) => /površin|veličin|m²|m2/i.test(r));
    console.log(`Found ${relevantRows.length} rows mentioning size.`);
    for (const row of relevantRows.slice(0, 10)) {
      console.log(`  ${row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
