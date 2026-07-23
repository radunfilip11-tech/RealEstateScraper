/**
 * Debug script: Check what data the HTML abstracts contain for land listings.
 * Uses the HTML fallback approach since browseListingsStore may be blocked.
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

  // Block images/css/fonts
  await page.route("**/*", (route: any) => {
    const rt = route.request().resourceType();
    if (["image", "stylesheet", "font", "media", "other"].includes(rt)) {
      return route.abort();
    }
    return route.continue();
  });

  const url = "https://www.njuskalo.hr/prodaja-zemljista/zagreb?page=1";
  console.log(`Fetching: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for articles
  try {
    await page.waitForSelector('article[class*="entity-body"]', { timeout: 15000 });
  } catch {
    console.log("No article cards found. Page may be blocked.");
    const title = await page.title();
    console.log("Page title:", title);
    const htmlSnippet = (await page.content()).substring(0, 2000);
    console.log("HTML snippet:", htmlSnippet);
    await browser.close();
    return;
  }

  const html = await page.content();
  
  // Check if browseListingsStore exists
  const hasStore = html.includes("browseListingsStore");
  console.log(`browseListingsStore found: ${hasStore}`);

  if (hasStore) {
    const storeIdx = html.indexOf("browseListingsStore");
    const blob = html.slice(storeIdx, storeIdx + 500);
    console.log(`Store snippet: ${blob.substring(0, 300)}`);
    
    // Extract a few listings and show their abstracts
    const fullBlob = html.slice(storeIdx);
    const chunks = fullBlob.split('{"id":');
    let shown = 0;
    for (const chunk of chunks) {
      if (!/\"categorySlug\":\"nekretnine\"/.test(chunk)) continue;
      if (shown >= 5) break;

      const idMatch = chunk.match(/^(\d+)/);
      const titleMatch = chunk.match(/"title":"((?:\\.|[^"\\])*)"/);
      const absMatch = chunk.match(/"abstracts":\s*\[([\s\S]*?)\]/);
      
      const id = idMatch ? idMatch[1] : "?";
      let title = titleMatch ? titleMatch[1] : "?";
      try { title = JSON.parse(`"${title}"`); } catch {}

      const abstractValues: string[] = [];
      if (absMatch) {
        const valRe = /"value":"((?:\\.|[^"\\])*)"/g;
        let vm;
        while ((vm = valRe.exec(absMatch[1])) !== null) {
          try { abstractValues.push(JSON.parse(`"${vm[1]}"`)); } catch { abstractValues.push(vm[1]); }
        }
      }

      console.log(`\n[${++shown}] ID: ${id}`);
      console.log(`    Title: ${title}`);
      console.log(`    Abstracts (${abstractValues.length}): ${JSON.stringify(abstractValues)}`);
      console.log("-".repeat(80));
    }
  } else {
    console.log("browseListingsStore NOT found. Showing raw HTML card abstracts...");
    // Fallback: look at raw HTML for abstract-like elements
    const abstractMatches = html.match(/class="[^"]*abstract[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/g);
    console.log(`Found ${abstractMatches?.length || 0} abstract elements.`);
    if (abstractMatches) {
      for (let i = 0; i < Math.min(5, abstractMatches.length); i++) {
        console.log(`\nAbstract ${i + 1}: ${abstractMatches[i].substring(0, 300)}`);
      }
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
