#!/usr/bin/env bash
#
# install.sh — One-command app bootstrap (Linux / macOS / Git Bash)
#
# Sets up a local instance of the app:
#   1. Checks Node.js version
#   2. Installs dependencies — ONLINE (npm ci) or OFFLINE (vendor/offline bundle)
#   3. Writes a local .env file (fresh secrets, SQLite)
#   4. Generates the Prisma client
#   5. Applies Prisma migrations
#   6. Seeds the database (default admin user)
#   7. Optionally enables HTTPS with a trusted local cert (bundled mkcert)
#   8. Starts the server
#
# Offline bundle (make it once on an internet machine):
#     node scripts/generate-offline-bundle.mjs
#   Then copy the app + vendor/offline/ to the offline machine and run this
#   script — it auto-detects the bundle and installs with `npm ci --offline`.
#
# Safe to re-run — idempotent scripts throughout.
# For production deployments, use Docker Compose (docker-compose.local.yml).

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m" # No Color

# Prisma telemetry / update checks — skip network chatter
export CHECKPOINT_DISABLE=1
export PRISMA_HIDE_UPDATE_MESSAGE=1

echo -e "${BOLD}Quiz App — Installer${NC}"
echo "============================="
echo ""

# ── 1. Check Node.js ─────────────────────────────────────────────────────
echo -e "${BOLD}[1/8]${NC} Checking Node.js version…"
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
if [ "$NODE_VERSION" = "none" ]; then
  echo -e "${RED}Node.js is not installed. Please install Node.js 20+ from https://nodejs.org${NC}"
  exit 1
fi
echo "  Found Node.js $NODE_VERSION"
echo ""

