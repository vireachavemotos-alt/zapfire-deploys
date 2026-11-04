#!/bin/bash
# COLA ISSO NA SSH DA VM GCP (Console → Compute Engine → SSH do zapfire-micro)
# Baixa imagem nova, recria o container ZapFire, mostra logs.

set -e
cd ~/zapfire || { echo "sem ~/zapfire na VM"; exit 1; }

echo "== baixando compose atualizado =="
curl -fsSL -o docker-compose.gcp.yml \
  https://raw.githubusercontent.com/vireachavemotos-alt/zapfire-deploys/main/docker-compose.gcp.yml

echo "== baixando imagem (320MB) =="
curl -fL -o /tmp/zapfire-image.tar.gz \
  https://github.com/vireachavemotos-alt/zapfire-deploys/releases/download/v2026-11-04/zapfire-image.tar.gz

echo "== carregando imagem no docker =="
docker load < /tmp/zapfire-image.tar.gz

echo "== recriando container zapfire =="
docker compose -f docker-compose.gcp.yml up -d --no-build --force-recreate zapfire

echo "== aguardando 10s =="
sleep 10

echo "== logs =="
docker compose -f docker-compose.gcp.yml logs --tail 40 zapfire

echo "== health check =="
curl -s https://zapfire.duckdns.org/api/health && echo " ✓ online" || echo " ✗ sem resposta"

echo "== pronto. "
