// GET /api/grupos/preview?instanceName=X&inviteUrl=Y
// Mostra nome/foto/descrição/nº de membros do grupo SEM entrar.

import { NextResponse } from "next/server";
import { extractInviteCode } from "@/lib/grupo";
import { getGroupInviteInfo } from "@/lib/evolution";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const instanceName = (url.searchParams.get("instanceName") || "").trim();
  const inviteUrl = (url.searchParams.get("inviteUrl") || "").trim();
  if (!instanceName) {
    return NextResponse.json({ error: "instanceName obrigatório" }, { status: 400 });
  }
  const code = extractInviteCode(inviteUrl);
  if (!code) {
    return NextResponse.json(
      { error: "Link de convite inválido" },
      { status: 400 }
    );
  }
  try {
    const g = await getGroupInviteInfo(instanceName, code);
    return NextResponse.json({
      jid: g.id,
      nome: g.subject ?? null,
      descricao: g.desc ?? null,
      pictureUrl: g.pictureUrl ?? null,
      totalMembros: g.size ?? g.participants?.length ?? 0,
      criacao: g.creation ?? null,
      owner: g.owner ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502 }
    );
  }
}
