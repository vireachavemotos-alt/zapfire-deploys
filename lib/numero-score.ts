// Score de aquecimento por número (instância Evolution).
//
// Ideia: chip novo precisa ser "aquecido" — mandar pouco no dia 1,
// ir crescendo até normalizar por volta do dia 14-30. Misturamos isso
// com a taxa de sucesso (failure rate alto derruba score) pra gerar:
//
//   score:     0..100 — saúde geral. 100 = veterano com alta entregabilidade
//   capacidadeHoje: envios sugeridos pro dia (warming curve × score factor)
//   restanteHoje:   capacidadeHoje − enviadasHoje (quanto ainda pode mandar)
//   delaySugerido:  {min,max} em ms, mais conservador pra score baixo
//
// Curva de aquecimento (diária, sem score ruim):
//   dia 0-1 → 20
//   dia 2-3 → 40
//   dia 4-7 → 80
//   dia 8-14 → 200
//   dia 15-29 → 500
//   dia ≥30 → 1000
//
// Degradação por taxa de falha:
//   fail% < 5   → fator 1.00
//   fail% < 15  → fator 0.75
//   fail% < 30  → fator 0.50
//   fail% ≥ 30  → fator 0.25

import { prisma } from "./db";

export interface NumeroMetricsData {
  instanceName: string;
  primeiroUsoEm: Date;
  ultimoUsoEm: Date;
  totalEnviadas: number;
  totalFalhas: number;
  diaRef: string;
  enviadasHoje: number;
  falhasHoje: number;
}

export interface NumeroScore {
  instanceName: string;
  /** 0..100 */
  score: number;
  /** Idade em dias desde o primeiro envio. */
  idadeDias: number;
  /** Taxa de falha lifetime em % (0..100). */
  failureRate: number;
  /** Sends totais (OK) na vida. */
  totalEnviadas: number;
  /** Cap sugerido pro dia atual (pós aquecimento + score). */
  capacidadeHoje: number;
  /** Quanto ainda pode mandar hoje. Pode ser 0. */
  restanteHoje: number;
  /** Já usou mais do que o sugerido hoje. */
  estouradoHoje: boolean;
  enviadasHoje: number;
  falhasHoje: number;
  /** Delay recomendado (ms) entre envios, dado o score. */
  delaySugerido: { min: number; max: number };
  /** Classificação textual pra UI. */
  tier: "novo" | "aquecendo" | "estavel" | "veterano" | "degradado";
}

export function todayKey(d: Date = new Date()): string {
  // YYYY-MM-DD local — simples e bom pra comparar.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function warmingCap(idadeDias: number): number {
  if (idadeDias <= 1) return 20;
  if (idadeDias <= 3) return 40;
  if (idadeDias <= 7) return 80;
  if (idadeDias <= 14) return 200;
  if (idadeDias <= 29) return 500;
  return 1000;
}

function scoreFactor(failureRatePct: number): number {
  if (failureRatePct < 5) return 1.0;
  if (failureRatePct < 15) return 0.75;
  if (failureRatePct < 30) return 0.5;
  return 0.25;
}

