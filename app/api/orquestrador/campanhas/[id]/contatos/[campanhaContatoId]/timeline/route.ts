// GET /api/orquestrador/campanhas/[id]/contatos/[campanhaContatoId]/timeline
// Monta timeline cronológica unindo MessageExecution + MessageAttempt +
// InboundMessage pra aquele contato na campanha.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Evento = {
  tipo:
    | "execution_pending"
    | "execution_scheduled"
    | "execution_running"
    | "execution_sent"
    | "execution_delivered"
    | "execution_read"
    | "execution_replied"
    | "execution_failed"
    | "execution_blocked"
    | "execution_canceled"
    | "attempt_sent"
    | "attempt_failed"
    | "inbound";
  label: string;
  timestamp: string;
  detail?: string;
  status?: string;
  textoEnviado?: string;
  textoRecebido?: string;
  erro?: string;
  snapshotNome?: string;
  stepPosicao?: number;
  versaoNumero?: number;
  instanceName?: string;
};

const EXECUTION_LABEL: Record<string, { tipo: Evento["tipo"]; label: string }> = {
  pending: { tipo: "execution_pending", label: "Execução agendada" },
  scheduled: { tipo: "execution_scheduled", label: "Execução agendada" },
  running: { tipo: "execution_running", label: "Em execução" },
  sent: { tipo: "execution_sent", label: "Enviado" },
  delivered: { tipo: "execution_delivered", label: "Entregue" },
  read: { tipo: "execution_read", label: "Lido" },
  replied: { tipo: "execution_replied", label: "Lead respondeu" },
  failed: { tipo: "execution_failed", label: "Falhou" },
  blocked: { tipo: "execution_blocked", label: "Bloqueado (suppression)" },
  canceled: { tipo: "execution_canceled", label: "Cancelado — contato respondeu" },
};

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: { id: string; campanhaContatoId: string };
  }
) {
  const campContato = await prisma.campanhaContato.findUnique({
    where: { id: params.campanhaContatoId },
  });
  if (!campContato || campContato.campanhaId !== params.id) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }
  const contato = await prisma.contato.findUnique({
    where: { id: campContato.contatoId },
    select: { id: true, nome: true, telefone: true, empresa: true },
  });

  const [executions, inbounds] = await Promise.all([
    prisma.messageExecution.findMany({
      where: { campanhaContatoId: campContato.id },
      orderBy: { agendadoPara: "asc" },
      include: {
        snapshot: { select: { nome: true, posicao: true, tipo: true } },
        attempts: { orderBy: { enviadoEm: "asc" } },
      },
    }),
    prisma.inboundMessage.findMany({
      where: { campanhaContatoId: campContato.id },
      orderBy: { recebidoEm: "asc" },
      select: {
        id: true,
        texto: true,
        tipo: true,
        instanceName: true,
        recebidoEm: true,
      },
    }),
  ]);

  const eventos: Evento[] = [];

  for (const exec of executions) {
    const snapName = exec.snapshot?.nome ?? "step";
    const stepPos = exec.snapshot?.posicao;
    // Evento principal da execução (status atual)
    const meta = EXECUTION_LABEL[exec.status] ?? {
      tipo: "execution_pending" as const,
      label: exec.status,
    };
    const timestamp = (
      exec.concluidoEm ?? exec.iniciadoEm ?? exec.agendadoPara
    ).toISOString();
    eventos.push({
      tipo: meta.tipo,
      label: `${meta.label} — ${snapName}`,
      timestamp,
      status: exec.status,
      erro: exec.erroDetalhe ?? undefined,
      snapshotNome: snapName,
      stepPosicao: stepPos,
      versaoNumero: exec.versaoNumero,
    });
    // Tentativas (uma por attempt)
    for (const att of exec.attempts) {
      eventos.push({
        tipo: att.status === "sent" ? "attempt_sent" : "attempt_failed",
        label:
          att.status === "sent"
            ? `Mensagem enviada via ${att.instanceName}`
            : `Falha no envio via ${att.instanceName}`,
        timestamp: att.enviadoEm.toISOString(),
        textoEnviado: att.textoFinal ?? undefined,
        erro: att.erroDetalhe ?? undefined,
        snapshotNome: snapName,
        stepPosicao: stepPos,
        versaoNumero: exec.versaoNumero,
        instanceName: att.instanceName,
      });
    }
  }

  for (const inb of inbounds) {
    eventos.push({
      tipo: "inbound",
      label: "Resposta recebida",
      timestamp: inb.recebidoEm.toISOString(),
      textoRecebido: inb.texto ?? `(${inb.tipo})`,
      instanceName: inb.instanceName,
    });
  }

  eventos.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return NextResponse.json({
    contato: {
      id: campContato.id,
      contatoId: campContato.contatoId,
      nome: contato?.nome ?? "(sem nome)",
      telefone: contato?.telefone ?? "",
      empresa: contato?.empresa ?? null,
      status: campContato.status,
      respondeuEm: campContato.respondeuEm,
      proximoEnvioEm: campContato.proximoEnvioEm,
      versaoFixada: campContato.versaoFixada,
      stepAtualId: campContato.stepAtualId,
      criadoEm: campContato.criadoEm,
    },
    timeline: eventos,
  });
}
