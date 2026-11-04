// GET /api/warmup/sessions/[id]/messages?limit=50
// Histórico recente da sessão (do mais novo pro mais antigo).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const items = await prisma.warmupMessage.findMany({
    where: { sessionId: params.id },
    orderBy: { enviadoEm: "desc" },
    take: limit,
  });
  return NextResponse.json({ items });
}
