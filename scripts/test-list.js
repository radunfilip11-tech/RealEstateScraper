require('dotenv').config({ path: '.env.local' });
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto("https://www.njuskalo.hr/prodaja-stanova", { waitUntil: "domcontentloaded" });
  
  const html = await page.content();
  
  const itemRegex = /<li[^>]*EntityList-item[^>]*>[\s\S]*?<article[^>]*class="[^"]*entity-body[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
  const items = html.match(itemRegex) || [];
  
  let vauVauCount = 0;
  for (const item of items) {
    if (/VauVau/i.test(item)) {
      vauVauCount++;
    }
  }
  
  console.log("Total items parsed:", items.length);
  console.log("VauVau count:", vauVauCount);
  
  await browser.close();
}

main().catch(console.error);
