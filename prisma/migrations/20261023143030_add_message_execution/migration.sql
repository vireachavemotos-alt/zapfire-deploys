-- Orquestrador — bloco 4/6
-- Fila idempotente de execuções (1 por contato × step × versão) e as
-- tentativas reais contra o Evolution. O UNIQUE do MessageExecution é o
-- coração da proteção contra duplicidade.

CREATE TABLE "MessageExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campanhaId" TEXT NOT NULL,
    "campanhaContatoId" TEXT NOT NULL,
    "stepOriginalId" TEXT NOT NULL,
    "versaoNumero" INTEGER NOT NULL,
    "versaoId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "agendadoPara" DATETIME NOT NULL,
    "iniciadoEm" DATETIME,
    "concluidoEm" DATETIME,
    "erroDetalhe" TEXT,
    CONSTRAINT "MessageExecution_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageExecution_campanhaContatoId_fkey" FOREIGN KEY ("campanhaContatoId") REFERENCES "CampanhaContato" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageExecution_versaoId_fkey" FOREIGN KEY ("versaoId") REFERENCES "CampanhaVersao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MessageExecution_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "CampanhaStepSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MessageExecution_campanhaId_campanhaContatoId_stepOriginalId_versaoNumero_key" ON "MessageExecution"("campanhaId", "campanhaContatoId", "stepOriginalId", "versaoNumero");
CREATE INDEX "MessageExecution_status_agendadoPara_idx" ON "MessageExecution"("status", "agendadoPara");
CREATE INDEX "MessageExecution_campanhaId_idx" ON "MessageExecution"("campanhaId");
CREATE INDEX "MessageExecution_campanhaContatoId_idx" ON "MessageExecution"("campanhaContatoId");

CREATE TABLE "MessageAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "evolutionMsgId" TEXT,
    "variacaoIndex" INTEGER,
    "textoFinal" TEXT,
    "status" TEXT NOT NULL,
    "erroDetalhe" TEXT,
    "enviadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageAttempt_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MessageExecution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MessageAttempt_executionId_idx" ON "MessageAttempt"("executionId");
CREATE INDEX "MessageAttempt_evolutionMsgId_idx" ON "MessageAttempt"("evolutionMsgId");
