# Development Log

## [2026-07-01] Monitor Stats Dashboard, Worker Fixes & Category Expansion
- **Goal**: Complete Njuškalo category coverage, balance 2-worker load by traffic volume, fix incorrect stats, and improve bot-protection resilience during low-traffic periods.

### 1. Missing Categories Added (10 → 17)
- **File**: `src/lib/scraper/njuskalo.ts`
- Added 7 categories: `luksuzne_kuce`, `luksuzni_stanovi`, `najam_garaza`, `najam_zemljista`, `najam_luksuznih_kuca`, `najam_luksuznih_stanova`
- Added property type mappings in `parseListingsFromHTML()` for each new category key

### 2. Category URL Corrections
Three paths were wrong (ShieldSquare CAPTCHA or empty pages):
| Key | Wrong | Correct |
|-----|-------|---------|
| `luksuzne_kuce` | `/luksuzne-kuce` | `/prodaja-luksuznih-kuca` |
| `luksuzni_stanovi` | `/luksuzni-stanovi` | `/prodaja-luksuznih-stanova` |
| `najam_zemljista` | `/iznajmljivanje-zemljista` | `/zakup-zemljista` |

### 3. Weighted 2-Worker Load Balancing
- **File**: `src/lib/scraper/njuskalo.ts` — new `WORKER_CATEGORIES` export
- **File**: `scripts/monitor.ts` — removed `shuffleCategories()`, now uses `WORKER_CATEGORIES[WORKER_ID]`
- **Strategy**: Worker 1 = high-traffic sprint (fewer categories, faster cycles); Worker 2 = full coverage (all remaining categories)
- **Current split** (user-tuned):
  - W1: `kuce`, `zemljista`, `najam_stanova`, `najam_kuca`, `vikendice` (5 cats)
  - W2: `stanovi`, `poslovni_prostori`, `luksuzne_kuce`, `luksuzni_stanovi`, `garaze`, `novogradnja`, `najam_garaza`, `najam_zemljista`, `najam_poslovnih_prostora`, `najam_luksuznih_kuca`, `najam_luksuznih_stanova` (11 cats)
- **Note**: `stanovi` (60k ads) is only on W2 — consider moving to W1 or both workers for faster detection

### 4. Worker Count 3 → 2
- **Backend**: `src/app/api/monitor/control/route.ts` — `DEFAULT_WORKER_COUNT = 2`
- **Frontend**: `src/components/MonitorDashboard.tsx` — hardcoded `workers: 3` in start request was overriding server default; fixed to `workers: 2`

### 5. seen_listings 1,000 Row Limit Bug
- **Problem**: Log showed exactly `1000 seen` — Supabase default row limit truncated dedup set
- **Impact**: Ads beyond row 1,000 were re-fetched every cycle (wasted detail-page HTTP calls)
- **Fix** (`scripts/monitor.ts`): Added `fetchAllExternalIds()` with paginated `.range()` in 1,000-row chunks for both `listings` and `seen_listings`

### 6. Worker 1 Console Freeze (QuickEdit)
- **Problem**: Worker 1 sometimes opened in CMD/Node window and stopped scanning; title bar showed `Select cmd.exe`
- **Cause**: Windows console QuickEdit mode — clicking inside pauses the process until a key is pressed; `console.log` then blocks Node event loop
- **Fix** (`src/app/api/monitor/control/route.ts`):
  - `windowsHide: true` — no visible console window
  - stdout/stderr redirected to `logs/worker-N.log`
  - Added `/logs` and `*.pid` to `.gitignore`

### 7. Minimum Cycle Duration (Bot Protection)
- **Problem**: At night with few new ads, cycles completed in ~20s → ~30 page loads/min from one IP → ShieldSquare blocks
- **Fix** (`scripts/monitor.ts`): If cycle duration < 60s, add penalty wait to enforce 60s minimum cycle time
```typescript
if (cycleDuration < 60) {
  const extraWait = (60 - cycleDuration) * 1000;
  rest += extraWait;
}
```

### 8. Latency Outlier Cap
- **File**: `src/app/api/monitor/stats/route.ts`
- Changed detection latency outlier cutoff from **10 min → 5 min** (`ms < 5 * 60 * 1000`)
- Filters old backfill ads from first scan cycles out of avg/min/max

### 9. Enhanced Stats Dashboard
- **API** (`src/app/api/monitor/stats/route.ts`):
  - `latency.recent[]` — last 15 listings with individual detection latency
  - `cycles.categoryDetails{}` — per category: last scan time, last gap, last 5 gap measurements
  - `workers{}` — per-worker cycle history, timing, inferred status (Skenira/Čeka/Neaktivan)
- **UI** (`src/components/MonitorDashboard.tsx`):
  - Latency card expandable (click "Detalji") — shows last 15 ads with latency
  - Category frequency card expandable — shows last scan time + recent 5 gaps per category
  - New worker stats row — W1/W2 cards with cycle durations, status, inter-category pauses

### 10. Worker Stats Bug Fix (worker_id type mismatch)
- **Problem**: "Od zadnjeg skena" showed ~6381s (~106 min) while workers were actively cycling
- **Cause**: Strict `===` comparison on `worker_id` failed when Supabase returned numeric column as string in JSON
- **Fix**: `Number(s.worker_id) === workerId` in stats route filters

