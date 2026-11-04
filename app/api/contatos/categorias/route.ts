// GET /api/contatos/categorias
// Lista todas as categorias distintas existentes no banco, com contagem.
// Usado pra popular dropdown de filtro e sugerir nas modais de importação.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  // Prisma SQLite suporta groupBy
  const rows = await prisma.contato.groupBy({
    by: ["categoria"],
    _count: { _all: true },
    orderBy: { _count: { categoria: "desc" } },
  });

  const items = rows.map((r) => ({
    categoria: r.categoria, // pode ser null
    count: r._count._all,
  }));

  // Total geral pra UI mostrar "todos (N)"
  const total = items.reduce((acc, r) => acc + r.count, 0);
  const semCategoria = items.find((i) => i.categoria === null)?.count || 0;

  return NextResponse.json({
    total,
    semCategoria,
    items: items.filter((i) => i.categoria !== null) as Array<{
      categoria: string;
      count: number;
    }>,
  });
}
