// POST /api/webhooks/evolution
//
// Webhook da Evolution API — captura mensagens recebidas (messages.upsert)
// para alimentar reply detection do orquestrador.
//
// Config na Evolution (via docker-compose env):
//   WEBHOOK_GLOBAL_URL=http://zapfire:3000/api/webhooks/evolution
//   WEBHOOK_EVENTS_MESSAGES_UPSERT=true
//
// Payload esperado (resumido — formato Evolution v2.x):
//   {
//     event: "messages.upsert",
//     instance: "nick_mel",
//     data: {
//       key: { remoteJid: "5511988887766@s.whatsapp.net", id: "ABCD...", fromMe: false },
//       message: { conversation: "oi" } | { extendedTextMessage: { text: "oi" } } | ...,
//       pushName: "Fulano",
//       messageTimestamp: 1729692310
//     }
//   }
//
// Comportamento atual: filtra fromMe=true, normaliza telefone, grava
// InboundMessage com dedupe por evolutionMessageId. A correlação com
// MessageExecution (cancelar follow-ups do branch "no_reply") roda em
// outro worker — veja TODO(orchestrator) abaixo.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

// Compara em tempo constante pra não vazar o token via timing.
function tokenMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorized(req: Request): boolean {
  const expected = process.env.EVOLUTION_WEBHOOK_TOKEN;
  // Se não configurado, aceita qualquer coisa EM DEV (NODE_ENV !== production).
  // Em prod, rejeita tudo até configurar — fail-closed.
  if (!expected) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("x-webhook-token");
  if (tokenMatches(header, expected)) return true;
  const url = new URL(req.url);
  return tokenMatches(url.searchParams.get("token"), expected);
}

interface EvolutionUpsertKey {
  remoteJid?: string;
  id?: string;
  fromMe?: boolean;
}

interface EvolutionMessageBody {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
  audioMessage?: unknown;
}

interface EvolutionUpsertData {
  key?: EvolutionUpsertKey;
  message?: EvolutionMessageBody;
  pushName?: string;
  messageTimestamp?: number;
}

interface EvolutionWebhookBody {
  event?: string;
  instance?: string;
  data?: EvolutionUpsertData;
}

function extractText(msg?: EvolutionMessageBody): string {
  if (!msg) return "";
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    ""
  );
}

function stripJid(jid?: string): string | null {
  if (!jid) return null;
  // "5511988887766@s.whatsapp.net" | "5511988887766@c.us" | grupo "...@g.us"
  if (jid.includes("@g.us")) return null; // grupos ignorados por enquanto
  const [digits] = jid.split("@");
  return digits || null;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: EvolutionWebhookBody;
  try {
    body = (await req.json()) as EvolutionWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (body.event !== "messages.upsert") {
    // Outros eventos (status, qr, connection) são ignorados por aqui.
    return NextResponse.json({ ok: true, skipped: body.event ?? "unknown" });
  }

  const key = body.data?.key;
  if (key?.fromMe === true) {
    return NextResponse.json({ ok: true, skipped: "fromMe" });
  }

  const rawJid = stripJid(key?.remoteJid);
  if (!rawJid) {
    return NextResponse.json({ ok: true, skipped: "no remoteJid" });
  }

  const telefone = normalizePhone(rawJid) ?? rawJid;
  const evolutionMessageId = key?.id ?? null;
  const texto = extractText(body.data?.message);
  const instancia = body.instance ?? null;
  const recebidoEm = body.data?.messageTimestamp
    ? new Date(body.data.messageTimestamp * 1000)
    : new Date();
  const pushName = body.data?.pushName ?? null;

  // TODO(orchestrator): este bloco grava em InboundMessage, uma tabela que
  // vem no schema do orquestrador (migration separada). Enquanto ela não
  // existir no DB em prod, o try/catch deixa o webhook responder 200 pra
  // Evolution não encher a fila dela com retries — logamos pra o deploy
  // posterior.
  //
  // Depois do schema aterrissar, trocar o $executeRawUnsafe por
  // prisma.inboundMessage.upsert({...}) e disparar o worker de correlação
  // que:
  //   1. acha CampanhaContato pelo telefone (phoneVariants)
  //   2. marca `respondeu=true` no CampanhaContato ativo mais recente
  //   3. supersede MessageExecution futuras do branch "no_reply"
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "InboundMessage" ("id","evolutionMessageId","telefone","instancia","texto","pushName","recebidoEm","processado","criadoEm")
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
       ON CONFLICT("evolutionMessageId") DO NOTHING`,
      evolutionMessageId,
      telefone,
      instancia,
      texto,
      pushName,
      recebidoEm.toISOString()
    );
  } catch (e) {
    // Tabela ainda não migrada OU conflito de dedupe — ambos benignos.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/no such table|UNIQUE constraint/i.test(msg)) {
      console.warn("[webhook/evolution] insert falhou:", msg);
    }
  }

  return NextResponse.json({
    ok: true,
    telefone,
    evolutionMessageId,
    texto: texto.slice(0, 120),
  });
}

export async function GET() {
  // Útil pra health check manual do endpoint no browser.
  return NextResponse.json({
    ok: true,
    hint: "POST payload Evolution messages.upsert aqui.",
  });
}
