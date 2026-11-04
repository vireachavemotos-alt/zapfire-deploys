// Backfill de campanha legada → orquestrador.
//
// Converte UMA campanha existente (que guarda a sequência em `messages`
// JSON) numa sequência orquestrada equivalente: 1 CampanhaStep por bloco,
// Versão 1 com snapshots imutáveis, e por fim flipa `engine` pra
// "orchestrator".
//
// Idempotente: se a campanha já tem steps/versões, o script detecta e sai
// sem fazer nada (a menos que --force seja passado, caso em que apaga tudo
// e recria do zero — útil em dev).
//
// Uso:
//   npx tsx scripts/backfill-steps.ts <campanhaId>
//   npx tsx scripts/backfill-steps.ts <campanhaId> --dry-run
//   npx tsx scripts/backfill-steps.ts <campanhaId> --force
//
// NÃO roda automaticamente — é opt-in por campanha. Campanhas em execução
// NÃO devem ser migradas sem pausar antes.
//
// Nota: NÃO usa `scripts/` como entrypoint CLI aqui — espera-se rodar via
// `npx tsx` ou `node --experimental-strip-types`. O package.json atual não
// precisa de alterações.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type BackfillOpts = {
  campanhaId: string;
  dryRun: boolean;
  force: boolean;
};

async function backfill(opts: BackfillOpts) {
  const { campanhaId, dryRun, force } = opts;

  const camp = await prisma.campanha.findUnique({ where: { id: campanhaId } });
  if (!camp) {
    console.error(`[backfill] Campanha ${campanhaId} não encontrada.`);
    process.exit(2);
  }

  if (camp.status === "em_execucao") {
    console.error(
      `[backfill] Campanha ${campanhaId} está em_execucao. Pause antes de migrar.`
    );
    process.exit(3);
  }

  const existingSteps = await prisma.campanhaStep.count({ where: { campanhaId } });
  const existingVersoes = await prisma.campanhaVersao.count({ where: { campanhaId } });

  if ((existingSteps > 0 || existingVersoes > 0) && !force) {
    console.log(
      `[backfill] Campanha ${campanhaId} já tem ${existingSteps} steps e ${existingVersoes} versões — nada a fazer. Use --force pra recriar.`
    );
    return;
  }

  let blocks: unknown[] = [];
  try {
    const parsed = JSON.parse(camp.messages || "[]");
    if (Array.isArray(parsed)) blocks = parsed;
  } catch (e) {
    console.error(
      `[backfill] Campanha ${campanhaId} tem messages inválido:`,
      (e as Error).message
    );
    process.exit(4);
  }

  if (blocks.length === 0) {
    console.log(
      `[backfill] Campanha ${campanhaId} não tem blocos em messages — nada a migrar.`
    );
    return;
  }

  // Delay entre blocos → delaySegundos do próximo step.
  // Primeiro step: scheduleMode "immediate".
  const delayPorBloco = Math.max(0, Math.round((camp.delayEntreBlocos ?? 2000) / 1000));

  const plano = blocks.map((b, i) => ({
    posicao: i,
    nome: `Mensagem ${i + 1}`,
    tipo: "message",
    blocks: JSON.stringify([b]),
    scheduleMode: i === 0 ? "immediate" : "delay",
    delaySegundos: i === 0 ? 0 : delayPorBloco,
  }));

  console.log(`[backfill] Campanha "${camp.nome}" (${campanhaId})`);
  console.log(`[backfill] Blocos encontrados: ${blocks.length}`);
  console.log(`[backfill] delayEntreBlocos: ${camp.delayEntreBlocos}ms → ${delayPorBloco}s`);
  console.log(`[backfill] Steps que serão criados:`);
  for (const p of plano) {
    console.log(
      `  [${p.posicao}] ${p.nome}  mode=${p.scheduleMode}  delay=${p.delaySegundos}s`
    );
  }

  if (dryRun) {
    console.log(`[backfill] --dry-run — nada foi gravado.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (force) {
      // Remove snapshots/versoes/steps antigos nessa ordem pra respeitar FKs.
      await tx.messageExecution.deleteMany({ where: { campanhaId } });
      await tx.campanhaStepSnapshot.deleteMany({
        where: { versao: { campanhaId } },
      });
      await tx.campanhaVersao.deleteMany({ where: { campanhaId } });
      await tx.campanhaStep.deleteMany({ where: { campanhaId } });
    }

    // Steps draft
    const stepsCriados = [];
    for (const p of plano) {
      const s = await tx.campanhaStep.create({
        data: { campanhaId, ...p },
      });
      stepsCriados.push(s);
    }

    // Versão 1 + snapshots imutáveis
    const versao = await tx.campanhaVersao.create({
      data: {
        campanhaId,
        numero: 1,
        resumo: "backfill inicial — importado de messages JSON legada",
        publicadaPor: "backfill-script",
      },
    });

    for (const s of stepsCriados) {
      await tx.campanhaStepSnapshot.create({
        data: {
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
        },
      });
    }

    // Marca a campanha como orquestrada
    await tx.campanha.update({
      where: { id: campanhaId },
      data: { versaoAtual: 1, engine: "orchestrator" },
    });

    // Audit
    await tx.campanhaAudit.create({
      data: {
        campanhaId,
        autor: "backfill-script",
        acao: "versao_publicada",
        payload: JSON.stringify({
          versao: 1,
          steps: stepsCriados.length,
          origem: "backfill de messages JSON legada",
        }),
      },
    });
  });

  console.log(`[backfill] ✅ Campanha ${campanhaId} migrada pro orquestrador.`);
}

async function main() {
  const args = process.argv.slice(2);
  const campanhaId = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");

  if (!campanhaId) {
    console.error("uso: tsx scripts/backfill-steps.ts <campanhaId> [--dry-run] [--force]");
    process.exit(1);
  }

  try {
    await backfill({ campanhaId, dryRun, force });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
