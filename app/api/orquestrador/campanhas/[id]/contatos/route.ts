// GET /api/orquestrador/campanhas/[id]/contatos?status=em_andamento
// Lista CampanhaContato da campanha + join Contato (sem relation no schema).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  const campanha = await prisma.campanha.findUnique({
    where: { id: params.id },
    select: { id: true, engine: true },
  });
  if (!campanha) {
    return NextResponse.json({ error: "campanha não encontrada" }, { status: 404 });
  }

  const where: {
    campanhaId: string;
    status?: string;
  } = { campanhaId: params.id };
  if (statusFilter) where.status = statusFilter;

  const campContatos = await prisma.campanhaContato.findMany({
    where,
    orderBy: { criadoEm: "asc" },
  });

  if (campContatos.length === 0) {
    return NextResponse.json({ contatos: [], engine: campanha.engine });
  }

  const contatoIds = Array.from(new Set(campContatos.map((c) => c.contatoId)));
  const contatos = await prisma.contato.findMany({
    where: { id: { in: contatoIds } },
    select: { id: true, nome: true, telefone: true },
  });
  const byId = new Map(contatos.map((c) => [c.id, c]));

  const items = campContatos.map((cc) => {
    const contato = byId.get(cc.contatoId);
    return {
      id: cc.id,
      contatoId: cc.contatoId,
      nome: contato?.nome ?? "(sem nome)",
      telefone: contato?.telefone ?? "",
      status: cc.status,
      respondeuEm: cc.respondeuEm,
      ultimaRespostaId: cc.ultimaRespostaId,
      stepAtualId: cc.stepAtualId,
      proximoEnvioEm: cc.proximoEnvioEm,
      criadoEm: cc.criadoEm,
    };
  });

  return NextResponse.json({ contatos: items, engine: campanha.engine });
}
