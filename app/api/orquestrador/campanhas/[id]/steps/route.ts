// GET  /api/orquestrador/campanhas/[id]/steps  → lista steps editáveis
// POST /api/orquestrador/campanhas/[id]/steps  → adiciona step ao fim

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface NovoStepBody {
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

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const steps = await prisma.campanhaStep.findMany({
    where: { campanhaId: params.id },
    orderBy: { posicao: "asc" },
  });
  return NextResponse.json({ steps });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = (await req.json()) as NovoStepBody;
  const last = await prisma.campanhaStep.findFirst({
    where: { campanhaId: params.id },
    orderBy: { posicao: "desc" },
    select: { posicao: true },
  });
  const posicao = (last?.posicao ?? -1) + 1;
  const step = await prisma.campanhaStep.create({
    data: {
      campanhaId: params.id,
      posicao,
      nome: body.nome ?? `Mensagem ${posicao + 1}`,
      tipo: body.tipo ?? "message",
      blocks: JSON.stringify(body.blocks ?? []),
      scheduleMode: body.scheduleMode ?? (posicao === 0 ? "immediate" : "delay"),
      delaySegundos: body.delaySegundos ?? (posicao === 0 ? 0 : 30),
      horarioAbsoluto: body.horarioAbsoluto ?? null,
      dependeDoStepId: body.dependeDoStepId ?? null,
      condicao: body.condicao ?? null,
      ativo: body.ativo ?? true,
    },
  });
  await prisma.campanhaAudit.create({
    data: {
      campanhaId: params.id,
      acao: "step_criado",
      payload: JSON.stringify({ stepId: step.id, posicao }),
    },
  });
  return NextResponse.json({ step }, { status: 201 });
}