/** 0..100. 50 base, +ageBonus até 30, −failurePenalty até 40. */
function calcScore(idadeDias: number, failureRatePct: number): number {
  const ageBonus = Math.min(30, idadeDias * 2); // 15 dias = 30 pts
  let penalty = 0;
  if (failureRatePct >= 30) penalty = 40;
  else if (failureRatePct >= 15) penalty = 25;
  else if (failureRatePct >= 5) penalty = 10;
  const score = 50 + ageBonus - penalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function tierFor(score: number, idadeDias: number, failureRate: number): NumeroScore["tier"] {
  if (failureRate >= 30) return "degradado";
  if (idadeDias < 3) return "novo";
  if (idadeDias < 14) return "aquecendo";
  if (score >= 80) return "veterano";
  return "estavel";
}

function delayFor(score: number): { min: number; max: number } {
  // Score baixo = delay mais alto (mais devagar, cauteloso).
  if (score >= 80) return { min: 8_000, max: 20_000 };
  if (score >= 60) return { min: 12_000, max: 30_000 };
  if (score >= 40) return { min: 20_000, max: 45_000 };
  return { min: 30_000, max: 75_000 };
}

export function computeScore(m: NumeroMetricsData): NumeroScore {
  const now = new Date();
  const idadeMs = now.getTime() - m.primeiroUsoEm.getTime();
  const idadeDias = Math.max(0, Math.floor(idadeMs / 86_400_000));
  const totalTentativas = m.totalEnviadas + m.totalFalhas;
  const failureRate =
    totalTentativas === 0 ? 0 : (m.totalFalhas / totalTentativas) * 100;

  const score = calcScore(idadeDias, failureRate);

  // Reset lógico: se o diaRef salvo não é hoje, enviadas/falhas-hoje
  // valem zero pro cálculo (o logger vai materializar isso no DB).
  const hoje = todayKey(now);
  const enviadasHoje = m.diaRef === hoje ? m.enviadasHoje : 0;
  const falhasHoje = m.diaRef === hoje ? m.falhasHoje : 0;

  const capBase = warmingCap(idadeDias);
  const capacidadeHoje = Math.max(
    10, // piso mínimo pra nunca zerar de uma vez só por tx ruim
    Math.round(capBase * scoreFactor(failureRate))
  );
  const restanteHoje = Math.max(0, capacidadeHoje - enviadasHoje);

  return {
    instanceName: m.instanceName,
    score,
    idadeDias,
    failureRate: Math.round(failureRate * 10) / 10,
    totalEnviadas: m.totalEnviadas,
    capacidadeHoje,
    restanteHoje,
    estouradoHoje: enviadasHoje >= capacidadeHoje,
    enviadasHoje,
    falhasHoje,
    delaySugerido: delayFor(score),
    tier: tierFor(score, idadeDias, failureRate),
  };
}

/** Score "vazio" pra uma instância que ainda não tem métrica. */
export function defaultScore(instanceName: string): NumeroScore {
  return computeScore({
    instanceName,
    primeiroUsoEm: new Date(),
    ultimoUsoEm: new Date(),
    totalEnviadas: 0,
    totalFalhas: 0,
    diaRef: todayKey(),
    enviadasHoje: 0,
    falhasHoje: 0,
  });
}

/**
 * Registra um envio no banco. Upsert + reset diário automático.
 * Chamado pelo runner depois de cada tentativa.
 *
 * Nota: usamos um find→create/update em vez de upsert raw porque precisamos
 * detectar se o `diaRef` virou e resetar os contadores do dia.
 */
export async function logSend(
  instanceName: string,
  outcome: "ok" | "erro"
): Promise<void> {
  const hoje = todayKey();
  const now = new Date();
  const existing = await prisma.numeroMetrics.findUnique({
    where: { instanceName },
  });

  if (!existing) {
    await prisma.numeroMetrics.create({
      data: {
        instanceName,
        primeiroUsoEm: now,
        ultimoUsoEm: now,
        totalEnviadas: outcome === "ok" ? 1 : 0,
        totalFalhas: outcome === "erro" ? 1 : 0,
        diaRef: hoje,
        enviadasHoje: outcome === "ok" ? 1 : 0,
        falhasHoje: outcome === "erro" ? 1 : 0,
      },
    });
    return;
  }

  // Se virou o dia, zera os contadores-do-dia antes de incrementar.
  const mesmoDia = existing.diaRef === hoje;
  const baseEnv = mesmoDia ? existing.enviadasHoje : 0;
  const baseFal = mesmoDia ? existing.falhasHoje : 0;

  await prisma.numeroMetrics.update({
    where: { instanceName },
    data: {
      ultimoUsoEm: now,
      totalEnviadas:
        outcome === "ok"
          ? existing.totalEnviadas + 1
          : existing.totalEnviadas,
      totalFalhas:
        outcome === "erro"
          ? existing.totalFalhas + 1
          : existing.totalFalhas,
      diaRef: hoje,
      enviadasHoje: outcome === "ok" ? baseEnv + 1 : baseEnv,
      falhasHoje: outcome === "erro" ? baseFal + 1 : baseFal,
    },
  });
}

/** Score de uma instância. Retorna default quando ainda não tem métrica. */
export async function getScore(instanceName: string): Promise<NumeroScore> {
  const m = await prisma.numeroMetrics.findUnique({
    where: { instanceName },
  });
  if (!m) return defaultScore(instanceName);
  return computeScore(m);
}

/** Scores em batch (pra listagem na UI). */
export async function getScores(
  instanceNames: string[]
): Promise<Record<string, NumeroScore>> {
  if (!instanceNames.length) return {};
  const rows = await prisma.numeroMetrics.findMany({
    where: { instanceName: { in: instanceNames } },
  });
  const map: Record<string, NumeroScore> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    map[r.instanceName] = computeScore(r);
    seen.add(r.instanceName);
  }
  for (const n of instanceNames) {
    if (!seen.has(n)) map[n] = defaultScore(n);
  }
  return map;
}
