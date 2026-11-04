// POST /api/listas/:id/validate-numbers
// Body: { instanceName: string }
//
// Valida via Evolution (/chat/whatsappNumbers/:instance) todos os contatos da
// lista em chunks de 100 e persiste `whatsappValido` em cada Contato.
// Retorna stats agregados {total, validos, invalidos, erroRede}.
//
// Idempotente — pode rodar várias vezes. O resultado sobrescreve o anterior
// (se o usuário conectou um novo número o mundo pode ter mudado).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkIsWhatsApp } from "@/lib/evolution";

const CHUNK = 100;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const instanceName: string | undefined = body.instanceName;

  if (!instanceName) {
    return NextResponse.json(
      { error: "instanceName obrigatório" },
      { status: 400 }
    );
  }

  const lista = await prisma.lista.findUnique({
    where: { id: params.id },
    include: {
      contatos: {
        include: {
          contato: {
            select: { id: true, telefone: true },
          },
        },
      },
    },
  });

  if (!lista) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });
  }

  // Map telefone → contatoId. Deduplica caso o mesmo telefone esteja em
  // múltiplos contatos (teoricamente impossível pelo unique, mas defensivo).
  const numeros = lista.contatos
    .map((cl) => cl.contato.telefone)
    .filter((t): t is string => Boolean(t));

  if (!numeros.length) {
    return NextResponse.json({
      total: 0,
      validos: 0,
      invalidos: 0,
      erroRede: false,
    });
  }

  // Chunking — algumas versões da Evolution engasgam em batches muito grandes.
  const chunks: string[][] = [];
  for (let i = 0; i < numeros.length; i += CHUNK) {
    chunks.push(numeros.slice(i, i + CHUNK));
  }

  // Resultado por telefone normalizado (sem caracteres não-dígitos).
  const resultado = new Map<string, boolean>();
  let erroRede = false;

  for (const chunk of chunks) {
    try {
      const resp = (await checkIsWhatsApp(instanceName, chunk)) as Array<{
        number: string;
        exists: boolean;
      }>;

      if (!Array.isArray(resp)) {
        console.error(
          "[validate-numbers] Resposta inesperada da Evolution:",
          resp
        );
        erroRede = true;
        continue;
      }

      for (const item of resp) {
        const key = (item.number || "").replace(/\D/g, "");
        if (key) resultado.set(key, Boolean(item.exists));
      }
    } catch (err) {
      console.error("[validate-numbers] Falha em chunk:", err);
      erroRede = true;
      // Segue tentando os outros chunks — é uma operação "best effort".
    }
  }

  // Persiste em uma transação só (melhor pra SQLite).
  const updates: Array<ReturnType<typeof prisma.contato.update>> = [];
  for (const cl of lista.contatos) {
    const tel = (cl.contato.telefone || "").replace(/\D/g, "");
    const valido = resultado.get(tel);
    if (valido === undefined) continue; // chunk falhou → mantém o valor atual
    updates.push(
      prisma.contato.update({
        where: { id: cl.contato.id },
        data: { whatsappValido: valido },
      })
    );
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  let validos = 0;
  let invalidos = 0;
  resultado.forEach((v) => {
    if (v) validos++;
    else invalidos++;
  });

  return NextResponse.json({
    total: numeros.length,
    validos,
    invalidos,
    erroRede,
    /** quantidade de contatos cujo status foi atualizado nesta rodada */
    atualizados: updates.length,
  });
}
