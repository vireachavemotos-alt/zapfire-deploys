// POST /api/orquestrador/campanhas/[id]/iniciar
// Cria CampanhaContato por contato + primeira MessageExecution.
// Pode receber opcionalmente { contatoIds: [...] } pra sobrescrever
// a lista. Senão, usa Campanha.listaId.

import { NextResponse } from "next/server";
import { iniciarCampanhaOrquestrada } from "@/lib/orchestrator/enqueue";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = (await req.json().catch(() => ({}))) as {
    contatoIds?: string[];
  };
  try {
    const result = await iniciarCampanhaOrquestrada(params.id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
