// Retoma uma campanha pausada. Dispara o runner em background — a rota
// retorna imediatamente, o envio continua no process até acabar (ou pausar
// de novo, ou completar).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/campanha-serde";
import { runCampaignFromDb } from "@/lib/campaign-runner";

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
  if (atual.status !== "pausada") {
    return NextResponse.json(
      {
        error: `Só dá pra retomar campanha pausada (estado atual: ${atual.status})`,
      },
      { status: 409 }
    );
  }

  // Fire-and-forget. runCampaignFromDb faz a transição pausada → em_execucao
  // atomicamente logo no início, então se dois /resume chegarem juntos só um
  // pega o lock.
  runCampaignFromDb(params.id).catch((err) => {
    console.error(`[/resume] Falha no runner ${params.id}:`, err);
  });

  // Retorna o estado "pausada" (vai virar em_execucao em milissegundos no DB,
  // mas o cliente pode dar um reload pra ver).
  const refreshed = await prisma.campanha.findUnique({
    where: { id: params.id },
  });
  return NextResponse.json(refreshed ? toDTO(refreshed) : null);
}
