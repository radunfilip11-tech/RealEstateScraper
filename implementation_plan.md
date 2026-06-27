# Real Estate Scraper Dashboard — MVP Implementation Plan

## Summary

Build a real estate agent dashboard that:
1. **Scrapes** new property listings from Njuškalo (Nekretnine category)
2. **Stores** them in a Supabase database with deduplication
3. **Notifies** the agent via WhatsApp (Twilio) when new listings appear
4. **Displays** all listings in a premium, filterable dashboard

**Project location**: `C:\Users\Red Dragon\Documents\ANTIGRAVITY\Nekretnine`

---

## User Review Required

> [!NOTE]
> **Supabase Project**: Setup completed! We created a new Supabase project named `nekretnine` and configured the connection credentials in [.env.local](file:///c:/Users/Red%20Dragon/Documents/ANTIGRAVITY/Nekretnine/.env.local).

> [!IMPORTANT]
> **Twilio Account**: For WhatsApp notifications, you'll need a Twilio account (free trial works for testing). I'll need `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and the sandbox WhatsApp number. You can set this up later — the MVP dashboard will work without it.

> [!NOTE]
> **Scraping Approach**: The listing pages (`/prodaja-stanova`, `/prodaja-kuca`, etc.) are **not blocked** by Njuškalo's `robots.txt`. We'll use Playwright (headless browser) with reasonable delays (3-5s between pages) to avoid overloading their servers. For production, we'd add proxy rotation.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Next.js 14 App                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  Dashboard    │  │  Filters     │  │  Settings │ │
│  │  (listings)   │  │  (source,    │  │  (WhatsApp│ │
│  │              │  │   type, loc) │  │   number) │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         └─────────────┬───┘                │       │
│                       ▼                    │       │
│            ┌──────────────────┐            │       │
│            │   API Routes     │            │       │
│            │  /api/scrape     │◄───────────┘       │
│            │  /api/listings   │                    │
│            │  /api/notify     │                    │
│            └────────┬─────────┘                    │
└─────────────────────┼──────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Supabase │  │ Playwright│  │  Twilio  │
  │ (DB)     │  │ (Scraper) │  │ WhatsApp │
  └──────────┘  └──────────┘  └──────────┘
```

---

## Proposed Changes

### 1. Project Initialization

#### [NEW] Next.js 14 Project
- Initialize with `npx create-next-app@latest ./` in the Nekretnine directory
- TypeScript, Tailwind CSS, App Router, ESLint
- Install additional dependencies: `playwright`, `@supabase/supabase-js`, `twilio`

---

### 2. Database Schema (Supabase)

#### [NEW] `listings` table
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `external_id` | text (unique) | Njuškalo listing ID (for dedup) |
| `title` | text | Listing title |
| `price` | text | Price as displayed (e.g., "125.000 €") |
| `price_numeric` | numeric | Parsed numeric price for filtering |
| `size_m2` | numeric | Size in m² |
| `location` | text | Location/address |
| `property_type` | text | Stan, Kuća, Zemljište, etc. |
| `advertiser_type` | text | "Privatni" or "Agencija" |
| `url` | text | Full URL to listing |
| `image_url` | text | Thumbnail image URL |
| `source` | text | "njuskalo" (extensible for Index, Burza, etc.) |
| `description` | text | Short description snippet |
| `notified` | boolean | Whether WhatsApp notification was sent |
| `created_at` | timestamptz | When scraped |

#### [NEW] `scrape_runs` table
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `source` | text | "njuskalo" |
| `started_at` | timestamptz | Scrape start time |
| `finished_at` | timestamptz | Scrape end time |
| `listings_found` | integer | Total listings found |
| `new_listings` | integer | New listings (not seen before) |
| `status` | text | "success" / "error" |
| `error_message` | text | Error details if failed |

---

### 3. Scraper Service

#### [NEW] `src/lib/scraper/njuskalo.ts`
- Uses **Playwright** to navigate to `https://www.njuskalo.hr/prodaja-stanova` (and similar categories)
- Handles pagination (`?page=1`, `?page=2`, etc.)
- Extracts per listing: title, price, size, location, image, URL, advertiser type
- Implements delays between page loads (3-5 seconds)
- Returns array of parsed listing objects

#### [NEW] `src/app/api/scrape/route.ts`
- API route that triggers a scrape run
- Calls the Njuškalo scraper
- Deduplicates against existing `external_id` in Supabase
- Inserts new listings
- Triggers WhatsApp notification for new listings
- Returns summary (found, new, errors)

---

### 4. Notification Service

#### [NEW] `src/lib/notifications/whatsapp.ts`
- Twilio WhatsApp integration
- `sendNewListingNotification(listing)` — formats and sends a message with:
  - 🏠 Title
  - 💰 Price
  - 📍 Location
  - 📐 Size
  - 🔗 Direct link to listing

#### [NEW] `src/app/api/notify/route.ts`
- API route to send test notifications
- Marks listings as `notified = true` after successful send

---

### 5. Frontend Dashboard

#### [NEW] `src/app/page.tsx` — Main Dashboard
Matching the reference screenshots from "Luva Real Estates":
- **Stats bar**: "X Novih oglasa u posljednja 24 sata" | "Y Privatnih oglasa u posljednja 24 sata"
- **Search bar**: "Pretraži po naslovu ili šifri oglasa"
- **Filter chips/dropdowns**:
  - Oglasnik (Source): Njuškalo ✓ (more sources later)
  - Oglašivač (Advertiser): Privatni / Agencija
  - Tip nekretnine (Property Type): Stan, Kuća, Poslovni prostor, Zemljište, Luksuzni stan, Luksuzna kuća, Novogradnja, Vikendica, Garaža, Parkirno mjesto
  - Lokacija (Location): Hierarchical — Regija → Županija → Grad/Općina
  - Cijena (Price): Min-Max range
  - Kvadratura (Size): Min-Max range
- **Listing cards**: Thumbnail | Title | Size | Price | Location | Tags (Source badge, Advertiser badge)

#### [NEW] `src/app/settings/page.tsx` — Settings
- WhatsApp phone number configuration
- Scrape interval settings
- Filter presets for notifications

#### [NEW] `src/components/ui/` — Reusable components
- `FilterDropdown.tsx` — Multi-select dropdown with checkboxes
- `ListingCard.tsx` — Individual listing row
- `StatsBar.tsx` — Top statistics counters
- `SearchBar.tsx` — Search input
- `Badge.tsx` — Source/advertiser badges
- `Sidebar.tsx` — Navigation sidebar

---

### 6. Styling & Design

**Design system matching screenshots**:
- Clean white background with subtle borders
- Black text, minimal color (badges for source sites)
- Source badges: Njuškalo (green), Index (red), Burza (blue)
- Advertiser tags: "Privatni" (dark badge), "Agencija" (light badge)  
- Property type pills in the table
- Premium font (Inter from Google Fonts)
- Smooth filter animations
- Responsive layout with collapsible sidebar

---

## Implementation Order

| Phase | Task | Priority |
|-------|------|----------|
| 1 | Initialize Next.js project + install deps | 🔴 Critical |
| 2 | Create Supabase schema (listings, scrape_runs) | 🔴 Critical |
| 3 | Build Njuškalo scraper with Playwright | 🔴 Critical |
| 4 | Build dashboard UI (listings + filters) | 🔴 Critical |
| 5 | Connect scraper API route + deduplication | 🟡 High |
| 6 | WhatsApp notification integration | 🟢 Medium |
| 7 | Settings page | 🟢 Medium |
| 8 | Real-time updates (Supabase subscriptions) | 🔵 Low |

---

## Verification Plan

### Manual Verification
1. **Scraper**: Run `npm run scrape` or hit `/api/scrape` — verify listings appear in Supabase
2. **Dashboard**: Verify listings render correctly with images, prices, and all filters work
3. **WhatsApp**: Send test notification via `/api/notify` — verify message arrives on phone
4. **Deduplication**: Run scraper twice — verify no duplicate listings created

### Automated Tests
```bash
npm run build   # Verify project compiles
```
