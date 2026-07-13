#!/usr/bin/env bash
#
# install.sh — One-command Local School Installer
#
# Runs through the setup steps for a single-school local installation:
#   1. Checks Node.js version
#   2. Installs npm dependencies
#   3. Applies Prisma migrations (SQLite)
#   4. Seeds the database (creates default admin + school)
#   5. Generates a strong JWT_SECRET
#   6. Writes a local .env file
#   7. Starts the server
#
# Safe to re-run — idempotent scripts throughout.
# For SaaS deployment use Docker Compose (docker-compose.yml) instead.

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m" # No Color

echo -e "${BOLD}Quiz App — Local Installer${NC}"
echo "=============================="
echo ""

# ── 1. Check Node.js ─────────────────────────────────────────────────────────
echo -e "${BOLD}[1/7]${NC} Checking Node.js version…"
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
if [ "$NODE_VERSION" = "none" ]; then
  echo -e "${RED}Node.js is not installed. Please install Node.js 20+ from https://nodejs.org${NC}"
  exit 1
fi
echo "  Found Node.js $NODE_VERSION"
echo ""

# ── 2. Install dependencies ──────────────────────────────────────────────────
echo -e "${BOLD}[2/7]${NC} Installing npm dependencies…"
npm ci
echo -e "${GREEN}  Dependencies installed.${NC}"
echo ""

# ── 3. Generate Prisma client ────────────────────────────────────────────────
echo -e "${BOLD}[3/7]${NC} Generating Prisma client…"
npx prisma generate
echo -e "${GREEN}  Prisma client generated.${NC}"
echo ""

# ── 4. Apply migrations ─────────────────────────────────────────────────────
echo -e "${BOLD}[4/7]${NC} Applying database migrations…"
npx prisma migrate deploy
echo -e "${GREEN}  Migrations applied.${NC}"
echo ""

# ── 5. Seed database ─────────────────────────────────────────────────────────
echo -e "${BOLD}[5/7]${NC} Seeding database (creates default admin + school)…"
npx prisma db seed
echo -e "${GREEN}  Database seeded.${NC}"
echo ""

# ── 6. Generate .env if missing ──────────────────────────────────────────────
echo -e "${BOLD}[6/7]${NC} Ensuring .env file…"

JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

if [ ! -f .env ]; then
  cat > .env <<ENVEOF
# ── Mode ──────────────────────────────────────────────────────────────────────
APP_MODE=local
# "local" → SQLite, single school, no internet required
# "saas"  → PostgreSQL, multi-tenant, cloud deployment

# ── Database ──────────────────────────────────────────────────────────────────
DB_PROVIDER=sqlite
DATABASE_URL="file:./prisma/dev.db"

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
ENVEOF
  echo -e "${GREEN}  .env file created with random JWT_SECRET.${NC}"
else
  echo -e "${YELLOW}  .env already exists — skipping.${NC}"
fi
echo ""

# ── 7. Start ──────────────────────────────────────────────────────────────────
echo -e "${BOLD}[7/7]${NC} Starting the server…"
echo ""
echo -e "  ${GREEN}Quiz App is starting!${NC}"
echo -e "  Open http://localhost:3000 in your browser."
echo -e "  Default login: ${BOLD}admin${NC} / ${BOLD}admin123${NC}"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop the server."
echo ""

exec node src/backend/server.js
