// Scheduler do orquestrador — roda em paralelo com o `lib/scheduler.ts`
// legado. Toca 2 workers: dispatch (envia messages) + reply (correlaciona
// inbound). Singleton via globalThis pra sobreviver HMR.

import { dispatchDue } from "@/lib/orchestrator/dispatch";
import { processInboundQueue } from "@/lib/orchestrator/reply";

const TICK_MS = 10_000; // 10s — orquestrador vai mais rápido que o legado

interface OrcState {
  interval: NodeJS.Timeout | null;
  running: boolean;
  startedAt: number;
}

const g = globalThis as unknown as { __zapfireOrchestrator?: OrcState };

async function tick(state: OrcState) {
  if (state.running) return; // tick anterior ainda rodando, pula
  state.running = true;
  try {
    const [dispatchStats, replyStats] = await Promise.all([
      dispatchDue({ batch: 10 }).catch((e) => {
        console.error("[Orchestrator] dispatch falhou:", e);
        return null;
      }),
      processInboundQueue({ batch: 50 }).catch((e) => {
        console.error("[Orchestrator] reply falhou:", e);
        return null;
      }),
    ]);
    if (dispatchStats && (dispatchStats.sent || dispatchStats.failed || dispatchStats.blocked)) {
      console.log("[Orchestrator] dispatch:", dispatchStats);
    }
    if (replyStats && replyStats.processadas) {
      console.log("[Orchestrator] reply:", replyStats);
    }
  } finally {
    state.running = false;
  }
}

export function ensureOrchestrator() {
  if (g.__zapfireOrchestrator?.interval) return;
  const state: OrcState = { interval: null, running: false, startedAt: Date.now() };
  state.interval = setInterval(() => void tick(state), TICK_MS);
  g.__zapfireOrchestrator = state;
  console.log(`[Orchestrator] Iniciado (tick ${TICK_MS / 1000}s, pid=${process.pid})`);
  // Primeiro tick imediato pra pegar o que tá acumulado.
  void tick(state);
}
