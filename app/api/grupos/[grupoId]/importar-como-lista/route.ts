// POST /api/grupos/[grupoId]/importar-como-lista
// Body: { nomeLista?: string, categoria?: string }
//
// Cria uma Lista nova com todos os membros do grupo como Contato. Usa
// phoneVariants pra dedupe contra Contato existente (match pelo
// `telefone @unique`) — se o número já existe, só vincula via ContatoLista.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { phoneVariants } from "@/lib/phone";

export const dynamic = "force-dynamic";

interface Body {
  nomeLista?: string;
  categoria?: string;
}

export async function POST(
  req: Request,
  { params }: { params: { grupoId: string } }
) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const grupo = await prisma.grupo.findUnique({
    where: { id: params.grupoId },
    include: { membros: true },
  });
  if (!grupo) {
    return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  }
  if (grupo.membros.length === 0) {
    return NextResponse.json(
      { error: "Grupo sem membros extraídos. Sincronize primeiro." },
      { status: 400 }
    );
  }

  const nomeLista = (body.nomeLista || "").trim() || `Membros · ${grupo.nome}`;
  const categoria = (body.categoria || "").trim() || null;

  // Cria a Lista.
  const lista = await prisma.lista.create({
    data: {
      nome: nomeLista,
      descricao: `Importado do grupo ${grupo.nome} (${grupo.jid})`,
    },
  });

  let novosContatos = 0;
  let contatosReaproveitados = 0;
  let vinculosNovos = 0;

  for (const m of grupo.membros) {
    // Dedupe via variantes do 9º dígito — pega o primeiro que já existe.
    const variantes = phoneVariants(m.telefone);
    let contato = null;
    for (const v of variantes) {
      contato = await prisma.contato.findUnique({ where: { telefone: v } });
      if (contato) break;
    }

    if (!contato) {
      try {
        contato = await prisma.contato.create({
          data: {
            telefone: m.telefone,
            nome: m.pushName || null,
            categoria,
          },
        });
        novosContatos++;
      } catch {
        // UNIQUE race — refetch.
        contato = await prisma.contato.findUnique({
          where: { telefone: m.telefone },
        });
        if (!contato) continue;
        contatosReaproveitados++;
      }
    } else {
      contatosReaproveitados++;
    }

    try {
      await prisma.contatoLista.create({
        data: { contatoId: contato.id, listaId: lista.id },
      });
      vinculosNovos++;
    } catch {
      /* já vinculado — ignora */
    }
  }

  return NextResponse.json(
    {
      listaId: lista.id,
      nomeLista: lista.nome,
      totalMembrosGrupo: grupo.membros.length,
      novosContatos,
      contatosReaproveitados,
      vinculosNovos,
    },
    { status: 201 }
  );
}
