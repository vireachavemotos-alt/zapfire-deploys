-- Orquestrador — bloco 3/6
-- Estado por contato dentro de uma campanha orquestrada + overrides
-- individuais de um step específico. Depende dos modelos adicionados em
-- 20261023143010_add_campanha_steps.

CREATE TABLE "CampanhaContato" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campanhaId" TEXT NOT NULL,
    "contatoId" TEXT NOT NULL,
    "stepAtualId" TEXT,
    "versaoFixada" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "respondeuEm" DATETIME,
    "ultimaRespostaId" TEXT,
    "proximoEnvioEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "CampanhaContato_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CampanhaContato_campanhaId_contatoId_key" ON "CampanhaContato"("campanhaId", "contatoId");
CREATE INDEX "CampanhaContato_campanhaId_status_idx" ON "CampanhaContato"("campanhaId", "status");
CREATE INDEX "CampanhaContato_proximoEnvioEm_idx" ON "CampanhaContato"("proximoEnvioEm");

CREATE TABLE "CampanhaContatoOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campanhaContatoId" TEXT NOT NULL,
    "stepOriginalId" TEXT NOT NULL,
    "scheduleMode" TEXT,
    "delaySegundos" INTEGER,
    "horarioAbsoluto" TEXT,
    "ativo" BOOLEAN,
    "blocksSubstituto" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "CampanhaContatoOverride_campanhaContatoId_fkey" FOREIGN KEY ("campanhaContatoId") REFERENCES "CampanhaContato" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CampanhaContatoOverride_campanhaContatoId_stepOriginalId_key" ON "CampanhaContatoOverride"("campanhaContatoId", "stepOriginalId");
