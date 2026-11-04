// Helpers para campanhas em modo "drip" (programado).
//
// Conceito: em vez de disparar 500 contatos de uma vez, o usuário define
// `dripLotePorDia` (ex: 20) + dias da semana ativos + janela horária
// (09:00-18:00). A cada dia válido o scheduler re-ativa a campanha;
// o runner dispara até bater o lote ou sair da janela e auto-pausa.
//
// Tudo em horário LOCAL do servidor — sem timezone fancy.

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=seg..7=dom (ISO-8601)

/** Converte Date JS (Sun=0..Sat=6) pro padrão ISO (Mon=1..Sun=7). */
export function isoWeekday(d: Date = new Date()): Weekday {
  const js = d.getDay(); // 0=dom..6=sáb
  return (js === 0 ? 7 : js) as Weekday;
}

/** "YYYY-MM-DD" local. */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Converte "HH:MM" → minutos desde meia-noite. Retorna NaN se inválido. */
export function hhmmToMinutes(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return NaN;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

/** Minutos desde meia-noite, hora local. */
export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Parse "1,2,3,4,5" → Set<Weekday>. String vazia = todos os dias. */
export function parseDiasSemana(csv: string): Set<Weekday> {
  const all = new Set<Weekday>([1, 2, 3, 4, 5, 6, 7]);
  if (!csv || !csv.trim()) return all;
  const out = new Set<Weekday>();
  for (const p of csv.split(",")) {
    const n = parseInt(p.trim(), 10);
    if (n >= 1 && n <= 7) out.add(n as Weekday);
  }
  return out.size === 0 ? all : out;
}

export interface DripConfig {
  lotePorDia: number;
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  ultimaDataExecutada: string;
}

export interface DripStatus {
  /** Hoje é um dia ativo? */
  diaAtivo: boolean;
  /** Dentro da janela horária? */
  dentroJanela: boolean;
  /** Já rodou hoje (impede re-trigger pelo scheduler no mesmo dia). */
  jaRodouHoje: boolean;
  /** Descrição curta do motivo atual. */
  motivo: string;
  /** Minutos até próxima janela (aprox, só pra UI). Infinity se não couber estimar. */
  proximaJanelaEmMin: number;
}

/** Avalia se um drip deveria estar rodando agora. */
export function evaluateDrip(cfg: DripConfig, now: Date = new Date()): DripStatus {
  const wd = isoWeekday(now);
  const dias = parseDiasSemana(cfg.diasSemana);
  const diaAtivo = dias.has(wd);
  const start = hhmmToMinutes(cfg.horaInicio);
  // "00:00" como fim do dia é 24h, não 0h — usuários digitam isso pra "até
  // meia-noite" quando criam a campanha. Trataríamos como "janela nunca
  // válida" (start > end = 0) e a campanha ficaria pausada eternamente.
  const endRaw = hhmmToMinutes(cfg.horaFim);
  const end = endRaw === 0 ? 24 * 60 : endRaw;
  const nowMin = nowMinutes(now);
  const janelaValida = !isNaN(start) && !isNaN(end) && start < end;
  const dentroJanela = janelaValida && nowMin >= start && nowMin < end;
  const jaRodouHoje = cfg.ultimaDataExecutada === todayKey(now);

  let motivo = "pronto para rodar";
  if (!diaAtivo) motivo = "dia da semana fora da programação";
  else if (!janelaValida) motivo = "janela horária inválida";
  else if (!dentroJanela) motivo = nowMin < start ? "antes do horário de início" : "após o horário de fim";
  else if (jaRodouHoje) motivo = "já executou hoje, aguarda próximo dia ativo";

  // Estimativa de próxima janela: se hoje ainda vai abrir, faltam `start - nowMin`.
  // Senão procura o próximo dia ativo dentro dos próximos 7 dias.
  let proxMin = Infinity;
  if (diaAtivo && janelaValida && nowMin < start && !jaRodouHoje) {
    proxMin = start - nowMin;
  } else if (janelaValida) {
    for (let k = 1; k <= 7; k++) {
      const d = new Date(now);
      d.setDate(d.getDate() + k);
      if (dias.has(isoWeekday(d))) {
        // minutos até meia-noite de hoje + dias cheios + start
        const minsAteMeiaNoite = 24 * 60 - nowMin;
        proxMin = minsAteMeiaNoite + (k - 1) * 24 * 60 + start;
        break;
      }
    }
  }

  return { diaAtivo, dentroJanela, jaRodouHoje, motivo, proximaJanelaEmMin: proxMin };
}

/** Conta quantos sends (ok + erro) aconteceram hoje dentro da lista de resultados. */
export function contarEnviadosHoje(
  resultados: Array<{ status: string; timestamp?: string }>,
  now: Date = new Date()
): number {
  const hoje = todayKey(now);
  let c = 0;
  for (const r of resultados) {
    if (r.status !== "ok" && r.status !== "erro") continue;
    if (!r.timestamp) continue;
    const dt = new Date(r.timestamp);
    if (todayKey(dt) === hoje) c++;
  }
  return c;
}

/** Labels pros dias da semana (ISO 1..7). */
export const WEEKDAY_LABEL: Record<number, { curto: string; longo: string }> = {
  1: { curto: "Seg", longo: "Segunda" },
  2: { curto: "Ter", longo: "Terça" },
  3: { curto: "Qua", longo: "Quarta" },
  4: { curto: "Qui", longo: "Quinta" },
  5: { curto: "Sex", longo: "Sexta" },
  6: { curto: "Sáb", longo: "Sábado" },
  7: { curto: "Dom", longo: "Domingo" },
};

/** Presets prontos pra UI. */
export const DRIP_PRESETS: Record<string, { label: string; csv: string }> = {
  todos: { label: "Todos os dias", csv: "1,2,3,4,5,6,7" },
  uteis: { label: "Dias úteis (Seg-Sex)", csv: "1,2,3,4,5" },
  alternado: { label: "Dia sim, dia não (Seg/Qua/Sex)", csv: "1,3,5" },
  finaisSemana: { label: "Só fim de semana", csv: "6,7" },
};
