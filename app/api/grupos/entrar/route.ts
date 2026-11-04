// POST /api/grupos/entrar
// Body: { instanceName: string, inviteUrl: string }
// 1. Extrai o inviteCode do link
// 2. Chama inviteInfo pra pegar nome/foto/membros (preview)
// 3. Chama acceptInvite — Evolution devolve o jid
// 4. Faz upsert em Grupo (via jid) + popula GrupoMembro a partir dos participantes

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractInviteCode, phoneFromJid } from "@/lib/grupo";
import { normalizePhone } from "@/lib/phone";
import {
  acceptGroupInvite,
  getGroupInviteInfo,
  getGroupParticipants,
} from "@/lib/evolution";

export const dynamic = "force-dynamic";

interface Body {
  instanceName?: string;
  inviteUrl?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const instanceName = (body.instanceName || "").trim();
  const inviteUrl = (body.inviteUrl || "").trim();
  if (!instanceName) {
    return NextResponse.json({ error: "instanceName obrigatório" }, { status: 400 });
  }
  const code = extractInviteCode(inviteUrl);
  if (!code) {
    return NextResponse.json(
      { error: "Link de convite inválido. Use https://chat.whatsapp.com/CODE" },
      { status: 400 }
    );
  }

  let preview;
  try {
    preview = await getGroupInviteInfo(instanceName, code);
  } catch (e) {
    return NextResponse.json(
      { error: `Falha no preview: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  let acceptResp;
  try {
    acceptResp = await acceptGroupInvite(instanceName, code);
  } catch (e) {
    return NextResponse.json(
      { error: `Falha ao aceitar convite: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Evolution às vezes só devolve groupJid, às vezes devolve o grupo inteiro.
  const groupJid =
    acceptResp.groupJid || (acceptResp as { id?: string }).id || preview.id;
  if (!groupJid) {
    return NextResponse.json(
      { error: "Evolution não devolveu o groupJid" },
      { status: 502 }
    );
  }

  // Participantes: tenta pelo preview, se não vier, puxa separado.
  let participantes = preview.participants ?? [];
  if (!participantes.length) {
    try {
      const resp = await getGroupParticipants(instanceName, groupJid);
      participantes = resp.participants ?? [];
    } catch {
      /* segue sem membros, user pode sincronizar depois */
    }
  }

  const grupo = await prisma.grupo.upsert({
    where: { jid: groupJid },
    update: {
      nome: preview.subject ?? groupJid,
      descricao: preview.desc ?? null,
      pictureUrl: preview.pictureUrl ?? null,
      instanceName,
      totalMembros: participantes.length,
      ultimaSincEm: new Date(),
    },
    create: {
      jid: groupJid,
      nome: preview.subject ?? groupJid,
      descricao: preview.desc ?? null,
      pictureUrl: preview.pictureUrl ?? null,
      instanceName,
      totalMembros: participantes.length,
      ultimaSincEm: new Date(),
    },
  });

  if (participantes.length > 0) {
    await syncParticipantes(grupo.id, participantes);
  }

  return NextResponse.json(
    {
      grupoId: grupo.id,
      jid: grupo.jid,
      nome: grupo.nome,
      totalMembros: grupo.totalMembros,
    },
    { status: 201 }
  );
}

type ParticipantInput = {
  id: string;
  admin?: "admin" | "superadmin" | null;
};

async function syncParticipantes(grupoId: string, participantes: ParticipantInput[]) {
  for (const p of participantes) {
    const telRaw = phoneFromJid(p.id);
    if (!telRaw) continue;
    const telNorm = normalizePhone(telRaw) ?? telRaw;
    try {
      await prisma.grupoMembro.upsert({
        where: { grupoId_telefone: { grupoId, telefone: telNorm } },
        update: { admin: p.admin ?? null },
        create: {
          grupoId,
          telefone: telNorm,
          admin: p.admin ?? null,
        },
      });
    } catch {
      /* dedupe racey — segue */
    }
  }
}
