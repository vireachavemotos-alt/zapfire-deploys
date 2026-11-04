// GET /api/orquestrador/campanhas/[id]/estado
// Resumo pra a UI: versão atual, contagem por status de CampanhaContato,
// próxima execução prevista, últimas tentativas.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const campanhaId = params.id;
  const [campanha, contatosPorStatus, proximaExec, ultimasAttempts, totalExec] = await Promise.all([
    prisma.campanha.findUnique({
      where: { id: campanhaId },
      select: {
        id: true, nome: true, status: true, engine: true, versaoAtual: true,
        iniciadaEm: true, concluidaEm: true,
      },
    }),
    prisma.campanhaContato.groupBy({
      by: ["status"],
      where: { campanhaId },
      _count: { _all: true },
    }),
    prisma.messageExecution.findFirst({
      where: { campanhaId, status: "pending" },
      orderBy: { agendadoPara: "asc" },
      select: { agendadoPara: true, stepOriginalId: true, versaoNumero: true },
    }),
    prisma.messageAttempt.findMany({
      where: { execution: { campanhaId } },
      orderBy: { enviadoEm: "desc" },
      take: 20,
      select: {
        enviadoEm: true, status: true, textoFinal: true,
        instanceName: true, erroDetalhe: true,
      },
    }),
    prisma.messageExecution.groupBy({
      by: ["status"],
      where: { campanhaId },
      _count: { _all: true },
    }),
  ]);
  if (!campanha) return NextResponse.json({ error: "não encontrada" }, { status: 404 });

  return NextResponse.json({
    campanha,
    contatos: Object.fromEntries(contatosPorStatus.map((r) => [r.status, r._count._all])),
    execucoes: Object.fromEntries(totalExec.map((r) => [r.status, r._count._all])),
    proximaExecucao: proximaExec,
    ultimasTentativas: ultimasAttempts,
  });
}
