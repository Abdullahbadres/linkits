# syntax=docker/dockerfile:1
#
# Next.js production image (standalone) + Prisma (PostgreSQL).
#
# Port: the app listens on PORT (default 3000) *inside* the container.
# Host mapping (e.g. in docker-compose.yml "3001:3000") is what makes
# http://localhost:3001 work — that mapping is NOT defined in this file.
#
# Runtime: set DATABASE_URL + DIRECT_URL at runtime (Compose/Railway/Vercel injects these). CMD runs
# `prisma migrate deploy` then starts `server.js` from the standalone output.

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dummy?schema=public
ENV DATABASE_URL=$DATABASE_URL
ENV DIRECT_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl curl \
  && npm install -g prisma@6.16.3

ENV NODE_ENV=production
ENV PORT=3000
# Next standalone must bind to all interfaces so host port mapping works
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=8s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["sh", "-c", "prisma migrate deploy --schema=/app/prisma/schema.prisma && exec node server.js"]
