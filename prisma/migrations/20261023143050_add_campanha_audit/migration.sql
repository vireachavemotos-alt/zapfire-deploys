-- Orquestrador — bloco 6/6
-- Trilha de auditoria de edições em campanha. Sem efeito operacional,
-- apenas registra quem/o quê/quando pra UI de histórico.

CREATE TABLE "CampanhaAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campanhaId" TEXT NOT NULL,
    "autor" TEXT NOT NULL DEFAULT 'sistema',
    "acao" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampanhaAudit_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CampanhaAudit_campanhaId_criadoEm_idx" ON "CampanhaAudit"("campanhaId", "criadoEm");
