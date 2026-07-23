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
  1: ["stanovi"],
  2: ["kuce"],
  3: ["zemljista"],
  4: ["najam_stanova"],
  5: ["poslovni_prostori", "najam_poslovnih_prostora", "najam_zemljista"],
  6: [
    "vikendice", "garaze", "novogradnja",
    "luksuzne_kuce", "luksuzni_stanovi",
    "najam_kuca", "najam_garaza",
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
  landType: string | null;
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
  let landType: string | null = null;
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

  // --- Land type ---
  const landTypePattern = /(?:vrst[ae]|tip)\s*(?:zemlji[šs]ta)?[^<]*<\/(?:th|dt|span|div)>\s*<(?:td|dd|span|div)[^>]*>([^<]{3,60})<\/(?:td|dd|span|div)/gi;
  const landMatches = [...html.matchAll(landTypePattern)];
  for (const m of landMatches) {
    const val = m[1].trim();
    if (/poljoprivredn/i.test(val)) landType = "Poljoprivredno";
    else if (/[šs]umsk/i.test(val)) landType = "Šumsko";
    else if (/gra[đd]evinsk/i.test(val)) landType = "Građevinsko";
  }

  // --- Promoted (detail page contains "Istaknuto oglašavanje" or "Ovaj oglas je istaknut.") ---
  const isPromoted = /istaknuto ogla/i.test(html) || /oglas je istaknut/i.test(html) || /VauVau/i.test(html) || /SuperVau/i.test(html);

  // --- Published at (detail page has <time datetime="..."> element) ---
  let publishedAt: string | null = null;
  const pubMatch = html.match(/<time[^>]*datetime="([^"]+)"/i);
  if (pubMatch) {
    publishedAt = pubMatch[1];
  }

  return { price, priceNumeric, location, locationCounty, locationCity, locationNeighborhood, sizeM2, landType, advertiserType, isPromoted, publishedAt };
}

/**
 * Map a monitor category key to Njuškalo property + transaction type labels.
 * Shared by the HTML and JSON search parsers.
 */
function getTypesForCategory(category: string): {
  propertyType: string | null;
  transactionType: string;
} {
  let propertyType: string | null = null;
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

  return { propertyType, transactionType };
}

/**
 * Decode a JSON string body (the text between the quotes) — resolves \uXXXX
 * escapes (e.g. \u002F for "/"), escaped quotes, etc. Falls back to raw input.
 */
function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

/**
 * Parse listings from the Njuškalo search page's embedded state JSON
 * (`browseListingsStore`).
 *
 * Njuškalo server-renders a large inline <script> holding the Vue store state.
 * Every real-estate listing object in it carries all the fields we persist —
 * crucially `isOwnerResidentialSeller`, the private-vs-agency flag that is NOT
 * present in the visible HTML cards. Reading it here lets the monitor classify
 * and save listings WITHOUT ever opening a detail page.
 *
 * Robustness: instead of JSON.parse-ing a 100 KB+ object (brittle), we slice
 * from the `browseListingsStore` key, split on `{"id":` boundaries, and parse
 * each chunk with targeted regexes — keeping only real-estate listing chunks
 * (`"categorySlug":"nekretnine"` + `"titleSlug"`). Nav-menu and featured-store
 * objects that share the same script are ignored.
 *
 * See .agent/NJUSKALO_SEARCH_JSON.md for the full field reference.
 */
