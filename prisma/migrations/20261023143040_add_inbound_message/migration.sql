-- Orquestrador — bloco 5/6
-- Buffer de mensagens recebidas (webhook da Evolution). Pode subir antes do
-- orquestrador ligar — fica apenas acumulando até o processor correlacionar
-- com CampanhaContato.

CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceName" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "evolutionMsgId" TEXT,
    "texto" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'text',
    "campanhaContatoId" TEXT,
    "recebidoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" DATETIME
);

CREATE UNIQUE INDEX "InboundMessage_evolutionMsgId_key" ON "InboundMessage"("evolutionMsgId");
CREATE INDEX "InboundMessage_telefone_recebidoEm_idx" ON "InboundMessage"("telefone", "recebidoEm");
CREATE INDEX "InboundMessage_campanhaContatoId_idx" ON "InboundMessage"("campanhaContatoId");
