// Blacklist temporária de números.
//
// Auto-block: quando um número falha N vezes seguidas dentro de uma janela
// curta (24h), o runner adiciona aqui por 7 dias. Próximas campanhas pulam
// esses números como "pulado", sem gastar delay nem cota da instância.
//
// Manual: usuário pode adicionar/remover via UI também.

import { prisma } from "./db";

/** Default: bloqueia por 7 dias quando o runner detecta falhas seguidas. */
export const AUTO_BLOCK_DAYS = 7;
/** Quantas falhas em campanhas distintas/janela 24h dispara o auto-block. */
export const AUTO_BLOCK_THRESHOLD = 3;

export type BloqueioOrigem = "auto" | "manual" | "optout";

export interface BloqueioInput {
  telefone: string; // só dígitos, E.164 sem +
  motivo: string;
  falhas?: number;
  /** auto = runner marcou por falhas; manual = usuário botou; optout = contato pediu pra sair (sempre permanente). */
  origem?: BloqueioOrigem;
  /** Quantos dias permanece. 0 ou negativo = permanente. */
  diasValidade?: number;
}

/**
 * Marca um ou mais números como opt-out global (contato pediu pra sair).
 * Sempre permanente. Nunca é removido automaticamente — só manual via UI.
 * Idempotente: se já existir qualquer bloqueio pro número, converte em optout.
 */
export async function suprimirNumeros(
  telefones: string[],
  motivo = "Contato pediu para sair"
): Promise<{ adicionados: number; jaEraOptOut: number; invalidos: number }> {
  const normalizar = (t: string) => t.replace(/\D/g, "");
  const limpos = Array.from(
    new Set(telefones.map(normalizar).filter((t) => t.length >= 10))
  );
  const invalidos = telefones.length - limpos.length;
  if (limpos.length === 0) {
    return { adicionados: 0, jaEraOptOut: 0, invalidos };
  }

  const existentes = await prisma.contatoBloqueado.findMany({
    where: { telefone: { in: limpos } },
    select: { telefone: true, origem: true },
  });
  const mapExist = new Map(existentes.map((e) => [e.telefone, e.origem]));

  let adicionados = 0;
  let jaEraOptOut = 0;

  await prisma.$transaction(
    limpos.map((tel) => {
      const atual = mapExist.get(tel);
      if (atual === "optout") {
        jaEraOptOut++;
        return prisma.contatoBloqueado.update({
          where: { telefone: tel },
          data: { motivo, validoAte: null },
        });
      }
      adicionados++;
      return prisma.contatoBloqueado.upsert({
        where: { telefone: tel },
        create: {
          telefone: tel,
          motivo,
          origem: "optout",
          validoAte: null,
          falhas: 0,
        },
        update: {
          motivo,
          origem: "optout",
          validoAte: null,
        },
      });
    })
  );

  return { adicionados, jaEraOptOut, invalidos };
}

/** Adiciona/atualiza bloqueio. Idempotente — se já existir, refresha o motivo + datas. */
export async function bloquearNumero(input: BloqueioInput): Promise<void> {
  const tel = input.telefone.replace(/\D/g, "");
  if (!tel) return;
  const dias = input.diasValidade ?? AUTO_BLOCK_DAYS;
  const validoAte =
    dias > 0 ? new Date(Date.now() + dias * 86_400_000) : null;

  await prisma.contatoBloqueado.upsert({
    where: { telefone: tel },
    create: {
      telefone: tel,
      motivo: input.motivo,
      falhas: input.falhas ?? 0,
      origem: input.origem ?? "auto",
      validoAte,
    },
    update: {
      motivo: input.motivo,
      falhas: input.falhas ?? 0,
      origem: input.origem ?? "auto",
      validoAte,
    },
  });
}

export async function desbloquearNumero(telefone: string): Promise<boolean> {
  const tel = telefone.replace(/\D/g, "");
  if (!tel) return false;
  const r = await prisma.contatoBloqueado
    .delete({ where: { telefone: tel } })
    .catch(() => null);
  return r !== null;
}

/** Devolve o conjunto de telefones ativos no blacklist (validoAte > now ou NULL). */
export async function listarBloqueadosAtivos(): Promise<Set<string>> {
  const now = new Date();
  const rows = await prisma.contatoBloqueado.findMany({
    where: {
      OR: [{ validoAte: null }, { validoAte: { gt: now } }],
    },
    select: { telefone: true },
  });
  return new Set(rows.map((r) => r.telefone));
}

/** Listagem completa (com expirados também) — pra UI mostrar histórico. */
export async function listarTodos() {
  const rows = await prisma.contatoBloqueado.findMany({
    orderBy: { bloqueadoEm: "desc" },
    take: 500,
  });
  const now = new Date();
  return rows.map((r) => ({
    telefone: r.telefone,
    motivo: r.motivo,
    falhas: r.falhas,
    origem: r.origem as BloqueioOrigem,
    bloqueadoEm: r.bloqueadoEm.toISOString(),
    validoAte: r.validoAte?.toISOString() ?? null,
    ativo: !r.validoAte || r.validoAte > now,
  }));
}

/**
 * Conta falhas recentes (últimas 24h) deste telefone em qualquer campanha
 * concluída/em-execução. Usado pelo runner pra decidir se vai auto-bloquear.
 */
export async function contarFalhasRecentes(
  telefoneSemDigitos: string,
  janelaHoras = 24
): Promise<number> {
  const tel = telefoneSemDigitos.replace(/\D/g, "");
  if (!tel) return 0;
  const desde = new Date(Date.now() - janelaHoras * 3_600_000);
  // Resultados moram como JSON em Campanha.resultados — a gente
  // varre as campanhas com atualização recente e conta.
  const campanhas = await prisma.campanha.findMany({
    where: { atualizadoEm: { gte: desde } },
    select: { resultados: true },
  });
  let count = 0;
  for (const c of campanhas) {
    if (!c.resultados) continue;
    let arr: unknown;
    try {
      arr = JSON.parse(c.resultados);
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      if (!r || typeof r !== "object") continue;
      const item = r as { numero?: string; status?: string; timestamp?: string };
      if (item.status !== "erro") continue;
      if (item.numero?.replace(/\D/g, "") !== tel) continue;
      // Filtra por timestamp se existir
      if (item.timestamp) {
        const ts = new Date(item.timestamp);
        if (ts < desde) continue;
      }
      count++;
    }
  }
  return count;
}
