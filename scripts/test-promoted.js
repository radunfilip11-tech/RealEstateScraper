require('dotenv').config({ path: '.env.local' });
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto("https://www.njuskalo.hr/prodaja-stanova", { waitUntil: "domcontentloaded" });
  console.log("Page loaded. Looking for promoted ads...");
  
  const html = await page.content();
  
  // Find a list item that seems promoted
  const articles = html.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
  let promotedUrl = null;
  
  for (const article of articles) {
    if (article.includes("VauVau") || article.includes("SuperVau") || /istaknut/i.test(article)) {
      const match = article.match(/href="(\/nekretnine\/[^"]+)"/);
      if (match) {
        promotedUrl = "https://www.njuskalo.hr" + match[1];
        console.log("Found promoted ad:", promotedUrl);
        break;
      }
    }
  }
  
  if (!promotedUrl) {
    console.log("No promoted ad found on page 1.");
    await browser.close();
    return;
  }
  
  // Now fetch it using raw HTTP
  console.log("Fetching raw HTTP for:", promotedUrl);
  const res = await fetch(promotedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    }
  });
  const rawHtml = await res.text();
  console.log("Raw HTML length:", rawHtml.length);
  
  console.log("Check for 'Ovaj oglas je istaknut':", /Ovaj oglas je istaknut/i.test(rawHtml));
  console.log("Check for 'Istaknuto oglašavanje':", /Istaknuto ogla/i.test(rawHtml));
  console.log("Check for 'istaknut':", /istaknut/i.test(rawHtml));
  console.log("Check for 'VauVau':", /VauVau/i.test(rawHtml));
  
  // Try to find the actual badge text in the HTML
  if (!/Ovaj oglas je istaknut/i.test(rawHtml)) {
    console.log("Regex didn't match. Looking for the text surrounding the badge...");
    // Find what class is used for the info box
    const infoBox = rawHtml.match(/<div[^>]*class="[^"]*info[^"]*"[^>]*>[\s\S]*?<\/div>/gi);
    if (infoBox) {
      console.log("Found info boxes:", infoBox.length);
    }
    
    // Check __INITIAL_STATE__
    if (rawHtml.includes('window.__INITIAL_STATE__')) {
       console.log("Found INITIAL_STATE. It might be rendering from state.");
       const istakMatch = rawHtml.match(/.{0,50}istaknut.{0,50}/gi);
       if (istakMatch) {
         console.log("Matches of 'istaknut':", istakMatch);
       }
    }
  }
  
  await browser.close();
}

main().catch(console.error);
