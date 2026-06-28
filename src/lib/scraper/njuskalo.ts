import type { ListingInsert } from "@/lib/supabase/types";

interface ScrapeOptions {
  maxPages?: number;
  categories?: string[];
  delayMs?: number;
  countySlug?: string | null;
}

const NJUSKALO_BASE = "https://www.njuskalo.hr";

const CATEGORIES: Record<string, string> = {
  stanovi: "/prodaja-stanova",
  kuce: "/prodaja-kuca",
  zemljista: "/prodaja-zemljista",
  poslovni_prostori: "/prodaja-poslovnih-prostora",
  vikendice: "/vikendice",
  garaze: "/prodaja-garaza",
  novogradnja: "/novogradnja",
  najam_stanova: "/iznajmljivanje-stanova",
  najam_kuca: "/iznajmljivanje-kuca",
  najam_poslovnih_prostora: "/iznajmljivanje-poslovnih-prostora",
};

/**
 * Strip HTML tags and Vue/SSR comment nodes from a string.
 */
function stripHtml(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse listing items from Njuškalo search results HTML.
 *
 * Real HTML structure (as of June 2026):
 *   <li class="EntityList-item ...">
 *     <article class="entity-body cf">
 *       <h3 class="entity-title">
 *         <a href="/nekretnine/...-oglas-ID" name="ID"><span>TITLE</span></a>
 *       </h3>
 *       <div class="entity-thumbnail"><img src="..."></div>
 *       <div class="entity-description">...Stambena površina: X m2...Lokacija: Y...</div>
 *       <div class="entity-prices">
 *         <strong class="price price--hrk">349.000 €</strong>
 *       </div>
 *     </article>
 *   </li>
 */
function parseListingsFromHTML(
  html: string,
  category: string
): ListingInsert[] {
  const listings: ListingInsert[] = [];

  // Match each <article class="entity-body cf">...</article> block
  // Using <article> instead of <li> because <li> can be nested, causing the regex to stop too early
  const itemRegex =
    /<article[^>]*class="[^"]*entity-body[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
  const items = html.match(itemRegex) || [];

  for (const item of items) {
    try {
      // --- External ID ---
      const idMatch = item.match(/name="(\d+)"/);
      if (!idMatch) continue;
      const externalId = idMatch[1];

      // --- URL ---
      const urlMatch = item.match(/href="(\/nekretnine\/[^"]+)"/);
      const url = urlMatch ? `${NJUSKALO_BASE}${urlMatch[1]}` : "";
      if (!url) continue;

      // --- Title ---
      const titleMatch = item.match(
        /class="entity-title"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i
      );
      const title = titleMatch
        ? stripHtml(titleMatch[1])
        : `Oglas ${externalId}`;

      // --- Image ---
      const imgMatch = item.match(
        /src="(https:\/\/www\.njuskalo\.hr\/image[^"]+)"/i
      );
      const imageUrl = imgMatch ? imgMatch[1] : null;

      // --- Price ---
      let price: string | null = null;
      let priceNumeric: number | null = null;
      const priceMatch = item.match(
        /class="price[^"]*"[^>]*>([\s\S]*?)<\/strong>/i
      );
      if (priceMatch) {
        price = stripHtml(priceMatch[1]);
        const numStr = price
          .replace(/[^\d.,]/g, "")
          .replace(/\./g, "")
          .replace(",", ".");
        const parsed = parseFloat(numStr);
        if (!isNaN(parsed)) {
          priceNumeric = parsed;
        }
      }

      // --- Description ---
      let description: string | null = null;
      const descMatch = item.match(
        /class="entity-description"[^>]*>([\s\S]*?)<\/div>/i
      );
      if (descMatch) {
        description = stripHtml(descMatch[1]).substring(0, 500) || null;
      }

      // --- Location ---
      let location: string | null = null;
      let locationCounty: string | null = null;
      let locationCity: string | null = null;
      let locationNeighborhood: string | null = null;

      const locMatch = item.match(
        /Lokacija:<\/span>\s*(?:<!--[\s\S]*?-->)?\s*([\s\S]*?)(?:<!--|<br|<\/div)/i
      );
      if (locMatch) {
        location = stripHtml(locMatch[1]) || null;
        if (location) {
          const parts = location.split(",").map((s) => s.trim());
          if (parts.length > 0) locationCity = parts[0] || null;
          if (parts.length > 1) locationNeighborhood = parts[1] || null;
          
          if (locationCity) {
            const cityToCounty: Record<string, string> = {
              "Donji Grad": "Grad Zagreb", "Gornji Grad - Medveščak": "Grad Zagreb", "Trnje": "Grad Zagreb", 
              "Maksimir": "Grad Zagreb", "Peščenica - Žitnjak": "Grad Zagreb", "Novi Zagreb - Istok": "Grad Zagreb", 
              "Novi Zagreb - Zapad": "Grad Zagreb", "Trešnjevka - Sjever": "Grad Zagreb", "Trešnjevka - Jug": "Grad Zagreb", 
              "Črnomerec": "Grad Zagreb", "Gornja Dubrava": "Grad Zagreb", "Donja Dubrava": "Grad Zagreb", 
              "Stenjevec": "Grad Zagreb", "Podsused - Vrapče": "Grad Zagreb", "Podsljeme": "Grad Zagreb", 
              "Sesvete": "Grad Zagreb", "Brezovica": "Grad Zagreb", "Zaprešić": "Zagrebačka", "Zaprešić - Okolica": "Zagrebačka", 
              "Velika Gorica": "Zagrebačka", "Velika Gorica - Okolica": "Zagrebačka", "Samobor": "Zagrebačka", 
              "Samobor - Okolica": "Zagrebačka", "Sveta Nedelja": "Zagrebačka", "Dugo Selo": "Zagrebačka", 
              "Ivanić-Grad": "Zagrebačka", "Jastrebarsko": "Zagrebačka", "Sveti Ivan Zelina": "Zagrebačka", 
              "Vrbovec": "Zagrebačka", "Rijeka": "Primorsko-goranska", "Krk": "Primorsko-goranska", 
              "Dobrinj": "Primorsko-goranska", "Crikvenica": "Primorsko-goranska", "Malinska-Dubašnica": "Primorsko-goranska", 
              "Opatija": "Primorsko-goranska", "Kastav": "Primorsko-goranska", "Viškovo": "Primorsko-goranska", 
              "Baška": "Primorsko-goranska", "Omišalj": "Primorsko-goranska", "Punat": "Primorsko-goranska", 
              "Vrbnik": "Primorsko-goranska", "Novi Vinodolski": "Primorsko-goranska", "Pula": "Istarska", "Poreč": "Istarska", 
              "Rovinj": "Istarska", "Umag": "Istarska", "Vodnjan": "Istarska", "Medulin": "Istarska", "Labin": "Istarska", 
              "Pazin": "Istarska", "Novigrad": "Istarska", "Split": "Splitsko-dalmatinska", "Kaštela": "Splitsko-dalmatinska", 
              "Makarska": "Splitsko-dalmatinska", "Omiš": "Splitsko-dalmatinska", "Trogir": "Splitsko-dalmatinska", 
              "Solin": "Splitsko-dalmatinska", "Sinj": "Splitsko-dalmatinska", "Brač": "Splitsko-dalmatinska", 
              "Hvar": "Splitsko-dalmatinska", "Zadar": "Zadarska", "Biograd na Moru": "Zadarska", "Nin": "Zadarska", 
              "Pag": "Zadarska", "Vir": "Zadarska", "Šibenik": "Šibensko-kninska", "Šibenik - Okolica": "Šibensko-kninska", 
              "Vodice": "Šibensko-kninska", "Knin": "Šibensko-kninska", "Osijek": "Osječko-baranjska", "Đakovo": "Osječko-baranjska", 
              "Našice": "Osječko-baranjska", "Valpovo": "Osječko-baranjska", "Beli Manastir": "Osječko-baranjska", 
              "Belišće": "Osječko-baranjska", "Varaždin": "Varaždinska", "Karlovac": "Karlovačka", "Sisak": "Sisačko-moslavačka", 
              "Slavonski Brod": "Brodsko-posavska", "Dubrovnik": "Dubrovačko-neretvanska", "Vinkovci": "Vukovarsko-srijemska", 
              "Vukovar": "Vukovarsko-srijemska", "Koprivnica": "Koprivničko-križevačka", "Bjelovar": "Bjelovarsko-bilogorska", 
              "Čakovec": "Međimurska", "Požega": "Požeško-slavonska", "Virovitica": "Virovitičko-podravska", "Gospić": "Ličko-senjska", 
              "Otočac": "Ličko-senjska", "Novalja": "Ličko-senjska", "Krapina": "Krapinsko-zagorska"
            };
            locationCounty = cityToCounty[locationCity] || null;
          }
        }
      }

      // --- Size (m²) ---
      let sizeM2: number | null = null;
      const sizeMatch = item.match(
        /(?:površina|Površina)[:\s]*(\d+[\s.,]?\d*)\s*m[²2]/
      );
      if (sizeMatch) {
        const sizeStr = sizeMatch[1].replace(/\s/g, "").replace(",", ".");
        sizeM2 = parseFloat(sizeStr);
        if (isNaN(sizeM2)) sizeM2 = null;
      }

      // --- Property type & Transaction type ---
      let propertyType = null;
      let transactionType = "Prodaja"; // default

      if (category === "stanovi") propertyType = "Stan";
      else if (category === "kuce") propertyType = "Kuća";
      else if (category === "zemljista") propertyType = "Zemljište";
      else if (category === "poslovni_prostori") propertyType = "Poslovni prostor";
      else if (category === "vikendice") propertyType = "Vikendica";
      else if (category === "garaze") propertyType = "Garaža";
      else if (category === "novogradnja") propertyType = "Novogradnja";
      else if (category === "najam_stanova") { propertyType = "Stan"; transactionType = "Najam"; }
      else if (category === "najam_kuca") { propertyType = "Kuća"; transactionType = "Najam"; }
      else if (category === "najam_poslovnih_prostora") { propertyType = "Poslovni prostor"; transactionType = "Najam"; }

      // --- Advertiser type ---
      let advertiserType: string | null = null;
      if (/privatni/i.test(item)) {
        advertiserType = "Privatni";
      } else if (/agencij/i.test(item)) {
        advertiserType = "Agencija";
      }

      listings.push({
        external_id: `njuskalo-${externalId}`,
        title,
        price,
        price_numeric: priceNumeric,
        size_m2: sizeM2,
        location,
        location_region: null, // Scraper doesn't reliably get region, we get county/city
        location_county: locationCounty,
        location_city: locationCity,
        location_neighborhood: locationNeighborhood,
        property_type: propertyType,
        transaction_type: transactionType,
        advertiser_type: advertiserType,
        url,
        image_url: imageUrl,
        source: "njuskalo",
        description,
        status: "Novi",
        hidden: false,
      });
    } catch (e) {
      console.error("[Scraper] Error parsing listing:", e);
      continue;
    }
  }

  return listings;
}

