-- CreateTable
CREATE TABLE "Contato" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT,
    "telefone" TEXT NOT NULL,
    "empresa" TEXT,
    "tags" TEXT,
    "whatsappValido" BOOLEAN,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lista" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContatoLista" (
    "contatoId" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,

    PRIMARY KEY ("contatoId", "listaId"),
    CONSTRAINT "ContatoLista_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "Contato" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContatoLista_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campanha" (
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
    CONSTRAINT "Campanha_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "Lista" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Contato_telefone_key" ON "Contato"("telefone");

-- CreateIndex
CREATE INDEX "Contato_criadoEm_idx" ON "Contato"("criadoEm");

-- CreateIndex
CREATE INDEX "Lista_criadoEm_idx" ON "Lista"("criadoEm");

-- CreateIndex
CREATE INDEX "ContatoLista_listaId_idx" ON "ContatoLista"("listaId");

-- CreateIndex
CREATE INDEX "ContatoLista_contatoId_idx" ON "ContatoLista"("contatoId");

-- CreateIndex
CREATE INDEX "Campanha_status_idx" ON "Campanha"("status");

-- CreateIndex
CREATE INDEX "Campanha_criadoEm_idx" ON "Campanha"("criadoEm");
