// Pausa uma campanha em execução. Só muda o status — o runner em curso
// detecta isso na próxima iteração e sai salvando o parcial.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/campanha-serde";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const atual = await prisma.campanha.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  });
  if (!atual) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }
  if (atual.status !== "em_execucao") {
    return NextResponse.json(
      {
        error: `Só dá pra pausar campanha em execução (estado atual: ${atual.status})`,
      },
      { status: 409 }
    );
  }

  const updated = await prisma.campanha.update({
    where: { id: params.id },
    data: { status: "pausada" },
  });
  return NextResponse.json(toDTO(updated));
}
