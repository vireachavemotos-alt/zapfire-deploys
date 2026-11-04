// Suppression list global — consultada antes de QUALQUER envio
// (legacy ou orquestrador). Reusa a tabela ContatoBloqueado:
// um registro ativo (validoAte NULL ou futuro) significa bloqueado.
//
// Chamada em hot-path, então mantém cache em memória de 60s por
// telefone pra evitar hit no DB a cada envio dentro de um lote.

import { prisma } from "./db";
import { phoneVariants } from "./phone";

const TTL_MS = 60 * 1000;

interface CacheEntry {
  blocked: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): boolean | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.blocked;
}

function cacheSet(key: string, blocked: boolean): void {
  cache.set(key, { blocked, expiresAt: Date.now() + TTL_MS });
}

/**
 * True se o telefone tem bloqueio ativo. Checa as duas formas do 9º dígito
 * para evitar que um cadastro "551188887766" burle um bloqueio sobre
 * "5511988887766" (ou vice-versa).
 */
export async function isSuppressed(telefone: string): Promise<boolean> {
  const variants = phoneVariants(telefone);
  if (variants.length === 0) return false;

  // Cache lookup — se qualquer variante tiver resposta cached, usa.
  for (const v of variants) {
    const cached = cacheGet(v);
    if (cached !== null) return cached;
  }

  const now = new Date();
  const found = await prisma.contatoBloqueado.findFirst({
    where: {
      telefone: { in: variants },
      OR: [{ validoAte: null }, { validoAte: { gt: now } }],
    },
    select: { telefone: true },
  });

  const blocked = !!found;
  // Preenche cache pra ambas as variantes — resposta é a mesma.
  for (const v of variants) cacheSet(v, blocked);
  return blocked;
}

/** Invalida cache (útil quando a UI acabou de criar/remover bloqueio). */
export function invalidateSuppressionCache(telefone?: string): void {
  if (!telefone) {
    cache.clear();
    return;
  }
  for (const v of phoneVariants(telefone)) cache.delete(v);
}
