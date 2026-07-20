# Njuškalo Search-Page State JSON (`browseListingsStore`)

Reference for the embedded search-page data that lets us classify and save
listings **without opening detail pages**. Captured live from
`https://www.njuskalo.hr/prodaja-stanova?sort=new` (2026-07-20).

## Where it lives

- Njuškalo server-renders a large **inline `<script>`** (no `src`, `type` is
  plain JS — ~100 KB) that contains the Vue store state.
- The relevant slice starts at the key **`browseListingsStore`**:
  `..."browseListingsStore":{"pageData":{"meta":{...}, ... , <listings> , ...}}`
- `window.__NUXT__` and `window.__APOLLO_STATE__` are **absent** — do not rely
  on them. Parse the script text from `page.content()` instead.
- The same script also contains unrelated objects (nav menu items like
  `{"id":12551,"title":"Poslovi","url":"..."}`, plus `userPromotedListings` and
  `featuredStores`). Filter to real-estate listings via
  `"categorySlug":"nekretnine"` + presence of `"titleSlug"`.

## Per-listing object (all observed fields)

```jsonc
{
  "id": 50735880,
  "title": "ZADAR – CRVENE KUĆE, dvosoban stan S2 u prizemlju od 76 m2 s vrtom, NO",
  "abstracts": [
    { "caption": null,       "value": "Stan u stambenoj zgradi, prizemlje", "highlight": false },
    { "caption": null,       "value": "Stambena površina: 76.36 m2",        "highlight": false },
    { "caption": "Lokacija", "value": "Zadar, Crvene kuće",                 "highlight": false }
  ],
  "createdAt": "2026-07-18T14:12:00.000Z",
  "createdAtFormatted": "18.07.2026.",
  "deadlineAt": null,
  "deadlineAtFormatted": null,
  "image": "https:\u002F\u002Fwww.njuskalo.hr\u002Fimage-200x150\u002Fnekretnine\u002F...-slika-279581161.jpg",
  "priceFormatted": "252.000 €",
  "priceMinFormatted": null,
  "priceMaxFormatted": null,
  "isPriceOnRequest": false,
  "hidePrice": false,
  "categorySlug": "nekretnine",
  "titleSlug": "zadar-crvene-kuce-dvosoban-stan-s2-prizemlju-76-m2-vrtom-no",
  "isNewCar": false,
  "hasCarWarranty": false,
  "hasG1Warranty": false,
  "hasVirtualTour": false,
  "isOnlinePaymentEnabled": false,
  "hasVideo": false,
  "hasMap": true,
  "hasGroundPlan": false,
  "hasHKSCertificate": false,
  "isLuxuryRealEstate": false,
  "isOwnerResidentialSeller": false,   // <-- private (true) vs agency (false)
  "isSaveAvailable": true,
  "isCompareAvailable": false,
  "isPromoted": true,
  "location": "Zadar, Crvene kuće",
  "condition": null,
  "itemSize": null,
  "isCompared": false
}
```

Notes:
- Forward slashes inside string values are escaped as `\u002F`; decode with
  `JSON.parse('"' + raw + '"')`.
- `isOwnerResidentialSeller: true` corresponds exactly to the detail-page phrase
  **"Korisnik nije trgovac"** (verified). `false` = agency/business.
- The flag and full price/size/location are present **even on promoted /
  SuperVau cards**, whose visible HTML card is only a teaser — that was the one
  case that previously forced a detail open.

## Field → `ListingInsert` mapping (see `src/lib/scraper/njuskalo.ts`)

| Source field                                   | DB field                                                        |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `id`                                           | `external_id` = `njuskalo-<id>`                                 |
| `titleSlug` + `id`                             | `url` = `<base>/nekretnine/<titleSlug>-oglas-<id>`              |
| `title`                                        | `title`                                                         |
| `isOwnerResidentialSeller`                     | `advertiser_type` (`true` → `Privatni`, `false` → `Agencija`)   |
| `priceFormatted` (+ `isPriceOnRequest`/`hidePrice`) | `price`, `price_numeric`                                    |
| `location`                                     | `location`, `location_city`, `location_neighborhood`, `location_county` (via `CITY_TO_COUNTY`) |
| `abstracts[].value` (`Stambena površina: X m2`) | `size_m2`                                                      |
| `abstracts[].value` (joined)                   | `description`                                                    |
| `createdAt`                                    | `published_at`                                                  |
| `isPromoted`                                   | `is_promoted`                                                   |
| `image`                                        | `image_url`                                                     |
| (category constant)                            | `property_type`, `transaction_type`                             |

## Parsing strategy

Do **not** `JSON.parse` the whole 100 KB blob (brittle). Instead:

1. `html.indexOf("browseListingsStore")`, slice from there.
2. `split('{"id":')` and process each chunk.
3. Keep chunks matching `"categorySlug":"nekretnine"` **and** `"titleSlug":"..."`
   **and** `"isOwnerResidentialSeller":(true|false)`.
4. Extract fields with targeted regexes (see `parseListingsFromSearchJSON`).

On a typical `?sort=new` page this yields ~31 listings (main list + promoted),
all with price/size/location populated. `parseListingsFromHTML` remains the
fallback when the state JSON is absent (layout change / bot-challenge page).
