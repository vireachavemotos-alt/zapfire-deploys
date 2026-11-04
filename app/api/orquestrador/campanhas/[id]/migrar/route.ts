// POST /api/orquestrador/campanhas/[id]/migrar
// Converte uma campanha legacy (engine='legacy', messages=MessageBlock[])
// em orchestrator: cria 1 CampanhaStep por MessageBlock, publica V1,
// flipa engine='orchestrator'. Idempotente — se já tem steps, só retorna.
//
// NÃO toca em campanhas legacy que estão rodando — exige status != em_execucao.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicarVersao } from "@/lib/orchestrator/plan";
import type { MessageBlock } from "@/lib/message";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const camp = await prisma.campanha.findUnique({ where: { id: params.id } });
  if (!camp) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  if (camp.engine === "orchestrator") {
    return NextResponse.json({ ok: true, msg: "já era orchestrator" });
  }
  if (camp.status === "em_execucao") {
    return NextResponse.json(
      { error: "pausa a campanha legacy antes de migrar" },
      { status: 400 }
    );
  }

  let blocks: MessageBlock[] = [];
  try {
    blocks = JSON.parse(camp.messages) as MessageBlock[];
  } catch {
    return NextResponse.json(
      { error: "messages JSON inválido na campanha legacy" },
      { status: 500 }
    );
  }
  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "campanha sem mensagens — nada pra migrar" },
      { status: 400 }
    );
  }

  const existentes = await prisma.campanhaStep.count({ where: { campanhaId: params.id } });

  await prisma.$transaction(async (tx) => {
    if (existentes === 0) {
      // 1 step por bloco, delay = delayEntreBlocos (menos o 1º = imediato).
      for (let i = 0; i < blocks.length; i++) {
        await tx.campanhaStep.create({
          data: {
            campanhaId: params.id,
            posicao: i,
            nome: `Mensagem ${i + 1}`,
            tipo: "message",
            blocks: JSON.stringify([blocks[i]]),
            scheduleMode: i === 0 ? "immediate" : "delay",
            delaySegundos: i === 0 ? 0 : Math.max(1, Math.round((camp.delayEntreBlocos ?? 2000) / 1000)),
            ativo: true,
          },
        });
      }
    }
    await tx.campanha.update({
      where: { id: params.id },
      data: { engine: "orchestrator" },
    });
    await tx.campanhaAudit.create({
      data: {
        campanhaId: params.id,
        acao: "migrada_para_orchestrator",
        payload: JSON.stringify({ steps: blocks.length, blocosOriginais: blocks.length }),
      },
    });
  });

  const pub = await publicarVersao(params.id, {
    autor: "sistema",
    resumo: "backfill inicial da migração legacy",
  });

  return NextResponse.json({
    ok: true,
    stepsCriados: existentes === 0 ? blocks.length : 0,
    versao: pub,
  });
}
