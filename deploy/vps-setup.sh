#!/usr/bin/env bash
# First-time VPS setup for Nekretnine workers (Ubuntu 22.04/24.04 or Debian 12).
# Run as a non-root user with sudo access:
#   chmod +x deploy/vps-setup.sh
#   ./deploy/vps-setup.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/nekretnine}"
REPO_URL="${REPO_URL:-https://github.com/radunfilip11-tech/RealEstateScraper.git}"
NODE_MAJOR="${NODE_MAJOR:-20}"

echo "==> Nekretnine VPS setup"
echo "    App dir:  $APP_DIR"
echo "    Node:     v$NODE_MAJOR LTS"
echo ""

# --- System packages ---
echo "==> Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq git curl ca-certificates build-essential

# --- Node.js via NodeSource ---
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  echo "==> Installing Node.js $NODE_MAJOR..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "    Node $(node -v), npm $(npm -v)"

# --- PM2 ---
if ! command -v pm2 &>/dev/null; then
  echo "==> Installing PM2..."
  sudo npm install -g pm2
fi
echo "    PM2 $(pm2 -v)"

# --- Clone or update repo ---
if [[ -d "$APP_DIR/.git" ]]; then
  echo "==> Updating existing repo at $APP_DIR..."
  git -C "$APP_DIR" pull --ff-only
else
  echo "==> Cloning repo to $APP_DIR..."
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# --- Dependencies ---
echo "==> Installing npm dependencies..."
if ! npm ci; then
  echo "!! npm ci failed (lock file out of sync) — falling back to npm install"
  npm install
fi

# --- Playwright Chromium + system libs ---
echo "==> Installing Playwright Chromium (this may take a few minutes)..."
npx playwright install chromium --with-deps

# --- Logs directory ---
mkdir -p logs

# --- Environment file ---
if [[ ! -f .env.local ]]; then
  cp env.example .env.local
  echo ""
  echo "!! Created .env.local from env.example"
  echo "!! Edit it now with production Supabase + Telegram keys:"
  echo "     nano $APP_DIR/.env.local"
  echo ""
else
  echo "==> .env.local already exists (skipping)"
fi

# --- PM2 startup on boot ---
echo "==> Configuring PM2 startup..."
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | bash || true

echo ""
echo "==> Setup complete. Next steps:"
echo "  1. Edit .env.local with production keys"
echo "  2. pm2 start ecosystem.config.cjs"
echo "  3. pm2 save"
echo "  4. pm2 status"
echo "  5. pm2 logs monitor-w1   # verify scraping"
