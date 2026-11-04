// POST /api/campanhas/[id]/retry-errors
//
// Re-enfileira contatos que deram erro pra serem tentados de novo na próxima
// execução do runner. Classifica os erros antes:
//
//   - "not_found" (número não existe no WhatsApp) → DESCARTA. Não vai pra fila
//     de novo. Marca o contato com `whatsappValido=false` pra runner pular sem
//     gastar delay em campanhas futuras também.
//   - Qualquer outro tipo de erro → re-enfileira. O runner identifica que o
//     número não está mais em `resultados` e volta a tentar.
//
// Concorrência: requer status != em_execucao. O runner reescreve `resultados`
// a cada contato — se modificarmos junto, perdemos writes. Usuário precisa
// pausar a campanha primeiro (já é o comportamento esperado de uma "ação
// de limpeza pós-erro").

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatError, type ErrorCategory } from "@/lib/error-format";

export const dynamic = "force-dynamic";

interface ResultadoItem {
  numero: string;
  status: "ok" | "erro" | "pulado";
  detail?: string;
  timestamp?: string;
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const camp = await prisma.campanha.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, resultados: true },
  });
  if (!camp) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  if (camp.status === "em_execucao") {
    return NextResponse.json(
      {
        error:
          "Campanha está em execução. Pause antes de re-enfileirar erros pra evitar perda de progresso.",
      },
      { status: 409 }
    );
  }

  let resultados: ResultadoItem[];
  try {
    resultados = JSON.parse(camp.resultados || "[]");
  } catch {
    resultados = [];
  }
  if (!Array.isArray(resultados)) resultados = [];

  // Separa em 4 baldes
  const reenfileirar: ResultadoItem[] = []; // erro não-descartável → some do array
  const descartar: ResultadoItem[] = []; // erro not_found → some do array, contato marcado
  const manter: ResultadoItem[] = []; // ok / pulado / erro que decidimos manter
  const numerosDescartar: string[] = []; // só dígitos, pra updateMany

  for (const r of resultados) {
    if (r.status !== "erro") {
      manter.push(r);
      continue;
    }
    const fe = formatError(r.detail);
    if (fe.category === "not_found") {
      descartar.push(r);
      const num = (r.numero || "").replace(/\D/g, "");
      if (num) numerosDescartar.push(num);
    } else {
      reenfileirar.push(r);
    }
  }

  // Marca contatos descartados como whatsappValido=false (pra runner pular
  // em qualquer campanha futura também, sem gastar tentativa).
  let contatosMarcados = 0;
  if (numerosDescartar.length > 0) {
    const upd = await prisma.contato.updateMany({
      where: { telefone: { in: numerosDescartar } },
      data: { whatsappValido: false },
    });
    contatosMarcados = upd.count;
  }

  // O array novo de resultados mantém só os "manter" (ok, pulado, e quaisquer
  // erros que NÃO foram limpos). Os descartados/reenfileirados saem — mas com
  // significados distintos pro próximo run:
  //   reenfileirados: o número volta a aparecer como "pendente" na fila.
  //   descartados   : volta como "pendente", MAS na próxima execução o runner
  //                   bate no validityMap (whatsappValido=false) e marca como
  //                   "pulado" sem disparar.
  const novosResultados = manter;

  // Recalcula contadores agregados a partir do array novo (fonte de verdade)
  const oks = novosResultados.filter((r) => r.status === "ok").length;
  const falhas = novosResultados.filter((r) => r.status === "erro").length;

  await prisma.campanha.update({
    where: { id: params.id },
    data: {
      resultados: JSON.stringify(novosResultados),
      enviadas: oks,
      falhas: falhas,
      atualizadoEm: new Date(),
    },
  });

  // Resumo por categoria pra UI mostrar o que aconteceu
  const porCategoriaReenfileirar: Record<string, number> = {};
  for (const r of reenfileirar) {
    const cat = formatError(r.detail).category as ErrorCategory;
    porCategoriaReenfileirar[cat] = (porCategoriaReenfileirar[cat] || 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    reenfileirados: reenfileirar.length,
    descartados: descartar.length,
    contatosMarcados,
    porCategoria: porCategoriaReenfileirar,
  });
}
