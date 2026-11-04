-- AlterTable
ALTER TABLE "Campanha" ADD COLUMN "rating" INTEGER;
ALTER TABLE "Campanha" ADD COLUMN "ratingComment" TEXT;

-- CreateTable
CREATE TABLE "WarmupSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanciaA" TEXT NOT NULL,
    "instanciaB" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "iniciadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proximoEnvioEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalEnviadas" INTEGER NOT NULL DEFAULT 0,
    "enviadasHoje" INTEGER NOT NULL DEFAULT 0,
    "diaRef" TEXT NOT NULL DEFAULT '',
    "diasAtivo" INTEGER NOT NULL DEFAULT 0,
    "limiteDiario" INTEGER NOT NULL DEFAULT 5,
    "ultimaDirecao" TEXT NOT NULL DEFAULT 'A',
    "ultimaFraseId" TEXT
);

-- CreateTable
CREATE TABLE "WarmupMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "enviadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "erroDetalhe" TEXT,
    CONSTRAINT "WarmupMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WarmupSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WarmupFrase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "texto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'geral',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "usos" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jid" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "pictureUrl" TEXT,
    "instanceName" TEXT NOT NULL,
    "totalMembros" INTEGER NOT NULL DEFAULT 0,
    "descobertoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaSincEm" DATETIME
);

-- CreateTable
CREATE TABLE "GrupoMembro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grupoId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "pushName" TEXT,
    "admin" TEXT,
    "entrouEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrupoMembro_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WarmupSession_instanciaA_instanciaB_key" ON "WarmupSession"("instanciaA", "instanciaB");

-- CreateIndex
CREATE INDEX "WarmupMessage_sessionId_enviadoEm_idx" ON "WarmupMessage"("sessionId", "enviadoEm");

-- CreateIndex
CREATE INDEX "WarmupFrase_categoria_ativa_idx" ON "WarmupFrase"("categoria", "ativa");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_jid_key" ON "Grupo"("jid");

-- CreateIndex
CREATE INDEX "Grupo_instanceName_idx" ON "Grupo"("instanceName");

-- CreateIndex
CREATE INDEX "GrupoMembro_telefone_idx" ON "GrupoMembro"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoMembro_grupoId_telefone_key" ON "GrupoMembro"("grupoId", "telefone");
