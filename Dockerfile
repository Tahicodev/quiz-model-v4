# Dockerfile — multi-stage build for the Quiz Application
# Stage 1: install production dependencies + optionally build the frontend
# Stage 2: runtime — slim Node image, runs the backend

# ── Stage 1: Build / Install ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first (leverages Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy prisma schema and generate client (schema-only, no migrations at build)
COPY prisma/schema.prisma ./prisma/
RUN npx prisma generate

# (Optional) Build frontend bundle with esbuild
# COPY src/frontend/ ./src/frontend/
# COPY src/shared/ ./src/shared/
# RUN npx esbuild src/frontend/main.js --bundle --outfile=public/bundle.js --minify

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Create non-root user (security best practice)
RUN addgroup -S quizapp && adduser -S quizapp -G quizapp

WORKDIR /app

# Copy production node_modules and prisma client from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma/generated ./prisma/generated

# Copy application source (backend + shared — frontend optional if pre-built)
COPY src/backend/ ./src/backend/
COPY src/frontend/ ./src/frontend/
COPY src/shared/ ./src/shared/
COPY prisma/schema.prisma ./prisma/
COPY prisma/migrations/ ./prisma/migrations/
COPY package.json ./

# (Optional) Copy pre-built frontend if Stage 1 built it
# COPY --from=builder /app/public ./public

# Expose the API port
EXPOSE 3000

# Healthcheck — verifies the Express /health endpoint responds
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run migrations on startup, then start the server.
# Use `migrate deploy` (not `dev`) — matches spec §25 Operations guideline.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/backend/server.js"]

# Switch to non-root user
USER quizapp
