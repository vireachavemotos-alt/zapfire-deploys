// Processa InboundMessage: correlaciona com CampanhaContato pelo telefone
// (dentro de uma janela razoável), marca que respondeu, e cancela
// MessageExecution futuras do branch "after_no_reply" / "followup" para
// aquela jornada.

import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

const JANELA_HORAS = 72; // correlaciona com uma campanha nos últimos 3 dias

export interface ReplyStats {
  processadas: number;
  correlacionadas: number;
  canceladas: number;
}

export async function processInboundQueue(opts: { batch?: number } = {}): Promise<ReplyStats> {
  const batch = opts.batch ?? 50;
  const inbox = await prisma.inboundMessage.findMany({
    where: { processadoEm: null },
    orderBy: { recebidoEm: "asc" },
    take: batch,
  });

  const stats: ReplyStats = { processadas: 0, correlacionadas: 0, canceladas: 0 };
  const limite = new Date(Date.now() - JANELA_HORAS * 3600 * 1000);

  for (const msg of inbox) {
    const telNorm = normalizePhone(msg.telefone) ?? msg.telefone;

    // Procura contato por telefone (variantes do 9º dígito deveriam ter
    // sido normalizadas no enqueue; aqui comparamos a forma normalizada).
    const contato = await prisma.contato.findFirst({
      where: { telefone: telNorm },
      select: { id: true },
    });

    if (contato) {
      // Pega o CampanhaContato ativo mais recente desse contato.
      const camp = await prisma.campanhaContato.findFirst({
        where: {
          contatoId: contato.id,
          status: { in: ["em_andamento", "pendente"] },
          atualizadoEm: { gte: limite },
        },
        orderBy: { atualizadoEm: "desc" },
      });

      if (camp) {
        await prisma.campanhaContato.update({
          where: { id: camp.id },
          data: {
            status: "respondeu",
            respondeuEm: msg.recebidoEm,
            ultimaRespostaId: msg.id,
          },
        });

        // Cancela MessageExecution futuras do tipo followup/after_no_reply.
        const cancel = await prisma.messageExecution.updateMany({
          where: {
            campanhaContatoId: camp.id,
            status: "pending",
            snapshot: {
              OR: [
                { tipo: "followup" },
                { scheduleMode: "after_no_reply" },
                { tipo: "branch_no_reply" },
              ],
            },
          },
          data: { status: "canceled", concluidoEm: new Date(), erroDetalhe: "lead respondeu" },
        });

        stats.correlacionadas++;
        stats.canceladas += cancel.count;

        await prisma.inboundMessage.update({
          where: { id: msg.id },
          data: { processadoEm: new Date(), campanhaContatoId: camp.id },
        });

        await prisma.campanhaAudit.create({
          data: {
            campanhaId: camp.campanhaId,
            autor: "sistema",
            acao: "reply_detectado",
            payload: JSON.stringify({
              campanhaContatoId: camp.id,
              inboundId: msg.id,
              canceladas: cancel.count,
            }),
          },
        });

        stats.processadas++;
        continue;
      }
    }

    // Sem correlação — só marca como processado pra não revisitar.
    await prisma.inboundMessage.update({
      where: { id: msg.id },
      data: { processadoEm: new Date() },
    });
    stats.processadas++;
  }

  return stats;
}
