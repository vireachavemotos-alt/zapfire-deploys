-- CreateTable
CREATE TABLE "ContatoBloqueado" (
    "telefone" TEXT NOT NULL PRIMARY KEY,
    "motivo" TEXT NOT NULL,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "origem" TEXT NOT NULL DEFAULT 'auto',
    "bloqueadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validoAte" DATETIME
);

-- CreateIndex
CREATE INDEX "ContatoBloqueado_validoAte_idx" ON "ContatoBloqueado"("validoAte");
