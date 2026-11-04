// POST /api/listas/[id]/duplicate
//
// Duplica uma lista existente. A nova lista tem os MESMOS contatoIds —
// os contatos em si NÃO são clonados (continuam únicos, só o vínculo é novo).
// Útil pra fazer testes A/B em cima de uma lista estável sem mexer na original.
//
// Body (opcional): { nome?: string } — se não enviar, usa "{original} (cópia)"
// Resposta: { listaCriada: { id, nome, contatoIds }, contatosCopiados }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const original = await prisma.lista.findUnique({
    where: { id: params.id },
    include: { contatos: { select: { contatoId: true } } },
  });
  if (!original) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { nome?: string };
  const novoNome =
    (body.nome || "").trim() || `${original.nome} (cópia)`;

  const contatoIds = original.contatos.map((c) => c.contatoId);

  const [novaLista] = await prisma.$transaction([
    prisma.lista.create({
      data: {
        nome: novoNome,
        descricao: original.descricao,
      },
    }),
  ]);

  if (contatoIds.length > 0) {
    await prisma.$transaction(
      contatoIds.map((cid) =>
        prisma.contatoLista.create({
          data: { listaId: novaLista.id, contatoId: cid },
        })
      )
    );
  }

  return NextResponse.json(
    {
      listaCriada: {
        id: novaLista.id,
        nome: novaLista.nome,
        contatoIds,
      },
      contatosCopiados: contatoIds.length,
    },
    { status: 201 }
  );
}
