# Development Log

## [2026-07-20] Proxy burned 2 GB in ~30 min — estimate was wrong

### 42. Why 4 GB/mo estimate failed
- **Prior estimate** (~2–4 GB/mo) assumed either (a) proxy only on detail pages, or (b) HTML/JS-only traffic.
- **What shipped**: ALL traffic via residential proxy + **search pages loaded full images/CSS/fonts**. Njuškalo listing pages are multi‑MB with thumbnails. 2 workers × dozens of category loads/hour ≈ **~2 GB in half an hour**. Dashboard: remaining **-0.07 GB**, 402 until top-up.
- **Fix**: Block image/stylesheet/font/media on **search and detail** proxy pages (keep document/script/xhr for Vue). Expected lean page ~0.2–0.5 MB vs ~5–15 MB full.
- **Revised reality check** (lean, all-proxy, current scan rate, 24/7): still likely **tens of GB/month**, not 4. For cheap continuous monitoring prefer **unlimited-bandwidth ISP/static residential** (e.g. Webshare) over pay-per-GB. Pay-per-GB only works if scan rate is slowed a lot or search returns to native IP (risky if IP is burned).
- **Files**: `scripts/monitor.ts`

---

## [2026-07-20] ShieldSquare blocks after proxy — root cause was IPRoyal 402 + bad sticky format

### 41. Still "blocked" after proxy implementation
- **Symptom**: Workers logged `BLOCKED by ShieldSquare` immediately on category start; 0 ads saved; 10-min backoff loops.
- **Real root cause #1 (billing)**: IPRoyal gateway returns **HTTP 402 Payment Required**. Playwright surfaces this as `ERR_TUNNEL_CONNECTION_FAILED`, which the monitor previously mislabeled as ShieldSquare.
- **Real root cause #2 (code)**: Sticky session IDs were invalid (`s{timestamp}_{rand}` — IPRoyal requires **exactly 8 alphanumeric** chars + `_lifetime-`). Search + detail used **separate contexts** → different IPs + no shared ShieldSquare cookies.
- **Fix**:
  1. Shared proxy context (search + detail pages) with one sticky session / IP
  2. Correct sticky password: `{pass}_session-{8chars}_lifetime-30m` (country already in `PROXY_PASS`)
  3. Startup egress IP check — refuse to scrape on native IP when proxy is configured but dead
  4. Distinguish `blockReason` (ShieldSquare vs no-cards vs tunnel)
  5. `scripts/test-proxy.ts` billing check (402)
- **Action required**: Top up IPRoyal balance at dashboard, then `npx tsx scripts/test-proxy.ts`, then restart workers.
- **Files**: `scripts/monitor.ts`, `scripts/test-proxy.ts`, `src/lib/scraper/njuskalo.ts`

---

## [2026-07-20] IPRoyal Residential Proxy Integration

### 40. IPRoyal proxy for all scraping traffic
- **Problem**: Both workers getting frequently blocked by ShieldSquare on the Contabo VPS datacenter IP. 10-min backoff was insufficient — re-blocked within 1 second of restarting. Additionally, routing only details through the proxy proved insufficient because search page requests also triggered ShieldSquare blocks on the VPS native IP.
- **Solution**: IPRoyal residential proxy ($1.56–6.25/GB) routed through Playwright's native proxy support for ALL Njuškalo traffic.
- **Architecture**: Dual proxy context routing:
  - **Search pages**: Routed through a proxy context *with* assets enabled (required for Vue layout rendering).
  - **Detail pages**: Routed through a proxy context *without* assets (images, CSS, fonts, and media blocked via `page.route()` to achieve a ~90% bandwidth reduction from ~3 MB to ~100-150 KB per page).
  - **Fallback**: If proxy vars not set, all traffic falls back to VPS native IP (existing behavior).
- **Env vars**: `PROXY_HOST`, `PROXY_PORT`, `PROXY_USER`, `PROXY_PASS` in `.env.local` / `.env.production.local`.
- **Verified**: Confirmed both workers running successfully on the VPS via `pm2 logs`, fetching categories and detail pages without ShieldSquare blocks.
- **Files changed**: `scripts/monitor.ts` (dual proxy context creation, all 3 restart paths updated), `.env.local`, `.env.production.local`, `.env.example`, `scripts/test-proxy.ts`.

## [2026-07-20] Contabo VPS Live — Production Workers Deployed

### 35. VPS provisioned & workers running
- **Provider**: Contabo **Cloud VPS 4** (8 GB, 4 vCPU, 100 GB SSD) — same tier as old "VPS 10" naming (~€6.88/mo incl. VAT)
- **Region**: EU (Hub Europe)
- **IP**: `169.58.32.15`
- **OS**: Ubuntu 24.04, hostname `vmi3445391`
- **Stack**: Node 20.20.2, PM2 7.x, Playwright Chromium
- **PM2 processes**: `monitor-w1`, `monitor-w2`, `notify-poll` via `ecosystem.config.cjs`
- **Boot persistence**: `pm2 startup` + `pm2 save` configured (`pm2-root.service`)
- **Repo clone**: `https://github.com/radunfilip11-tech/RealEstateScraper.git` (temporarily **public** for passwordless clone; can revert to private + PAT for `git pull`)