# ── 2. Install dependencies (online or offline) ───────────────────────────
OFFLINE_DIR="vendor/offline"
PLAT="$(node -p "process.platform + '-' + process.arch")"
OFFLINE=0
if [ -f "$OFFLINE_DIR/manifest.json" ] && ls "$OFFLINE_DIR"/packages/*.tgz >/dev/null 2>&1; then
  OFFLINE=1
fi

echo -e "${BOLD}[2/8]${NC} Installing dependencies…"

if [ "$OFFLINE" = "1" ] && [ -f node_modules/.bundled.marker ]; then
  echo -e "${GREEN}  Bundled node_modules found — skipping npm install.${NC}"
elif [ "$OFFLINE" = "1" ]; then
  echo -e "${YELLOW}  OFFline mode — using ${OFFLINE_DIR} (no registry).${NC}"
  echo "  Seeding npm cache from ${OFFLINE_DIR}/packages…"
  for f in "$OFFLINE_DIR"/packages/*.tgz; do
    npm cache add "$f" >/dev/null 2>&1 || { echo -e "${RED}  Failed to seed cache from $f${NC}"; exit 1; }
  done
  if ! npm ci --offline --ignore-scripts --no-audit --no-fund; then
    echo -e "${YELLOW}  npm ci --offline failed, retrying with npm install --offline…${NC}"
    npm install --offline --ignore-scripts --no-audit --no-fund
  fi
else
  echo "  Online mode — running npm ci (registry)."
  npm ci --ignore-scripts --no-audit --no-fund
fi

# Restore the Prisma engine binaries snapshotted at bundle time (offline only)
if [ "$OFFLINE" = "1" ]; then
  if [ -d "$OFFLINE_DIR/prisma-engines/$PLAT" ]; then
    echo "  Restoring Prisma engines for $PLAT…"
    rm -rf node_modules/@prisma/engines
    cp -R "$OFFLINE_DIR/prisma-engines/$PLAT" node_modules/@prisma/engines
  else
    echo -e "${YELLOW}  No bundled Prisma engines for $PLAT — prisma generate will need internet once.${NC}"
  fi
fi
echo "  Building frontend bundles (best effort — falls back to committed public/*-bundle.js)…"
if ! npm run build >/dev/null 2>&1; then
  echo -e "${YELLOW}  Frontend build skipped — using committed bundles.${NC}"
fi
echo -e "${GREEN}  Dependencies installed.${NC}"
echo ""

# ── 3. Generate .env if missing ──────────────────────────────────────────
echo -e "${BOLD}[3/8]${NC} Ensuring .env file…"

JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
QUIZ_ADMIN_SECRET=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")

if [ ! -f .env ]; then
  cat > .env <<ENVEOF
# ── Mode ──────────────────────────────────────────────────────────────────────
APP_MODE=local
# "local" → SQLite, single school, no internet required
# "saas"  → PostgreSQL, multi-tenant, cloud deployment

# ── Database ──────────────────────────────────────────────────────────────────
DB_PROVIDER=sqlite
DATABASE_URL="file:./dev.db"

# ── Auth ──────────────────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
BCRYPT_ROUNDS=12

# ── Server ────────────────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL=info

# ── Tenant ────────────────────────────────────────────────────────────────────
DEFAULT_SCHOOL_ID=local

# ── Realtime admin pairing ────────────────────────────────────────────────────
QUIZ_ADMIN_SECRET=${QUIZ_ADMIN_SECRET}
ENVEOF
  echo -e "${GREEN}  .env file created with random JWT_SECRET and QUIZ_ADMIN_SECRET.${NC}"
else
  echo -e "${YELLOW}  .env already exists — skipping.${NC}"
fi
echo ""

# ── 4. Generate Prisma client ─────────────────────────────────────────────
echo -e "${BOLD}[4/8]${NC} Generating Prisma client…"
npx prisma generate
echo -e "${GREEN}  Prisma client generated.${NC}"
echo ""

# ── 5. Apply migrations ───────────────────────────────────────────────────
echo -e "${BOLD}[5/8]${NC} Applying database migrations…"
npx prisma migrate deploy
echo -e "${GREEN}  Migrations applied.${NC}"
echo ""

# ── 6. Seed database ──────────────────────────────────────────────────────
echo -e "${BOLD}[6/8]${NC} Seeding database (creates the default admin user)…"
npx prisma db seed
echo -e "${GREEN}  Database seeded.${NC}"
echo ""

# ── 7. Optional HTTPS (trusted local certificate) ─────────────────────────
echo -e "${BOLD}[7/8]${NC} Enabling HTTPS? (trusted local certificate)"
echo -e "  This uses the bundled mkcert to generate a CA + certificate for this"
echo -e "  machine, so tablets/phones can open the app over https:// securely."
echo -e "  (If you are unsure, answer n — the app works fine over plain HTTP.)"
read -r -p "  Enable HTTPS? [y/N]: " HTTPSQ
HTTPS_ON=0
if [ "$HTTPSQ" = "y" ] || [ "$HTTPSQ" = "Y" ]; then
  echo "  Generating trusted certificate (bundled mkcert — offline)…"
  if node scripts/gen-https-certs.mjs; then
    printf 'TLS_ENABLED=1\nTLS_CERT_PATH=certs/server.crt\nTLS_KEY_PATH=certs/server.key\n' >> .env
    echo -e "${GREEN}  HTTPS enabled. Browser URL: https://localhost:3000${NC}"
    echo "  To trust it on tablets/phones, install certs/ca/rootCA.pem as a CA."
    HTTPS_ON=1
  else
    echo -e "${YELLOW}  HTTPS setup failed — continuing with plain HTTP.${NC}"
  fi
else
  echo "  HTTPS skipped — using plain HTTP."
fi
echo ""

# ── 8. Start ─────────────────────────────────────────────────────────────
echo -e "${BOLD}[8/8]${NC} Starting the server…"
echo ""
LANIP=$(node scripts/lan-ip.mjs)
echo -e "  ${GREEN}Quiz App is starting!${NC}"
if [ "$HTTPS_ON" = "1" ]; then
  echo -e "  On this PC:  https://localhost:3000"
  echo -e "  Students:    https://${LANIP}:3000"
else
  echo -e "  On this PC:  http://localhost:3000"
  echo -e "  Students:    http://${LANIP}:3000"
fi
echo -e "  Default login: ${BOLD}admin${NC} / ${BOLD}admin123${NC}"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop the server."
echo ""

exec node src/backend/server.js