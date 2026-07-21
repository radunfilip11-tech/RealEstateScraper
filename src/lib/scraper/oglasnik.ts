import type { ListingInsert } from "@/lib/supabase/types";
import { stripHtml } from "./njuskalo"; // we can reuse stripHtml

export const OGLASNIK_BASE = "https://www.oglasnik.hr";

// Oglasnik categories mapping
export const OGLASNIK_CATEGORIES: Record<string, string> = {
  // Sale categories
  stanovi: "/stanovi-prodaja",
  kuce: "/kuce-prodaja",
  zemljista: "/zemljista-prodaja",
  poslovni_prostori: "/poslovni-prostori-prodaja",
  vikendice: "/vikendice-prodaja", // Check if this exists on Oglasnik, otherwise we skip
  garaze: "/garaze-prodaja",
  // Rent categories
  najam_stanova: "/stanovi-najam",
  najam_kuca: "/kuce-najam",
  najam_poslovnih_prostora: "/poslovni-prostori-najam",
  najam_garaza: "/garaze-najam",
  najam_zemljista: "/zemljista-najam",
};

export const OGLASNIK_WORKER_CATEGORIES: Record<number, string[]> = {
  1: [
    "stanovi", "kuce", "zemljista", "najam_stanova",
  ],
  2: [
    "najam_kuca", "poslovni_prostori", "garaze", "najam_garaza",
    "najam_zemljista", "najam_poslovnih_prostora"
  ],
};

// Map Oglasnik top-level locations to Njuškalo counties (as best effort)
const OGLASNIK_TO_NJUSKALO_COUNTY: Record<string, string> = {
  "Grad Zagreb": "Grad Zagreb",
  "Zagrebačka": "Zagrebačka",
  "Splitsko-dalmatinska": "Splitsko-dalmatinska",
  "Primorsko-goranska": "Primorsko-goranska",
  "Istarska": "Istarska",
  "Zadarska": "Zadarska",
  "Šibensko-kninska": "Šibensko-kninska",
  "Dubrovačko-neretvanska": "Dubrovačko-neretvanska",
  "Osječko-baranjska": "Osječko-baranjska",
  "Varaždinska": "Varaždinska",
  "Bjelovarsko-bilogorska": "Bjelovarsko-bilogorska",
  "Brodsko-posavska": "Brodsko-posavska",
  "Karlovačka": "Karlovačka",
  "Koprivničko-križevačka": "Koprivničko-križevačka",
  "Krapinsko-zagorska": "Krapinsko-zagorska",
  "Ličko-senjska": "Ličko-senjska",
  "Međimurska": "Međimurska",
  "Požeško-slavonska": "Požeško-slavonska",
  "Sisačko-moslavačka": "Sisačko-moslavačka",
  "Virovitičko-podravska": "Virovitičko-podravska",
  "Vukovarsko-srijemska": "Vukovarsko-srijemska",
};

/**
 * Helper to extract JSON objects from a string by balancing braces.
 */
function extractJsonObjects(str: string, token: string): string[] {
  const results = [];
  let startIndex = 0;
  while ((startIndex = str.indexOf(token, startIndex)) !== -1) {
    let braceCount = 0;
    let i = startIndex;
    
    if (str[i] === '{') {
      braceCount = 1;
      i++;
      while (i < str.length && braceCount > 0) {
        if (str[i] === '{') braceCount++;
        else if (str[i] === '}') braceCount--;
        i++;
      }
      
      if (braceCount === 0) {
        results.push(str.substring(startIndex, i));
      }
    }
    startIndex += token.length;
  }
  return results;
}

function slugify(text: string): string {
  const chars: Record<string, string> = { 'č':'c', 'ć':'c', 'š':'s', 'đ':'d', 'ž':'z' };
  let str = text.toLowerCase().replace(/[čćšđž]/g, m => chars[m] || m);
  return str.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Parses listings from Oglasnik's Playwright page directly.
 */
export async function parseOglasnikPage(
  page: any,
  categoryUrl: string
): Promise<ListingInsert[]> {
  const listings: ListingInsert[] = [];

  const domListings = await page.$$eval('a[href*="-oglas-"]', (els: any[]) => {
    return els.map((el) => {
      const titleEl = el.querySelector('h2, h3, h4, .text-lg, .font-semibold');
      const priceEl = el.querySelector('.text-2xl, .text-xl, [class*="price"]');
      const locationEl = el.querySelector('.text-sm.text-gray-500, [class*="location"]');
      const rawText = el.textContent?.trim() || "";
      
      // Look for size in raw text or title
      let sizeStr = "";
      const sizeMatch = rawText.match(/(\d+(?:,\d+)?)\s*m²/);
      if (sizeMatch) {
        sizeStr = sizeMatch[1];
      }
      
      // Look for location (usually text immediately following size or in a location element)
      let locationText = locationEl?.textContent?.trim() || "";
      if (!locationText) {
        // Try to extract from raw text
        const parts = rawText.split('m²');
        if (parts.length > 1) {
          locationText = parts[1].replace(/[\d.,]+\s*€.*/, '').trim();
        }
      }

      return {
        href: el.href,
        title: titleEl?.textContent?.trim() || "",
        price: priceEl?.textContent?.trim() || "",
        location: locationText,
        sizeStr,
        rawText
      };
    });
  });

  for (const item of domListings) {
    if (!item.title || !item.price || !item.href) continue;

    const idMatch = item.href.match(/-oglas-(\d+)/);
    if (!idMatch) continue;
    const id = `oglasnik-${idMatch[1]}`;

    let county = null;
    let locationStr = item.location;
    const locParts = item.location.split(',').map((p: string) => p.trim());
    
    if (locParts.length > 0) {
      county = locParts[0];
      if (OGLASNIK_TO_NJUSKALO_COUNTY[county]) {
        county = OGLASNIK_TO_NJUSKALO_COUNTY[county];
      }
    }

    let size: number | null = null;
    if (item.sizeStr) {
      size = parseFloat(item.sizeStr.replace(",", "."));
    } else {
      const sizeFallback = item.title.match(/(\d+(?:,\d+)?)\s*m2/i);
      if (sizeFallback) {
        size = parseFloat(sizeFallback[1].replace(",", "."));
      }
    }

    let numericPrice = null;
    const priceMatch = item.price.replace(/\./g, "").replace(",", ".").match(/(\d+(?:\.\d+)?)/);
    if (priceMatch) {
      numericPrice = parseFloat(priceMatch[1]);
    }

    listings.push({
      external_id: id,
      title: stripHtml(item.title),
      price: item.price,
      price_numeric: numericPrice,
      size_m2: size,
      location: locationStr,
      location_region: null,
      location_county: county,
      location_city: locParts.length > 1 ? locParts[1] : null,
      location_neighborhood: locParts.length > 2 ? locParts[2] : null,
      url: item.href,
      advertiser_type: "Agencija", // Oglasnik doesn't easily expose this on the search page, defaulting to Agencija for now
      transaction_type: categoryUrl.includes("najam") ? "Najam" : "Prodaja",
      is_promoted: item.rawText?.includes("Top Oglas") || false,
      status: "Novi",
      source: "oglasnik",
      description: null,
      hidden: false,
    });
  }

  // Deduplicate by external_id
  const uniqueListings = Array.from(new Map(listings.map(item => [item.external_id, item])).values());
  return uniqueListings;
}