export function parseListingsFromSearchJSON(
  html: string,
  category: string
): ListingInsert[] {
  const listings: ListingInsert[] = [];

  const storeIdx = html.indexOf("browseListingsStore");
  if (storeIdx === -1) return listings;
  const blob = html.slice(storeIdx);

  const { propertyType, transactionType } = getTypesForCategory(category);
  const seen = new Set<string>();

  // Each listing object begins with `{"id":`; split on that boundary.
  const chunks = blob.split('{"id":');
  for (const chunk of chunks) {
    try {
      // Keep only real-estate listing objects (skip nav menu / featured stores).
      if (!/"categorySlug":"nekretnine"/.test(chunk)) continue;
      const slugMatch = chunk.match(/"titleSlug":"([^"]+)"/);
      const flagMatch = chunk.match(/"isOwnerResidentialSeller":(true|false)/);
      const idMatch = chunk.match(/^(\d+)/);
      if (!slugMatch || !flagMatch || !idMatch) continue;

      const id = idMatch[1];
      const externalId = `njuskalo-${id}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);

      const titleSlug = slugMatch[1];
      const url = `${NJUSKALO_BASE}/nekretnine/${titleSlug}-oglas-${id}`;

      // --- Title ---
      const titleMatch = chunk.match(/"title":"((?:\\.|[^"\\])*)"/);
      const title = titleMatch ? decodeJsonString(titleMatch[1]) : `Oglas ${id}`;

      // --- Advertiser type (the whole point of this parser) ---
      const advertiserType = flagMatch[1] === "true" ? "Privatni" : "Agencija";

      // --- Abstracts (building type, size, location caption) ---
      const absMatch = chunk.match(/"abstracts":(\[[\s\S]*?\]),"createdAt"/);
      const abstractValues: string[] = [];
      if (absMatch) {
        const valRe = /"value":"((?:\\.|[^"\\])*)"/g;
        let vm: RegExpExecArray | null;
        while ((vm = valRe.exec(absMatch[1])) !== null) {
          abstractValues.push(decodeJsonString(vm[1]));
        }
      }
      const description =
        abstractValues.length > 0
          ? abstractValues.join(", ").substring(0, 500)
          : null;

      // --- Size (m²) from an abstract like "Stambena površina: 76.36 m2", "Zemljišna površina: 1.250 m2", or just "830 m2" ---
      let sizeM2: number | null = null;
      for (const v of abstractValues) {
        // Try with prefix first
        let sm = v.match(/(?:povr[šs]ina|zemlji[šs]t[ea])[^0-9]*([\d.\s]+(?:,\d+)?)\s*m/i);
        if (!sm) {
          // If no prefix, just try to match a number immediately followed by m2 (e.g. "830 m2", "1.250 m²")
          sm = v.match(/^([\d.\s]+(?:,\d+)?)\s*m(?:2|²)$/i);
        }
        if (sm) {
          const parsed = parseFloat(sm[1].replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
          if (!isNaN(parsed)) sizeM2 = parsed;
          break;
        }
      }
      // Fallback: if sizeM2 is still null, try extracting from title (e.g. "686 m²", "1.250 m2")
      if (sizeM2 === null && title) {
        const tm = title.match(/([\d.\s]+)\s*(?:m²|m2)\b/i);
        if (tm) {
          const parsed = parseFloat(tm[1].replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
          if (!isNaN(parsed) && parsed >= 5 && parsed <= 5000000) {
            sizeM2 = parsed;
          }
        }
      }

      // --- Price ---
      let price: string | null = null;
      let priceNumeric: number | null = null;
      const hidePrice = /"hidePrice":true/.test(chunk);
      const onRequest = /"isPriceOnRequest":true/.test(chunk);
      const priceMatch = chunk.match(/"priceFormatted":"([^"]*)"/);
      if (!hidePrice && !onRequest && priceMatch && priceMatch[1]) {
        price = decodeJsonString(priceMatch[1]);
        const numStr = price
          .replace(/[^\d.,]/g, "")
          .replace(/\./g, "")
          .replace(",", ".");
        const parsed = parseFloat(numStr);
        if (!isNaN(parsed)) priceNumeric = parsed;
      }

      // --- Location ---
      let location: string | null = null;
      let locationCounty: string | null = null;
      let locationCity: string | null = null;
      let locationNeighborhood: string | null = null;
      const locMatch = chunk.match(/"location":"((?:\\.|[^"\\])*)"/);
      if (locMatch && locMatch[1]) {
        location = decodeJsonString(locMatch[1]) || null;
        if (location) {
          const parts = location.split(",").map((s) => s.trim());
          if (parts.length > 0) locationCity = parts[0] || null;
          if (parts.length > 1) locationNeighborhood = parts[1] || null;
          if (locationCity) {
            locationCounty = CITY_TO_COUNTY[locationCity] || null;
          }
        }
      }

      // --- Image ---
      let imageUrl: string | null = null;
      const imgMatch = chunk.match(/"image":"((?:\\.|[^"\\])*)"/);
      if (imgMatch && imgMatch[1]) {
        imageUrl = decodeJsonString(imgMatch[1]) || null;
      }

      // --- Promoted ---
      const isPromoted = /"isPromoted":true/.test(chunk);

      // --- Published at ---
      let publishedAt: string | undefined = undefined;
      const pubMatch = chunk.match(/"createdAt":"([^"]+)"/);
      if (pubMatch) publishedAt = pubMatch[1];

      // --- Room count (abstracts: "2-sobni", "3.5-sobni", "Garsonijera", "Studio") ---
      let roomCount: number | null = null;
      for (const v of abstractValues) {
        // "Garsonijera" / "Studio" → 1
        if (/garsonijera|studio/i.test(v)) { roomCount = 1; break; }
        // "2-sobni", "2.5-sobni", "2,5-sobni"
        const rm = v.match(/^([\d]+(?:[.,][\d]+)?)-sobni?/i);
        if (rm) {
          const parsed = parseFloat(rm[1].replace(",", "."));
          if (!isNaN(parsed)) { roomCount = parsed; break; }
        }
      }

      // --- Floor (abstracts: "1. kat", "Prizemlje", "Potkrovlje") ---
      let floorLabel: string | null = null;
      for (const v of abstractValues) {
        if (/kat|prizemlje|potkrovlje|visoko prizemlje|suteren/i.test(v)) {
          floorLabel = v.trim();
          break;
        }
      }

      // --- Yard size (abstracts: "Okućnica: 300 m2") ---
      let yardSizeM2: number | null = null;
      for (const v of abstractValues) {
        const ym = v.match(/oku[ćc]nica[^0-9]*([\d.\s]+(?:,\d+)?)\s*m/i);
        if (ym) {
          const parsed = parseFloat(ym[1].replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
          if (!isNaN(parsed)) { yardSizeM2 = parsed; break; }
        }
      }

      // --- Land type (abstracts: "Građevinsko", "Poljoprivredno", "Šumsko") ---
      let landType: string | null = null;
      if (category === "zemljista" || category === "najam_zemljista") {
        for (const v of abstractValues) {
          if (/gra[đd]evinsk/i.test(v)) { landType = "Građevinsko"; break; }
          if (/poljoprivredn/i.test(v)) { landType = "Poljoprivredno"; break; }
          if (/[šs]umsk/i.test(v)) { landType = "Šumsko"; break; }
          // Also try title for common patterns like "Građevinsko zemljište"
        }
        if (!landType && title) {
          if (/gra[đd]evinsk/i.test(title)) landType = "Građevinsko";
          else if (/poljoprivredn/i.test(title)) landType = "Poljoprivredno";
          else if (/[šs]umsk/i.test(title)) landType = "Šumsko";
        }
      }

      // --- House type (abstracts or title: "Samostojeća", "Dvojna kuća", "Niz") ---
      let houseType: string | null = null;
      if (category === "kuce" || category === "najam_kuca" || category === "luksuzne_kuce" || category === "najam_luksuznih_kuca" || category === "vikendice") {
        const houseText = [...abstractValues, title].join(" ");
        if (/samostoje[ćc]/i.test(houseText)) houseType = "Samostojeća";
        else if (/dvojn/i.test(houseText)) houseType = "Dvojna";
        else if (/\bniz\b/i.test(houseText)) houseType = "Niz";
      }

      // --- Commercial type (abstracts or title: "Ured", "Ugostiteljstvo", "Skladište", "Trgovina") ---
      let commercialType: string | null = null;
      if (category === "poslovni_prostori" || category === "najam_poslovnih_prostora") {
        const commText = [...abstractValues, title].join(" ");
        if (/ured/i.test(commText)) commercialType = "Ured";
        else if (/ugostiteljst/i.test(commText)) commercialType = "Ugostiteljstvo";
        else if (/skladi[šs]t/i.test(commText)) commercialType = "Skladište";
        else if (/trgovin/i.test(commText)) commercialType = "Trgovina";
        else if (/salon/i.test(commText)) commercialType = "Salon";
      }

      // --- Garage type (title: "Garažno mjesto", "Vanjsko parkirno") ---
      let garageType: string | null = null;
      if (category === "garaze" || category === "najam_garaza") {
        const garageText = [...abstractValues, title].join(" ");
        if (/gara[žz]no mjesto/i.test(garageText)) garageType = "Garažno mjesto";
        else if (/vanjsko parkirno/i.test(garageText)) garageType = "Vanjsko parkirno mjesto";
        else if (/gara[žz]/i.test(garageText)) garageType = "Garaža";
      }

      listings.push({
        external_id: externalId,
        title,
        price,
        price_numeric: priceNumeric,
        size_m2: sizeM2,
        location,
        location_region: null,
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
        room_count: roomCount,
        floor_label: floorLabel,
        yard_size_m2: yardSizeM2,
        land_type: landType,
        house_type: houseType,
        commercial_type: commercialType,
        garage_type: garageType,
      });
    } catch (e) {
      console.error("[Scraper] Error parsing search JSON listing:", e);
      continue;
    }
  }

  return listings;
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
        room_count: null,
        floor_label: null,
        yard_size_m2: null,
        land_type: null,
        house_type: null,
        commercial_type: null,
        garage_type: null,
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
            // Prefer the embedded state JSON (has advertiser type + full data,
            // including for SuperVau/promoted cards). Fall back to HTML card
            // parsing only if the JSON blob is absent (layout change / block).
            let pageListings = parseListingsFromSearchJSON(html, category);
            if (pageListings.length === 0) {
              pageListings = parseListingsFromHTML(html, category);
            }
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

/**
 * Lightweight search-page-only scrape for the continuous monitor.
 * Uses an EXISTING Playwright page (browser stays alive across cycles).
 * Returns raw listing stubs from page 1 of a single category.
 */
export async function scrapeSearchPageOnly(
  page: any,
  category: string
): Promise<{ listings: ListingInsert[]; blocked: boolean; blockReason?: string }> {
  const categoryPath = CATEGORIES[category];
  if (!categoryPath) return { listings: [], blocked: false };

  const url = `${NJUSKALO_BASE}${categoryPath}?sort=new`;
  console.log(`[Monitor] [${category}] Loading search page: ${url}`);

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000, // residential proxy can be slower than native IP
    });

    const title = await page.title();
    if (title.includes("ShieldSquare") || title.includes("Captcha")) {
      console.error(`[Monitor] [${category}] Bot protection detected! title="${title}"`);
      return { listings: [], blocked: true, blockReason: "ShieldSquare/Captcha" };
    }

    // Wait for Vue to render listing cards
    try {
      await page.waitForSelector('article[class*="entity-body"]', {
        timeout: 20000,
      });
    } catch {
      console.warn(`[Monitor] [${category}] No listing cards found (timeout). Treating as soft block!`);
      return { listings: [], blocked: true, blockReason: "no-cards-timeout" };
    }

    // Human-like scroll
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 500) + 300);
    });
    await randomDelay(300, 600);

    const html = await page.content();
    // Prefer the embedded state JSON — it carries advertiser type
    // (isOwnerResidentialSeller) plus full price/location/size, so the monitor
    // no longer needs to open detail pages. HTML parsing is the fallback.
    let listings = parseListingsFromSearchJSON(html, category);
    if (listings.length === 0) {
      listings = parseListingsFromHTML(html, category);
    }
    if (listings.length === 0) {
      console.warn(`[Monitor] [${category}] Parsed 0 listings (JSON + HTML). Treating as soft block!`);
      return { listings: [], blocked: true, blockReason: "zero-listings-parsed" };
    }
    console.log(`[Monitor] [${category}] Found ${listings.length} listings on page 1.`);

    return { listings, blocked: false };
  } catch (error) {
    console.error(`[Monitor] [${category}] Error loading search page:`, error);
    return {
      listings: [],
      blocked: true,
      blockReason: `nav-error: ${(error as Error).message?.slice(0, 80) || "unknown"}`,
    };
  }
}

/**
 * Multi-page search scrape for continuous monitor.
 * Scrapes pages sequentially (1, 2, ...) until an entire page consists of known listings,
 * or until maxPages cap is reached.
 */
export async function scrapeSearchPagesUntilKnown(
  page: any,
  category: string,
  knownIds: Set<string>,
  maxPages: number = 10
): Promise<{
  listings: ListingInsert[];
  pagesScanned: number;
  blocked: boolean;
  blockReason?: string;
}> {
  const categoryPath = CATEGORIES[category];
  if (!categoryPath) return { listings: [], pagesScanned: 0, blocked: false };

  const allNewListings: ListingInsert[] = [];
  let pagesScanned = 0;
  let consecutiveKnownPages = 0;
  const KNOWN_PAGES_STOP_THRESHOLD = 3; // require 3 all-known pages before stopping

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const url =
      pageNum === 1
        ? `${NJUSKALO_BASE}${categoryPath}?sort=new`
        : `${NJUSKALO_BASE}${categoryPath}?page=${pageNum}&sort=new`;
    console.log(`[Monitor] [${category}] Loading search page ${pageNum}: ${url}`);

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });

      const title = await page.title();
      if (title.includes("ShieldSquare") || title.includes("Captcha")) {
        console.error(`[Monitor] [${category}] Bot protection detected on page ${pageNum}! title="${title}"`);
        return {
          listings: allNewListings,
          pagesScanned,
          blocked: true,
          blockReason: "ShieldSquare/Captcha",
        };
      }

      // Wait for Vue to render listing cards
      try {
        await page.waitForSelector('article[class*="entity-body"]', {
          timeout: 20000,
        });
      } catch {
        if (pageNum === 1) {
          console.warn(`[Monitor] [${category}] No listing cards found on page 1 (timeout). Treating as soft block!`);
          return { listings: [], pagesScanned: 0, blocked: true, blockReason: "no-cards-timeout" };
        } else {
          console.log(`[Monitor] [${category}] No listing cards on page ${pageNum}. Reached end of category.`);
          break;
        }
      }

      // Human-like scroll
      await page.evaluate(() => {
        window.scrollBy(0, Math.floor(Math.random() * 500) + 300);
      });
      await randomDelay(300, 600);

      const html = await page.content();
      let listings = parseListingsFromSearchJSON(html, category);
      if (listings.length === 0) {
        listings = parseListingsFromHTML(html, category);
      }
      if (listings.length === 0) {
        if (pageNum === 1) {
          console.warn(`[Monitor] [${category}] Parsed 0 listings on page 1. Soft block!`);
          return { listings: [], pagesScanned: 0, blocked: true, blockReason: "zero-listings-parsed" };
        } else {
          break;
        }
      }

      pagesScanned++;

      // Filter new listings on this page
      const newListingsOnPage = listings.filter((l) => !knownIds.has(l.external_id));

      console.log(
        `[Monitor] [${category}] Page ${pageNum}: ${listings.length} total, ${newListingsOnPage.length} new.`
      );

      allNewListings.push(...newListingsOnPage);

      // STOP CONDITION: require 3 consecutive all-known pages before stopping.
      // This prevents early termination when promoted/sticky ads fill page 1.
      if (newListingsOnPage.length === 0) {
        consecutiveKnownPages++;
        console.log(`[Monitor] [${category}] Page ${pageNum}: all ${listings.length} listings known (${consecutiveKnownPages}/${KNOWN_PAGES_STOP_THRESHOLD} consecutive). ${consecutiveKnownPages >= KNOWN_PAGES_STOP_THRESHOLD ? 'Stopping.' : 'Continuing...'} `);
        if (consecutiveKnownPages >= KNOWN_PAGES_STOP_THRESHOLD) {
          break;
        }
      } else {
        // Reset counter whenever we find new listings
        consecutiveKnownPages = 0;
      }

      // Delay between pages if paginating further
      if (pageNum < maxPages) {
        await randomDelay(2000, 4000);
      }
    } catch (error) {
      console.error(`[Monitor] [${category}] Error on page ${pageNum}:`, error);
      if (pageNum === 1) {
        return {
          listings: [],
          pagesScanned: 0,
          blocked: true,
          blockReason: `nav-error: ${(error as Error).message?.slice(0, 80) || "unknown"}`,
        };
      }
      // If error on page > 1, return what we have so far
      break;
    }
  }

  return { listings: allNewListings, pagesScanned, blocked: false };
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
        landType: null,
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
