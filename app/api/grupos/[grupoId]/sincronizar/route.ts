// POST /api/grupos/[grupoId]/sincronizar
// Re-busca participantes do grupo no WhatsApp, atualiza GrupoMembro.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getGroupParticipants } from "@/lib/evolution";
import { phoneFromJid } from "@/lib/grupo";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { grupoId: string } }
) {
  const grupo = await prisma.grupo.findUnique({ where: { id: params.grupoId } });
  if (!grupo) {
    return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  }

  let resp;
  try {
    resp = await getGroupParticipants(grupo.instanceName, grupo.jid);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 502 }
    );
  }

  const participantes = resp.participants ?? [];
  const telsAtuais = new Set<string>();
  let novos = 0;
  let atualizados = 0;

  for (const p of participantes) {
    const telRaw = phoneFromJid(p.id);
    if (!telRaw) continue;
    const telNorm = normalizePhone(telRaw) ?? telRaw;
    telsAtuais.add(telNorm);
    const existing = await prisma.grupoMembro.findUnique({
      where: { grupoId_telefone: { grupoId: grupo.id, telefone: telNorm } },
    });
    if (existing) {
      if (existing.admin !== (p.admin ?? null)) {
        await prisma.grupoMembro.update({
          where: { id: existing.id },
          data: { admin: p.admin ?? null },
        });
        atualizados++;
      }
    } else {
      try {
        await prisma.grupoMembro.create({
          data: { grupoId: grupo.id, telefone: telNorm, admin: p.admin ?? null },
        });
        novos++;
      } catch { /* race */ }
    }
  }

  // Remove membros que saíram.
  const removidos = await prisma.grupoMembro.deleteMany({
    where: {
      grupoId: grupo.id,
      telefone: { notIn: Array.from(telsAtuais) },
    },
  });

  await prisma.grupo.update({
    where: { id: grupo.id },
    data: {
      totalMembros: participantes.length,
      ultimaSincEm: new Date(),
    },
  });

  return NextResponse.json({
    totalMembros: participantes.length,
    novos,
    atualizados,
    removidos: removidos.count,
  });
}
