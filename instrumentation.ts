// Next.js Instrumentation Hook — roda uma vez por process quando o server sobe.
// Aqui arrancamos o scheduler in-memory que dispara campanhas agendadas.
// Só fazemos isso em runtime Node (edge runtime não tem filesystem/setInterval
// de longa duração).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureScheduler } = await import("./lib/scheduler");
    ensureScheduler();
    const { ensureOrchestrator } = await import("./lib/orchestrator/tick");
    ensureOrchestrator();
    const { ensureWarmup } = await import("./lib/warmup/tick");
    ensureWarmup();
  }
}
