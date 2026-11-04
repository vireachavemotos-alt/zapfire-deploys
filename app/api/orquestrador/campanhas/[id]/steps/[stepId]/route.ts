// PATCH  /api/orquestrador/campanhas/[id]/steps/[stepId]  → edita step
// DELETE /api/orquestrador/campanhas/[id]/steps/[stepId]  → remove step
//
// IMPORTANTE: edição no CampanhaStep é DRAFT. Só vira efetiva nas próximas
// execuções após `POST /publicar`. Mensagens em voo seguem no snapshot da
// versão anterior — isso é o que permite editar durante campanha ativa
// sem corromper jobs em execução.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PatchBody {
  nome?: string;
  tipo?: string;
  blocks?: unknown[];
  scheduleMode?: string;
  delaySegundos?: number;
  horarioAbsoluto?: string | null;
  dependeDoStepId?: string | null;
  condicao?: string | null;
  ativo?: boolean;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; stepId: string } }
) {
  const body = (await req.json()) as PatchBody;
  const antes = await prisma.campanhaStep.findUnique({ where: { id: params.stepId } });
  if (!antes || antes.campanhaId !== params.id) {
    return NextResponse.json({ error: "step não encontrado" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.nome !== undefined) data.nome = body.nome;
  if (body.tipo !== undefined) data.tipo = body.tipo;
  if (body.blocks !== undefined) data.blocks = JSON.stringify(body.blocks);
  if (body.scheduleMode !== undefined) data.scheduleMode = body.scheduleMode;
  if (body.delaySegundos !== undefined) data.delaySegundos = body.delaySegundos;
  if (body.horarioAbsoluto !== undefined) data.horarioAbsoluto = body.horarioAbsoluto;
  if (body.dependeDoStepId !== undefined) data.dependeDoStepId = body.dependeDoStepId;
  if (body.condicao !== undefined) data.condicao = body.condicao;
  if (body.ativo !== undefined) data.ativo = body.ativo;

  const step = await prisma.campanhaStep.update({
    where: { id: params.stepId },
    data,
  });

  // Audit (log do que mudou — ignora campos que ficaram iguais).
  const diffs: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const [k, v] of Object.entries(data)) {
    const antesV = (antes as unknown as Record<string, unknown>)[k];
    if (antesV !== v) diffs[k] = { antes: antesV, depois: v };
  }
  if (Object.keys(diffs).length > 0) {
    await prisma.campanhaAudit.create({
      data: {
        campanhaId: params.id,
        acao: "step_editado",
        payload: JSON.stringify({ stepId: step.id, diffs }),
      },
    });
  }

  return NextResponse.json({ step, mudancas: Object.keys(diffs).length });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; stepId: string } }
) {
  const step = await prisma.campanhaStep.findUnique({ where: { id: params.stepId } });
  if (!step || step.campanhaId !== params.id) {
    return NextResponse.json({ error: "step não encontrado" }, { status: 404 });
  }
  await prisma.$transaction([
    prisma.campanhaStep.delete({ where: { id: params.stepId } }),
    // Compacta posições maiores (shift down) pra não deixar buracos.
    prisma.$executeRaw`
      UPDATE "CampanhaStep"
         SET posicao = posicao - 1
       WHERE "campanhaId" = ${params.id}
         AND posicao > ${step.posicao}
    `,
    prisma.campanhaAudit.create({
      data: {
        campanhaId: params.id,
        acao: "step_removido",
        payload: JSON.stringify({ stepId: step.id, posicao: step.posicao, nome: step.nome }),
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
