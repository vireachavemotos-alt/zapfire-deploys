// Serialização Campanha <-> DB row.
// No schema guardamos instanceNames/messages/resultados/listaSnapshot como JSON text.

import type { Campanha as CampanhaDB } from "@prisma/client";
import type { MessageBlock } from "./message";

export interface CampanhaDTO {
  id: string;
  nome: string;
  status: string;
  instanceNames: string[];
  listaId: string | null;
  listaSnapshot: unknown;
  messages: MessageBlock[];
  delayMin: number;
  delayMax: number;
  delayEntreBlocos: number;
  limitePorHora: number;
  total: number;
  enviadas: number;
  falhas: number;
  resultados: Array<{
    numero: string;
    status: "ok" | "erro" | "pulado";
    detail?: string;
    timestamp?: string;
  }>;
  agendadoPara: string | null;
  criadaEm: string;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  // Drip / programado
  modo: "imediato" | "drip";
  dripLotePorDia: number;
  /** ISO-8601 weekday CSV: "1,2,3,4,5" (1=seg..7=dom). Vazio = qualquer dia. */
  dripDiasSemana: string;
  dripHoraInicio: string; // "HH:MM"
  dripHoraFim: string;    // "HH:MM"
  dripUltimaDataExecutada: string; // "YYYY-MM-DD" ou ""
  // Avaliação pós-conclusão
  rating: number | null;
  ratingComment: string | null;
  /** Engine ativo do runtime: 'legacy' (runner clássico) ou 'orchestrator'. */
  engine: "legacy" | "orchestrator";
  versaoAtual: number;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toDTO(c: CampanhaDB): CampanhaDTO {
  return {
    id: c.id,
    nome: c.nome,
    status: c.status,
    instanceNames: parseJson<string[]>(c.instanceNames, []),
    listaId: c.listaId,
    listaSnapshot: parseJson<unknown>(c.listaSnapshot, null),
    messages: parseJson<MessageBlock[]>(c.messages, []),
    delayMin: c.delayMin,
    delayMax: c.delayMax,
    delayEntreBlocos: c.delayEntreBlocos,
    limitePorHora: c.limitePorHora,
    total: c.total,
    enviadas: c.enviadas,
    falhas: c.falhas,
    resultados: parseJson(c.resultados, []),
    agendadoPara: c.agendadoPara?.toISOString() ?? null,
    criadaEm: c.criadoEm.toISOString(),
    iniciadaEm: c.iniciadaEm?.toISOString() ?? null,
    concluidaEm: c.concluidaEm?.toISOString() ?? null,
    modo: (c.modo === "drip" ? "drip" : "imediato") as "imediato" | "drip",
    dripLotePorDia: c.dripLotePorDia,
    dripDiasSemana: c.dripDiasSemana,
    dripHoraInicio: c.dripHoraInicio,
    dripHoraFim: c.dripHoraFim,
    dripUltimaDataExecutada: c.dripUltimaDataExecutada,
    rating: c.rating ?? null,
    ratingComment: c.ratingComment ?? null,
    engine: (c.engine === "orchestrator" ? "orchestrator" : "legacy") as "legacy" | "orchestrator",
    versaoAtual: c.versaoAtual ?? 1,
  };
}
