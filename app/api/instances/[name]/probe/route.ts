// GET /api/instances/[name]/probe
//
// Teste de conexão REAL — vai além do connectionState cosmético da Evolution.
// Retorna se a instância consegue de fato falar com o WhatsApp agora.
//
// Sequência:
//   1. Consulta connectionState (rápido, só pega o estado declarado)
//   2. Pega disconnectionReasonCode (se houver, é prova de que caiu)
//   3. Faz um probe ATIVO: chama /chat/whatsappNumbers (sem enviar mensagem
//      nenhuma — só pergunta se um número tem WhatsApp). Se Baileys está
//      vivo, retorna 200. Se a sessão foi invalidada pelo WhatsApp, vem 428
//      "Connection Closed".
//
// Diagnóstico:
//   - probeOk:    pode mandar mensagem agora
//   - probeFail:  socket morto. Razão no `motivo` (401 = sessão invalidada,
//                 normalmente outro device assumiu o WhatsApp Web)

import { NextResponse } from "next/server";
import {
  getConnectionState,
  fetchInstances,
  checkIsWhatsApp,
} from "@/lib/evolution";

export const dynamic = "force-dynamic";

interface ProbeResult {
  ok: boolean;
  state: string; // "open" | "close" | "connecting" | "unknown"
  jid: string | null;
  motivo: string;
  detalhe: string | null;
  disconnectReasonCode: number | null;
  disconnectAt: string | null;
  testadoEm: string;
}

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  const inicio = Date.now();
  const r: ProbeResult = {
    ok: false,
    state: "unknown",
    jid: null,
    motivo: "Iniciando…",
    detalhe: null,
    disconnectReasonCode: null,
    disconnectAt: null,
    testadoEm: new Date().toISOString(),
  };

  // 1) connectionState rápido
  try {
    const cs = (await getConnectionState(params.name)) as
      | { instance?: { state?: string } }
      | { state?: string }
      | null;
    const state =
      (cs as { instance?: { state?: string } } | null)?.instance?.state ||
      (cs as { state?: string } | null)?.state ||
      "unknown";
    r.state = state;
  } catch (err) {
    r.motivo = "Não consegui falar com a Evolution API.";
    r.detalhe = (err as Error).message;
    return NextResponse.json(r, { status: 200 });
  }

  // 2) Detalhes da instância (jid + disconnectReason)
  try {
    const list = (await fetchInstances()) as Array<{
      name?: string;
      ownerJid?: string;
      disconnectionReasonCode?: number | null;
      disconnectionAt?: string | null;
    }>;
    const inst = Array.isArray(list)
      ? list.find((i) => i.name === params.name)
      : null;
    if (inst) {
      r.jid = inst.ownerJid || null;
      r.disconnectReasonCode = inst.disconnectionReasonCode ?? null;
      r.disconnectAt = inst.disconnectionAt ?? null;
    }
  } catch {
    /* não fatal */
  }

  // 3) Probe ativo — só faz se o state já é "open" (senão já sabemos a resposta)
  if (r.state !== "open") {
    r.motivo =
      r.state === "close"
        ? "Instância está desconectada do WhatsApp."
        : r.state === "connecting"
          ? "Tentando conectar (escaneie o QR)."
          : `Estado: ${r.state}`;
    if (r.disconnectReasonCode === 401) {
      r.motivo +=
        " Sessão foi invalidada pelo WhatsApp (geralmente outro dispositivo abriu o WhatsApp Web).";
    }
    r.detalhe = r.disconnectAt
      ? `Caiu em ${r.disconnectAt}`
      : null;
    return NextResponse.json(r, { status: 200 });
  }

  // 4) Estado=open: confirmar com probe real. Se for cosmético (igual a Nick_Mel
  // estava), o checkIsWhatsApp vai retornar 428 e a gente captura o erro.
  try {
    // Usamos o próprio jid da instância pra perguntar (idempotente, sem efeito).
    const numero = r.jid?.split("@")[0]?.replace(/\D/g, "") || "5511999999999";
    await checkIsWhatsApp(params.name, [numero]);
    // Se passou daqui, está realmente OK.
    r.ok = true;
    r.motivo = "Conectado e operacional.";
    r.detalhe = `Probe respondido em ${Date.now() - inicio}ms`;
    return NextResponse.json(r, { status: 200 });
  } catch (err) {
    const msg = (err as Error).message;
    r.ok = false;
    // 428 = Connection Closed (sessão Baileys morta mesmo Evolution dizendo open)
    if (msg.includes("428") || msg.toLowerCase().includes("connection closed")) {
      r.motivo =
        "Instância parece conectada mas a sessão WhatsApp está morta. Precisa reconectar via QR.";
      r.detalhe = msg.slice(0, 300);
    } else {
      r.motivo = "Falha ao testar envio.";
      r.detalhe = msg.slice(0, 300);
    }
    return NextResponse.json(r, { status: 200 });
  }
}
