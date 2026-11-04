// Modelo de mensagem para composer multi-bloco / multi-variação.
// Cada campanha envia uma sequência de blocos para cada contato.
// Em blocos com variações, uma é escolhida aleatoriamente por envio.

export type MessageKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "call";

export interface MessageBlock {
  id: string;
  kind: MessageKind;
  /**
   * Texto (text) ou legenda (image/video/document). Cada item é uma variação.
   * Para kinds sem texto (sticker/location/call) fica [].
   */
  variations: string[];

  /** Mídia como data URL ou URL pública */
  mediaUrl?: string;
  mediaFileName?: string;
  mediaMimetype?: string;

  /** Call (chamada fantasma) */
  callDurationSeconds?: number;
  callIsVideo?: boolean;

  /** Location */
  latitude?: number;
  longitude?: number;
  locationName?: string;
  locationAddress?: string;

  /** Se true, injeta spintax resolver + zero-width chars pra reduzir risco de ban */
  antiBan?: boolean;
}

export function newBlock(kind: MessageKind): MessageBlock {
  const id = Math.random().toString(36).slice(2, 10);
  const base: MessageBlock = { id, kind, variations: [] };
  if (kind === "text") base.variations = [""];
  if (kind === "image" || kind === "video" || kind === "document") {
    base.variations = [""]; // legenda opcional
  }
  if (kind === "call") {
    base.callDurationSeconds = 10;
    base.callIsVideo = false;
  }
  return base;
}

export function pickVariation(vars: string[]): string {
  if (!vars.length) return "";
  return vars[Math.floor(Math.random() * vars.length)];
}

export function applyVariables(
  text: string,
  vars: Record<string, string> = {}
): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

/**
 * Resolve spintax recursivamente. `{a|b|c}` sorteia aleatoriamente um dos itens.
 * Suporta aninhamento: `{Oi|Olá} {amigo|{meu brother|parceiro}}` resolve nos dois níveis.
 */
export function applySpintax(text: string): string {
  if (!text) return text;
  const re = /\{([^{}]+)\}/;
  let result = text;
  let safety = 0;
  while (re.test(result) && safety < 50) {
    result = result.replace(re, (_, group: string) => {
      const opts = group.split("|");
      return opts[Math.floor(Math.random() * opts.length)];
    });
    safety++;
  }
  return result;
}

/**
 * Injeta zero-width spaces (U+200B) entre palavras aleatoriamente.
 * Objetivo: evitar que mensagens idênticas pareçam idênticas pros sistemas
 * de detecção do WhatsApp. prob=0.05 (5% de chance por espaço).
 */
export function applyInvisibleChars(text: string, prob = 0.05): string {
  if (!text) return text;
  return text.replace(/ /g, (match) =>
    Math.random() < prob ? "​ " : match
  );
}

/**
 * Pipeline completa: pickVariation → applyVariables → applySpintax → applyInvisibleChars.
 * Use essa função no runner em vez de encadear manualmente.
 */
export function renderText(
  variations: string[],
  vars: Record<string, string> = {},
  opts: { antiBan?: boolean } = {}
): string {
  if (!variations.length) return "";
  const chosen = pickVariation(variations);
  const applied = applyVariables(chosen, vars);
  const spun = applySpintax(applied);
  return opts.antiBan ? applyInvisibleChars(spun) : spun;
}

export const messageKindLabels: Record<MessageKind, string> = {
  text: "Texto",
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  call: "Chamada",
};

/** O bloco precisa de pelo menos 1 variação não vazia para ser enviável? */
export function blockSupportsVariations(k: MessageKind): boolean {
  return k === "text" || k === "image" || k === "video" || k === "document";
}

export function blockSupportsMedia(k: MessageKind): boolean {
  return (
    k === "image" ||
    k === "video" ||
    k === "audio" ||
    k === "document" ||
    k === "sticker"
  );
}

/** Valida se o bloco está pronto para ser enviado. */
export function isBlockValid(b: MessageBlock): boolean {
  if (b.kind === "text") {
    return b.variations.some((v) => v.trim().length > 0);
  }
  if (blockSupportsMedia(b.kind)) {
    return !!b.mediaUrl;
  }
  if (b.kind === "location") {
    return (
      typeof b.latitude === "number" &&
      typeof b.longitude === "number" &&
      !Number.isNaN(b.latitude) &&
      !Number.isNaN(b.longitude)
    );
  }
  if (b.kind === "call") {
    return (b.callDurationSeconds ?? 0) > 0;
  }
  return false;
}
