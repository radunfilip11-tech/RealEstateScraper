# VPS Deployment Guide

Workers run 24/7 on a VPS. The dashboard stays on Vercel.

| Component | Where | What runs |
|-----------|-------|-----------|
| Dashboard | Vercel | Next.js UI (`real-estate-scraper-sandy.vercel.app`) |
| Workers | VPS | `monitor-w1`, `monitor-w2`, `notify-poll` via PM2 |
| Database | Supabase | `nekretnine-prod` (eu-west-3) |

## Decisions (2026-07-16)

- **Provider**: Contabo Cloud VPS 10 (~€7/mo incl. VAT). Hetzner unavailable for new orders.
- **Why Contabo**: 8 GB RAM for 2 Playwright workers; OVH 4 GB too tight. CPU spikes slow workers but PM2 auto-recovers.
- **Scaling**: Different sites can share one IP (bot protection is per-site). 8 GB VPS = Njuškalo + 1 worker per extra site. ~10 sites → 4 VPS (~€28/mo).
- **Migration**: VPS is stateless (data in Supabase). Switching provider ≈ 30 min.

## 1. Provision the VPS

**Recommended:** [Contabo Cloud VPS 10](https://contabo.com/en/vps/) (~€7/mo incl. VAT)

- 4 vCPU, 8 GB RAM — comfortable for 2 Playwright browsers + notify poller
- Location: **Germany (Nuremberg)**
- OS: **Ubuntu 24.04**

Create the server, add your SSH key, note the public IP.

## 2. SSH in and run setup

```bash
ssh root@YOUR_VPS_IP

# Create a deploy user (recommended)
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
su - deploy

# Clone and run the setup script
git clone https://github.com/radunfilip11-tech/RealEstateScraper.git ~/nekretnine
cd ~/nekretnine
chmod +x deploy/vps-setup.sh
./deploy/vps-setup.sh
```

The script installs Node 20, PM2, Playwright Chromium, and npm dependencies.

## 3. Configure environment

```bash
nano ~/nekretnine/.env.local
```

Required values (production Supabase project `nekretnine-prod`):

```env
APP_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://fyhgxulgonnjbzufqljf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>
TELEGRAM_BOT_TOKEN=<your bot token>
```

Get keys from: [Supabase Dashboard](https://supabase.com/dashboard/project/fyhgxulgonnjbzufqljf/settings/api)

## 4. Start workers

```bash
cd ~/nekretnine
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

You should see three processes online:

| Process | Role |
|---------|------|
| `monitor-w1` | High-traffic categories (stanovi, kuce, …) |
| `monitor-w2` | All 17 categories |
| `notify-poll` | Telegram notifications every 5 min |

## 5. Verify

```bash
# Watch worker 1 logs
pm2 logs monitor-w1 --lines 50

# Check all processes
pm2 status

# Memory usage (2 Chromium instances ~1–2 GB total)
free -h
```

Healthy log output looks like:

```
[W1] Loaded 28000+ known IDs
[W1] Scanning category: stanovi
[W1] Cycle complete: 0 new private ads (142s)
```

## 6. Updating after code changes

```bash
cd ~/nekretnine
git pull
npm install    # use npm ci only if lockfile is in sync
npx playwright install chromium --with-deps   # only if playwright version changed
pm2 restart all
```

**Copy prod env from PC:**
```powershell
scp ".env.production.local" root@169.58.32.15:~/nekretnine/.env.local
```

## PM2 cheat sheet

```bash
pm2 status                  # process list
pm2 logs                    # all logs (live)
pm2 logs monitor-w2         # one worker
pm2 restart monitor-w1      # restart one
pm2 restart all             # restart all
pm2 stop all                # stop (maintenance)
pm2 monit                   # live CPU/RAM dashboard
```

## Troubleshooting

### `--use-system-ca is not allowed in NODE_OPTIONS`
Linux Node rejects this flag. Ensure `scripts/with-system-ca.mjs` only sets it on `win32`. Patch on VPS or `git pull` the fix, then `pm2 restart all`.

### `Node.js 20 detected without native WebSocket support`
```bash
npm install ws
```
Also need `realtime: { transport: WebSocket }` in `src/lib/supabase/server.ts` (see repo). Then `pm2 restart all`.

### `npm ci` lock file out of sync
Use `npm install` instead, or run `npm install` on PC, commit `package-lock.json`, then pull on VPS.

### PM2 crash loop (↺ climbing)
```bash
pm2 logs monitor-w1 --lines 30 --nostream
```
Read the actual error — usually env missing or the two issues above.

### `Missing NEXT_PUBLIC_SUPABASE_URL`
`.env.local` is missing or empty. Edit it and `pm2 restart all`.

### Playwright browser won't launch
```bash
npx playwright install chromium --with-deps
pm2 restart all
```

### ShieldSquare blocks (captcha in logs)
Normal after aggressive scraping. Workers auto-backoff 10 min. If persistent, check that both workers are running (different category sets).

### Out of memory (OOM)
Contabo VPS 4 has 8 GB. If OOM kills occur:
```bash
pm2 restart all
```
Consider upgrading to CX32 (8 GB) or running only one monitor worker initially.

### Notifications not sending
```bash
pm2 logs notify-poll
```
Verify `TELEGRAM_BOT_TOKEN` in `.env.local` and that notification filters exist in the dashboard.

## Architecture notes

- Workers connect directly to Supabase (no Next.js server needed on VPS).
- `APP_ENV=production` blocks start/stop via the Vercel dashboard API — workers are managed only via PM2 on the VPS.
- Frontend on Vercel reads listings via Supabase; Realtime updates work without the VPS serving HTTP.
