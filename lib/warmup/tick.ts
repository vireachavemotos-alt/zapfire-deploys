// Scheduler loop do aquecimento. Singleton via globalThis pra sobreviver
// HMR do Next. Tick a cada 60s — mais que isso vira bot pra Evolution.

import { warmupTick } from "@/lib/warmup/dispatch";

const TICK_MS = 60_000;

interface WarmupState {
  interval: NodeJS.Timeout | null;
  running: boolean;
  startedAt: number;
}

const g = globalThis as unknown as { __zapfireWarmup?: WarmupState };

async function tick(state: WarmupState) {
  if (state.running) return;
  state.running = true;
  try {
    const stats = await warmupTick();
    if (stats.enviadas || stats.falhas) {
      console.log("[Warmup] tick:", stats);
    }
  } catch (e) {
    console.error("[Warmup] tick falhou:", e);
  } finally {
    state.running = false;
  }
}

export function ensureWarmup() {
  if (g.__zapfireWarmup?.interval) return;
  const state: WarmupState = { interval: null, running: false, startedAt: Date.now() };
  state.interval = setInterval(() => void tick(state), TICK_MS);
  g.__zapfireWarmup = state;
  console.log(`[Warmup] Iniciado (tick ${TICK_MS / 1000}s, pid=${process.pid})`);
  void tick(state);
}
