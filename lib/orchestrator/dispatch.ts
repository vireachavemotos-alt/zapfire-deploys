// Processa MessageExecution que estão prontas pra sair.
// Chamado a cada tick do scheduler quando há campanhas com engine=orchestrator.
//
// Algoritmo:
//   1. Pega N executions com status='pending' e agendadoPara <= now,
//      com Campanha.status != pausada.
//   2. Pra cada uma, dentro de uma transação:
//      a. Faz UPDATE pending→running (claim). Se não bate (outra worker pegou),
//         pula.
//      b. Chama resolveSendTarget() pra achar instance + telefone normalizado.
//      c. Checa suppression — se bloqueado, status=blocked.
//      d. Renderiza blocks (variáveis, spintax).
//      e. Chama lib/evolution.sendText (ou sendMedia por kind) por bloco.
//      f. Grava MessageAttempt (sent/failed).
//      g. Status final: sent/failed.
//      h. Enfileira o próximo step (lookup no snapshot pela posicao+1 ou
//         dependeDoStepId quando branch).
//
// Reusa infraestrutura existente: lib/evolution.ts, lib/message.ts, lib/suppression.ts.

import { prisma } from "@/lib/db";
import { renderText, type MessageBlock } from "@/lib/message";
import { sendText } from "@/lib/evolution";
import { isSuppressed } from "@/lib/suppression";
import { normalizePhone } from "@/lib/phone";
import { computeAgendadoPara } from "@/lib/orchestrator/enqueue";

const DEFAULT_BATCH = 10;

export interface DispatchStats {
  claimed: number;
  sent: number;
  failed: number;
  blocked: number;
  skipped: number;
  enqueuedNext: number;
}

