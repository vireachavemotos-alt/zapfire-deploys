// Publica uma nova versão da campanha: congela os CampanhaStep em
// CampanhaStepSnapshot. Jobs já em voo continuam no snapshot anterior.
//
// Convenção: a versão N == Campanha.versaoAtual == CampanhaVersao.numero.
// Depois de publicar, novos CampanhaContato criados usam a versão corrente;
// contatos já em jornada continuam com `versaoFixada` da versão em que
// começaram, exceto se forem explicitamente promovidos.

import { prisma } from "@/lib/db";

export interface PublicarResult {
  campanhaId: string;
  versaoNumero: number;
  versaoId: string;
  totalSteps: number;
}

export async function publicarVersao(
  campanhaId: string,
  opts: { autor?: string; resumo?: string } = {}
): Promise<PublicarResult> {
  return prisma.$transaction(async (tx) => {
    const campanha = await tx.campanha.findUnique({ where: { id: campanhaId } });
    if (!campanha) throw new Error(`Campanha ${campanhaId} não existe`);

    const steps = await tx.campanhaStep.findMany({
      where: { campanhaId },
      orderBy: { posicao: "asc" },
    });
    if (steps.length === 0) {
      throw new Error("Campanha não tem steps — adicione pelo menos um antes de publicar.");
    }

    const novoNumero = (campanha.versaoAtual ?? 0) + 1;
    const versao = await tx.campanhaVersao.create({
      data: {
        campanhaId,
        numero: novoNumero,
        publicadaPor: opts.autor ?? "sistema",
        resumo: opts.resumo ?? null,
      },
    });

    await tx.campanhaStepSnapshot.createMany({
      data: steps.map((s) => ({
        versaoId: versao.id,
        stepOriginalId: s.id,
        posicao: s.posicao,
        nome: s.nome,
        tipo: s.tipo,
        blocks: s.blocks,
        scheduleMode: s.scheduleMode,
        delaySegundos: s.delaySegundos,
        horarioAbsoluto: s.horarioAbsoluto,
        dependeDoStepId: s.dependeDoStepId,
        condicao: s.condicao,
        ativo: s.ativo,
      })),
    });

    await tx.campanha.update({
      where: { id: campanhaId },
      data: { versaoAtual: novoNumero },
    });

    await tx.campanhaAudit.create({
      data: {
        campanhaId,
        autor: opts.autor ?? "sistema",
        acao: "versao_publicada",
        payload: JSON.stringify({ versao: novoNumero, totalSteps: steps.length }),
      },
    });

    return {
      campanhaId,
      versaoNumero: novoNumero,
      versaoId: versao.id,
      totalSteps: steps.length,
    };
  });
}