/**
 * Random delay between min and max milliseconds to mimic human behavior.
 */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrape listings from Njuškalo using Playwright + Stealth plugin.
 *
 * Launches a headless Chromium browser with the stealth plugin to bypass
 * ShieldSquare bot protection. Includes human-like behavior (random delays,
 * scrolling) to avoid triggering captcha challenges.
 */
export async function scrapeNjuskalo(
  options: ScrapeOptions = {}
): Promise<ListingInsert[]> {
  const { maxPages = 1, delayMs = 3000, categories = options.categories || Object.keys(CATEGORIES) } = options;

  const allListings: ListingInsert[] = [];

  // Dynamic imports to avoid build-time issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright-extra");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");

  // Register stealth plugin
  chromium.use(StealthPlugin());

  console.log(`[Scraper] Launching headless browser to scrape ${categories.length} categories...`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

  try {
    const context = await browser.newContext({
      locale: "hr-HR",
      timezoneId: "Europe/Zagreb",
      userAgent: randomUA,
      viewport: { width: 1920, height: 1080 },
      extraHTTPHeaders: {
        "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const page = await context.newPage();

    for (const category of categories) {
      const categoryPath = CATEGORIES[category];
      if (!categoryPath) continue;

      const countiesToScrape = options.countySlug ? options.countySlug.split(",") : [null];

      for (const county of countiesToScrape) {
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          const basePath = county ? `${categoryPath}/${county}` : categoryPath;
          const url = `${NJUSKALO_BASE}${basePath}?page=${pageNum}`;
          console.log(`[Scraper] [${category}] [${county || "all"}] Navigating to page ${pageNum}: ${url}`);

          try {
            await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });

            await randomDelay(1500, 3000);

            const title = await page.title();
            if (title.includes("ShieldSquare") || title.includes("Captcha")) {
              console.error(`[Scraper] Bot protection detected on ${category} page ${pageNum}.`);
              break; // Stop this county
            }

            await page.evaluate(() => {
              window.scrollBy(0, Math.floor(Math.random() * 500) + 300);
            });
            await randomDelay(500, 1000);

            const html = await page.content();
            const pageListings = parseListingsFromHTML(html, category);
            console.log(`[Scraper] [${category}] [${county || "all"}] Page ${pageNum}: found ${pageListings.length} listings`);

            allListings.push(...pageListings);

            // Delay between pages to avoid bot detection
            const delay = delayMs + Math.floor(Math.random() * 2000);
            console.log(`[Scraper] Waiting ${delay}ms before next action...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          } catch (error) {
            console.error(`[Scraper] Error on ${category} [${county || "all"}] page ${pageNum}:`, error);
            break; // Stop this county on error
          }
        } // end pageNum loop
      } // end county loop
    } // end category loop

    await context.close();
  } finally {
    await browser.close();
    console.log("[Scraper] Browser closed.");
  }

  console.log(`[Scraper] Total listings scraped: ${allListings.length}`);
  return allListings;
}
