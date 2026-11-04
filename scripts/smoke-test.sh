#!/usr/bin/env bash
# Smoke tests pós-deploy do ZapFire. Roda contra a URL em BASE_URL.
#
# Uso:
#   BASE_URL=https://zapfire.duckdns.org bash scripts/smoke-test.sh
#   # ou pra ambiente local:
#   BASE_URL=http://localhost:3000 bash scripts/smoke-test.sh
#
# Opcional:
#   EVOLUTION_WEBHOOK_TOKEN=<valor>  # testa webhook autenticado também
#
# Exit code: 0 se tudo ok, 1 se qualquer FAIL. Testes `skipped` não quebram.

set -u

BASE_URL="${BASE_URL:-https://zapfire.duckdns.org}"
PASS=0
FAIL=0
SKIP=0

# ANSI colors (desligadas se stdout não é tty)
if [ -t 1 ]; then
  G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; D=$'\033[2m'; N=$'\033[0m'
else
  G=''; R=''; Y=''; D=''; N=''
fi

# Executa curl, mede latência, imprime [PASS|FAIL]. Argumentos:
#   $1 = label (ex: "GET /api/health")
#   $2 = expected status (ex: "200" ou "200,400" pra múltiplos aceitos)
#   $3+ = argumentos extra pro curl (ex: "-X POST -d '{}'")
# Opcional (via env por chamada): EXPECT_BODY_CONTAINS="texto"
check() {
  local label="$1"
  local expected_csv="$2"
  shift 2

  local tmp
  tmp="$(mktemp -t zf-smoke.XXXXXX)"

  local t0 t1 ms
  t0=$(perl -e 'use Time::HiRes qw(time); print int(time()*1000)' 2>/dev/null || date +%s000)
  local code
  code=$(curl -ksS -o "$tmp" -w '%{http_code}' --max-time 15 "$@" || echo "000")
  t1=$(perl -e 'use Time::HiRes qw(time); print int(time()*1000)' 2>/dev/null || date +%s000)
  ms=$((t1 - t0))

  local ok=0
  IFS=',' read -ra expected <<< "$expected_csv"
  for e in "${expected[@]}"; do
    if [ "$code" = "$e" ]; then ok=1; break; fi
  done

  if [ -n "${EXPECT_BODY_CONTAINS:-}" ] && [ "$ok" = 1 ]; then
    if ! grep -q -- "$EXPECT_BODY_CONTAINS" "$tmp"; then
      ok=0
    fi
  fi

  if [ "$ok" = 1 ]; then
    printf '%s[PASS]%s %s %s %s(%dms)%s\n' "$G" "$N" "$label" "$code" "$D" "$ms" "$N"
    PASS=$((PASS + 1))
  else
    printf '%s[FAIL]%s %s expected %s got %s %s(%dms)%s\n' "$R" "$N" "$label" "$expected_csv" "$code" "$D" "$ms" "$N"
    printf '       body: %s\n' "$(head -c 240 "$tmp" | tr -d '\n')"
    FAIL=$((FAIL + 1))
  fi

  rm -f "$tmp"
  unset EXPECT_BODY_CONTAINS
}

skip() {
  printf '%s[SKIP]%s %s — %s\n' "$Y" "$N" "$1" "$2"
  SKIP=$((SKIP + 1))
}

printf '%s▶ ZapFire smoke tests @ %s%s\n' "$D" "$BASE_URL" "$N"
printf '%s\n' '────────────────────────────────────────────────────────────'

# 1. Health — espera {"status":"ok", evolution:{status:"ok", version:"2.3.7"}}
EXPECT_BODY_CONTAINS='"status":"ok"' check \
  'GET /api/health' 200 "$BASE_URL/api/health"

# 1b. Health evolution subcheck (não quebra se Evolution ainda tá starting)
r=$(curl -ksS --max-time 10 "$BASE_URL/api/health" || echo '{}')
if printf '%s' "$r" | grep -q '"status":"ok".*"version":"2.3.7"'; then
  printf '%s[PASS]%s evolution subcheck v2.3.7\n' "$G" "$N"
  PASS=$((PASS + 1))
else
  printf '%s[FAIL]%s evolution subcheck v2.3.7\n' "$R" "$N"
  printf '       body: %s\n' "$(printf '%s' "$r" | head -c 240)"
  FAIL=$((FAIL + 1))
fi

# 2-7. GETs básicos — todos devem ser 200
check 'GET /api/instancias'      200 "$BASE_URL/api/instancias"
check 'GET /api/contatos?limit=1' 200 "$BASE_URL/api/contatos?limit=1"
check 'GET /api/listas'          200 "$BASE_URL/api/listas"
check 'GET /api/campanhas'       200 "$BASE_URL/api/campanhas"
check 'GET /api/blacklist'       200 "$BASE_URL/api/blacklist"
check 'GET /api/templates'       200 "$BASE_URL/api/templates"

# 8. Orquestrador — publicar numa campanha inexistente: aceita 400 ou 404,
#    nunca 500.
check 'POST /api/orquestrador/campanhas/nonexistent/publicar' '400,404' \
  -X POST -H 'Content-Type: application/json' -d '{}' \
  "$BASE_URL/api/orquestrador/campanhas/nonexistent/publicar"

# 9. Grupos list (instance inexistente) — espera 200 com [] OU 400, nunca 500.
check 'GET /api/grupos?instanceName=notfound' '200,400' \
  "$BASE_URL/api/grupos?instanceName=notfound"

# 10. Warmup sessions list — 200.
check 'GET /api/warmup/sessions' 200 "$BASE_URL/api/warmup/sessions"

# 11. Webhook Evolution SEM token — espera 401 (auth é obrigatória em prod).
#     Em dev (NODE_ENV!=production + token não setado) pode ser 200. Aceita só 401.
check 'POST /api/webhooks/evolution (no auth)' 401 \
  -X POST -H 'Content-Type: application/json' \
  -d '{"event":"messages.upsert","instance":"test","data":{"key":{"fromMe":false,"id":"X","remoteJid":"551199@s.whatsapp.net"}}}' \
  "$BASE_URL/api/webhooks/evolution"

# 12. Webhook Evolution COM token (se setado).
if [ -n "${EVOLUTION_WEBHOOK_TOKEN:-}" ]; then
  check 'POST /api/webhooks/evolution (with token)' 200 \
    -X POST -H 'Content-Type: application/json' \
    -H "x-webhook-token: $EVOLUTION_WEBHOOK_TOKEN" \
    -d '{"event":"messages.upsert","instance":"test","data":{"key":{"fromMe":false,"id":"smoke-'"$RANDOM"'","remoteJid":"551199887766@s.whatsapp.net"},"message":{"conversation":"ping"},"messageTimestamp":'"$(date +%s)"'}}' \
    "$BASE_URL/api/webhooks/evolution"
else
  skip 'POST /api/webhooks/evolution (with token)' 'EVOLUTION_WEBHOOK_TOKEN env var not set'
fi

printf '%s\n' '────────────────────────────────────────────────────────────'
TOTAL=$((PASS + FAIL + SKIP))
printf '%d passed, %d failed, %d skipped (of %d)\n' "$PASS" "$FAIL" "$SKIP" "$TOTAL"

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
