# Project Architecture & Rules

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- **Database / Backend**: Supabase (Database, Auth, Row Level Security)
- **Scraper**: Playwright + Stealth Plugin (headless Chromium with bot protection bypass)
- **Notifications**: Twilio (WhatsApp notifications API)

## Database Schema (Supabase)
- `listings`: Stores scraped real estate listings. Uses `external_id` (Njuškalo ID) for deduplication. Includes `transaction_type` (Prodaja/Najam), `status` (Novi, Obnovljen, Istekao), and `hidden` boolean.
- `scrape_runs`: Logs scraper execution history, status, and listing counts.

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
- **Bot Protection (ShieldSquare)**: Repeatedly hitting the same category (e.g., `/prodaja-stanova`) in headless Playwright triggers Captchas. Mitigation involves using `puppeteer-extra-plugin-stealth`, applying rotating standard desktop User-Agents, and relying on varied endpoints.
- **Renewed Listings (Obnovljen)**: Instead of parsing unreliable UI badges, detect "renewed" listings via database age. If a scraped listing's `external_id` is already in the DB but is older than 12 hours, update its `status` to `Obnovljen` and refresh its `created_at` timestamp.

## Advanced Scraping & Scaling Strategy
- **Fast Private Ad Detection**: "Korisnik nije trgovac" (Private Ad indicator) only exists on detail pages. To keep scraping fast without getting banned, the scraper uses Playwright to load the search page, extracts the new listing URLs, grabs the active session cookies, and then uses pure HTTP `fetch` to grab the HTML of the detail pages (skipping JS/CSS rendering).
- **Live Monitor Dashboard**: Use Supabase Realtime to stream newly discovered private ads directly into the frontend UI instantly.
- **Scaling to Multiple Sites (10+)**: A "Distributed Fleet" architecture is highly recommended. Instead of running one massive scraper, deploy multiple lightweight worker apps (e.g., on separate cheap VPS instances). 
  - Worker 1 handles Njuškalo (Stanovi)
  - Worker 2 handles Njuškalo (Kuće)
  - Worker 3 handles Index.hr Oglasi
  - This prevents IP rate-limiting, balances CPU/RAM usage (headless browsers are heavy), and keeps notification latency extremely low (under a minute) for every category and site.
