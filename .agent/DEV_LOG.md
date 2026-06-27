# Development Log

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
- **Configuration File**: Created [.env.local](file:///c:/Users/Red%20Dragon/Documents/ANTIGRAVITY/Nekretnine/.env.local) with the keys.
