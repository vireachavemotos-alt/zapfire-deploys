// Cliente central para todas as chamadas à Evolution API

const BASE_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const API_KEY = process.env.EVOLUTION_API_KEY || "";

async function evoFetch(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    console.error(
      `[Evolution API] ${options.method || "GET"} ${path} → ${res.status}`,
      data
    );
    throw new Error(
      `Evolution API error ${res.status}: ${JSON.stringify(data)}`
    );
  }
  return data;
}

// ─── Instâncias ───────────────────────────────────────────────

/**
 * Cria uma instância na Evolution.
 * Se `number` é passado (só dígitos, com DDI), a instância já nasce amarrada
 * àquele telefone — o que habilita conectar via pairing code depois.
 */
export async function createInstance(
  instanceName: string,
  number?: string
) {
  return evoFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      ...(number ? { number } : {}),
    }),
  });
}

export async function fetchInstances() {
  return evoFetch("/instance/fetchInstances");
}

/**
 * Inicia o fluxo de conexão. Sem `number`: retorna QR (base64).
 * Com `number`: retorna também `pairingCode` (8 caracteres alfanuméricos)
 * que o usuário digita em WhatsApp → Dispositivos Conectados → Conectar
 * com número de telefone. O QR continua vindo caso queira alternar.
 */
export async function connectInstance(
  instanceName: string,
  number?: string
) {
  const qs = number ? `?number=${encodeURIComponent(number)}` : "";
  return evoFetch(`/instance/connect/${instanceName}${qs}`);
}

export async function getConnectionState(instanceName: string) {
  return evoFetch(`/instance/connectionState/${instanceName}`);
}

export async function restartInstance(instanceName: string) {
  return evoFetch(`/instance/restart/${instanceName}`, { method: "PUT" });
}

export async function logoutInstance(instanceName: string) {
  return evoFetch(`/instance/logout/${instanceName}`, { method: "DELETE" });
}

export async function deleteInstance(instanceName: string) {
  return evoFetch(`/instance/delete/${instanceName}`, { method: "DELETE" });
}

// ─── Envio de Mensagens ───────────────────────────────────────

/**
 * A Evolution rejeita `data:image/png;base64,XXX` com
 * "Owned media must be a url or base64" — ela aceita só a URL pública
 * OU o base64 cru (sem o prefixo `data:MIME;base64,`).
 *
 * Essa função normaliza qualquer string que venha: se for data-URL,
 * tira o prefixo e (opcionalmente) devolve também o mimetype embutido.
 */
function normalizeMediaPayload(src: string): { media: string; detectedMime?: string } {
  const m = src.match(/^data:([^;,]+)(?:;[^,]*)?,(.+)$/);
  if (!m) return { media: src };
  const mime = m[1];
  let payload = m[2];
  // data URLs podem ser base64 (padrão) ou URL-encoded. Se vier URL-encoded,
  // a Evolution não aceita — a gente só suporta base64 aqui.
  // O flag "base64" fica entre o MIME e a vírgula; simplificando, se o
  // prefixo completo contém "base64," assumimos base64.
  if (!src.slice(0, 200).toLowerCase().includes("base64")) {
    // Tenta recodificar URL-encoded → base64
    try {
      payload = typeof Buffer !== "undefined"
        ? Buffer.from(decodeURIComponent(payload), "utf-8").toString("base64")
        : btoa(decodeURIComponent(payload));
    } catch {
      /* mantém como veio; Evolution provavelmente vai rejeitar */
    }
  }
  return { media: payload, detectedMime: mime };
}

export interface SendTextPayload {
  number: string;
  text: string;
  delay?: number;
}

export async function sendText(
  instanceName: string,
  payload: SendTextPayload
) {
  return evoFetch(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: payload.number,
      text: payload.text,
      delay: payload.delay || 0,
    }),
  });
}

export interface SendMediaPayload {
  number: string;
  mediatype: "image" | "video" | "document" | "audio";
  mimetype: string;
  caption?: string;
  media: string;
  fileName?: string;
}

