// Helpers de telefone BR — usados tanto no client (store) quanto no server (API routes).

/**
 * Normaliza telefone brasileiro para formato E.164 sem +:
 * - Remove tudo que não for dígito
 * - 10 ou 11 dígitos (DDD + número) → prepende "55"
 * - Já começando com "55" e 12-13 dígitos → mantém
 * - 12-15 dígitos (outros prefixos internacionais) → aceita
 * - Caso contrário → null
 */
export function normalizePhone(raw: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13)
    return digits;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

/** Exibe "+55 DD XXXXX-XXXX" a partir do E.164 normalizado. */
export function formatPhoneBR(e164: string): string {
  const d = (e164 || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9)
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8)
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return e164;
}

/**
 * Alterna a presença do 9 no celular BR.
 * - 55 DD 9XXXXXXXX (13) → 55 DD XXXXXXXX (12)  (remove 9)
 * - 55 DD XXXXXXXX  (12) → 55 DD 9XXXXXXXX (13) (adiciona 9)
 * Só opera em números BR (começam com 55) com DDD de celular (primeiro
 * dígito pós-DDD seria 6-9 depois do toggle). Para qualquer outro input
 * retorna o próprio valor — nunca lança.
 */
export function toggleNinthDigit(n: string): string {
  const d = (n || "").replace(/\D/g, "");
  if (!d.startsWith("55")) return d;
  if (d.length === 13) {
    const ddd = d.slice(2, 4);
    const nono = d[4];
    const rest = d.slice(5);
    if (nono === "9") return `55${ddd}${rest}`;
    return d;
  }
  if (d.length === 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const primeiro = rest[0];
    if (primeiro >= "6" && primeiro <= "9") return `55${ddd}9${rest}`;
    return d;
  }
  return d;
}

/**
 * Retorna todas as variantes equivalentes de um número para match contra
 * contatos salvos — cobre as duas formas do 9º dígito. Útil pra correlação
 * de inbound/suppression quando a origem não bate com o cadastro.
 * Resultado deduplica e sempre inclui pelo menos o próprio normalizado.
 */
export function phoneVariants(raw: string): string[] {
  const base = normalizePhone(raw);
  if (!base) return [];
  const toggled = toggleNinthDigit(base);
  return toggled && toggled !== base ? [base, toggled] : [base];
}
