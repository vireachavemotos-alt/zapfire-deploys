# ZapFire — imagem de produção.
#
# Multi-stage build:
#  1) deps    → instala node_modules (com cache da camada se package.json não muda)
#  2) builder → roda `prisma generate` + `next build` em modo standalone
#  3) runner  → imagem final mínima (~150 MB) com só o necessário pra rodar
#
# Funciona em x86_64 (Hetzner) e ARM64 (Oracle Free Tier ARM Ampere) — base
# `node:20-alpine` é multi-arch.

# ─── 1) deps ────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ─── 2) builder ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Garante client do Prisma com binário pra Alpine (linux-musl)
RUN npx prisma generate
RUN npm run build

# ─── 3) runner ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Cria usuário sem privilégios pra rodar o processo
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Standalone bundle = server.js + .next + somente os deps em runtime
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Schema + node_modules completo (CLI do Prisma puxa transitivas tipo
# effect/c12/empathic que não dá pra copiar seletivamente sem buraco).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Diretório onde o SQLite vive — o docker-compose monta um volume aqui.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Entrypoint roda migrations e sobe o server.
COPY --chown=nextjs:nodejs docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["/app/entrypoint.sh"]
