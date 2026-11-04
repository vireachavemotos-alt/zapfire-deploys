// Parser universal de contatos — lida com CSV, texto colado, output de Excel
// convertido pra CSV, texto extraído de PDF etc.
//
// A ideia: recebe um blob de texto qualquer e devolve uma lista de
// {nome?, telefone, empresa?}. Faz duas passadas:
//
// 1. Se parece CSV estruturado (header com "telefone/nome"), parseia por colunas.
// 2. Senão, cai pra modo "free-text": processa linha por linha, extrai telefones
//    via regex e usa o resto da linha como nome.
//
// O objetivo é aceitar COMO O USUÁRIO COLOU — da agenda do celular, de uma
// planilha, de um print de PDF, de uma lista separada por vírgula, etc.

import { normalizePhone } from "./phone";

export interface ParsedContact {
  nome?: string;
  telefone: string;
  empresa?: string;
}

// Regex pra telefones BR + internacionais. Captura variantes:
//   +55 (11) 99887-7766
//   11 99887-7766
//   (11) 99887.7766
//   11988877766
//   +5511988877766
//
// Requer ao menos 8 dígitos "colados" (permitindo um separador entre bloco de
// 4/5 e bloco de 4). O normalizePhone depois valida tamanho final.
const PHONE_RE =
  /(?:\+?\d{1,3}[\s\-.]?)?(?:\(?\d{2}\)?[\s\-.]?)?\d{4,5}[\s\-.]?\d{4}/g;

export function extractContacts(rawText: string): ParsedContact[] {
  const text = rawText || "";
  const linhas = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) return [];

  // Heurística de CSV estruturado: primeira linha tem separador (`,`, `;`, `\t`)
  // E contém palavra-chave de header reconhecível.
  const first = linhas[0].toLowerCase();
  const hasSep = /[,;\t]/.test(linhas[0]);
  const hasHeaderWords =
    /\b(tel|telefone|numero|número|whats|phone|celular|nome|name|empresa|company)\b/.test(
      first
    );

  if (hasSep && hasHeaderWords) {
    return parseStructuredCsv(linhas);
  }

  // CSV sem header mas com MUITOS separadores? Tenta colunas assumidas.
  const sampleSepCount = (linhas[0].match(/[,;\t]/g) || []).length;
  if (hasSep && sampleSepCount >= 1) {
    // Heurística: se 80%+ das linhas têm o mesmo separador, é CSV posicional.
    const sep = pickSep(linhas[0]);
    const coerentes = linhas.filter((l) => l.includes(sep)).length;
    if (coerentes / linhas.length >= 0.8) {
      return parsePositionalCsv(linhas, sep);
    }
  }

  return parseFreeText(linhas);
}

function pickSep(line: string): string {
  const counts = {
    ";": (line.match(/;/g) || []).length,
    ",": (line.match(/,/g) || []).length,
    "\t": (line.match(/\t/g) || []).length,
  };
  return (Object.entries(counts) as [string, number][]).sort(
    (a, b) => b[1] - a[1]
  )[0][0];
}

/**
 * Split de linha CSV que respeita aspas. Aceita `"Silva, Maria"` como 1 campo.
 * Suporta aspas duplas escapadas (`""`) e separador configurável.
 */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur.trim());
  return out;
}

function parseStructuredCsv(linhas: string[]): ParsedContact[] {
  const sep = pickSep(linhas[0]);
  const headers = linhas[0].toLowerCase().split(sep).map((h) => h.trim());
  const iNome = headers.findIndex(
    (h) => h.includes("nome") || h === "name"
  );
  const iTel = headers.findIndex(
    (h) =>
      h.includes("tel") ||
      h.includes("numero") ||
      h.includes("número") ||
      h.includes("whats") ||
      h === "phone" ||
      h === "celular"
  );
  const iEmp = headers.findIndex(
    (h) => h.includes("empresa") || h === "company"
  );

  const out: ParsedContact[] = [];
  const seen = new Set<string>();

  for (const l of linhas.slice(1)) {
    const cols = splitCsvLine(l, sep);
    const tel = iTel >= 0 ? cols[iTel] : cols[1] || cols[0];
    if (!tel) continue;
    const norm = normalizePhone(tel);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({
      nome: (iNome >= 0 ? cols[iNome] : cols[0]) || undefined,
      telefone: tel,
      empresa: iEmp >= 0 ? cols[iEmp] : undefined,
    });
  }
  return out;
}

function parsePositionalCsv(
  linhas: string[],
  sep: string
): ParsedContact[] {
  const out: ParsedContact[] = [];
  const seen = new Set<string>();

  for (const l of linhas) {
    const cols = splitCsvLine(l, sep);

    // Descobre qual coluna tem um telefone válido
    let telIdx = -1;
    let telValue = "";
    for (let i = 0; i < cols.length; i++) {
      const n = normalizePhone(cols[i]);
      if (n) {
        telIdx = i;
        telValue = cols[i];
        break;
      }
    }
    if (telIdx === -1) continue;
    const norm = normalizePhone(telValue)!;
    if (seen.has(norm)) continue;
    seen.add(norm);

    // Assume: primeira coluna não-vazia antes do telefone = nome; depois = empresa
    const nome = cols.slice(0, telIdx).find(Boolean);
    const empresa = cols.slice(telIdx + 1).find(Boolean);

    out.push({
      nome: nome || undefined,
      telefone: telValue,
      empresa: empresa || undefined,
    });
  }
  return out;
}

function parseFreeText(linhas: string[]): ParsedContact[] {
  const out: ParsedContact[] = [];
  const seen = new Set<string>();

  for (const linha of linhas) {
    const matches = Array.from(linha.matchAll(PHONE_RE)).map((m) => m[0]);
    const valid = matches
      .map((m) => ({ raw: m, norm: normalizePhone(m) }))
      .filter((m): m is { raw: string; norm: string } => Boolean(m.norm));

    if (valid.length === 0) continue;

    if (valid.length === 1) {
      const p = valid[0];
      if (seen.has(p.norm)) continue;
      seen.add(p.norm);

      // Remove o telefone encontrado pra extrair o nome do resto
      let resto = linha.replace(p.raw, " ");
      // Remove outros matches de telefone que possam ter sobrado
      resto = resto.replace(PHONE_RE, " ");
      // Trim + limpa separadores comuns nas bordas
      resto = resto.replace(/\s+/g, " ").trim();
      resto = resto.replace(/^[\s,;:|\-–—\t]+|[\s,;:|\-–—\t]+$/g, "").trim();

      out.push({
        nome: resto || undefined,
        telefone: p.raw,
      });
      continue;
    }

    // Múltiplos telefones na mesma linha → cada um é um contato sem nome.
    for (const p of valid) {
      if (seen.has(p.norm)) continue;
      seen.add(p.norm);
      out.push({ telefone: p.raw });
    }
  }
  return out;
}
