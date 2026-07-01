import type { ListingInsert } from "@/lib/supabase/types";

interface ScrapeOptions {
  maxPages?: number;
  categories?: string[];
  delayMs?: number;
  countySlug?: string | null;
}

export const NJUSKALO_BASE = "https://www.njuskalo.hr";

export const CATEGORIES: Record<string, string> = {
  // Sale categories
  stanovi: "/prodaja-stanova",
  kuce: "/prodaja-kuca",
  zemljista: "/prodaja-zemljista",
  poslovni_prostori: "/prodaja-poslovnih-prostora",
  vikendice: "/vikendice",
  garaze: "/prodaja-garaza",
  novogradnja: "/novogradnja",
  luksuzne_kuce: "/prodaja-luksuznih-kuca",
  luksuzni_stanovi: "/prodaja-luksuznih-stanova",
  // Rent categories
  najam_stanova: "/iznajmljivanje-stanova",
  najam_kuca: "/iznajmljivanje-kuca",
  najam_poslovnih_prostora: "/iznajmljivanje-poslovnih-prostora",
  najam_garaza: "/iznajmljivanje-garaza",
  najam_zemljista: "/zakup-zemljista",
  najam_luksuznih_kuca: "/iznajmljivanje-luksuznih-kuca",
  najam_luksuznih_stanova: "/iznajmljivanje-luksuznih-stanova",
};

export const WORKER_CATEGORIES: Record<number, string[]> = {
  // Worker 1: High-traffic sprint — only 6 categories, ~1min cycle
  1: [
    "stanovi", "kuce", "zemljista", "najam_stanova",
  ],
  // Worker 2: Full coverage — 10 categories, ~4-5min cycle
  // High-traffic categories interleaved for even spacing
  2: [
    "najam_kuca", "vikendice", "poslovni_prostori", "luksuzne_kuce",
    "luksuzni_stanovi", "garaze","novogradnja", "najam_garaza", 
    "najam_zemljista", "najam_poslovnih_prostora",
    "najam_luksuznih_kuca", "najam_luksuznih_stanova",
  ],
};

/**
 * Strip HTML tags and Vue/SSR comment nodes from a string.
 */
