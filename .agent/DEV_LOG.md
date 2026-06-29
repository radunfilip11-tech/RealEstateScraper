# Development Log

## [2026-06-29] Performance & Monitoring Upgrades (Live Monitor)
- **Goal**: Allow real-time inspection of the scraper to evaluate efficiency, ensure only "Private" ads are saved correctly, and determine if the 15-minute polling interval is sufficient or needs optimization.
- **Two-Phase Scraper**:
  - The script was refactored from a one-off Vercel/Next.js API route into a persistent background Node process (`monitor.ts`).
  - **Phase 1 (Search):** A single Playwright context loads category page 1 to execute JS and bypass ShieldSquare.
  - **Phase 2 (Details):** For newly discovered `external_id`s, we extract the Playwright cookies and use native HTTP `fetch` to instantly grab the detail page. This avoids the huge overhead of Playwright rendering each ad. The detail fetch is artificially delayed by ~1 sec (`randomDelay(500, 1500)`) to simulate human reading speed and prevent soft IP bans.
- **Live Monitor Dashboard**:
  - Created `/monitor` page for side-by-side verification.
  - **Left Pane:** Uses Supabase Realtime to stream newly inserted `listings` instantly to the UI. The scraper was temporarily set to **only save Private ads** into the DB to provide a clean testing environment for the user.
  - **Right Pane:** Uses a new `scraper_console_logs` table (also via Supabase Realtime) to stream terminal output directly to the browser.
  - **Controls:** Built an API route `/api/monitor/control` to Start, Stop (via a `.pid` file lock), and Clear Database directly from the web UI.

### Strategy Notes: Scaling the Scraper Speed
If the current ~15 minute full-cycle interval is too slow, these are the evaluated scale-up strategies:
1. **The Bottleneck**: Njuškalo's ShieldSquare tracks IP address velocity. Dropping category delays below 20-30s from a single IP will quickly result in Captchas. 
2. **VPS ($5/mo)**: Required to keep the script running 24/7 (so the user's laptop doesn't need to stay on). This does *not* solve the IP speed limit.
3. **Proxies ($30+/mo)**: To achieve < 1 minute latency, the script must rotate through 10-20 different IP addresses. 
    - **Residential (Pay-per-GB)**: The script uses ~500KB per minute (HTML only, no images). Running at 1-min intervals = ~22 GB/month = ~$110/mo.
    - **Datacenter/ISP Proxies**: Renting 10 static ISP proxies costs ~$25/mo flat rate, which is the recommended path if sub-minute latency is required.

---
## [2026-06-29] SuperVau Card Data Enrichment via Detail Page Scraping
- **Problem**: Some listings appeared in the dashboard without price, location, or size data, even though those fields existed on Njuškalo's detail page.
- **Root Cause**: Njuškalo uses 3 card types on search results pages:
  - **VauVau** (standard promoted): Full card with `entity-prices`, `Lokacija:` label → parsed correctly.
  - **SuperVau** (premium featured): Compact card with only a title, teaser `<p>` paragraph, and thumbnail. **No price div, no Lokacija label, no size** in the card HTML.
  - **Latest** (sidebar ads): Non-real-estate items from other categories — correctly skipped by the `/nekretnine/` URL filter.
- **Fix**: Added `parseDetailPageHTML()` function that extracts data from the structured detail page HTML (`ClassifiedDetailSummary-priceDomestic` for price, `ClassifiedDetailBasicDetails` for location/size). After parsing search results, the scraper visits detail pages for any listing missing price or location, filling in gaps with human-like delays between visits.
- **Bonus**: Extracted `CITY_TO_COUNTY` mapping to module-level constant (was duplicated inline). Extended it with county self-mappings and additional Dalmatian coast cities for detail page 3-part location format (County, City, Neighborhood).

