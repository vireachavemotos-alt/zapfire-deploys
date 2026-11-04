// POST /api/campanhas/[id]/start
//
// Antes essa rota rodava TODO o loop de disparo DENTRO do request HTTP —
// request ficava aberto por minutos ou horas, celular/Safari matava a
// conexão em 60s, e desligar o browser "parava" o disparo pela ótica do
// usuário (o servidor continuava, mas a UI nunca sabia). Isso era o bug
// clássico de "não consigo startar pelo celular".
//
// Agora: salva os campos recebidos do body no DB (instanceNames, messages,
// delays, limite) e dispara o runner em background com fire-and-forget,
// igual `/resume`. Resposta é imediata (202) com `{started:true}`.
// O caller faz polling pelo endpoint da campanha (ou pela listagem) pra
// ver progresso. Scheduler/runner não dependem do browser pra continuar.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runCampaignFromDb } from "@/lib/campaign-runner";
import type { MessageBlock } from "@/lib/message";

export const dynamic = "force-dynamic";

interface StartPayload {
  instanceNames?: string[];
  contatos?: Array<{ numero: string; variaveis?: Record<string, string> }>;
  messages?: MessageBlock[];
  delayMin?: number;
  delayMax?: number;
  delayEntreBlocos?: number;
  limitePorHora?: number;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const payload: StartPayload = await req.json().catch(() => ({}));

  const atual = await prisma.campanha.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, listaSnapshot: true },
  });
  if (!atual) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  }
  if (atual.status === "em_execucao") {
    return NextResponse.json({ error: "Já está em execução" }, { status: 409 });
  }

  // Atualiza a campanha com os campos recebidos (sobrescreve o que vier).
  // Isso cobre o fluxo da wizard que cria a campanha e dispara em sequência.
  const data: Record<string, unknown> = {};
  if (Array.isArray(payload.instanceNames)) {
    data.instanceNames = JSON.stringify(payload.instanceNames);
  }
  if (Array.isArray(payload.messages)) {
    data.messages = JSON.stringify(payload.messages);
  }
  if (typeof payload.delayMin === "number") data.delayMin = payload.delayMin;
  if (typeof payload.delayMax === "number") data.delayMax = payload.delayMax;
  if (typeof payload.delayEntreBlocos === "number") data.delayEntreBlocos = payload.delayEntreBlocos;
  if (typeof payload.limitePorHora === "number") data.limitePorHora = payload.limitePorHora;

  // Se o body trouxe `contatos` explícitos, usamos como snapshot override
  // (caso venha diferente da lista do DB) — mantém a semântica antiga.
  if (Array.isArray(payload.contatos) && payload.contatos.length > 0) {
    const nomePreexistente = (() => {
      try {
        const prev = atual.listaSnapshot ? JSON.parse(atual.listaSnapshot) : null;
        return prev?.nome ?? "Snapshot direto";
      } catch { return "Snapshot direto"; }
    })();
    data.listaSnapshot = JSON.stringify({
      nome: nomePreexistente,
      contatoIds: [],
      contatos: payload.contatos.map((c) => ({
        id: "",
        nome: c.variaveis?.nome ?? "",
        telefone: c.numero,
        empresa: c.variaveis?.empresa ?? null,
      })),
    });
    data.total = payload.contatos.length;
  }

  if (Object.keys(data).length > 0) {
    await prisma.campanha.update({ where: { id: params.id }, data });
  }

  // Fire-and-forget: runCampaignFromDb faz a transição → em_execucao
  // atomicamente, então múltiplos /start concorrentes só um pega o lock.
  runCampaignFromDb(params.id).catch((err) => {
    console.error(`[/start] Runner ${params.id} falhou:`, err);
  });

  return NextResponse.json({ started: true, campanhaId: params.id }, { status: 202 });
}
