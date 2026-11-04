// Pool de frases pro aquecimento. Pega aleatório da `WarmupFrase`
// ativa, incrementa `usos`. Opcionalmente filtra por categoria.

import { prisma } from "@/lib/db";

export type Categoria = "saudacao" | "pergunta" | "resposta" | "geral";

export async function pickFrase(
  categoria?: Categoria,
  excludeId?: string | null
): Promise<{ id: string; texto: string } | null> {
  const where: Record<string, unknown> = {
    ativa: true,
    ...(categoria ? { categoria } : {}),
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
  const total = await prisma.warmupFrase.count({ where });
  if (total === 0) {
    // Se filtrar por excludeId deixou vazio, cai pro pool completo (sem excludeId).
    if (excludeId) return pickFrase(categoria, null);
    return null;
  }
  const skip = Math.floor(Math.random() * total);
  const [f] = await prisma.warmupFrase.findMany({ where, skip, take: 1 });
  if (!f) return null;
  // Incrementa usos em fire-and-forget — perder isso num DB blip não é fim de mundo.
  prisma.warmupFrase
    .update({ where: { id: f.id }, data: { usos: { increment: 1 } } })
    .catch(() => {});
  return { id: f.id, texto: f.texto };
}