export function stripHtml(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * City-to-county mapping for resolving county from city name.
 * Used by both search card parser and detail page parser.
 */
export const CITY_TO_COUNTY: Record<string, string> = {
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
  "Otočac": "Ličko-senjska", "Novalja": "Ličko-senjska", "Krapina": "Krapinsko-zagorska",
  // County names map to themselves (detail pages return county as the first part)
  "Grad Zagreb": "Grad Zagreb", "Zagrebačka": "Zagrebačka", "Primorsko-goranska": "Primorsko-goranska",
  "Istarska": "Istarska", "Splitsko-dalmatinska": "Splitsko-dalmatinska", "Zadarska": "Zadarska",
  "Šibensko-kninska": "Šibensko-kninska", "Osječko-baranjska": "Osječko-baranjska", "Varaždinska": "Varaždinska",
  "Karlovačka": "Karlovačka", "Sisačko-moslavačka": "Sisačko-moslavačka", "Brodsko-posavska": "Brodsko-posavska",
  "Dubrovačko-neretvanska": "Dubrovačko-neretvanska", "Vukovarsko-srijemska": "Vukovarsko-srijemska",
  "Koprivničko-križevačka": "Koprivničko-križevačka", "Bjelovarsko-bilogorska": "Bjelovarsko-bilogorska",
  "Međimurska": "Međimurska", "Požeško-slavonska": "Požeško-slavonska", "Virovitičko-podravska": "Virovitičko-podravska",
  "Ličko-senjska": "Ličko-senjska", "Krapinsko-zagorska": "Krapinsko-zagorska",
  // Additional cities/areas that appear on detail pages
  "Murter": "Šibensko-kninska", "Primošten": "Šibensko-kninska", "Rogoznica": "Šibensko-kninska",
  "Trogir - Okolica": "Splitsko-dalmatinska", "Kaštela - Okolica": "Splitsko-dalmatinska",
  "Marina": "Splitsko-dalmatinska", "Podstrana": "Splitsko-dalmatinska", "Stobreč": "Splitsko-dalmatinska",
  "Supetar": "Splitsko-dalmatinska", "Bol": "Splitsko-dalmatinska", "Jelsa": "Splitsko-dalmatinska",
  "Stari Grad": "Splitsko-dalmatinska", "Vis": "Splitsko-dalmatinska", "Komiža": "Splitsko-dalmatinska",
  "Korčula": "Dubrovačko-neretvanska", "Orebić": "Dubrovačko-neretvanska", "Ploče": "Dubrovačko-neretvanska",
  "Metković": "Dubrovačko-neretvanska", "Cavtat": "Dubrovačko-neretvanska",
};

/**
 * Parse price, location, and size from a Njuškalo detail page HTML.
 *
 * Detail page structure (as of June 2026):
 *   Price:    <dd class="ClassifiedDetailSummary-priceDomestic">195.000 €</dd>
 *   Location: <dt>Lokacija</dt><dd>Splitsko-dalmatinska, Trogir - Okolica, Plano</dd>
 *   Size:     <dt>Površina|Stambena površina</dt><dd>999,00 m²</dd>
 *   (all inside ClassifiedDetailBasicDetails-list)
 */
export function parseDetailPageHTML(html: string): {
  price: string | null;
  priceNumeric: number | null;
  location: string | null;
  locationCounty: string | null;
  locationCity: string | null;
  locationNeighborhood: string | null;
  sizeM2: number | null;
  advertiserType: string | null;
  isPromoted: boolean;
  publishedAt: string | null;
} {
  let price: string | null = null;
  let priceNumeric: number | null = null;
  let location: string | null = null;
  let locationCounty: string | null = null;
  let locationCity: string | null = null;
  let locationNeighborhood: string | null = null;
  let sizeM2: number | null = null;
  let advertiserType: string | null = null;

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
  // Pattern: <dt>...Lokacija...</dt><dd>...Splitsko-dalmatinska, City, Neighborhood...</dd>
  const locMatch = html.match(
    /Lokacija<\/span>[\s\S]*?ClassifiedDetailBasicDetails-listDefinition"[^>]*>[\s\S]*?textWrapContainer"[^>]*>([\s\S]*?)<\/span>/i
  );
  if (locMatch) {
    location = stripHtml(locMatch[1]) || null;
    if (location) {
      // Detail pages return: "County, City, Neighborhood" (3 parts)
      // or sometimes "City, Neighborhood" (2 parts)
      const parts = location.split(",").map((s) => s.trim());
      if (parts.length >= 3) {
        // Full format: County, City, Neighborhood
        locationCounty = CITY_TO_COUNTY[parts[0]] || parts[0] || null;
        locationCity = parts[1] || null;
        locationNeighborhood = parts[2] || null;
      } else if (parts.length === 2) {
        locationCity = parts[0] || null;
        locationNeighborhood = parts[1] || null;
        locationCounty = CITY_TO_COUNTY[parts[0]] || null;
      } else if (parts.length === 1) {
        locationCity = parts[0] || null;
        locationCounty = CITY_TO_COUNTY[parts[0]] || null;
      }
    }
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

  // --- Advertiser type ---
  if (/korisnik nije trgovac/i.test(html)) {
    advertiserType = "Privatni";
  }

  // --- Promoted (detail page contains "Istaknuto oglašavanje" or "Ovaj oglas je istaknut.") ---
  const isPromoted = /istaknuto ogla/i.test(html) || /oglas je istaknut/i.test(html) || /VauVau/i.test(html) || /SuperVau/i.test(html);

  // --- Published at (detail page has <time datetime="..."> element) ---
  let publishedAt: string | null = null;
  const pubMatch = html.match(/<time[^>]*datetime="([^"]+)"/i);
  if (pubMatch) {
    publishedAt = pubMatch[1];
  }

  return { price, priceNumeric, location, locationCounty, locationCity, locationNeighborhood, sizeM2, advertiserType, isPromoted, publishedAt };
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
 *
 * Note: "SuperVau" (premium) cards use a different layout with only a teaser
 * paragraph and NO price/location data. These are enriched by visiting the
 * detail page after initial parsing (see enrichIncompleteListings).
 */
export function parseListingsFromHTML(
  html: string,
  category: string
): ListingInsert[] {
  const listings: ListingInsert[] = [];

  // Match the outer <li> and the <article> block.
  // We need the <li> wrapper because it contains classes like "EntityList-item--VauVau"
  const itemRegex =
    /<li[^>]*EntityList-item[^>]*>[\s\S]*?<article[^>]*class="[^"]*entity-body[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
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
            locationCounty = CITY_TO_COUNTY[locationCity] || null;
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
      else if (category === "luksuzne_kuce") propertyType = "Luksuzna kuća";
      else if (category === "luksuzni_stanovi") propertyType = "Luksuzni stan";
      else if (category === "najam_stanova") { propertyType = "Stan"; transactionType = "Najam"; }
      else if (category === "najam_kuca") { propertyType = "Kuća"; transactionType = "Najam"; }
      else if (category === "najam_poslovnih_prostora") { propertyType = "Poslovni prostor"; transactionType = "Najam"; }
      else if (category === "najam_garaza") { propertyType = "Garaža"; transactionType = "Najam"; }
      else if (category === "najam_zemljista") { propertyType = "Zemljište"; transactionType = "Najam"; }
      else if (category === "najam_luksuznih_kuca") { propertyType = "Luksuzna kuća"; transactionType = "Najam"; }
      else if (category === "najam_luksuznih_stanova") { propertyType = "Luksuzni stan"; transactionType = "Najam"; }

      // --- Advertiser type ---
      let advertiserType: string | null = null;
      if (/korisnik nije trgovac/i.test(item)) {
        advertiserType = "Privatni";
      }

      // --- Promoted ---
      const strippedItem = stripHtml(item);
      const isPromoted = /istaknut/i.test(strippedItem) || /VauVau/i.test(item) || /SuperVau/i.test(item);

      // --- Published at ---
      let publishedAt: string | undefined = undefined;
      const pubMatch = item.match(/<time[^>]*datetime="([^"]+)"/i);
      if (pubMatch) {
        publishedAt = pubMatch[1];
      }

      // Debug: log raw HTML for listings missing price or location so we can fix regexes
      if (process.env.DEBUG_MISSING_FIELDS && (!price || !location)) {
        console.warn(
          `[Scraper][DEBUG] Missing fields for ${externalId} (price=${price}, location=${location})\n` +
          `--- RAW ARTICLE HTML ---\n${item}\n--- END ---`
        );
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
        is_promoted: isPromoted,
        published_at: publishedAt,
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
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
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
              // networkidle can be blocked by ads/trackers; domcontentloaded
              // fires early before Vue renders cards, so we wait for the
              // first card selector explicitly below.
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });

            const title = await page.title();
            if (title.includes("ShieldSquare") || title.includes("Captcha")) {
              console.error(`[Scraper] Bot protection detected on ${category} page ${pageNum}.`);
              break; // Stop this county
            }

            // Wait for Vue to mount and render at least one listing card.
            // This replaces the unreliable random delay that caused a race
            // condition where page.content() was called before Vue hydrated.
            try {
              await page.waitForSelector('article[class*="entity-body"]', {
                timeout: 15000,
              });
            } catch {
              // No cards appeared — could be an empty page or bot block.
              console.warn(`[Scraper] [${category}] No listing cards found on page ${pageNum} (empty or blocked).`);
            }

            // Human-like scroll after cards have loaded
            await page.evaluate(() => {
              window.scrollBy(0, Math.floor(Math.random() * 500) + 300);
            });
            await randomDelay(300, 700);

            const html = await page.content();
            const pageListings = parseListingsFromHTML(html, category);
            console.log(`[Scraper] [${category}] [${county || "all"}] Page ${pageNum}: found ${pageListings.length} listings`);

            // Enrich listings missing price/location by visiting their detail pages.
            // This handles SuperVau (premium) cards that only show a teaser on the
            // search results page but have full structured data on the detail page.
            // Also visit if advertiser type is missing, since it might only be on the detail page.
            const incomplete = pageListings.filter((l) => !l.price || !l.location || !l.advertiser_type);
            if (incomplete.length > 0) {
              console.log(`[Scraper] [${category}] ${incomplete.length} listings missing data — visiting detail pages...`);
              for (const listing of incomplete) {
                if (!listing.url) continue;
                try {
                  await randomDelay(1500, 3000); // Human-like delay before each detail visit
                  await page.goto(listing.url, {
                    waitUntil: "domcontentloaded",
                    timeout: 20000,
                  });
                  // Detail pages are server-rendered, no need for waitForSelector
                  await randomDelay(500, 1000);
                  const detailHtml = await page.content();
                  const detail = parseDetailPageHTML(detailHtml);

                  // Only fill in missing fields — don't overwrite existing ones
                  if (!listing.price && detail.price) {
                    listing.price = detail.price;
                    listing.price_numeric = detail.priceNumeric;
                  }
                  if (!listing.location && detail.location) {
                    listing.location = detail.location;
                    listing.location_county = detail.locationCounty;
                    listing.location_city = detail.locationCity;
                    listing.location_neighborhood = detail.locationNeighborhood;
                  }
                  if (!listing.size_m2 && detail.sizeM2) {
                    listing.size_m2 = detail.sizeM2;
                  }
                  if (!listing.advertiser_type && detail.advertiserType) {
                    listing.advertiser_type = detail.advertiserType;
                  }

                  console.log(
                    `[Scraper] Enriched ${listing.external_id}: price=${listing.price}, location=${listing.location}, size=${listing.size_m2}`
                  );
                } catch (err) {
                  console.warn(`[Scraper] Failed to enrich ${listing.external_id}:`, err);
                }
              }
            }

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

/**
 * Lightweight search-page-only scrape for the continuous monitor.
 * Uses an EXISTING Playwright page (browser stays alive across cycles).
 * Returns raw listing stubs from page 1 of a single category.
 */
export async function scrapeSearchPageOnly(
  page: any,
  category: string
): Promise<{ listings: ListingInsert[]; blocked: boolean }> {
  const categoryPath = CATEGORIES[category];
  if (!categoryPath) return { listings: [], blocked: false };

  const url = `${NJUSKALO_BASE}${categoryPath}?sort=new`;
  console.log(`[Monitor] [${category}] Loading search page: ${url}`);

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const title = await page.title();
    if (title.includes("ShieldSquare") || title.includes("Captcha")) {
      console.error(`[Monitor] [${category}] Bot protection detected!`);
      return { listings: [], blocked: true };
    }

    // Wait for Vue to render listing cards
    try {
      await page.waitForSelector('article[class*="entity-body"]', {
        timeout: 15000,
      });
    } catch {
      console.warn(`[Monitor] [${category}] No listing cards found (empty or blocked).`);
      return { listings: [], blocked: false };
    }

    // Human-like scroll
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 500) + 300);
    });
    await randomDelay(300, 600);

    const html = await page.content();
    const listings = parseListingsFromHTML(html, category);
    console.log(`[Monitor] [${category}] Found ${listings.length} listings on page 1.`);

    return { listings, blocked: false };
  } catch (error) {
    console.error(`[Monitor] [${category}] Error loading search page:`, error);
    return { listings: [], blocked: false };
  }
}

