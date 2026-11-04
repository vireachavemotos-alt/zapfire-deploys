// Helpers de grupo WhatsApp.
//
// JID de grupo WhatsApp: `<id>@g.us` (ex: "120363XXXXXX@g.us").
// Participante vem como `<telefone>@s.whatsapp.net`.
// Link de convite: `https://chat.whatsapp.com/<code>` (code tem 10-24 chars).

/**
 * Extrai o inviteCode de um link de convite do WhatsApp.
 * Aceita:
 *   https://chat.whatsapp.com/XYZ
 *   http://chat.whatsapp.com/XYZ?foo=bar
 *   chat.whatsapp.com/XYZ
 *   XYZ (passa direto se parecer um code)
 * Retorna null se não conseguir extrair.
 */
export function extractInviteCode(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Match the last path segment of chat.whatsapp.com/<code>
  const m = trimmed.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]{6,})/i);
  if (m) return m[1];
  // Se já parece um code (sem barras, sem domínios, chars válidos), devolve.
  if (/^[A-Za-z0-9_-]{6,30}$/.test(trimmed)) return trimmed;
  return null;
}

/** Extrai telefone (string de dígitos) de um JID `<numero>@s.whatsapp.net`. */
export function phoneFromJid(jid: string): string | null {
  if (!jid) return null;
  const [left] = jid.split("@");
  const digits = (left || "").replace(/\D/g, "");
  return digits || null;
}

/** True se o jid é um grupo WhatsApp (`<id>@g.us`). */
export function isGroupJid(jid: string): boolean {
  return typeof jid === "string" && jid.endsWith("@g.us");
}
