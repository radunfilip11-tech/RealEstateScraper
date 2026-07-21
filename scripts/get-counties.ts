import { chromium } from "playwright";

async function getCounties() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("https://www.njuskalo.hr/prodaja-stanova");
  
  // Njuškalo has a location filter sidebar or something similar.
  // We can look at hrefs inside the location filter
  const links = await page.$$eval("a[href*='/prodaja-stanova/']", (elements) =>
    elements.map((e) => (e as HTMLAnchorElement).href)
  );
  
  const uniqueLinks = [...new Set(links)];
  console.log(uniqueLinks);
  await browser.close();
}

getCounties().catch(console.error);
