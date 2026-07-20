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
- **Bot protection**: Adaptive min cycle duration — night W1 8–10 min / W2 20–25 min; day W1 100–250s / W2 200–500s; 10-min backoff on ShieldSquare block
- **Stats**: `/api/monitor/stats` — latency, category frequency, per-worker metrics, `adsPerHour` histogram data

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
- **Windows + Node 24 TLS**: On Windows only, npm scripts run via `scripts/with-system-ca.mjs` which sets `NODE_OPTIONS=--use-system-ca`. **Linux/VPS**: wrapper is a no-op (Node rejects `--use-system-ca` in `NODE_OPTIONS` on Linux — see DEV_LOG 2026-07-20).
- **Node 20 + Supabase on VPS**: Requires `ws` package and `realtime: { transport: WebSocket }` in `getSupabaseServerClient()` (`server.ts`).

## Scraper Strategy & Bot Protection Bypass (Njuškalo)
- **HTML Parsing**: Njuškalo's property cards are wrapped in `<article class="entity-body cf">`. Do **not** split/match on `<li>` tags because inner lists (like prices) will break the regex lazily. Always extract based on the `<article>` wrapper.
- **Bot Protection (ShieldSquare)**: Repeatedly hitting the same category in headless Playwright triggers Captchas. Mitigations:
  - **IPRoyal residential proxy** for ALL Njuškalo traffic (`PROXY_HOST/PORT/USER/PASS`). Sticky: `{pass}_session-{8chars}_lifetime-30m` (exactly 8 alphanumeric). Country via `_country-hr` in password. Search+detail share **one** context. **Block images/CSS/fonts/media** (scripts/XHR kept for Vue rendering) **AND a third-party ad/analytics host blocklist** (`BLOCKED_AD_HOSTS` in `monitor.ts`: googletagmanager, googlesyndication, doubleclick, tiktok analytics, etc.) — measured to be **99% of a "lean" page's bytes** (1105 KB → 8 KB, same card count). Never block `perfdrive.com` (Radware/ShieldSquare's own infra — breaks the bot challenge). Startup egress check — exit on 402. Diagnose: `npx tsx scripts/test-proxy.ts` (reports KB used). Pay-per-GB is expensive at current scan rates; prefer unlimited ISP proxies for 24/7.
  - `puppeteer-extra-plugin-stealth` + rotating User-Agents
  - Adaptive min cycle duration + 10-min backoff on real ShieldSquare block
  - 2 workers with different category subsets; inter-category + cycle rest delays
  - Never spawn workers with visible Windows console (QuickEdit freeze risk)
- **Supabase pagination**: Default query limit is 1000 rows. Monitor must paginate when loading `listings`/`seen_listings` external_ids for dedup.
- **Numeric column types**: Supabase JSON may return `worker_id` as string — use `Number()` when filtering.
- **Renewed Listings (Obnovljen)**: Instead of parsing unreliable UI badges, detect "renewed" listings via database age. If a scraped listing's `external_id` is already in the DB but is older than 12 hours, update its `status` to `Obnovljen` and refresh its `created_at` timestamp.

## Advanced Scraping & Scaling Strategy
- **Private Ad Detection via Playwright**: "Korisnik nije trgovac" (Private Ad indicator) only exists on detail pages. The scraper uses Playwright for BOTH search and detail pages (HTTP fetch with stolen cookies was blocked by ShieldSquare after extended use due to fingerprint mismatch). Detail page fetches use 1.5-3s delays to appear human-like.
- **Duplicate Detection & Skip Logic**: The monitor loads `external_id`s from both `listings` (private ads) and `seen_listings` (agency ads) at cycle start into a `knownIds` Set. Only ads NOT in `knownIds` trigger detail-page fetches. After checking, private ads go to `listings`, agency ads go to `seen_listings` for future skip tracking.
- **Live Monitor Dashboard**: Use Supabase Realtime to stream newly discovered private ads directly into the frontend UI instantly.
- **Scaling to Multiple Sites (10+)**: A "Distributed Fleet" architecture is recommended — deploy lightweight worker apps on separate VPS instances per site/category group to avoid IP rate-limiting.

---

## Deployment Architecture (Production)
- **Frontend**: Vercel (free Hobby tier) — `https://real-estate-scraper-sandy.vercel.app`
- **Workers**: **Contabo Cloud VPS 4** (`169.58.32.15`, 8 GB, EU) — PM2: `monitor-w1`, `monitor-w2`, `notify-poll` via `ecosystem.config.cjs`. Hetzner was original plan but unavailable for new orders.
- **VPS setup**: `deploy/vps-setup.sh` + `deploy/VPS_DEPLOY.md`. Env: copy `.env.production.local` → VPS `.env.local` via `scp`.
- **Env separation**: PC `.env.local` = dev Supabase; VPS `.env.local` = prod Supabase + `APP_ENV=production`; Vercel Production = prod keys.
- **Scaling**: Pool different sites on same VPS (shared IP OK — bot protection is per-site). 8 GB = Njuškalo (2 workers) + 1 worker/extra site. ~10 sites → 4× Contabo VPS (~€28/mo).
- **VPS is stateless**: Data in Supabase. Provider switch ≈ 30 min.
- **Database (Prod)**: Supabase `nekretnine-prod` (`fyhgxulgonnjbzufqljf`, eu-west-3)
- **Database (Dev)**: Supabase `nekretnine` (`xlaaatbkorktjgbmjtkl`, eu-west-3)
- **Notifications**: PM2 `notify-poll` on VPS (continuous loop), NOT Vercel cron (blocked on Hobby tier).
- **Production monitoring**: Client uses Oglasi page. Ops: `/monitor` (logs via `scraper_console_logs`, stats via `scrape_runs`), SSH `pm2 logs`, Supabase tables. Monitor tab hidden from sidebar in prod; Start/Stop blocked on Vercel (workers on VPS only). TODO: read-only Monitor in prod.
- **No auth layer** (single client). Future: Supabase Auth + hide `/monitor` from client.

## [2026-06-30] Multi-Worker Scraping Architecture & Latency Tracking (Superseded)
- Original plan was 3 workers shuffling all categories. **Replaced** by 2-worker weighted split via `WORKER_CATEGORIES` (see [2026-07-01] entry above).
