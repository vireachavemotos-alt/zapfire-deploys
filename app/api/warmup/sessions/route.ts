// GET  /api/warmup/sessions         → lista sessões com stats
// POST /api/warmup/sessions          body { instanciaA, instanciaB }
//
// Cria sessão entre 2 instâncias. UNIQUE(instanciaA, instanciaB) impede
// duplicata — se já existe, retorna 409 com msg clara.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calcLimiteDiario } from "@/lib/warmup/progression";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = await prisma.warmupSession.findMany({
    orderBy: { iniciadoEm: "desc" },
  });
  const items = sessions.map((s) => ({
    id: s.id,
    instanciaA: s.instanciaA,
    instanciaB: s.instanciaB,
    ativo: s.ativo,
    iniciadoEm: s.iniciadoEm,
    proximoEnvioEm: s.proximoEnvioEm,
    totalEnviadas: s.totalEnviadas,
    enviadasHoje: s.enviadasHoje,
    diaRef: s.diaRef,
    diasAtivo: s.diasAtivo,
    limiteDiario: s.limiteDiario,
    limiteSugerido: calcLimiteDiario(s.diasAtivo || 1),
  }));
  return NextResponse.json({ items });
}

interface CreateBody {
  instanciaA?: string;
  instanciaB?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const a = (body.instanciaA ?? "").trim();
  const b = (body.instanciaB ?? "").trim();
  if (!a || !b) {
    return NextResponse.json(
      { error: "instanciaA e instanciaB são obrigatórios" },
      { status: 400 }
    );
  }
  if (a === b) {
    return NextResponse.json(
      { error: "Uma instância não pode aquecer consigo mesma" },
      { status: 400 }
    );
  }
  try {
    const session = await prisma.warmupSession.create({
      data: { instanciaA: a, instanciaB: b, limiteDiario: calcLimiteDiario(1) },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|UNIQUE/i.test(msg)) {
      return NextResponse.json(
        { error: `Já existe sessão entre ${a} e ${b}` },
        { status: 409 }
      );
    }
    throw e;
  }
}
