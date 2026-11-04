// Pretty-printer de erros de envio.
//
// Os erros chegam no `resultado.detail` como strings no formato:
//   "bloco N (kind): <mensagem>"
// Onde `<mensagem>` é o `.message` do Error, que muitas vezes contém o
// JSON bruto da Evolution API, tipo:
//   Evolution API error 400: {"status":400,"error":"Bad Request","response":{"message":["..."]}}
//
// Esse módulo extrai o que interessa e categoriza, pra UI mostrar uma
// versão curta + permitir expandir pra ver o JSON cru.

export type ErrorCategory =
  | "media"       // mídia inválida / formato / tamanho
  | "not_found"   // número não existe / não tem WhatsApp
  | "auth"        // 401/403 — apikey inválida, instância não autorizada
  | "rate_limit"  // 429 — muitas requests
  | "network"     // timeout, DNS, conexão
  | "server"      // 5xx genérico
  | "client"      // 4xx outros (payload inválido etc)
  | "unknown";

export interface FormattedError {
  /** Uma frase curta em PT-BR, pro usuário ler rápido. */
  short: string;
  /** O payload original pra quem quer investigar. */
  full: string;
  /** Categoria pra agrupamento / ícone. */
  category: ErrorCategory;
  /** Status HTTP, se conseguimos extrair. */
  httpStatus?: number;
  /** Qual bloco da mensagem falhou (0-indexed logicamente, 1-indexed no texto). */
  blockIndex?: number;
  /** Tipo do bloco (image/video/audio/document/etc). */
  blockKind?: string;
}

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  media: "Mídia inválida",
  not_found: "Número sem WhatsApp",
  auth: "Autenticação",
  rate_limit: "Limite excedido",
  network: "Rede",
  server: "Servidor Evolution",
  client: "Dados inválidos",
  unknown: "Falha",
};

export function categoryLabel(c: ErrorCategory): string {
  return CATEGORY_LABELS[c];
}

const MEDIA_HINTS = [
  "must be a url or base64",
  "invalid media",
  "mediatype",
  "libspng",
  "file too large",
  "unsupported",
];

const NOT_FOUND_HINTS = [
  "not found",
  "does not exist",
  "number not registered",
  "no such user",
  "bad-user",
];

const AUTH_HINTS = ["unauthorized", "forbidden", "apikey", "invalid token"];
const RATE_HINTS = ["too many requests", "rate limit", "flood"];
const NETWORK_HINTS = ["fetch failed", "econnrefused", "timeout", "network", "enotfound"];

export function formatError(detail: string | undefined | null): FormattedError {
  const full = (detail || "").trim();
  if (!full) {
    return { short: "Erro desconhecido", full: "", category: "unknown" };
  }

  // Tenta extrair `bloco N (kind):`
  let blockIndex: number | undefined;
  let blockKind: string | undefined;
  let rest = full;
  const blockMatch = full.match(/^bloco\s+(\d+)\s+\(([^)]+)\):\s*(.+)$/i);
  if (blockMatch) {
    blockIndex = parseInt(blockMatch[1], 10);
    blockKind = blockMatch[2];
    rest = blockMatch[3];
  }

  // Tenta extrair o status HTTP e o body JSON da Evolution:
  //   "Evolution API error 400: {...}"
  let httpStatus: number | undefined;
  let innerMessage = rest;
  const evoMatch = rest.match(/Evolution API error\s+(\d+):\s*(\{[\s\S]*\})\s*$/);
  if (evoMatch) {
    httpStatus = parseInt(evoMatch[1], 10);
    const jsonStr = evoMatch[2];
    try {
      const parsed = JSON.parse(jsonStr);
      innerMessage = extractEvolutionMessage(parsed) || jsonStr;
    } catch {
      innerMessage = jsonStr;
    }
  }

  const lowered = innerMessage.toLowerCase();
  const category = classify(lowered, httpStatus);

  let short = innerMessage;
  // Se a mensagem é muito técnica, dá uma tradução amigável
  const translated = translateCommonMessage(lowered, category);
  if (translated) short = translated;

  // Prefixa com o bloco quando relevante
  if (blockIndex !== undefined && blockKind) {
    short = `Bloco ${blockIndex} (${blockKind}) — ${short}`;
  }

  return {
    short,
    full,
    category,
    httpStatus,
    blockIndex,
    blockKind,
  };
}

function classify(lowered: string, status?: number): ErrorCategory {
  if (MEDIA_HINTS.some((h) => lowered.includes(h))) return "media";
  if (NOT_FOUND_HINTS.some((h) => lowered.includes(h))) return "not_found";
  if (AUTH_HINTS.some((h) => lowered.includes(h))) return "auth";
  if (RATE_HINTS.some((h) => lowered.includes(h))) return "rate_limit";
  if (NETWORK_HINTS.some((h) => lowered.includes(h))) return "network";

  if (status) {
    if (status === 401 || status === 403) return "auth";
    if (status === 404) return "not_found";
    if (status === 429) return "rate_limit";
    if (status >= 500) return "server";
    if (status >= 400) return "client";
  }
  return "unknown";
}

function translateCommonMessage(
  lowered: string,
  category: ErrorCategory
): string | null {
  if (lowered.includes("must be a url or base64"))
    return "Mídia precisa ser URL pública ou base64. Reenvie o arquivo.";
  if (lowered.includes("libspng") || lowered.includes("invalid png"))
    return "PNG corrompido ou não suportado. Tente converter pra JPEG.";
  if (lowered.includes("file too large"))
    return "Arquivo muito grande. O WhatsApp aceita até 16MB de vídeo e 100MB de documento.";
  if (category === "not_found")
    return "Número não existe no WhatsApp.";
  if (category === "auth")
    return "Instância desconectada ou apikey inválida.";
  if (category === "rate_limit")
    return "Evolution API pediu pra esperar (rate limit).";
  if (category === "network")
    return "Sem resposta da Evolution API (timeout ou offline).";
  return null;
}

function extractEvolutionMessage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  // Formato clássico: { response: { message: ["..."] | "..." } }
  const response = obj.response as Record<string, unknown> | undefined;
  if (response) {
    const msg = response.message;
    if (Array.isArray(msg)) return msg.filter(Boolean).join(" · ");
    if (typeof msg === "string") return msg;
  }

  if (typeof obj.message === "string") return obj.message;
  if (Array.isArray(obj.message))
    return (obj.message as unknown[]).filter(Boolean).join(" · ");

  if (typeof obj.error === "string") return obj.error;
  return null;
}
