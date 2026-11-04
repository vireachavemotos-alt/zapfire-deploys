-- Orquestrador — bloco 1/6
-- Adiciona duas colunas à Campanha pra o novo runner conviver com o legacy:
--  * versaoAtual: versão publicada corrente da sequência
--  * engine:      "legacy" (default) | "orchestrator"
-- Aditivo, zero destrutivo. Default rebatível em qualquer campanha antiga
-- sem backfill.

ALTER TABLE "Campanha" ADD COLUMN "versaoAtual" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Campanha" ADD COLUMN "engine" TEXT NOT NULL DEFAULT 'legacy';