### Files Changed (Session Summary)
| File | Changes |
|------|---------|
| `src/lib/scraper/njuskalo.ts` | +7 categories, `WORKER_CATEGORIES`, URL fixes, property types |
| `scripts/monitor.ts` | `WORKER_CATEGORIES`, paginated ID fetch, 60s min cycle, delays tuned |
| `src/app/api/monitor/control/route.ts` | 2 workers, hidden spawn, log files |
| `src/app/api/monitor/stats/route.ts` | Extended stats, 5-min cap, worker/category details |
| `src/components/MonitorDashboard.tsx` | 2 workers UI, expandable stats, worker cards |
| `.gitignore` | `/logs`, `*.pid` |

### Lessons Learned
1. **Supabase default limit is 1000 rows** — always paginate when loading full tables for dedup
2. **Windows QuickEdit freezes Node** — never spawn workers with visible console on Windows; use log files
3. **Fast empty cycles trigger bot protection** — enforce minimum cycle duration when no new ads found
4. **Frontend can override backend defaults** — check both API route AND dashboard for hardcoded values
5. **`WORKER_CATEGORIES` must actually be used** — defining config without wiring it in monitor.ts caused identical scan frequencies for all categories
6. **Supabase JSON may return numbers as strings** — use `Number()` when filtering by numeric columns

---

## [2026-06-30] Multi-Worker Scraping Architecture & Latency Tracking
- **Goal**: Maximize the Njuškalo scraping frequency without triggering ShieldSquare bot protection, and track the exact latency from the moment an ad is published until we scrape it.
- **Bot Protection Insight**: Running 3 independent monitor scripts simultaneously from the same IP does *not* trigger bot protection. This works because ShieldSquare tracks rolling average request rates, and 3 desynchronized scripts with random delays create organic-looking, human-like traffic spikes rather than a robotic rhythm. 
- **Multi-Worker Strategy**: 
  - Instead of deploying 3 separate physical scripts, `monitor.ts` will be updated to accept a `--worker-id` argument.
  - The UI will spawn 3 concurrent processes.
  - Each worker handles the exact same 10 categories, but shuffles the order based on its worker ID. This means Worker 1 checks `stanovi`, while Worker 2 checks `zemljista`.
  - Result: 3x the scan frequency (every ~1.5 to 2 minutes per category) with no additional bot protection risk.
- **Latency Stats Feature**:
  - To measure exact performance, the UI will feature a "Stats" panel.
  - It compares the Njuškalo published `<time>` (from the detail page) against the Supabase `created_at` timestamp.
  - Metrics tracked: Average Detection Latency, Fastest Discovery, Slowest Discovery, and Cycle Frequency.
- **Scaling Verdict for 10+ Sites**:
  - To monitor 10+ ad sites simultaneously (Index.hr, Crozilla, etc.), a single app on a single IP will hit rate limits and consume too much RAM (headless Chromium uses ~200MB per instance).
  - **Option A (Proxies)**: Run one massive app locally and use Rotating Residential Proxies. Cost: $30 - $100+/mo depending on data bandwidth (Playwright downloads a lot of HTML).
  - **Option B (Distributed Fleet)**: Deploy identical lightweight workers on separate $5/mo VPS instances (e.g., Worker 1 on VPS A handles Njuškalo Stanovi, Worker 2 on VPS B handles Index.hr). Cost: Fixed at $5/mo per server, no proxies required. This is the recommended, scalable path.
## [2026-06-30] Dockerization & VPS Deployment Strategy (Complete)
- **Goal**: Containerize the application and provide a step-by-step guide for deploying it 24/7 on a budget VPS to achieve continuous monitoring (sub-minute latency).
- **Dockerfile**: Created a production-ready `Dockerfile` for the Next.js app (building on `node:20-slim`) and a separate `docker-compose.yml` for the standalone Node.js scraper script.
- **VPS Strategy Walkthrough**:
  - **Host**: Recommended **OVH VPS SSD 2 (4 vCPU, 8 GB RAM, 40 GB SSD)** for ~$5/month (includes one IPv4). Available in Strasbourg data center for best latency to Croatia.
  - **Network**: **Public IP**: Reserved for VPS. **Localhost**: Used for the scraper script to talk to the local Supabase instance.
  - **Architecture Options**:
    1. **Recommended (Simple)**: Single container running both Web UI and Scraper. Uses host's public IP. Scraper hits public IP for "external" scraping (requires port 3000/3001 open). **Latency**: ~15 mins (current). **Cost**: $5/mo.
    2. **Optimal (Fast)**: VPS as a proxy network. **Web UI** on public IP (e.g., 3001). **Scraper** runs in Docker with a rotating residential/datacenter proxy (10-20 IPs) to achieve sub-minute latency. **Cost**: $5 (VPS) + $30 (Proxies) = ~$35/mo.
- **Deployment Steps**:
  - Buy OVH VPS SSD 2 (Strasbourg).
  - Install Ubuntu 22.04.
  - Install Docker & Docker Compose.
  - Build and run containers (`docker-compose up -d`).
  - **Port Mapping**: Map VPS `80:3000` (to access the UI publicly) and `8080:3001` (to keep the scraper's "internal" target available).
- **Firewall Notes**: VPS firewalls must allow inbound traffic on `80` (HTTP) and `8080` (Internal target). The scraper will hit `http://[VPS_IP]` or `http://localhost:8080`.
- **Cost Analysis**: Confirmed $5/mo is the entry point. Adding a cheap ISP proxy (e.g., from GeoSurf or similar providers) via `docker-compose` network settings brings latency down to sub-minute for an extra ~$25.

---
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