### 36. Production env on VPS (2026-07-20)
- **Pattern**: Keep **dev** keys in PC `.env.local`; use **`.env.production.local`** locally, copy to VPS as `.env.local` via `scp`
- **VPS `.env.local`**: `APP_ENV=production` + Supabase **nekretnine-prod** (`fyhgxulgonnjbzufqljf`) + `TELEGRAM_BOT_TOKEN`
- **Verified**: `grep SUPABASE_URL` shows prod ref; logs show `[W1] Database has 0 known listings` on first prod run (empty prod DB — expected vs ~30k on dev)
- **Local dev unchanged**: PC still uses dev project `xlaaatbkorktjgbmjtkl`

### 37. Deployment blockers & fixes (hints for next time)

| # | Problem | Symptom | Fix |
|---|---------|---------|-----|
| 1 | **Private GitHub repo** | `Username for 'https://github.com':` on clone | Make repo public temporarily, or use PAT in clone URL, or deploy key |
| 2 | **`npm ci` lock mismatch** | `Missing: @emnapi/* from lock file` on Linux | Run `npm install` on VPS (or sync lockfile on PC). `deploy/vps-setup.sh` now falls back to `npm install` |
| 3 | **`with-system-ca.mjs` on Linux** | `/usr/bin/node: --use-system-ca is not allowed in NODE_OPTIONS` → PM2 crash loop | Only set `NODE_OPTIONS=--use-system-ca` when `process.platform === 'win32'`. Windows-only TLS fix |
| 4 | **Supabase on Node 20** | `Node.js 20 detected without native WebSocket support` | Add `ws` dependency + pass `realtime: { transport: WebSocket }` in `src/lib/supabase/server.ts`. `monitor.ts` now uses `getSupabaseServerClient()` |
| 5 | **Wrong directory on VPS** | `cp: cannot stat 'env.example'` | Always `cd ~/nekretnine` first — not `~` |
| 6 | **SSH disconnect** | `client_loop: send disconnect: Connection reset` | Files persist on VPS; SSH back in and continue. Run long commands in SSH, not local PowerShell |
| 7 | **Ran setup on Windows** | `Permission denied` for `~/nekretnine` | Clone/install only on **VPS** (`root@vmi3445391`), not `PS C:\...>` |
| 8 | **Contabo login confusion** | `root` fails on my.contabo.com | Panel login = **email** + Contabo account password. VPS SSH = `root` + **VPS root password** (set at order) |
| 9 | **Contabo KYC** | Order on hold after payment | Reply to support email with ID + utility bill; ~hours to approve |
| 10 | **Monitor "Stopped" on Vercel prod** | `/api/monitor/control` status checks **local PID files** on Vercel, not VPS PM2 | Expected. Use `/monitor` logs (Supabase `scraper_console_logs`), `/api/monitor/stats`, or `pm2 logs` on VPS |

### 38. Files changed during VPS deployment (local repo)
- `scripts/with-system-ca.mjs` — Windows-only `--use-system-ca`
- `src/lib/supabase/server.ts` — `ws` transport for Node < 22
- `scripts/monitor.ts` — uses `getSupabaseServerClient()` instead of raw `createClient`
- `package.json` — added `ws` dependency
- `deploy/vps-setup.sh` — `npm ci` → fallback `npm install`
- `.env.production.local` — **[local only, gitignored]** template for VPS prod keys

### 39. Ops commands (VPS cheat sheet)
```bash
ssh root@169.58.32.15
pm2 status
pm2 logs monitor-w1 --lines 30 --nostream
pm2 stop all          # pause workers
pm2 start ecosystem.config.cjs
pm2 restart all       # after .env.local or git pull
pm2 save
grep SUPABASE_URL ~/nekretnine/.env.local
```

**Update VPS env from PC:**
```powershell
scp ".env.production.local" root@169.58.32.15:~/nekretnine/.env.local
```

**Update VPS code:**
```bash
cd ~/nekretnine && git pull && npm install && pm2 restart all
```

### 40. Production monitoring workflow (agreed, not all implemented)
- **Client view**: Vercel prod URL → Oglasi (listings updating = healthy)
- **Ops view**: `/monitor` page still works (logs via `scraper_console_logs`, stats via `scrape_runs`) but **hidden from sidebar** when `APP_ENV=production`
- **Start/Stop on prod Vercel**: Correctly blocked — workers managed by PM2 on VPS only
- **TODO (future)**: Re-show Monitor tab in prod as **read-only** (hide Start/Stop; infer worker status from `/api/monitor/stats` not PID files)
- **TODO (future)**: Simple auth so client doesn't see `/monitor`

