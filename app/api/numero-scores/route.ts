// GET /api/numeros/scores?names=inst1,inst2,inst3
//
// Retorna um map { instanceName → NumeroScore } para as instâncias pedidas.
// Se alguma ainda não tem métrica no DB, vem um score "default" baseado em
// "acabou de começar hoje" (útil pra UI não quebrar).
//
// Sem `names`: retorna scores de todas as instâncias que já têm métrica.

import { NextResponse } from "next/server";
import { getScores } from "@/lib/numero-score";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const namesParam = url.searchParams.get("names");
  let names: string[];
  if (namesParam) {
    names = namesParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    const all = await prisma.numeroMetrics.findMany({
      select: { instanceName: true },
    });
    names = all.map((r) => r.instanceName);
  }
  const scores = await getScores(names);
  return NextResponse.json({ scores });
}
