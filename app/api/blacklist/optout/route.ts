// POST /api/blacklist/optout
//
// Marca uma lista de números como opt-out global (contato pediu pra sair).
// Diferente de blacklist auto/manual: optout é PERMANENTE (validoAte=null) e
// nunca sai sozinho da lista. O runner já ignora qualquer bloqueado ativo,
// então basta inserir aqui pra o número nunca mais receber em nenhuma campanha.
//
// Body: { telefones: string[], motivo?: string }
// Resposta: { adicionados, jaEraOptOut, invalidos }

import { NextResponse } from "next/server";
import { suprimirNumeros } from "@/lib/blacklist";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    telefones?: string[];
    motivo?: string;
  };
  const tels = Array.isArray(body.telefones) ? body.telefones : [];
  if (tels.length === 0) {
    return NextResponse.json(
      { error: "Envie um array `telefones` com pelo menos 1 número." },
      { status: 400 }
    );
  }
  const motivo = (body.motivo || "").trim() || "Contato pediu para sair";
  const result = await suprimirNumeros(tels, motivo);
  return NextResponse.json(result, { status: 201 });
}
