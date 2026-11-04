// POST /api/orquestrador/campanhas/[id]/steps/reordenar
// Body: { ordem: string[] } — stepIds na nova ordem desejada.
// Faz UPDATE atômico das posicoes (0, 1, 2, ...).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = (await req.json()) as { ordem?: string[] };
  const ordem = (body.ordem ?? []).filter((x) => typeof x === "string");
  if (ordem.length === 0) {
    return NextResponse.json({ error: "ordem vazia" }, { status: 400 });
  }

  const existentes = await prisma.campanhaStep.findMany({
    where: { campanhaId: params.id },
    select: { id: true, posicao: true },
  });
  const idsExistentes = new Set(existentes.map((s) => s.id));
  for (const id of ordem) {
    if (!idsExistentes.has(id)) {
      return NextResponse.json(
        { error: `step ${id} não pertence a esta campanha` },
        { status: 400 }
      );
    }
  }
  if (ordem.length !== existentes.length) {
    return NextResponse.json(
      { error: `ordem incompleta — enviou ${ordem.length}, esperava ${existentes.length}` },
      { status: 400 }
    );
  }

  // Estratégia pra driblar o UNIQUE (campanhaId, posicao):
  // 1) move tudo pra faixa alta (offset 10_000)
  // 2) depois reatribui 0..N-1 na ordem desejada
  await prisma.$transaction(async (tx) => {
    for (const s of existentes) {
      await tx.campanhaStep.update({
        where: { id: s.id },
        data: { posicao: s.posicao + 10_000 },
      });
    }
    for (let i = 0; i < ordem.length; i++) {
      await tx.campanhaStep.update({
        where: { id: ordem[i] },
        data: { posicao: i },
      });
    }
    await tx.campanhaAudit.create({
      data: {
        campanhaId: params.id,
        acao: "step_reordenado",
        payload: JSON.stringify({ ordem }),
      },
    });
  });

  return NextResponse.json({ ok: true, total: ordem.length });
}
