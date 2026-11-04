// GET/PATCH/DELETE /api/templates/[id]

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

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const t = await prisma.template.findUnique({ where: { id: params.id } });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(toDTO(t));
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("nome" in body) {
    const nome = String(body.nome || "").trim();
    if (!nome)
      return NextResponse.json(
        { error: "Nome não pode ser vazio" },
        { status: 400 }
      );
    data.nome = nome;
  }
  if ("descricao" in body) {
    const d = body.descricao ? String(body.descricao).trim() : null;
    data.descricao = d;
  }
  if ("blocks" in body) {
    if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
      return NextResponse.json(
        { error: "Template precisa de pelo menos um bloco" },
        { status: 400 }
      );
    }
    data.blocks = JSON.stringify(body.blocks);
  }

  const updated = await prisma.template
    .update({ where: { id: params.id }, data })
    .catch(() => null);
  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(toDTO(updated));
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.template.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