---
## [2026-06-27] Smart Renewal Tracking & Filters UI Update
- **Goal**: Add UI filtering by rent vs sale, location, price, and status (new, renewed, expired), alongside robust scraper fixes for prices and category bans.
- **Tasks & Fixes**:
  - **Transaction Type**: Added `transaction_type` to DB. Updated scraper to fetch `najam_stanova`, `najam_kuca`, etc.
  - **Location Filter**: Replaced a potential 100+ item dropdown with a sleek text input for `Lokacija` that uses real-time `ilike` querying for flexibility.
  - **Missing Prices Bug**: Fixed scraper returning `null` for prices. The HTML regex `<li>...</li>` stopped too early on nested lists. Replaced with `<article class="entity-body cf">...</article>`.
  - **ShieldSquare Ban**: Heavy testing on `/prodaja-stanova` triggered a ban. Added a rotating `User-Agent` array to Playwright context to mimic different OS/Browsers.
  - **Smart "Obnovljen" Tracking**: Instead of unreliable HTML badge parsing for "Novi/Obnovljen", implemented database-driven logic. If a listing is scraped on Page 1 but already exists in DB and is >12 hours old, it is marked as `Obnovljen` and bumped up in the UI (by resetting `created_at` and `notified` flag).
  - **UI Hide System**: Added `hidden` boolean to DB. Added eye-slash button to `ListingCard` appearing on hover, allowing users to manually banish listings. Added "Prikaži skrivene" toggle switch in dashboard.

---
## [2026-06-27] Playwright Scraper Upgrade
- **Goal**: Fix scraper being blocked by Njuškalo's ShieldSquare bot protection.
- **Investigation**:
  - Basic `fetch` requests return a ShieldSquare Captcha page (17KB HTML with JS challenge).
  - Adding full browser-like headers (`Sec-Ch-Ua`, `Sec-Fetch-*`) bypasses the initial check temporarily.
  - However, repeated requests from the same IP trigger a harder Captcha block.
- **Solution**: Upgraded scraper from `fetch` to **Playwright + Stealth Plugin**.
  - Installed `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`.
  - Installed Chromium browser binary via `npx playwright install chromium`.
  - Scraper now launches a headless browser with stealth mode, Croatian locale/timezone, and human-like behavior (random delays, scrolling).
  - Uses `require()` for dynamic imports to avoid Next.js build-time issues.
- **Bug Fix**: Changed listing insert from `.insert()` to `.upsert()` with `onConflict: "external_id"` to handle duplicates gracefully.
- **Lesson**: Njuškalo's HTML structure uses `/nekretnine/...-oglas-ID` URLs (not `/oglas/`), IDs in `name` attributes, and prices in `<strong class="price price--hrk">`.


## [2026-06-27] MVP Implementation
- **Goal**: Build the full Nekretnine real estate scraper dashboard MVP.
- **Tasks**:
  - [x] Initialize Next.js 16 project (TypeScript, Tailwind, App Router)
  - [x] Install dependencies (@supabase/supabase-js, twilio)
  - [x] Create Supabase client library (browser + server)
  - [x] Define TypeScript database types
  - [x] Build complete dashboard UI (Sidebar, StatsBar, SearchBar, FilterDropdown, RangeFilter, ListingCard, Badge)
  - [x] Build Njuškalo HTML scraper (fetch + regex parsing)
  - [x] Create API routes (/api/scrape, /api/listings, /api/notify)
  - [x] Build Settings page with WhatsApp config
  - [x] Verify build passes (`npm run build` ✓)

### Technical Notes
- **Next.js 16** was installed (latest), not 14 as originally planned. All code follows v16 conventions.
- **Scraper approach**: Using server-side `fetch` + regex HTML parsing for MVP. No Playwright binary required. Can upgrade later.
- **Supabase typing**: Without generated DB types, used `any` casts on write operations to avoid TypeScript `never` inference.
- **Twilio**: Lazy-initialized to prevent build errors when credentials are missing.

---

## [2026-06-27] Supabase Setup
- **Goal**: Initialize and configure Supabase project for the Nekretnine scraper dashboard.
- **Tasks**:
  - [x] Determine user project choice (create new or restore existing)
  - [x] Create/configure Supabase project
  - [x] Fetch credentials (URL, keys) and document them for setup
  - [x] Initialize database schema

### Setup Details
- **Project Name**: nekretnine
- **Project ID (Ref)**: `xlaaatbkorktjgbmjtkl`
- **Region**: `eu-west-3` (Paris)
- **URL**: `https://xlaaatbkorktjgbmjtkl.supabase.co`
- **Tables Created**: `public.listings` (RLS enabled, public read allowed), `public.scrape_runs` (RLS enabled, public read allowed)
- **Configuration File**: Created .env.local with the keys.
