# quiz-app-v4 — single-container build (works on any OS with Docker)
# Build:  docker compose -f docker-compose.local.yml build
# Run:    docker compose -f docker-compose.local.yml up -d
# The app runs in local/SQLite mode; data persists in the quiz-data volume.

FROM node:22-slim

ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

WORKDIR /app

# OpenSSL is required by Prisma's engines (schema/query) on Debian-based images.
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

# Install ALL dependencies (prisma + esbuild are devDeps but needed at runtime
# for migrations/bundles). --ignore-scripts: the frontend build needs source
# files which are copied below.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force

# Copy the full app (roots static pages, src, prisma, public bundles, vendor libs)
COPY . .

# Strip anything that must not run/ship inside the image (dist volumes handle data)
RUN rm -f .env && \
    rm -f prisma/dev.db prisma/dev.db.bak prisma/*.db-journal prisma/test-*.db && \
    rm -rf tests gui-test-screenshots dist

# Generate the Prisma client (downloads engines into the image — needs network
# once at BUILD time; afterwards the image is fully self-contained) and build
# the frontend bundles.
RUN npx prisma generate && (npm run build || true)

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Migrate + seed on every start (both idempotent), then boot the server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node src/backend/server.js"]