export async function sendMedia(
  instanceName: string,
  payload: SendMediaPayload
) {
  const { media, detectedMime } = normalizeMediaPayload(payload.media);
  return evoFetch(`/message/sendMedia/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      media,
      // Se o caller não passou mimetype e o data-URL trouxe um, usa esse
      mimetype: payload.mimetype || detectedMime || "application/octet-stream",
    }),
  });
}

export async function sendAudio(
  instanceName: string,
  number: string,
  audioUrl: string
) {
  const { media } = normalizeMediaPayload(audioUrl);
  return evoFetch(`/message/sendWhatsAppAudio/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number, audio: media }),
  });
}

export async function sendSticker(
  instanceName: string,
  payload: { number: string; sticker: string }
) {
  const { media } = normalizeMediaPayload(payload.sticker);
  return evoFetch(`/message/sendSticker/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number: payload.number, sticker: media }),
  });
}

export interface SendLocationPayload {
  number: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export async function sendLocation(
  instanceName: string,
  payload: SendLocationPayload
) {
  return evoFetch(`/message/sendLocation/${instanceName}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface SendFakeCallPayload {
  number: string;
  isVideo?: boolean;
  callDuration?: number; // segundos
}

export async function sendFakeCall(
  instanceName: string,
  payload: SendFakeCallPayload
) {
  return evoFetch(`/call/fakeCall/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: payload.number,
      isVideo: payload.isVideo ?? false,
      callDuration: payload.callDuration ?? 10,
    }),
  });
}

export async function checkIsWhatsApp(
  instanceName: string,
  numbers: string[]
) {
  return evoFetch(`/chat/whatsappNumbers/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ numbers }),
  });
}

// ─── Grupos ─────────────────────────────────────────────────

export interface EvolutionGroupParticipant {
  id: string; // "<telefone>@s.whatsapp.net"
  admin?: "admin" | "superadmin" | null;
}

export interface EvolutionGroup {
  id: string; // "<id>@g.us"
  subject?: string;
  subjectOwner?: string;
  subjectTime?: number;
  pictureUrl?: string | null;
  size?: number;
  creation?: number;
  owner?: string;
  desc?: string;
  descId?: string;
  restrict?: boolean;
  announce?: boolean;
  participants?: EvolutionGroupParticipant[];
}

/** Lista todos os grupos onde a instância está (opcionalmente com participantes). */
export async function fetchAllGroups(
  instanceName: string,
  getParticipants = true
): Promise<EvolutionGroup[]> {
  return evoFetch(
    `/group/fetchAllGroups/${instanceName}?getParticipants=${getParticipants}`
  ) as Promise<EvolutionGroup[]>;
}

/** Preview de grupo via código do convite (não entra ainda). */
export async function getGroupInviteInfo(
  instanceName: string,
  inviteCode: string
): Promise<EvolutionGroup> {
  return evoFetch(
    `/group/inviteInfo/${instanceName}?inviteCode=${encodeURIComponent(inviteCode)}`
  ) as Promise<EvolutionGroup>;
}

/** Entra no grupo via código. Retorna o JID do grupo. */
export async function acceptGroupInvite(
  instanceName: string,
  inviteCode: string
): Promise<{ groupJid?: string } & Record<string, unknown>> {
  return evoFetch(
    `/group/acceptInvite/${instanceName}?inviteCode=${encodeURIComponent(inviteCode)}`
  ) as Promise<{ groupJid?: string } & Record<string, unknown>>;
}

/** Lista participantes de um grupo específico. */
export async function getGroupParticipants(
  instanceName: string,
  groupJid: string
): Promise<{ participants: EvolutionGroupParticipant[] }> {
  return evoFetch(
    `/group/participants/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`
  ) as Promise<{ participants: EvolutionGroupParticipant[] }>;
}

/** Sai do grupo. Evolution v2.3.7: DELETE /group/leaveGroup/{instance}?groupJid=... */
export async function leaveGroup(instanceName: string, groupJid: string) {
  return evoFetch(
    `/group/leaveGroup/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
    { method: "DELETE" }
  );
}