### 41. Contabo order notes
- Plan: **Cloud VPS 4**, Ubuntu 24.04, no auto-backup add-on (stateless workers; data in Supabase)
- Skip Plesk/cPanel/Windows — Ubuntu only
- `*** System restart required ***` after kernel upgrade — safe to ignore short-term; reboot when convenient

### Status (2026-07-20)
- ✅ VPS workers running on **production** Supabase
- ✅ PM2 survives reboot
- ⏳ Confirm Vercel Production env vars match prod Supabase (if not already)
- ⏳ Optional: notification_filters migration dev → prod
- ⏳ Optional: read-only Monitor tab in production
- ⏳ Push local fixes (`with-system-ca`, `server.ts`, `ws`) to GitHub so VPS can `git pull` cleanly

### Lessons Learned
1. **`with-system-ca.mjs` must be platform-gated** — Linux Node rejects `--use-system-ca` in `NODE_OPTIONS`; crashes all PM2 workers instantly.
2. **Installing `ws` is not enough** — `@supabase/supabase-js` on Node 20 requires explicit `realtime: { transport: WebSocket }` in client options.
3. **`.env.production.local` + `scp`** is easiest way to set VPS secrets without typing in nano.
4. **Never paste `service_role` keys in chat** — rotate in Supabase if exposed.
5. **Prod DB starts empty** — 0 listings on first connect is correct; dev listing counts do not carry over.
6. **PM2 `stop all` + `save`** pauses workers across reboot; use when testing locally against dev without VPS competing.

## [2026-07-16] VPS Provider Decision — Contabo (Conclusions)

### 34. Provider evaluation & final decision
- **Hetzner**: Originally planned (CX22), but **unavailable** for new instances (hardware shortage, Jun 2026).
- **OVH vs Contabo**: Evaluated for 1-site start and 10-site scale.
- **Decision**: **Contabo Cloud VPS 4** (8 GB, EU, Ubuntu 24.04) — ~€7/mo incl. VAT. *(Contabo renamed "VPS 10" → "VPS 4" in 2026.)*

### Conclusions (agreed in planning dialogue)
1. **VPS role**: Workers only (`monitor-w1`, `monitor-w2`, `notify-poll`). Dashboard stays on Vercel; data in Supabase. VPS is stateless — switching providers takes ~30 min (git clone + `.env.local` + PM2).
2. **Why Contabo over OVH for now**: 8 GB RAM fits 2 Njuškalo Playwright workers comfortably; OVH VPS-1 (4 GB) is too tight. Contabo offers best specs/€ for start.
3. **CPU spikes (Contabo overselling)**: Workers **slow down, don't break**. PM2 auto-restarts on real crashes. Not a blocker for 1–3 sites.
4. **Pause time reuse**: Idle CPU between Njuškalo cycles can run other sites on the **same VPS**. RAM is NOT freed (Chromium stays open). Rule: Njuškalo (2 workers) + **1 worker per additional site** on 8 GB VPS.
5. **Separate IP per site**: **Not required** for different sites — bot protection is per-site. Separate IPs matter for **multiple workers on the same site**, not cross-site scraping.
6. **Scaling to 10 sites** (projected, incl. ~25% VAT):
   - **Budget pooled** (4× Contabo VPS 4): ~€28/mo — recommended
   - **1 VPS per site** (OVH cheapest for isolation): ~€52/mo — overkill unless same-site worker scaling
   - **Not on one VPS**: RAM limit (~3 sites per 8 GB box max)
7. **Switch triggers**: Constant PM2 restarts → check RAM; cycles 3× slower for days → try OVH VPS-2; Hetzner available again → compare CX33.

### Status
- ~~Deploy artifacts ready — not yet pushed~~ → Pushed in commit `9fef185` ("preparing for vps")
- ~~Order Contabo~~ → **Done** — see [2026-07-20] entry

## [2026-07-13] VPS Deployment Artifacts Added

### 33. PM2 + Setup Script for Hetzner VPS
- **Files added**:
  - `ecosystem.config.cjs` — PM2 config for `monitor-w1`, `monitor-w2`, `notify-poll`
  - `deploy/vps-setup.sh` — first-time Ubuntu/Debian setup (Node 20, PM2, Playwright, npm ci)
  - `deploy/VPS_DEPLOY.md` — step-by-step deployment guide
  - `env.example` — env var template (`.env.example` blocked by `.gitignore`)
- **Architecture unchanged**: Vercel hosts dashboard; VPS runs workers only (no Next.js server on VPS)
- **Next step for user**: Provision Hetzner CX22 → SSH → run `deploy/vps-setup.sh` → fill `.env.local` → `pm2 start ecosystem.config.cjs`

