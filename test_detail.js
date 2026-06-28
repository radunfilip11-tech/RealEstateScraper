const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

chromium.use(StealthPlugin());

function stripHtml(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDetailPageHTML(html) {
  let price = null;
  let priceNumeric = null;
  let location = null;
  let sizeM2 = null;

  // --- Price ---
  const priceMatch = html.match(
    /ClassifiedDetailSummary-priceDomestic"[^>]*>([\s\S]*?)<\/dd>/i
  );
  if (priceMatch) {
    price = stripHtml(priceMatch[1]);
    const numStr = price
      .replace(/[^\d.,]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = parseFloat(numStr);
    if (!isNaN(parsed)) priceNumeric = parsed;
  }

  // --- Location ---
  const locMatch = html.match(
    /Lokacija<\/span>[\s\S]*?ClassifiedDetailBasicDetails-listDefinition"[^>]*>[\s\S]*?textWrapContainer"[^>]*>([\s\S]*?)<\/span>/i
  );
  if (locMatch) {
    location = stripHtml(locMatch[1]) || null;
  }

  // --- Size ---
  const sizeMatch = html.match(
    /(?:površina|Površina)<\/span>[\s\S]*?textWrapContainer"[^>]*>([\s\S]*?)<\/span>/i
  );
  if (sizeMatch) {
    const sizeText = stripHtml(sizeMatch[1]);
    const sizeStr = sizeText.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = parseFloat(sizeStr);
    if (!isNaN(parsed)) sizeM2 = parsed;
  }

  return { price, priceNumeric, location, sizeM2 };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb"
  });

  const page = await context.newPage();
  await page.goto("https://www.njuskalo.hr/nekretnine/stan-sinj-57.00-m2-oglas-49019762", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  
  const html = await page.content();
  const parsed = parseDetailPageHTML(html);
  
  console.log("Parsed result:", parsed);
  
  // Dump interesting parts of HTML if missing
  if (!parsed.price || !parsed.location) {
      console.log("Missing data! Dumping basic details HTML...");
      const basicDetails = await page.evaluate(() => {
          const bd = document.querySelector('.ClassifiedDetailBasicDetails, [class*="BasicDetails"]');
          return bd ? bd.outerHTML.substring(0, 2000) : "Not found";
      });
      console.log(basicDetails);
  }

  await browser.close();
})();
