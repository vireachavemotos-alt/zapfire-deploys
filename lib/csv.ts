// CSV helpers — RFC 4180-ish.
// O ponto é gerar um arquivo que abre limpo no Excel/Numbers/Sheets:
//  - separador vírgula
//  - line ending CRLF
//  - aspas duplas dentro do campo viram "" (escape)
//  - BOM UTF-8 no começo pra Excel reconhecer acentos
//  - se o campo tem `,`, `"`, `\n`, `\r` ou começa/termina com espaço, envolve em aspas

export type CsvRow = (string | number | boolean | null | undefined)[];

const CRLF = "\r\n";

function quote(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "boolean") s = v ? "true" : "false";
  else if (typeof v === "number") s = Number.isFinite(v) ? String(v) : "";
  else s = String(v);

  const needs =
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r") ||
    /^\s|\s$/.test(s);

  if (!needs) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function rowsToCSV(headers: string[], rows: CsvRow[]): string {
  const head = headers.map(quote).join(",");
  const body = rows.map((r) => r.map(quote).join(",")).join(CRLF);
  return body.length === 0 ? head : `${head}${CRLF}${body}`;
}

/**
 * Dispara download de CSV no navegador.
 * Adiciona BOM UTF-8 — sem ele o Excel pt-BR mostra acento bagunçado.
 */
export function downloadCSV(filename: string, csv: string) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ensureCsvExt(filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Libera o blob — sem isso fica preso na memória até reload.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ensureCsvExt(name: string): string {
  return name.toLowerCase().endsWith(".csv") ? name : `${name}.csv`;
}

/**
 * Sanitiza pedaços de nome de arquivo (remove `/`, `:` etc) e adiciona timestamp curto.
 */
export function csvFilename(parts: string[]): string {
  const safe = parts
    .map((p) => p.replace(/[\\/:*?"<>|]+/g, "-").trim())
    .filter(Boolean)
    .join("_");
  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[-T:]/g, "");
  return `${safe || "export"}_${stamp}.csv`;
}
