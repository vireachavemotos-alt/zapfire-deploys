// GET /api/grupos?instanceName=X&sync=true
// Lista Grupos salvos. Com `sync=true`, antes de listar sincroniza do
// WhatsApp (fetchAllGroups) — útil pra pegar grupos que a instance
// entrou por fora da plataforma.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAllGroups, type EvolutionGroup } from "@/lib/evolution";
import { phoneFromJid } from "@/lib/grupo";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const instanceName = url.searchParams.get("instanceName")?.trim() || "";
  const sync = url.searchParams.get("sync") === "true";

  let avisoSync: string | null = null;
  if (sync) {
    if (!instanceName) {
      return NextResponse.json(
        { error: "instanceName obrigatório quando sync=true" },
        { status: 400 }
      );
    }
    try {
      const grupos = await fetchAllGroups(instanceName, true);
      await persistirSync(instanceName, grupos);
    } catch (e) {
      avisoSync = `Sync falhou: ${(e as Error).message}`;
    }
  }

  const where = instanceName ? { instanceName } : {};
  const grupos = await prisma.grupo.findMany({
    where,
    orderBy: { descobertoEm: "desc" },
    include: { _count: { select: { membros: true } } },
  });
  return NextResponse.json({
    avisoSync,
    grupos: grupos.map((g) => ({
      id: g.id,
      jid: g.jid,
      nome: g.nome,
      descricao: g.descricao,
      pictureUrl: g.pictureUrl,
      instanceName: g.instanceName,
      totalMembros: g.totalMembros,
      membrosArmazenados: g._count.membros,
      descobertoEm: g.descobertoEm,
      ultimaSincEm: g.ultimaSincEm,
    })),
  });
}

async function persistirSync(instanceName: string, grupos: EvolutionGroup[]) {
  for (const g of grupos) {
    const jid = g.id;
    if (!jid) continue;
    const participantes = g.participants ?? [];
    const grupoRow = await prisma.grupo.upsert({
      where: { jid },
      update: {
        nome: g.subject ?? jid,
        descricao: g.desc ?? null,
        pictureUrl: g.pictureUrl ?? null,
        instanceName,
        totalMembros: g.size ?? participantes.length,
        ultimaSincEm: new Date(),
      },
      create: {
        jid,
        nome: g.subject ?? jid,
        descricao: g.desc ?? null,
        pictureUrl: g.pictureUrl ?? null,
        instanceName,
        totalMembros: g.size ?? participantes.length,
        ultimaSincEm: new Date(),
      },
    });
    for (const p of participantes) {
      const telRaw = phoneFromJid(p.id);
      if (!telRaw) continue;
      const telNorm = normalizePhone(telRaw) ?? telRaw;
      try {
        await prisma.grupoMembro.upsert({
          where: { grupoId_telefone: { grupoId: grupoRow.id, telefone: telNorm } },
          update: { admin: p.admin ?? null },
          create: { grupoId: grupoRow.id, telefone: telNorm, admin: p.admin ?? null },
        });
      } catch {
        /* race condition é benigna */
      }
    }
  }
}