export async function dispatchDue(opts: { batch?: number } = {}): Promise<DispatchStats> {
  const now = new Date();
  const batch = opts.batch ?? DEFAULT_BATCH;

  // Candidatos: pending + agendadoPara passou + campanha ativa.
  const candidates = await prisma.messageExecution.findMany({
    where: {
      status: "pending",
      agendadoPara: { lte: now },
      campanha: { status: { in: ["em_execucao", "agendada"] } },
    },
    orderBy: { agendadoPara: "asc" },
    take: batch,
    include: {
      snapshot: true,
      campanhaContato: true, // Contato é buscado em bulk abaixo (sem relation no schema).
      campanha: { select: { id: true, instanceNames: true } },
    },
  });

  const stats: DispatchStats = {
    claimed: 0, sent: 0, failed: 0, blocked: 0, skipped: 0, enqueuedNext: 0,
  };

  // Bulk load dos Contato (sem relation no schema CampanhaContato).
  const contatoIds = Array.from(new Set(candidates.map((c) => c.campanhaContato.contatoId)));
  const contatos = contatoIds.length === 0 ? [] : await prisma.contato.findMany({
    where: { id: { in: contatoIds } },
    select: { id: true, telefone: true, nome: true, empresa: true },
  });
  const contatoById = new Map(contatos.map((c) => [c.id, c]));

  for (const exec of candidates) {
    const contato = contatoById.get(exec.campanhaContato.contatoId);
    if (!contato) { stats.skipped++; continue; }

    // 1. Claim atômico: só continua se seguir pending.
    const claim = await prisma.messageExecution.updateMany({
      where: { id: exec.id, status: "pending" },
      data: { status: "running", iniciadoEm: now },
    });
    if (claim.count === 0) { stats.skipped++; continue; }
    stats.claimed++;

    const telNorm = normalizePhone(contato.telefone) ?? contato.telefone;

    // 2. Suppression.
    if (await isSuppressed(telNorm)) {
      await prisma.messageExecution.update({
        where: { id: exec.id },
        data: { status: "blocked", concluidoEm: new Date(), erroDetalhe: "suppression ativa" },
      });
      await prisma.campanhaContato.update({
        where: { id: exec.campanhaContato.id },
        data: { status: "bloqueado" },
      });
      stats.blocked++;
      continue;
    }

    // 3. Resolve instanceName (round-robin pelas da campanha).
    let instances: string[] = [];
    try { instances = JSON.parse(exec.campanha.instanceNames) as string[]; } catch {}
    const instance = instances[Math.floor(Math.random() * Math.max(1, instances.length))] ?? "";
    if (!instance) {
      await markFailed(exec.id, "nenhuma instance configurada");
      stats.failed++;
      continue;
    }

    // 4. Renderizar + enviar blocos.
    let blocks: MessageBlock[] = [];
    try { blocks = JSON.parse(exec.snapshot.blocks) as MessageBlock[]; } catch {
      await markFailed(exec.id, "snapshot.blocks JSON inválido");
      stats.failed++; continue;
    }

    let ok = true;
    let lastErro = "";
    let evolutionMsgId: string | undefined;
    let textoFinal = "";
    const vars = { nome: contato.nome ?? "", empresa: contato.empresa ?? "" };
    for (const b of blocks) {
      try {
        const variations = (b as { variations?: string[] }).variations ?? [];
        // renderText já aplica spintax + invisibleChars quando antiBan=true.
        textoFinal = renderText(variations, vars, { antiBan: !!b.antiBan });
        if (!textoFinal) continue; // bloco de mídia-only não suportado neste MVP
        const resp = await sendText(instance, { number: telNorm, text: textoFinal });
        const asRec = resp as unknown as { key?: { id?: string } } | null;
        evolutionMsgId = asRec?.key?.id;
      } catch (e) {
        ok = false;
        lastErro = e instanceof Error ? e.message : String(e);
        break;
      }
    }

    // 5. Grava MessageAttempt.
    await prisma.messageAttempt.create({
      data: {
        executionId: exec.id,
        instanceName: instance,
        evolutionMsgId: evolutionMsgId ?? null,
        textoFinal: textoFinal.slice(0, 2000),
        status: ok ? "sent" : "failed",
        erroDetalhe: ok ? null : lastErro,
      },
    });

    if (!ok) {
      await markFailed(exec.id, lastErro);
      stats.failed++;
      continue;
    }

    await prisma.messageExecution.update({
      where: { id: exec.id },
      data: { status: "sent", concluidoEm: new Date() },
    });
    stats.sent++;

    // 6. Enfileira próximo step (linear — branching será expandido depois).
    const next = await findNextStep(exec.campanhaId, exec.versaoId, exec.snapshot.posicao);
    if (next) {
      const base = new Date();
      try {
        await prisma.messageExecution.create({
          data: {
            campanhaId: exec.campanhaId,
            campanhaContatoId: exec.campanhaContato.id,
            stepOriginalId: next.stepOriginalId,
            versaoNumero: exec.versaoNumero,
            versaoId: exec.versaoId,
            snapshotId: next.id,
            status: "pending",
            agendadoPara: computeAgendadoPara(base, next),
          },
        });
        await prisma.campanhaContato.update({
          where: { id: exec.campanhaContato.id },
          data: { stepAtualId: next.stepOriginalId, proximoEnvioEm: computeAgendadoPara(base, next) },
        });
        stats.enqueuedNext++;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (!/unique|UNIQUE/i.test(m)) throw e;
      }
    } else {
      // Fim da sequência pra esse contato.
      await prisma.campanhaContato.update({
        where: { id: exec.campanhaContato.id },
        data: { status: "concluido", proximoEnvioEm: null, stepAtualId: null },
      });
    }
  }

  return stats;
}

async function markFailed(executionId: string, erro: string) {
  await prisma.messageExecution.update({
    where: { id: executionId },
    data: { status: "failed", concluidoEm: new Date(), erroDetalhe: erro.slice(0, 2000) },
  });
}

async function findNextStep(campanhaId: string, versaoId: string, posicaoAtual: number) {
  // Pega o próximo snapshot "message" ou "wait" ativo na mesma versão.
  // Branches (branch_reply/branch_no_reply) são tratados em reply.ts.
  return prisma.campanhaStepSnapshot.findFirst({
    where: {
      versaoId,
      posicao: { gt: posicaoAtual },
      ativo: true,
      tipo: { in: ["message", "wait", "followup"] },
    },
    orderBy: { posicao: "asc" },
  });
}
