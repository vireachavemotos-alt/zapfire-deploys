#!/bin/sh
# Entrypoint do container ZapFire.
# - Roda migrations pendentes contra o SQLite montado em /app/data
# - Sobe o servidor Next.js (modo standalone)
set -e

echo "[entrypoint] Aplicando migrations…"
# Chamamos o CLI do Prisma via `node` direto porque o standalone bundle do
# Next.js não traz o symlink node_modules/.bin/prisma — e o npx acabaria
# tentando baixar o CLI em runtime (sem rede garantida em algumas VMs).
PRISMA_CLI="/app/node_modules/prisma/build/index.js"
node "$PRISMA_CLI" migrate deploy --schema=/app/prisma/schema.prisma || {
  echo "[entrypoint] AVISO: migrate deploy falhou. Tentando db push…"
  node "$PRISMA_CLI" db push --schema=/app/prisma/schema.prisma --accept-data-loss=false
}

echo "[entrypoint] Subindo Next.js em :${PORT:-3000}"
exec node server.js
