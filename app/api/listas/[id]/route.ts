import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const l = await prisma.lista.findUnique({
    where: { id: params.id },
    include: { contatos: { select: { contatoId: true } } },
  });
  if (!l) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: l.id,
    nome: l.nome,
    descricao: l.descricao,
    contatoIds: l.contatos.map((c) => c.contatoId),
    criadaEm: l.criadoEm.toISOString(),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const data: { nome?: string; descricao?: string | null } = {};
  if ("nome" in body) data.nome = (body.nome || "").trim();
  if ("descricao" in body)
    data.descricao = (body.descricao || "").trim() || null;

  // contatoIds: substitui tudo
  if ("contatoIds" in body && Array.isArray(body.contatoIds)) {
    await prisma.$transaction([
      prisma.contatoLista.deleteMany({ where: { listaId: params.id } }),
      prisma.contatoLista.createMany({
        data: body.contatoIds.map((cid: string) => ({
          contatoId: cid,
          listaId: params.id,
        })),
      }),
    ]);
  }

  const updated = await prisma.lista
    .update({
      where: { id: params.id },
      data,
      include: { contatos: { select: { contatoId: true } } },
    })
    .catch(() => null);

  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: updated.id,
    nome: updated.nome,
    descricao: updated.descricao,
    contatoIds: updated.contatos.map((c) => c.contatoId),
    criadaEm: updated.criadoEm.toISOString(),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.lista.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
