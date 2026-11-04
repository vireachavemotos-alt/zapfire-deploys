// POST /api/orquestrador/campanhas/[id]/publicar
// Congela os CampanhaStep editáveis em CampanhaStepSnapshot (nova versão).
// Jobs em voo seguem no snapshot anterior; só execuções criadas depois
// usam a nova versão.

import { NextResponse } from "next/server";
import { publicarVersao } from "@/lib/orchestrator/plan";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = (await req.json().catch(() => ({}))) as {
    autor?: string;
    resumo?: string;
  };
  try {
    const result = await publicarVersao(params.id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
