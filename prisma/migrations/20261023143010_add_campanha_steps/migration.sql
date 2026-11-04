-- Orquestrador — bloco 2/6
-- Steps editáveis (draft) + versões publicadas + snapshots imutáveis.
-- Nenhuma coluna existente é tocada; tabelas nascem vazias.

CREATE TABLE "CampanhaStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campanhaId" TEXT NOT NULL,
    "posicao" INTEGER NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'message',
    "blocks" TEXT NOT NULL,
    "scheduleMode" TEXT NOT NULL DEFAULT 'delay',
    "delaySegundos" INTEGER NOT NULL DEFAULT 0,
    "horarioAbsoluto" TEXT,
    "dependeDoStepId" TEXT,
    "condicao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "CampanhaStep_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CampanhaStep_campanhaId_posicao_key" ON "CampanhaStep"("campanhaId", "posicao");
CREATE INDEX "CampanhaStep_campanhaId_idx" ON "CampanhaStep"("campanhaId");

CREATE TABLE "CampanhaVersao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campanhaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "publicadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadaPor" TEXT,
    "resumo" TEXT,
    CONSTRAINT "CampanhaVersao_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CampanhaVersao_campanhaId_numero_key" ON "CampanhaVersao"("campanhaId", "numero");
CREATE INDEX "CampanhaVersao_campanhaId_idx" ON "CampanhaVersao"("campanhaId");

CREATE TABLE "CampanhaStepSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versaoId" TEXT NOT NULL,
    "stepOriginalId" TEXT NOT NULL,
    "posicao" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "blocks" TEXT NOT NULL,
    "scheduleMode" TEXT NOT NULL,
    "delaySegundos" INTEGER NOT NULL,
    "horarioAbsoluto" TEXT,
    "dependeDoStepId" TEXT,
    "condicao" TEXT,
    "ativo" BOOLEAN NOT NULL,
    CONSTRAINT "CampanhaStepSnapshot_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "CampanhaVersao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CampanhaStepSnapshot_versaoId_idx" ON "CampanhaStepSnapshot"("versaoId");
CREATE INDEX "CampanhaStepSnapshot_stepOriginalId_idx" ON "CampanhaStepSnapshot"("stepOriginalId");
