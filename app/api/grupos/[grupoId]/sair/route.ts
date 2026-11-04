// DELETE /api/grupos/[grupoId]/sair
// Sai do grupo via Evolution e remove a linha local (membros caem via cascade).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { leaveGroup } from "@/lib/evolution";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { grupoId: string } }
) {
  const grupo = await prisma.grupo.findUnique({ where: { id: params.grupoId } });
  if (!grupo) {
    return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  }

  let avisoEvolution: string | null = null;
  try {
    await leaveGroup(grupo.instanceName, grupo.jid);
  } catch (e) {
    avisoEvolution = `Evolution leaveGroup falhou: ${(e as Error).message}`;
  }

  await prisma.grupo.delete({ where: { id: grupo.id } });

  return NextResponse.json({ ok: true, avisoEvolution });
}
