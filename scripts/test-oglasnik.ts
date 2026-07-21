import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";

chromium.use(StealthPlugin());

async function run() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  
  console.log("Navigating to Oglasnik...");
  await page.goto("https://www.oglasnik.hr/stanovi-prodaja?sort=newest", { waitUntil: "domcontentloaded" });
  
  const html = await page.content();
  fs.writeFileSync("scratch/oglasnik.html", html, "utf-8");
  console.log("Saved to scratch/oglasnik.html");
  
  await browser.close();
}

run().catch(console.error);
