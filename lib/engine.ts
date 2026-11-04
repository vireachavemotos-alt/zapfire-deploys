// Switch entre runner legado (campaign-runner.ts) e orquestrador novo.
//
// Enquanto estiver `legacy`, o fluxo atual roda sem alteração: scheduler
// chama runCampaignFromDb, snapshot da lista é a fonte da verdade,
// MessageBlock[] vive em Campanha.messages.
//
// Quando migrada pra `orchestrator`, a campanha passa a ter steps
// explícitos (CampanhaStep + snapshots versionados) e execuções por
// contato × step com idempotência de banco.
//
// Esse arquivo é só o PONTO DE DECISÃO. Nenhum caller deve ler
// `campanha.engine` diretamente — sempre via getEngine().

export type Engine = "legacy" | "orchestrator";

/** Qualquer objeto que carregue (ou não) o campo `engine`. */
interface MaybeHasEngine {
  engine?: string | null;
}

/**
 * Retorna o engine ativo. Default é `legacy` — campanhas antigas e
 * novas feitas pela UI atual continuam no runner que já funciona.
 */
export function getEngine(campanha: MaybeHasEngine | null | undefined): Engine {
  const raw = campanha?.engine;
  return raw === "orchestrator" ? "orchestrator" : "legacy";
}
