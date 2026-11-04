# ZapFire — guia pra agentes

## Orchestrator Migration

ZapFire está em transição de um **runner monolítico** (uma função
`runCampaignFromDb` que percorre `MessageBlock[]` em RAM) para um
**orquestrador por step** (um step × contato × versão = uma linha
executável, idempotente). A convivência é controlada pelo campo
`Campanha.engine`:

- `engine = "legacy"` (default): fluxo atual. `lib/campaign-runner.ts`,
  `lib/scheduler.ts`, `lib/drip.ts`, `lib/message.ts` e todas as rotas
  sob `app/api/campanhas/` seguem funcionando sem alteração. Snapshots
  da lista em `Campanha.listaSnapshot` continuam sendo a fonte de
  verdade pro dispatch.
- `engine = "orchestrator"`: campanha usa `CampanhaStep` + versões
  (`CampanhaVersao` + `CampanhaStepSnapshot`), execuções por
  `MessageExecution` com `UNIQUE(campaignContactId, stepOriginalId,
  versaoNumero)`, reply detection via webhook da Evolution.

**Nunca** leia `campanha.engine` direto — use `getEngine(campanha)` em
`lib/engine.ts`. **Nunca** mexa em `campaign-runner.ts`, `scheduler.ts`,
`drip.ts`, `message.ts`, `campanha-serde.ts` ou nas rotas de campanha
atuais sem antes garantir que a mudança não quebra o path legado:
qualquer campanha que não tenha migrado para o orquestrador precisa
continuar rodando igual.

Para novos helpers que ambos os engines usam, prefira módulos novos
(ex.: `lib/suppression.ts`, `lib/phone.ts` extensões, webhooks em
`app/api/webhooks/*`). Mudanças em schema são **aditivas**: adicione
colunas opcionais e tabelas novas, nunca `DROP`/`ALTER` destrutivo —
veja `prisma/schema.prisma` e o doc de design em `scratchpad/arch_schema.md`.

## Testes

Projeto não tem jest configurado. Testes unitários puros ficam em
`lib/*.test.ts` com `node:test` + `assert/strict`, roda com:
```
npx tsx --test lib/<arquivo>.test.ts
```

## Deploy

Produção em GCP e2-micro (`zapfire.duckdns.org`). Stack:
`evo_postgres` → `evolution_api` → `zapfire_app` → `zapfire_caddy`.
Compose: `docker-compose.gcp.yml` (ver `arch_runtime.md` pra integração
do webhook via `WEBHOOK_GLOBAL_URL`).

### Smoke tests pós-deploy

Rodar logo após o deploy pra confirmar que subiu funcionando:

```
BASE_URL=https://zapfire.duckdns.org bash scripts/smoke-test.sh
```

Testa health, Evolution ↔ ZapFire, todas as rotas GET principais
(`/api/instancias`, `/api/contatos`, `/api/listas`, `/api/campanhas`,
`/api/blacklist`, `/api/templates`, `/api/grupos`, `/api/warmup/sessions`),
orquestrador (`/api/orquestrador/campanhas/<x>/publicar` → 400/404 pra
inexistente, nunca 500), e webhook Evolution (401 sem token, 200 com
`EVOLUTION_WEBHOOK_TOKEN` se setado). Exit 1 se qualquer FAIL. Pra
rodar contra local: `BASE_URL=http://localhost:3000 bash scripts/smoke-test.sh`.
