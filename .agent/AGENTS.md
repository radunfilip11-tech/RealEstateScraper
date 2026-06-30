# Project Architecture & Rules

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **Database / Backend**: Supabase (Database, Auth, Row Level Security)
- **Scraper**: Playwright + Stealth Plugin (headless Chromium with bot protection bypass)
- **Notifications**: Twilio (WhatsApp notifications API)

## Database Schema (Supabase)
- `listings`: Stores scraped real estate listings (private ads only from monitor). Uses `external_id` (Njuškalo ID) for deduplication. Includes `transaction_type` (Prodaja/Najam), `status` (Novi, Obnovljen, Istekao), `published_at`, `is_promoted`, and `hidden` boolean.
- `seen_listings`: Lightweight skip-list tracking `external_id`s we've already checked (agency ads). Prevents redundant detail-page fetches across monitor cycles. Contains: `external_id`, `advertiser_type`, `seen_at`, `worker_id`.
- `scrape_runs`: Logs monitor cycle history. Fields: `started_at`, `worker_id`, `cycle_duration_s`, `new_listings`, `status`.
- `category_scans`: Tracks per-category scan timestamps (`category`, `scanned_at`, `worker_id`) for frequency stats.
- `scraper_console_logs`: Real-time logs from monitor workers (streamed to dashboard via Supabase Realtime).

## Njuškalo Categories (17 total)
Defined in `src/lib/scraper/njuskalo.ts` as `CATEGORIES` + `WORKER_CATEGORIES`.

**Sale**: stanovi, kuce, zemljista, poslovni_prostori, vikendice, garaze, novogradnja, luksuzne_kuce, luksuzni_stanovi  
**Rent**: najam_stanova, najam_kuca, najam_poslovnih_prostora, najam_garaza, najam_zemljista, najam_luksuznih_kuca, najam_luksuznih_stanova

**URL gotchas** (use these exact paths):
- Land rent: `/zakup-zemljista` (not `/iznajmljivanje-zemljista`)
- Luxury houses sale: `/prodaja-luksuznih-kuca`
- Luxury flats sale: `/prodaja-luksuznih-stanova`

## Multi-Worker Monitor Architecture (2 workers)
- **Spawn**: `src/app/api/monitor/control/route.ts` starts 2 detached processes via `npm run monitor -- --worker-id N`
- **Windows**: Workers run hidden (`windowsHide: true`); logs go to `logs/worker-N.log` (QuickEdit console freeze prevention)
- **Category assignment**: `WORKER_CATEGORIES` in `njuskalo.ts` — each worker scans a different subset
- **Dedup**: Both workers share the same `listings` + `seen_listings` tables; paginated fetch at cycle start (Supabase 1000-row limit)
- **Bot protection**: 60s minimum cycle duration when cycle completes too fast (low-traffic nights); 10-min backoff on ShieldSquare block
- **Stats**: `/api/monitor/stats` — latency, category frequency, per-worker cycle metrics

## Project Structure
```
src/
├── app/             # Next.js App Router pages & API routes
├── components/      # React components (Dashboard, ui/)
└── lib/             # Business logic (supabase/, scraper/, notifications/)
```

## Architecture Notes
- Use Next.js Server Components for initial page render of listings.
- Wrap API clients (e.g. Supabase, Twilio) inside handler/endpoint functions or utilize lazy initialization to prevent Next.js build-time errors from missing environment variables.
- Ensure Row Level Security (RLS) is enabled on all tables created in Supabase.
- Supabase server client uses service role key (bypasses RLS) for scraper writes.
- Supabase browser client uses anon key for public reads.
- Without generated database types, use `any` casts on Supabase write operations.
- All UI text is in Croatian (hr).

## Scraper Strategy & Bot Protection Bypass (Njuškalo)
- **HTML Parsing**: Njuškalo's property cards are wrapped in `<article class="entity-body cf">`. Do **not** split/match on `<li>` tags because inner lists (like prices) will break the regex lazily. Always extract based on the `<article>` wrapper.
- **Bot Protection (ShieldSquare)**: Repeatedly hitting the same category in headless Playwright triggers Captchas. Mitigations:
  - `puppeteer-extra-plugin-stealth` + rotating User-Agents
  - 60s minimum cycle duration when cycles finish too fast (no new ads = robotic polling pattern)
  - 2 workers with different category subsets (not identical loops)
  - Inter-category delays (`CATEGORY_DELAY_MS`) and cycle rest (`CYCLE_REST_MS`)
  - Never spawn workers with visible Windows console (QuickEdit freeze risk)
- **Supabase pagination**: Default query limit is 1000 rows. Monitor must paginate when loading `listings`/`seen_listings` external_ids for dedup.
- **Numeric column types**: Supabase JSON may return `worker_id` as string — use `Number()` when filtering.
- **Renewed Listings (Obnovljen)**: Instead of parsing unreliable UI badges, detect "renewed" listings via database age. If a scraped listing's `external_id` is already in the DB but is older than 12 hours, update its `status` to `Obnovljen` and refresh its `created_at` timestamp.

## Advanced Scraping & Scaling Strategy
- **Fast Private Ad Detection**: "Korisnik nije trgovac" (Private Ad indicator) only exists on detail pages. To keep scraping fast without getting banned, the scraper uses Playwright to load the search page, extracts the new listing URLs, grabs the active session cookies, and then uses pure HTTP `fetch` to grab the HTML of the detail pages (skipping JS/CSS rendering).
- **Duplicate Detection & Skip Logic**: The monitor loads `external_id`s from both `listings` (private ads) and `seen_listings` (agency ads) at cycle start into a `knownIds` Set. Only ads NOT in `knownIds` trigger detail-page fetches. After checking, private ads go to `listings`, agency ads go to `seen_listings` for future skip tracking.
- **Live Monitor Dashboard**: Use Supabase Realtime to stream newly discovered private ads directly into the frontend UI instantly.
- **Scaling to Multiple Sites (10+)**: A "Distributed Fleet" architecture is recommended — deploy lightweight worker apps on separate VPS instances per site/category group to avoid IP rate-limiting.

---

## [2026-06-30] Multi-Worker Scraping Architecture & Latency Tracking (Superseded)
- Original plan was 3 workers shuffling all categories. **Replaced** by 2-worker weighted split via `WORKER_CATEGORIES` (see [2026-07-01] entry above).
