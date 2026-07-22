async function test() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto("https://www.oglasnik.hr/stanovi-prodaja?page=1", { waitUntil: "networkidle" });
  
  const listings = await page.$$eval('a[href*="-oglas-"]', (els: HTMLAnchorElement[]) => {
    return els.map(el => {
      // Find title, price, location inside the card
      const titleEl = el.querySelector('h2, h3, h4, .text-lg, .font-semibold');
      const priceEl = el.querySelector('.text-2xl, .text-xl, [class*="price"]');
      const locationEl = el.querySelector('.text-sm.text-gray-500, [class*="location"]');
      
      return {
        href: el.href,
        title: titleEl?.textContent?.trim(),
        price: priceEl?.textContent?.trim(),
        location: locationEl?.textContent?.trim(),
        rawText: el.textContent?.trim().substring(0, 100).replace(/\s+/g, ' ')
      };
    });
  });
  
  console.log(`Found ${listings.length} listings`);
  console.log("First 3 listings:");
  console.log(JSON.stringify(listings.slice(0, 3), null, 2));
  
  await browser.close();
}

test().catch(console.error);
