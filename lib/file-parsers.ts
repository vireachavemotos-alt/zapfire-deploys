// Conversores de arquivos → texto, pra alimentar o extractContacts.
// Tudo dynamic-imported pra não inflar o bundle inicial (xlsx e pdfjs-dist
// são pesados e só são usados no fluxo de importação).

/**
 * Lê .xlsx / .xls / .ods, pega a primeira aba e converte pra CSV.
 * O CSV resultante é passado pro extractContacts, que detecta header.
 */
export async function excelToText(file: File): Promise<string> {
  const XLSXmod = await import("xlsx");
  const XLSX = (XLSXmod as unknown as { default?: typeof XLSXmod }).default || XLSXmod;

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const sheetName = wb.SheetNames[0];
  if (!sheetName) return "";
  const sheet = wb.Sheets[sheetName];

  // sheet_to_csv é tolerante e mantém strings com "" dentro — já temos parser
  // que consome CSV, então é o formato intermediário mais simples.
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false, strip: false });
}

/**
 * Extrai texto plano de um PDF usando pdfjs-dist.
 * Worker é configurado via CDN no primeiro uso (evita ter que empacotar no Next).
 */
export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // O worker precisa ser configurado; usamos o CDN com a mesma versão do pacote.
  const anyPdf = pdfjs as unknown as {
    GlobalWorkerOptions: { workerSrc: string };
    version: string;
    getDocument: (args: { data: ArrayBuffer }) => { promise: Promise<PDFDoc> };
  };
  if (!anyPdf.GlobalWorkerOptions.workerSrc) {
    anyPdf.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${anyPdf.version}/build/pdf.worker.min.mjs`;
  }

  const buf = await file.arrayBuffer();
  const loadingTask = anyPdf.getDocument({ data: buf });
  const pdf = await loadingTask.promise;

  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // `items[].str` é o texto; separamos com espaço e quebra por item sem
    // tentar reconstruir layout — o parser final só precisa dos telefones.
    const linhas = content.items
      .map((it: TextItem) => (typeof it.str === "string" ? it.str : ""))
      .join(" ");
    out += linhas + "\n";
  }
  return out;
}

// Tipos enxutos pro pdfjs (sem importar os tipos oficiais, que mudam entre versões)
interface PDFDoc {
  numPages: number;
  getPage: (n: number) => Promise<PDFPage>;
}
interface PDFPage {
  getTextContent: () => Promise<{ items: TextItem[] }>;
}
interface TextItem {
  str?: string;
}
