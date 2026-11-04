import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/campanha-serde";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const c = await prisma.campanha.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(toDTO(c));
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  for (const k of [
    "nome",
    "status",
    "delayMin",
    "delayMax",
    "delayEntreBlocos",
    "limitePorHora",
    "total",
    "enviadas",
    "falhas",
    "modo",
    "dripLotePorDia",
    "dripDiasSemana",
    "dripHoraInicio",
    "dripHoraFim",
    "dripUltimaDataExecutada",
    "rating",
    "ratingComment",
  ]) {
    if (k in body) data[k] = body[k];
  }

  if ("instanceNames" in body)
    data.instanceNames = JSON.stringify(body.instanceNames);
  if ("messages" in body) data.messages = JSON.stringify(body.messages);
  if ("resultados" in body) data.resultados = JSON.stringify(body.resultados);
  if ("agendadoPara" in body)
    data.agendadoPara = body.agendadoPara ? new Date(body.agendadoPara) : null;
  if ("iniciadaEm" in body)
    data.iniciadaEm = body.iniciadaEm ? new Date(body.iniciadaEm) : null;
  if ("concluidaEm" in body)
    data.concluidaEm = body.concluidaEm ? new Date(body.concluidaEm) : null;

  const updated = await prisma.campanha
    .update({ where: { id: params.id }, data })
    .catch(() => null);
  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(toDTO(updated));
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.campanha.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
