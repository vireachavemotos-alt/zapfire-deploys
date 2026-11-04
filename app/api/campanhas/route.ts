import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/campanha-serde";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await prisma.campanha.findMany({
    orderBy: { criadoEm: "desc" },
  });
  return NextResponse.json(items.map(toDTO));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const nome = (body.nome || "").trim();
  if (!nome) {
    return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  }

  // Snapshot da lista no momento da criação (para preservar histórico mesmo se a lista for deletada).
  let listaSnapshot: unknown = null;
  if (body.listaId) {
    const lista = await prisma.lista.findUnique({
      where: { id: body.listaId },
      include: {
        contatos: {
          include: { contato: true },
        },
      },
    });
    if (lista) {
      listaSnapshot = {
        id: lista.id,
        nome: lista.nome,
        contatos: lista.contatos.map((cl) => ({
          id: cl.contato.id,
          nome: cl.contato.nome,
          telefone: cl.contato.telefone,
          empresa: cl.contato.empresa,
        })),
      };
    }
  }

  const modo = body.modo === "drip" ? "drip" : "imediato";

  const created = await prisma.campanha.create({
    data: {
      nome,
      status: body.status || "rascunho",
      instanceNames: JSON.stringify(body.instanceNames || []),
      listaId: body.listaId || null,
      listaSnapshot: listaSnapshot ? JSON.stringify(listaSnapshot) : null,
      messages: JSON.stringify(body.messages || []),
      delayMin: body.delayMin ?? 8000,
      delayMax: body.delayMax ?? 20000,
      delayEntreBlocos: body.delayEntreBlocos ?? 2000,
      limitePorHora: body.limitePorHora ?? 60,
      total: body.total ?? 0,
      enviadas: 0,
      falhas: 0,
      agendadoPara: body.agendadoPara ? new Date(body.agendadoPara) : null,
      iniciadaEm: body.iniciadaEm ? new Date(body.iniciadaEm) : null,
      modo,
      dripLotePorDia:
        modo === "drip" ? Math.max(1, Number(body.dripLotePorDia) || 20) : 0,
      dripDiasSemana:
        modo === "drip" ? String(body.dripDiasSemana || "1,2,3,4,5") : "",
      dripHoraInicio:
        modo === "drip" ? String(body.dripHoraInicio || "09:00") : "09:00",
      dripHoraFim:
        modo === "drip" ? String(body.dripHoraFim || "18:00") : "18:00",
    },
  });

  return NextResponse.json(toDTO(created), { status: 201 });
}
