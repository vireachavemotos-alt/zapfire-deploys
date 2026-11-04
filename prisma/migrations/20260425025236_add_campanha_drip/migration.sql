-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campanha" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "instanceNames" TEXT NOT NULL,
    "listaId" TEXT,
    "listaSnapshot" TEXT,
    "messages" TEXT NOT NULL,
    "delayMin" INTEGER NOT NULL DEFAULT 8000,
    "delayMax" INTEGER NOT NULL DEFAULT 20000,
    "delayEntreBlocos" INTEGER NOT NULL DEFAULT 2000,
    "limitePorHora" INTEGER NOT NULL DEFAULT 60,
    "total" INTEGER NOT NULL DEFAULT 0,
    "enviadas" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "resultados" TEXT,
    "agendadoPara" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    "iniciadaEm" DATETIME,
    "concluidaEm" DATETIME,
    "modo" TEXT NOT NULL DEFAULT 'imediato',
    "dripLotePorDia" INTEGER NOT NULL DEFAULT 0,
    "dripDiasSemana" TEXT NOT NULL DEFAULT '',
    "dripHoraInicio" TEXT NOT NULL DEFAULT '09:00',
    "dripHoraFim" TEXT NOT NULL DEFAULT '18:00',
    "dripUltimaDataExecutada" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Campanha_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Campanha" ("agendadoPara", "atualizadoEm", "concluidaEm", "criadoEm", "delayEntreBlocos", "delayMax", "delayMin", "enviadas", "falhas", "id", "iniciadaEm", "instanceNames", "limitePorHora", "listaId", "listaSnapshot", "messages", "nome", "resultados", "status", "total") SELECT "agendadoPara", "atualizadoEm", "concluidaEm", "criadoEm", "delayEntreBlocos", "delayMax", "delayMin", "enviadas", "falhas", "id", "iniciadaEm", "instanceNames", "limitePorHora", "listaId", "listaSnapshot", "messages", "nome", "resultados", "status", "total" FROM "Campanha";
DROP TABLE "Campanha";
ALTER TABLE "new_Campanha" RENAME TO "Campanha";
CREATE INDEX "Campanha_status_idx" ON "Campanha"("status");
CREATE INDEX "Campanha_criadoEm_idx" ON "Campanha"("criadoEm");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