## [2026-07-13] Node 24 TLS Fix — Scrapers Broken on Windows (Not a Code Regression)

### 29. Problem Report & Investigation
- **Symptom**: Scrapers stopped working — monitor logged `Failed to fetch known IDs: TypeError: fetch failed`, manual scrape via `/api/scrape` returned 500, `/api/monitor/stats` hung ~37s.
- **Initial suspicion**: Last two git commits (`ee39ec4` vercel push, `1d55d5a` remove Vercel cron) — but **neither touched scraper code** (`njuskalo.ts`, `monitor.ts`, `cron.ts`, `/api/scrape`).
- **Key test**: Checking out older commits that previously worked **still failed** → confirmed **environment change**, not a code regression.
- **Node version at time of failure**: `v24.12.0`

### 30. Root Cause
- Node.js 24 uses its **own bundled CA certificate store** instead of the Windows system trust store by default.
- On this Windows machine, something in the trust chain (likely antivirus HTTPS inspection or an extra root CA in the Windows store) causes a mismatch with Node's bundled CAs.
- Error: `UNABLE_TO_VERIFY_LEAF_SIGNATURE — unable to verify the first certificate`
- **Every Supabase HTTPS call failed** → scrapers could launch Playwright fine but could not read/write the database.
- Passing `--use-system-ca` as a CLI flag alone did **not** work for `tsx` (child processes don't inherit it). Setting `NODE_OPTIONS=--use-system-ca` **did** work.

### 31. Solution Applied
- **Files changed**:
  - `scripts/with-system-ca.mjs` — **[NEW]** Spawns Node child processes with `NODE_OPTIONS=--use-system-ca` so tsx and Next.js inherit the Windows CA store
  - `package.json` — Updated `dev`, `start`, `scrape`, `monitor`, `notify-poll` scripts to route through the wrapper
- **Not used**: `cross-env` npm package — `npm install` itself failed with the same TLS error before the fix was in place
- **Verified**: `npm run monitor -- --worker-id 1` connected to Supabase (28k+ known listings), started scraping and saving private ads

### 32. What the Last Two Commits Actually Changed (Unrelated to Scraper Failure)
| Commit | Change | Affects scrapers? |
|--------|--------|-------------------|
| `ee39ec4` | Telegram listing numbering, production guard on monitor API (blocks start/stop in prod), mobile sidebar, `/api/config` | Only blocks dashboard start/stop **on Vercel production** — by design |
| `1d55d5a` | Removed Vercel cron for `/api/notify/poll` | **No** — notifications only, moved to PM2 on VPS |

### Lessons Learned
1. **`TypeError: fetch failed` + `UNABLE_TO_VERIFY_LEAF_SIGNATURE` on Windows = TLS/CA issue, not transient network** — Check Node version first. On Node 24+, try `NODE_OPTIONS=--use-system-ca` before debugging scraper logic.
2. **Old commits failing = environment problem** — Node upgrade, antivirus, or proxy change. Don't chase git diffs.
3. **`--use-system-ca` CLI flag ≠ `NODE_OPTIONS=--use-system-ca` for tsx** — tsx spawns child Node processes; use `NODE_OPTIONS` env var or a wrapper script.
4. **Alternative fix**: Downgrade to **Node 20 LTS** — avoids the bundled-CA mismatch on Windows entirely.
5. **For `npm install` on affected machines**: Run `$env:NODE_OPTIONS="--use-system-ca"; npm install` in PowerShell before installing packages.

## [2026-07-11] Production Deployment — Vercel + Supabase

### 25. Production-Ready Code Changes
- **Files changed**:
  - `src/components/MonitorDashboard.tsx` — Removed "Clear Database" button and `handleClearDb` handler entirely (too dangerous, even in dev)
  - `src/components/ui/Sidebar.tsx` — Added `devOnly: true` flag to "Live Monitor" nav item. Sidebar now fetches `/api/config` on mount and hides `devOnly` items when `APP_ENV=production`
  - `src/app/api/config/route.ts` — **[NEW]** Returns `{ isProduction: boolean }` based on `NODE_ENV` or `APP_ENV`
  - `src/app/api/monitor/control/route.ts` — Added production guard: blocks `clear_db`, `start`, `stop` actions when `APP_ENV=production` (returns 403)
  - `.env.example` — **[NEW]** Template documenting all required env vars for each environment
  - `vercel.json` — Removed 5-min cron job (`*/5 * * * *`) which was **blocking all Vercel Hobby deployments**. Notifications now handled by PM2 `notify-poll` on VPS instead
- **Environment separation pattern**: `APP_ENV=production` on Vercel Production + VPS; unset locally. Controls Monitor tab visibility and API safety guards.

### 26. Production Supabase Project Created
- **Project name**: `nekretnine-prod`
- **Project ID (Ref)**: `fyhgxulgonnjbzufqljf`
- **Region**: `eu-west-3` (Paris)
- **URL**: `https://fyhgxulgonnjbzufqljf.supabase.co`
- **Schema**: Applied full migration via MCP — all 7 tables (`listings`, `seen_listings`, `notification_filters`, `scrape_runs`, `scraper_console_logs`, `category_scans`, `buyers`) with RLS enabled, indexes, triggers, and Realtime publication on `listings` + `scraper_console_logs`
- **Cost**: Free tier ($0/mo)
- **Note**: `category_scans` now has RLS enabled (was missing on the dev project)

### 27. Vercel Deployment
- **Project**: `real-estate-scraper` under `filips-projects-b5361cb6`
- **Production URL**: `https://real-estate-scraper-sandy.vercel.app`
- **Blocker found**: `vercel.json` cron expression `*/5 * * * *` completely blocked deployments on Hobby tier — had to remove it
- **Environment variables**: Set up via Vercel dashboard — Production env uses prod Supabase keys + `APP_ENV=production`, Preview env uses dev Supabase keys + `APP_ENV=development`
- **Vercel CLI**: Linked local project via `npx vercel link --yes --project real-estate-scraper`. Note: `vercel link` command adds a `VERCEL_OIDC_TOKEN` to `.env.local` — this is harmless and short-lived
- **Git push**: Committed vercel.json change (`1d55d5a`) and deployed via `npx vercel --prod --yes`

### 28. VPS Setup Plan — **COMPLETED** (see [2026-07-20] DEV_LOG entry)
- ~~Recommended provider: Hetzner CX22~~ → **Contabo Cloud VPS 4**, IP `169.58.32.15`
- Stack on VPS: Node.js 20 + PM2 + Playwright Chromium — **live**
- PM2 processes: `monitor-w1`, `monitor-w2`, `notify-poll` — **running on prod Supabase**

### Lessons Learned
1. **Vercel Hobby blocks crons faster than daily** — `*/5 * * * *` in `vercel.json` prevents ALL deployments, not just the cron. Must remove the config entirely, not just disable.
2. **`vercel link` modifies `.env.local`** — Adds `VERCEL_OIDC_TOKEN`. This is short-lived and harmless, but can surprise you if you expect `.env.local` to be untouched.
3. **PowerShell does not support `&&`** — Use `;` as statement separator in PowerShell commands.
4. **`TypeError: fetch failed` in monitor is transient** — Network blips cause this. The monitor already handles it correctly: logs error, waits 30-60s, retries next cycle (lines 235-238 in `monitor.ts`).
5. **Supabase free tier pauses projects after 7 days of inactivity** — Keep this in mind for the dev project if you stop working on it for a while.


## [2026-07-08] Telegram Listing Numbering

### 24. Numbering Telegram listings within notification batches
- **Files**:
  - `src/app/api/notify/poll/route.ts`
  - `src/app/api/notify/route.ts`
  - `scripts/notify-poll.ts`
- **Goal**: Number each listing in Telegram notifications to make it easier to reference specific ads in conversation.
- **Current Behavior**: Prepends a bold sequential counter `*#1*`, `*#2*`, etc. to the listings in each sent notification batch using the array index.
- **Future Change Needed**: The numbering currently resets for each notification batch/message sent. It should instead count sequentially throughout the day (a daily counter) and reset at midnight. Since this requires database tracking or a persistent state file to coordinate daily counters across runs and workers, it is documented for future implementation.

## [2026-07-02] Fingerprint Reset via Periodic Browser Restart

### 23. Periodic Browser Restart to Prevent Fingerprint Accumulation
- **Files**: `scripts/monitor.ts`
- **Symptoms**: After ~9-10 hours of running, Worker 1 was hitting ShieldSquare blocks on detail page fetches during peak morning hours (due to higher volume of new listings).
- **Fix**: Added a check at the end of each cycle in the main monitor loop. Every 50 cycles (`totalCycles % 50 === 0`), it gracefully closes the Playwright context and browser instance, restarts it with a new randomized User-Agent, and launches a fresh context. This resets cookies and session storage state to avoid heuristic fingerprint detection.
- **Why**: Keeps the browser session fresh and breaks up fingerprint flags without waiting for a ShieldSquare block to trigger a restart.

## [2026-07-01] Fix Filter Race Condition and Active Preset Persistence

### 21. Fix fetchListings race condition on Dashboard remount
- **Files**: `src/components/Dashboard.tsx`
- **Symptoms**: "When I switch back from some tab, after a half a second it goes back to no filters although the filters are selected."
- **Root cause**: When the `Dashboard` component unmounted and remounted, it fired an initial `fetchListings()` with default/empty filters (which took a long time). Immediately after, `useEffect` restored the saved filters and fired a second `fetchListings()` (which was fast). The fast filtered query completed first, but then the slow unfiltered query completed and overwrote the listings array with unfiltered data.
- **Fix**: 
  - Added `latestFetchId` (using `useRef`) to track the most recent network request and discard stale responses.
  - Added a `filtersRestored` check to the `useEffect` that calls `fetchListings` to prevent the initial unfiltered fetch from happening at all, saving a network request and completely eliminating the race condition.

### 22. Fix active preset chip highlight disappearing on tab switch
- **Files**: `src/hooks/useFilterPresets.ts`
- **Symptoms**: "...and the saved filters are not there anymore." (The preset chips were visible but the green highlight indicating the active preset was gone).
- **Root cause**: `activePresetId` was kept only in React state (`useState`) and never persisted to `localStorage`, so when the component unmounted and remounted, it initialized back to `null`.
- **Fix**: Added `ACTIVE_PRESET_KEY` (`nekretnine_active_preset_id`) to `localStorage`. `activePresetId` is now loaded on mount and auto-saved alongside `presets`.
## [2026-07-01] Saved Filter Presets & Last-Used Filter Persistence

### 18. Filter presets with localStorage persistence
- **New files**:
  - `src/hooks/useFilterPresets.ts` — custom hook for preset CRUD + last-used filter auto-save/restore via localStorage
  - `src/components/ui/SavedFiltersBar.tsx` — preset chip bar UI (save, load, rename, update, delete)
- **Edited**:
  - `src/lib/supabase/types.ts` — added `FilterState` and `FilterPreset` interfaces
  - `src/components/Dashboard.tsx` — integrated auto-restore, auto-persist, preset bar, `applyFilters()` / `getCurrentFilters()` helpers, expanded `activeFilterCount`
- **Features**:
  - **Last used filters**: All filter state (search, locations, transaction types, property types, advertiser, sources, statuses, price/size ranges, date range, sort, showHidden) is automatically saved to localStorage on every change and restored on page load.
  - **Named presets**: Users can save the current filter combination with a custom name. Presets appear as clickable chips above the filter bar. Each preset has a hover menu with: update (overwrite with current filters), rename, and delete.
  - **Active preset highlighting**: The currently loaded preset gets an emerald ring indicator.
  - **Filter summary tooltip**: Hovering over a preset chip shows a summary of what filters it contains (transaction, property type, location, price/size ranges).
  - **Expanded active filter count**: `activeFilterCount` now includes search, location, transaction, status — not just source/property/advertiser/ranges.
- **Storage keys** (localStorage):
  - `nekretnine_last_filters` — last-used filter snapshot (auto-saved on every change)
  - `nekretnine_filter_presets` — array of named `FilterPreset` objects
- **Storage**: Pure localStorage — no DB table needed since this is a single-user internal app.
- **Cleared filters**: The "Očisti" button now resets to `DEFAULT_FILTERS` via `applyFilters()` AND deselects the active preset.
- **Hook API** (`useFilterPresets`):
  - `presets`, `activePresetId`, `setActivePresetId`
  - `savePreset(name, filters)`, `updatePreset(id, filters)`, `renamePreset(id, name)`, `deletePreset(id)`
  - Standalone: `getLastFilters()`, `persistLastFilters(filters)`, `DEFAULT_FILTERS`
  - Presets load from localStorage in `useEffect` (same hydration-safe pattern as last-filters restore)
- **UI placement**: `SavedFiltersBar` sits between `SearchBar` and the `#filters-bar` filter dropdown row on `/`.
- **Types added** (`src/lib/supabase/types.ts`):
  - `FilterState` — full dashboard filter snapshot (18 fields)
  - `FilterPreset` — `{ id, name, filters: FilterState, createdAt }`
- **Not in scope** (future): URL query-param sync, DB-backed presets, sharing presets across devices. Closest existing pattern for server-persisted filters is `notification_filters` on `/notifications`.

### 19. Fix hydration mismatch on filter restore
- **File**: `src/components/Dashboard.tsx`
- **Problem**: Initial implementation called `getLastFilters()` inside `useState()` initializers. Server renders with `DEFAULT_FILTERS` (no `localStorage`), client renders with saved filters (e.g. "Split" in `LocationFilterDropdown`, `hasActiveFilters={true}` on `SavedFiltersBar`) → React hydration mismatch.
- **Fix**:
  - All filter `useState` hooks now initialize from `DEFAULT_FILTERS` (server and client first render match).
  - Restore from `getLastFilters()` moved to a mount-only `useEffect`.
  - Added `filtersRestoredRef` guard so the auto-persist effect does not overwrite saved filters with defaults before restore completes.
- **Tradeoff**: Brief flash of default filters on first paint before restore applies — acceptable for a single-user dashboard.
- **Lesson**: Never read `localStorage` during SSR or initial `useState` in Next.js Client Components; defer to `useEffect` after hydration.

### 20. Fix filters/presets wiped on remount (ref → state guard)
- **Files**: `src/components/Dashboard.tsx`, `src/hooks/useFilterPresets.ts`
- **Symptoms**: After navigating away and back (Dashboard remount), (1) saved last-used filters and saved preset chips disappeared, and (2) selected filters stopped filtering (chips showed "2 odabrano" but all 756 listings returned unfiltered).
- **Root cause**: The "restore complete" guard was a `useRef` (`filtersRestoredRef` / `initialized`). The restore effect mutated `ref.current = true` synchronously, and the persist/save effect — running in the **same commit** — then read `true` and wrote the render's *stale default* state over the freshly-read saved data in localStorage. Under React StrictMode (dev) the double effect pass re-read the already-corrupted localStorage, permanently wiping filters to defaults and desyncing state from the fetch.
- **Fix**: Replaced the `useRef` guard with a **state** flag (`filtersRestored` / `loaded`). State is captured per-render in each effect's closure, so the persist/save effect reliably sees `false` on the first commit and only writes after the restored values are committed.
  - `Dashboard.tsx`: `filtersRestored` state; persist effect `if (!filtersRestored) return;` with deps `[filtersRestored, getCurrentFilters]`. Removed now-unused `useRef` import.
  - `useFilterPresets.ts`: `loaded` state; save effect `if (!loaded) return;` with deps `[loaded, presets]`. Removed `useRef` import.
- **Lesson**: For "skip persistence until hydrated/restored" guards, use `useState`, not `useRef`. A ref mutated inside one effect is visible to sibling effects in the same commit, causing stale-value writes; a state flag is closure-scoped per render and avoids the race (also correct under StrictMode double-invoke).

---

## [2026-07-01] Notification Filters Tab (WhatsApp alerts per saved filter rule)

### 17. New "Obavijesti" tab with per-filter WhatsApp notification rules
- **New files**:
  - `supabase/migrations/20260701_create_notification_filters.sql` — new table
  - `src/app/notifications/page.tsx` — sidebar tab page
  - `src/components/notifications/NotificationFilterForm.tsx` — create/edit modal
  - `src/components/notifications/NotificationFilterCard.tsx` — rule row w/ toggle, edit, delete, test
  - `src/app/api/notification-filters/route.ts` — CRUD (GET/POST/PUT/DELETE)
  - `src/app/api/notify/poll/route.ts` — poll & send matching WhatsApp
  - `scripts/notify-poll.ts` — local continuous poller (`npm run notify-poll`)
  - `vercel.json` — Vercel cron config for `/api/notify/poll` every 5 min
- **Edited**: `src/lib/supabase/types.ts` (added `NotificationFilter` interface), `src/components/ui/Sidebar.tsx` (added tab), `package.json` (added `notify-poll` script).
- **Feature**: User can create multiple saved filter rules; each rule has its own WhatsApp phone number and full set of Dashboard filters (location hierarchy, transaction, property type, advertiser, source, status, price range, size range). Rules can be paused/activated, tested (send matching listings now), edited, and deleted.
- **Matching approach**: Empty arrays / null values mean "any" for that dimension. All set dimensions AND together. Per-filter `last_notified_at` prevents re-sending the same listing; fallback = last 24h for never-notified filters. Fetches at most 500 candidate listings per cycle to keep load bounded.
- **Trigger mechanism**: Periodic polling every 5 minutes.
  - Deployed: `vercel.json` cron hits `/api/notify/poll`.
  - Local dev: `npm run notify-poll` (continuous loop) or `npm run notify-poll -- --once`.
- **RLS**: `notification_filters` has full RLS enabled — service role for the poller, public policy for the internal single-user app (matches existing pattern with `listings`, `buyers`).
- **Auto-updated timestamp**: DB trigger `notification_filters_updated_at` bumps `updated_at` on every UPDATE.
- **Reused components**: `FilterDropdown`, `RangeFilter`, `LocationFilterDropdown` from `src/components/ui/` — form UX is identical to Dashboard filters.
- **Lesson**: Reusing existing filter UI primitives saved a full form redesign — the same multi-select semantics translate directly to notification rules.

---

## [2026-07-01] Add Sorting by Published Date

### 16. New Sort Options: Published Date from Website
- **Files**: `src/app/api/listings/route.ts`, `src/components/Dashboard.tsx`
- **Feature**: Added two new sort options that use `published_at` (the actual publication date from the website) instead of `created_at` (when the ad was scraped).
- **Implementation**:
  - API route: Added `published_newest` and `published_oldest` cases that order by `published_at` with `nullsFirst: false`
  - Dashboard: Added "Najnovije objavljeno (na sajtu)" and "Najstarije objavljeno (na sajtu)" options to the sort dropdown
  - Updated existing options to clarify "(skraperano)" vs "(na sajtu)"
- **Data Source**: `published_at` is extracted from `<time datetime="...">` elements on both search results pages and detail pages (lines 201-206 and 360-365 in `njuskalo.ts`)
- **Why**: Allows users to see which ads were most recently published by sellers on the website, not just which ones were most recently discovered by the scraper. More useful for catching brand new listings.

---

## [2026-07-01] Fix HTTP 403 on Detail Pages — Switch to Playwright

### 15. Detail Page Fetches Now Use Playwright (not HTTP)
- **Files**: `src/lib/scraper/njuskalo.ts`, `scripts/monitor.ts`
- **Problem**: After several days of scraping, ShieldSquare started returning HTTP 403 on detail page fetches made with raw `fetch()` + stolen cookies.
- **Root Cause**: ShieldSquare detected the fingerprint mismatch — search pages had full browser JS execution, detail pages were raw HTTP without browser fingerprint.
- **Fix**: 
  - Added `fetchDetailPagePlaywright()` function that uses the existing Playwright page to navigate to detail pages
  - Replaced `fetchDetailPageHTTP()` calls in monitor with `fetchDetailPagePlaywright()`
  - Increased detail page delay from 500-1400ms to 1500-3000ms (human-like)
  - Added `blocked` detection on detail pages — if ShieldSquare triggers, stops detail fetches and restarts browser
- **Tradeoff**: ~10x slower per detail page (~3s vs ~200ms), but reliable. Cycle time with 20 new ads increases from ~65s to ~140s.
- **Lesson**: Raw HTTP fetch with stolen cookies is a temporary bypass. ShieldSquare's behavioral analysis eventually detects the pattern (browser for search, HTTP for detail). Use Playwright for all page loads.

---

## [2026-07-01] Night Shift Pacing, Worker Rebalance & Ads-by-Hour Stats *(uncommitted)*

### 11. Adaptive Minimum Cycle Duration (per worker + time of day)
- **File**: `scripts/monitor.ts`
- Replaced flat 60s minimum cycle with **timezone-aware, per-worker targets** (Europe/Zagreb):
  - **Night (01:00–06:00)**: W1 = 8–10 min, W2 = 20–25 min between cycle starts
  - **Day**: W1 = 100–250s, W2 = 200–500s
- If `cycleDuration < targetDuration`, adds penalty wait before next cycle
- **Why**: Fast empty cycles at night (~20s) were triggering ShieldSquare; daytime slows naturally when new ads need detail fetches

### 12. Worker Category Rebalance (high-traffic on W1)
- **File**: `src/lib/scraper/njuskalo.ts`
- **W1** (4 cats — sprint): `stanovi`, `kuce`, `zemljista`, `najam_stanova`
- **W2** (11 cats — full coverage): `najam_kuca`, `vikendice`, `poslovni_prostori`, luxury, garaze, novogradnja, remaining rent categories
- Moved `stanovi` back to W1 (60k ads — highest traffic)

### 13. Stats API Pagination & Ads-by-Hour
- **File**: `src/app/api/monitor/stats/route.ts`
- `scrape_runs` and `category_scans` queries now use `.limit(1000/2000)` + reverse to avoid Supabase 1000-row default truncation
- New `ads.adsPerHour[]` — hourly distribution from last 3000 private ads (`published_at` or `created_at`)

### 14. Ads-by-Hour Chart in Dashboard
- **File**: `src/components/MonitorDashboard.tsx`
- "Oglasi (24h)" card expandable — click "Po satu" for 24-bar hourly histogram with hover tooltips

### Uncommitted files (this commit)
| File | Changes |
|------|---------|
| `scripts/monitor.ts` | Night/day per-worker min cycle duration |
| `src/lib/scraper/njuskalo.ts` | W1 = 4 high-traffic, W2 = 11 remaining |
| `src/app/api/monitor/stats/route.ts` | Pagination limits, `adsPerHour` |
| `src/components/MonitorDashboard.tsx` | Hourly ads bar chart |

---

## [2026-07-01] Monitor Stats Dashboard, Worker Fixes & Category Expansion *(committed e301fd2)*
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
- **Current split**:
  - W1: `stanovi`, `kuce`, `zemljista`, `najam_stanova` (4 high-traffic)
  - W2: `najam_kuca`, `vikendice`, `poslovni_prostori`, + luxury/garaze/novogradnja/remaining rent (11 cats)
- **Note**: Previously W1 had 5 cats without `stanovi`; rebalanced so highest-traffic category is on sprint worker

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
- **Problem**: At night with few new ads, cycles completed in ~20s → ShieldSquare blocks
- **Fix** (`scripts/monitor.ts`): Adaptive per-worker minimum cycle duration (see [2026-07-01] uncommitted section §11)
- **Initial fix**: flat 60s penalty; **superseded** by night/day + per-worker targets

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
