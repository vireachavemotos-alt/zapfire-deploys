// PATCH  /api/warmup/sessions/[id]   body { ativo?: boolean }   → pausar/retomar
// DELETE /api/warmup/sessions/[id]                              → remove (cascata nas messages)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PatchBody {
  ativo?: boolean;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const data: Record<string, unknown> = {};
  if (typeof body.ativo === "boolean") {
    data.ativo = body.ativo;
    // Ao retomar, limpa o proximoEnvioEm pra disparar no próximo tick.
    if (body.ativo) data.proximoEnvioEm = new Date();
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nada pra atualizar" }, { status: 400 });
  }
  const session = await prisma.warmupSession.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ session });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.warmupSession.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
