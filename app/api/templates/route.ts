// GET /api/templates — lista todos (ordem desc por criadoEm)
// POST /api/templates — cria um novo { nome, descricao?, blocks }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function toDTO(t: {
  id: string;
  nome: string;
  descricao: string | null;
  blocks: string;
  criadoEm: Date;
  atualizadoEm: Date;
}) {
  let blocks: unknown = [];
  try {
    blocks = JSON.parse(t.blocks || "[]");
  } catch {
    blocks = [];
  }
  return {
    id: t.id,
    nome: t.nome,
    descricao: t.descricao,
    blocks,
    criadoEm: t.criadoEm.toISOString(),
    atualizadoEm: t.atualizadoEm.toISOString(),
  };
}

export async function GET() {
  const rows = await prisma.template.findMany({
    orderBy: { criadoEm: "desc" },
  });
  return NextResponse.json({ items: rows.map(toDTO) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const nome = String(body.nome || "").trim();
  const descricao = body.descricao ? String(body.descricao).trim() : null;
  const blocks = Array.isArray(body.blocks) ? body.blocks : null;

  if (!nome) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }
  if (!blocks || blocks.length === 0) {
    return NextResponse.json(
      { error: "Template precisa de pelo menos um bloco" },
      { status: 400 }
    );
  }

  const created = await prisma.template.create({
    data: {
      nome,
      descricao,
      blocks: JSON.stringify(blocks),
    },
  });
  return NextResponse.json(toDTO(created), { status: 201 });
}