/**
 * Fetch a detail page using raw HTTP fetch with stolen Playwright cookies.
 * ~10x faster than navigating Playwright to the page.
 * Returns the parsed detail data including advertiser type.
 * 
 * @deprecated Use fetchDetailPagePlaywright instead - HTTP fetch is now
 * blocked by ShieldSquare's fingerprint detection after extended use.
 */
export async function fetchDetailPageHTTP(
  url: string,
  cookies: { name: string; value: string; domain: string }[],
  userAgent: string
): Promise<ReturnType<typeof parseDetailPageHTML>> {
  // Build cookie header string
  const cookieHeader = cookies
    .filter((c) => url.includes(c.domain) || c.domain.includes("njuskalo"))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cookie": cookieHeader,
      "Referer": "https://www.njuskalo.hr/",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  return parseDetailPageHTML(html);
}

/**
 * Fetch a detail page using Playwright browser navigation.
 * Slower than HTTP fetch (~3s vs ~200ms) but reliable against ShieldSquare
 * bot protection which requires JavaScript execution.
 * 
 * @param page - Playwright page instance (must be from an existing context)
 * @param url - Full URL of the detail page to fetch
 * @returns Parsed detail data + blocked flag if ShieldSquare detected
 */
export async function fetchDetailPagePlaywright(
  page: any,
  url: string
): Promise<ReturnType<typeof parseDetailPageHTML> & { blocked: boolean }> {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });

    // Check for bot protection
    const title = await page.title();
    if (title.includes("ShieldSquare") || title.includes("Captcha")) {
      console.error(`[Scraper] Bot protection detected on detail page: ${url}`);
      return {
        price: null,
        priceNumeric: null,
        location: null,
        locationCounty: null,
        locationCity: null,
        locationNeighborhood: null,
        sizeM2: null,
        advertiserType: null,
        isPromoted: false,
        publishedAt: null,
        blocked: true,
      };
    }

    // Small delay for any dynamic content to settle
    await randomDelay(200, 400);

    const html = await page.content();
    const detail = parseDetailPageHTML(html);

    return { ...detail, blocked: false };
  } catch (err) {
    // Re-throw with more context
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Playwright detail fetch failed for ${url}: ${message}`);
  }
}
