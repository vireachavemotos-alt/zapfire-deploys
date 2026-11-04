import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const listas = await prisma.lista.findMany({
    orderBy: { criadoEm: "desc" },
    include: {
      contatos: { select: { contatoId: true } },
    },
  });
  return NextResponse.json(
    listas.map((l) => ({
      id: l.id,
      nome: l.nome,
      descricao: l.descricao,
      contatoIds: l.contatos.map((x) => x.contatoId),
      criadaEm: l.criadoEm.toISOString(),
    }))
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const nome = (body.nome || "").trim();
  if (!nome) {
    return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  }
  const contatoIds: string[] = Array.isArray(body.contatoIds)
    ? body.contatoIds
    : [];

  const lista = await prisma.lista.create({
    data: {
      nome,
      descricao: (body.descricao || "").trim() || null,
      contatos: {
        create: contatoIds.map((cid) => ({ contatoId: cid })),
      },
    },
    include: { contatos: { select: { contatoId: true } } },
  });

  return NextResponse.json(
    {
      id: lista.id,
      nome: lista.nome,
      descricao: lista.descricao,
      contatoIds: lista.contatos.map((c) => c.contatoId),
      criadaEm: lista.criadoEm.toISOString(),
    },
    { status: 201 }
  );
}
