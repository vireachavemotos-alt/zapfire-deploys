// Scheduler em memória para campanhas agendadas.
//
// A cada TICK_MS:
//   SELECT * FROM campanha WHERE status='agendada' AND agendadoPara <= NOW()
//   Para cada hit: dispara runCampaignFromDb() em background (fire-and-forget).
//
// Garantias / limitações:
// - Reinício do servidor não perde campanhas: o DB é a fonte de verdade. Na
//   próxima tick o scheduler redescobre tudo que deveria ter rodado.
// - Concorrência: runCampaignFromDb() faz um UPDATE status='em_execucao' antes
//   de enviar, então mesmo que o mesmo id apareça em duas ticks o segundo noop.
// - Singleton: ensureScheduler() guarda o interval em globalThis pra sobreviver
//   HMR do Next.

import { prisma } from "@/lib/db";
import { runCampaignFromDb } from "@/lib/campaign-runner";
import { evaluateDrip } from "@/lib/drip";

const TICK_MS = 30_000; // 30s — bom balanço entre precisão e carga.

// Cap de concorrência global. e2-micro (1GB RAM) aguenta ~3 runners ativos
// sem OOM; mais que isso derrubava o container, que no reinício pausava
// TUDO. Se chegar mais campanhas simultâneas elas esperam o próximo tick.
const MAX_PARALLEL = 3;

interface SchedulerState {
  interval: NodeJS.Timeout | null;
  processing: Set<string>;
  startedAt: number;
}

const g = globalThis as unknown as { __zapfireScheduler?: SchedulerState };

async function tick(state: SchedulerState) {
  try {
    const now = new Date();

    // ── 1) Campanhas agendadas comuns (agendada → em_execucao) ──────────
    const due = await prisma.campanha.findMany({
      where: {
        status: "agendada",
        agendadoPara: { lte: now },
      },
      select: { id: true, nome: true, agendadoPara: true },
    });
    for (const c of due) {
      if (state.processing.has(c.id)) continue;
      if (state.processing.size >= MAX_PARALLEL) {
        console.log(
          `[Scheduler] MAX_PARALLEL=${MAX_PARALLEL} atingido, "${c.nome}" aguarda próximo tick`
        );
        break;
      }
      state.processing.add(c.id);
      console.log(
        `[Scheduler] Disparando "${c.nome}" (${c.id}) — agendada para ${c.agendadoPara?.toISOString()}`
      );
      runCampaignFromDb(c.id)
        .catch((err) => {
          console.error(`[Scheduler] Falha em ${c.id}:`, err);
        })
        .finally(() => {
          state.processing.delete(c.id);
        });
    }

    // ── 2) Campanhas drip pausadas: re-ativar quando entrar na janela ──
    // Buscamos drips em status='pausada' que ainda têm contatos pra
    // processar, e checamos se hoje é dia ativo dentro da janela horária
    // E ainda não rodou hoje (dripUltimaDataExecutada != hoje).
    const drips = await prisma.campanha.findMany({
      where: { modo: "drip", status: "pausada" },
      select: {
        id: true,
        nome: true,
        total: true,
        enviadas: true,
        falhas: true,
        dripLotePorDia: true,
        dripDiasSemana: true,
        dripHoraInicio: true,
        dripHoraFim: true,
        dripUltimaDataExecutada: true,
      },
    });
    for (const c of drips) {
      // Se já mandou todo mundo (ok+erro >= total), não acorda mais.
      if (c.total > 0 && c.enviadas + c.falhas >= c.total) continue;
      if (state.processing.has(c.id)) continue;

      const ds = evaluateDrip(
        {
          lotePorDia: c.dripLotePorDia,
          diasSemana: c.dripDiasSemana,
          horaInicio: c.dripHoraInicio,
          horaFim: c.dripHoraFim,
          ultimaDataExecutada: c.dripUltimaDataExecutada,
        },
        now
      );
      if (!ds.diaAtivo || !ds.dentroJanela || ds.jaRodouHoje) continue;

      // ANTES marcávamos `dripUltimaDataExecutada=hoje` AQUI, antes de
      // disparar, pra não re-triggar. Mas isso anulava o re-boot: se o
      // runner caía logo depois (OOM, Prisma init, etc), o campo ficava
      // marcado e a campanha nunca mais rodava no dia. Agora quem marca é
      // o próprio runner, só depois do primeiro envio OK — e aqui o
      // guard contra duplo-trigger é o `state.processing` (set em memória).
      if (state.processing.has(c.id)) continue;
      if (state.processing.size >= MAX_PARALLEL) {
        console.log(`[Scheduler] MAX_PARALLEL=${MAX_PARALLEL} drip "${c.nome}" espera`);
        break;
      }
      state.processing.add(c.id);
      console.log(
        `[Scheduler] Drip "${c.nome}" (${c.id}) entrando em janela — retomando lote diário (${c.dripLotePorDia})`
      );
      runCampaignFromDb(c.id)
        .catch((err) => {
          console.error(`[Scheduler] Drip falhou em ${c.id}:`, err);
        })
        .finally(() => {
          state.processing.delete(c.id);
        });
    }
  } catch (err) {
    // Nunca deixa o interval morrer por causa de um erro pontual no tick.
    console.error("[Scheduler] Erro no tick:", err);
  }
}

/**
 * Recupera campanhas que ficaram órfãs em 'em_execucao' depois de um crash
 * do servidor (o runner morreu no meio do loop). Marcamos como 'pausada' pra
 * o usuário poder revisar e retomar manualmente.
 *
 * HEARTBEAT: cada envio feito pelo runner atualiza `Campanha.atualizadoEm`
 * (via @updatedAt do Prisma). Se o update é recente (<HEARTBEAT_MS atrás),
 * assumimos que o runner está vivo e não mexemos. Isso evita o bug clássico
 * em que o scheduler reinicia (HMR, deploy, ensureScheduler chamada de novo)
 * e MATA campanhas que estavam rodando normalmente — foi exatamente o que
 * fazia os disparos "pararem direto" sem motivo aparente.
 */
const HEARTBEAT_MS = 2 * 60 * 1000; // 2 min sem update = provavelmente morta

async function recoverOrphans() {
  try {
    const cutoff = new Date(Date.now() - HEARTBEAT_MS);
    const result = await prisma.campanha.updateMany({
      where: { status: "em_execucao", atualizadoEm: { lt: cutoff } },
      data: { status: "pausada" },
    });
    if (result.count > 0) {
      console.log(
        `[Scheduler] Recovery: ${result.count} campanha(s) sem heartbeat há >${HEARTBEAT_MS / 1000}s marcadas como pausada.`
      );
    }
  } catch (err) {
    console.error("[Scheduler] Falha no recovery de órfãs:", err);
  }
}

export function ensureScheduler() {
  if (g.__zapfireScheduler?.interval) return;

  const state: SchedulerState = {
    interval: null,
    processing: new Set<string>(),
    startedAt: Date.now(),
  };

  state.interval = setInterval(() => {
    void tick(state);
  }, TICK_MS);

  g.__zapfireScheduler = state;

  // Antes do primeiro tick: recupera órfãs do boot anterior. Só depois checa
  // campanhas agendadas.
  (async () => {
    await recoverOrphans();
    await tick(state);
  })();

  console.log(
    `[Scheduler] Iniciado (tick a cada ${TICK_MS / 1000}s, pid=${process.pid})`
  );
}

export function stopScheduler() {
  const s = g.__zapfireScheduler;
  if (s?.interval) {
    clearInterval(s.interval);
    s.interval = null;
  }
}
