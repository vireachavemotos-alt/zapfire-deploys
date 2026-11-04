// POST /api/listas/merge
//
// Funde várias listas numa lista nova, deduplicando contatos (contato que
// aparece em >1 lista entra só uma vez na mesclada). Lista original fica
// intacta — só cria a nova.
//
// Body: { listaIds: string[]; nome: string; descricao?: string }
// Resposta: { listaCriada: { id, nome }, contatosAdicionados, origemListas }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    listaIds?: string[];
    nome?: string;
    descricao?: string;
  };

  const ids = Array.from(
    new Set((body.listaIds || []).filter((x): x is string => typeof x === "string" && !!x))
  );
  const nome = (body.nome || "").trim();

  if (ids.length < 2) {
    return NextResponse.json(
      { error: "Informe pelo menos 2 listaIds distintas." },
      { status: 400 }
    );
  }
  if (!nome) {
    return NextResponse.json(
      { error: "Nome da nova lista é obrigatório." },
      { status: 400 }
    );
  }

  // Confirma que as listas existem
  const existentes = await prisma.lista.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (existentes.length !== ids.length) {
    return NextResponse.json(
      { error: "Uma ou mais listas não foram encontradas." },
      { status: 404 }
    );
  }

  // Pega contatoIds de todas as listas, dedupe via Set
  const vinculos = await prisma.contatoLista.findMany({
    where: { listaId: { in: ids } },
    select: { contatoId: true },
  });
  const contatoIdsUnicos = Array.from(new Set(vinculos.map((v) => v.contatoId)));

  // Cria lista nova + vínculos numa transaction
  const [listaCriada] = await prisma.$transaction([
    prisma.lista.create({
      data: {
        nome,
        descricao: (body.descricao || "").trim() || null,
      },
    }),
    // placeholder pra manter array; vínculos vão num segundo update
  ]);

  if (contatoIdsUnicos.length > 0) {
    await prisma.$transaction(
      contatoIdsUnicos.map((cid) =>
        prisma.contatoLista.create({
          data: { listaId: listaCriada.id, contatoId: cid },
        })
      )
    );
  }

  return NextResponse.json(
    {
      listaCriada: { id: listaCriada.id, nome: listaCriada.nome },
      contatosAdicionados: contatoIdsUnicos.length,
      origemListas: ids,
    },
    { status: 201 }
  );
}
