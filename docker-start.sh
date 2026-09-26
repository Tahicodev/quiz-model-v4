#!/usr/bin/env bash
# Quiz App v4 — Docker launcher for Linux / macOS (works offline with image tar)
set -euo pipefail

CDIR="$(cd "$(dirname "$0")" && pwd)"
cd "$CDIR"

echo ""
echo "  =================================================="
echo "    Quiz App  --  Docker Launcher  (any OS)"
echo "    * looks for quiz-app-v4-image.tar  (offline)"
echo "    * or builds the image once  (needs internet)"
echo "  =================================================="
echo ""

# 1. Docker installed?
if ! command -v docker >/dev/null 2>&1; then
  echo "  [ERROR] Docker is not installed."
  echo "          Install Docker, then run this again."
  exit 1
fi

# 2. Fresh .env with random secrets (used by compose)
if [ ! -f .env ]; then
  echo "  [1/4] Creating .env with random secrets..."
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  QUIZ_ADMIN_SECRET=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
  cat > .env <<ENVEOF
APP_MODE=local
DB_PROVIDER=sqlite
DATABASE_URL="file:./dev.db"
JWT_SECRET=${JWT_SECRET}
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
BCRYPT_ROUNDS=12
PORT=3000
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
DEFAULT_SCHOOL_ID=local
QUIZ_ADMIN_SECRET=${QUIZ_ADMIN_SECRET}
ENVEOF
else
  echo "  [1/4] .env already exists -- keeping it."
fi

# 3. Make sure the image exists
if ! docker image inspect quiz-app-v4:local >/dev/null 2>&1; then
  if [ -f "quiz-app-v4-image.tar" ]; then
    echo "  [2/4] Loading bundled image (offline, no internet needed)..."
    docker load -i "quiz-app-v4-image.tar"
  elif [ -f "quiz-app-v4-image.tar.gz" ]; then
    echo "  [2/4] Loading bundled image (offline, no internet needed)..."
    docker load -i "quiz-app-v4-image.tar.gz"
  else
    echo "  [2/4] Building image (first run only -- needs internet)..."
    docker compose -f docker-compose.local.yml build
  fi
else
  echo "  [2/4] Image already available."
fi

# 4. Start
echo "  [3/4] Starting the container..."
docker compose -f docker-compose.local.yml up -d

echo "  [4/4] Waiting for the app to be ready..."
TRY=0
until curl -fsS http://localhost:3000/health >/dev/null 2>&1; do
  TRY=$((TRY + 1))
  if [ "$TRY" -ge 30 ]; then
    echo "  [ERROR] The app did not become ready. Run:"
    echo "          docker compose -f docker-compose.local.yml logs app"
    exit 1
  fi
  sleep 1
done

echo ""
echo "  =================================================="
echo "    Quiz App is running!"
echo "    Login : admin    Password : admin123"
echo "    URL   : http://localhost:3000"
echo "  =================================================="
echo ""
echo "  To stop:  docker compose -f docker-compose.local.yml down"
echo ""