"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmModal } from "@/components/ConfirmModal";
import { BulkPasteModal } from "@/components/BulkPasteModal";
import { ImportFileConfigModal } from "@/components/ImportFileConfigModal";
import { ImportPreviewModal, type ImportPreview } from "@/components/ImportPreviewModal";
import {
  FileText,
  FileSpreadsheet,
  FileType,
  ClipboardPaste,
  Search,
  UserPlus,
  Users,
  Trash2,
  Phone,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Upload,
  Download,
} from "lucide-react";
import { useStore, formatPhoneBR } from "@/lib/store";
import { formatDateBR } from "@/lib/utils";
import { extractContacts, type ParsedContact } from "@/lib/contact-parser";
import { excelToText, pdfToText } from "@/lib/file-parsers";
import { rowsToCSV, downloadCSV, csvFilename } from "@/lib/csv";

const PAGE_SIZE = 50;

type ImportKind = "csv" | "excel" | "pdf";

export default function ContatosPage() {
  const contatos = useStore((s) => s.contatos);
  const addContato = useStore((s) => s.addContato);
  const addContatos = useStore((s) => s.addContatos);
  const previewContatos = useStore((s) => s.previewContatos);
  const removeContato = useStore((s) => s.removeContato);
  const removeContatosBulk = useStore((s) => s.removeContatosBulk);

  // Preview da importação — rows + opts ficam esperando o usuário confirmar.
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    rows: ParsedContact[];
    opts?: { categoria?: string; criarLista?: { nome: string; descricao?: string } };
  } | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const [mode, setMode] = useState<"idle" | "manual">("idle");
  const [query, setQuery] = useState("");
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [novoCategoria, setNovoCategoria] = useState("");
  // Filtro por categoria. null = todos. "__sem__" = sem categoria.
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);
  // Seleção múltipla — ids escolhidos. Persiste entre páginas (scroll/pagina
  // não perde seleção, igual comportamento de Gmail/Notion).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [importing, setImporting] = useState<ImportKind | null>(null);
  // Pós-parse de arquivo: rows + tipo + nome ficam aqui esperando o usuário
  // confirmar categoria/criar-lista. null = sem modal aberto.
  const [pendingFileImport, setPendingFileImport] = useState<{
    rows: ParsedContact[];
    source: "csv" | "excel" | "pdf";
    fileName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importKindRef = useRef<ImportKind>("csv");

  // Fecha o menu ao clicar fora
  useEffect(() => {
    if (!importMenuOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-import-menu]")) setImportMenuOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [importMenuOpen]);

  // Derivado: lista de categorias existentes com contagem (pra dropdown).
  // Recalcula sempre que o cache de contatos muda — frontend-only, sem fetch.
  const categorias = useMemo(() => {
    const map = new Map<string, number>();
    let semCat = 0;
    for (const c of contatos) {
      if (!c.categoria) {
        semCat++;
        continue;
      }
      map.set(c.categoria, (map.get(c.categoria) || 0) + 1);
    }
    const arr = Array.from(map.entries())
      .map(([categoria, count]) => ({ categoria, count }))
      .sort((a, b) => b.count - a.count);
    return { items: arr, semCategoria: semCat, total: contatos.length };
  }, [contatos]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let arr = contatos;
    if (categoriaFiltro !== null) {
      if (categoriaFiltro === "__sem__") {
        arr = arr.filter((c) => !c.categoria);
      } else {
        arr = arr.filter((c) => c.categoria === categoriaFiltro);
      }
    }
    if (q) {
      arr = arr.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          c.telefone.includes(q.replace(/\D/g, "")) ||
          (c.empresa || "").toLowerCase().includes(q) ||
          (c.categoria || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [contatos, query, categoriaFiltro]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Reset page quando a busca muda ou quando a lista encolhe.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [query, categoriaFiltro]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);
  const pageItems = filtered.slice(pageStart, pageEnd);

  const confirmTarget = confirmId
    ? contatos.find((c) => c.id === confirmId)
    : null;

  // Helpers de seleção. Um contato deletado fora da UI sai naturalmente porque
  // as `checked` comparam o id com o Set, e a lista filtrada não o inclui.
  const pageIds = pageItems.map((c) => c.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function selectAllFiltered() {
    setSelected(new Set(filtered.map((c) => c.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setDeletingBulk(true);
    try {
      const res = await removeContatosBulk(ids);
      toast.success(
        `${res.contatosRemovidos} contato${res.contatosRemovidos === 1 ? "" : "s"} removido${res.contatosRemovidos === 1 ? "" : "s"}.`
      );
      setSelected(new Set());
      setBulkConfirmOpen(false);
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
    } finally {
      setDeletingBulk(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!tel.trim()) return;
    const { contato, duplicate, error } = await addContato({
      nome: nome.trim(),
      telefone: tel,
      empresa: empresa.trim() || undefined,
      categoria: novoCategoria.trim() || undefined,
    });
    if (!contato) {
      toast.error(error || "Telefone inválido. Use DDD + número.");
      return;
    }
    if (duplicate) {
      toast.warning(`Telefone já existe: ${formatPhoneBR(contato.telefone)}`);
      return;
    }
    toast.success("Contato adicionado.");
    setNome("");
    setTel("");
    setEmpresa("");
    // Mantém a categoria preenchida — facilita adicionar vários contatos
    // do mesmo nicho em sequência.
    setMode("idle");
  }

  /**
   * Importa rows vindos de qualquer fonte (CSV, Excel, PDF, colar).
   *
   * @param opts.categoria  Aplica essa categoria a TODOS os rows (sobrescreve individual)
   * @param opts.criarLista Se passado, cria uma lista nova com todos os importados
   */
  // Pede PREVIEW primeiro — guarda rows+opts e abre o modal de confirmação.
  // O insert real roda em confirmImport() depois que o usuário escolhe
  // "Ignorar duplicados" ou "Atualizar existentes".
  async function importRows(
    rows: ParsedContact[],
    opts?: {
      categoria?: string;
      criarLista?: { nome: string; descricao?: string };
    }
  ) {
    if (rows.length === 0) {
      toast.error("Nenhum contato válido encontrado.");
      return;
    }
    try {
      const preview = await previewContatos(
        rows.map((r) => ({
          nome: r.nome || "",
          telefone: r.telefone,
          empresa: r.empresa,
        }))
      );
      setImportPreview(preview);
      setPendingImport({ rows, opts });
    } catch (e) {
      toast.error(`Falha ao analisar importação: ${(e as Error).message}`);
    }
  }

  async function confirmImport(atualizarExistentes: boolean) {
    if (!pendingImport) return;
    setImportBusy(true);
    try {
      const resp = await addContatos(
        pendingImport.rows.map((r) => ({
          nome: r.nome || "",
          telefone: r.telefone,
          empresa: r.empresa,
        })),
        { ...pendingImport.opts, atualizarExistentes }
      );
      const { adicionados, duplicados, invalidos, atualizados, listaCriada } = resp;
      const parts = [`${adicionados} adicionado${adicionados === 1 ? "" : "s"}`];
      if (atualizados && atualizados > 0)
        parts.push(`${atualizados} atualizado${atualizados === 1 ? "" : "s"}`);
      if (duplicados > 0)
        parts.push(`${duplicados} duplicado${duplicados === 1 ? "" : "s"}`);
      if (invalidos > 0)
        parts.push(`${invalidos} inválido${invalidos === 1 ? "" : "s"}`);
      if (listaCriada) parts.push(`lista "${listaCriada.nome}" criada`);
      const msg = parts.join(" · ");
      if (adicionados > 0 || atualizados || listaCriada) toast.success(msg);
      else toast.warning(msg);
      setImportPreview(null);
      setPendingImport(null);
    } catch (e) {
      toast.error(`Falha ao importar: ${(e as Error).message}`);
    } finally {
      setImportBusy(false);
    }
  }

  function cancelImport() {
    if (importBusy) return;
    setImportPreview(null);
    setPendingImport(null);
  }

  function triggerImport(kind: ImportKind) {
    setImportMenuOpen(false);
    importKindRef.current = kind;
    const accept =
      kind === "csv"
        ? ".csv,.txt"
        : kind === "excel"
          ? ".xlsx,.xls,.ods"
          : ".pdf";
    const inp = fileInputRef.current;
    if (!inp) return;
    inp.accept = accept;
    inp.value = "";
    inp.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind = importKindRef.current;
    setImporting(kind);
    try {
      let text: string;
      if (kind === "excel") {
        text = await excelToText(f);
      } else if (kind === "pdf") {
        text = await pdfToText(f);
      } else {
        text = await f.text();
      }
      const rows = extractContacts(text);
      if (rows.length === 0) {
        toast.error(
          kind === "pdf"
            ? "Nenhum telefone encontrado no PDF."
            : "Arquivo vazio ou sem contatos reconhecidos."
        );
      } else {
        // Em vez de importar direto, abre o modal de configuração pra
        // o usuário escolher categoria e se vai criar lista.
        setPendingFileImport({
          rows,
          source: kind,
          fileName: f.name,
        });
      }
    } catch (err) {
      toast.error(`Falha ao importar: ${(err as Error).message}`);
    } finally {
      setImporting(null);
      e.target.value = "";
    }
  }

  // Exporta o que está visível: se tem busca aplicada, leva o filtro;
  // se tem seleção, exporta só os marcados (precedência > filtro).
  // Sem seleção e sem busca, exporta a base toda.
  function handleExport() {
    let scope: "selecionados" | "filtrados" | "todos" = "todos";
    let rows = contatos;
    if (selected.size > 0) {
      rows = contatos.filter((c) => selected.has(c.id));
      scope = "selecionados";
    } else if (query.trim()) {
      rows = filtered;
      scope = "filtrados";
    }
    if (rows.length === 0) {
      toast.warning("Nada para exportar.");
      return;
    }
    const headers = [
      "id",
      "nome",
      "telefone",
      "telefone_formatado",
      "empresa",
      "tags",
      "whatsapp_valido",
      "criado_em",
    ];
    const data = rows.map((c) => [
      c.id,
      c.nome || "",
      c.telefone,
      formatPhoneBR(c.telefone),
      c.empresa || "",
      Array.isArray(c.tags) ? c.tags.join("; ") : "",
      c.whatsappValido === true
        ? "valido"
        : c.whatsappValido === false
          ? "invalido"
          : "",
      c.criadoEm,
    ]);
    const csv = rowsToCSV(headers, data);
    downloadCSV(csvFilename(["contatos", scope]), csv);
    toast.success(
      `${rows.length} contato${rows.length === 1 ? "" : "s"} exportado${rows.length === 1 ? "" : "s"}.`
    );
  }

  async function handleConfirmRemove() {
    if (!confirmId) return;
    try {
      await removeContato(confirmId);
      toast.success("Contato removido.");
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
    }
    setConfirmId(null);
  }

  return (
    <>
      <PageHeader
        title="Base"
        subtitle={`${contatos.length} contato${contatos.length === 1 ? "" : "s"} na base · números duplicados são ignorados automaticamente.`}
        actions={
          <>
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={() => setMode("manual")}
            >
              <UserPlus className="h-4 w-4" /> Adicionar
            </NeonButton>
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={() => setPasteOpen(true)}
            >
              <ClipboardPaste className="h-4 w-4" /> Colar em lote
            </NeonButton>
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={contatos.length === 0}
              title={
                selected.size > 0
                  ? `Exportar ${selected.size} selecionado${selected.size === 1 ? "" : "s"}`
                  : query.trim()
                    ? `Exportar ${filtered.length} filtrado${filtered.length === 1 ? "" : "s"}`
                    : `Exportar todos (${contatos.length})`
              }
            >
              <Download className="h-4 w-4" /> Exportar
            </NeonButton>

            {/* Dropdown de importação */}
            <div className="relative inline-flex" data-import-menu>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFile}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setImportMenuOpen((v) => !v);
                }}
                disabled={!!importing}
                className="inline-flex items-center gap-2 h-8 px-3 text-xs rounded-md border border-[#FF0033]/50 text-[#FF0033] hover:bg-[#FF0033]/5 cursor-pointer disabled:opacity-50 disabled:cursor-wait transition-colors"
              >
                <Upload className="h-4 w-4" />
                {importing
                  ? importing === "csv"
                    ? "Lendo CSV…"
                    : importing === "excel"
                      ? "Lendo Excel…"
                      : "Lendo PDF…"
                  : "Importar"}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${importMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {importMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-md border border-white/10 bg-[#1a1a1a]/95 backdrop-blur-md shadow-2xl overflow-hidden animate-fade-in"
                  data-import-menu
                >
                  <button
                    onClick={() => triggerImport("csv")}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-zinc-400" />
                    <div className="text-left">
                      <p className="font-medium">CSV / TXT</p>
                      <p className="text-[10px] text-zinc-500">
                        Separado por vírgula ou ponto-vírgula
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => triggerImport("excel")}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                    <div className="text-left">
                      <p className="font-medium">Excel</p>
                      <p className="text-[10px] text-zinc-500">
                        .xlsx, .xls ou .ods
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => triggerImport("pdf")}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5"
                  >
                    <FileType className="h-3.5 w-3.5 text-red-400" />
                    <div className="text-left">
                      <p className="font-medium">PDF</p>
                      <p className="text-[10px] text-zinc-500">
                        Extrai telefones do texto
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />

      {mode === "manual" && (
        <GlassCard strong className="mb-5">
          <form
            onSubmit={handleAdd}
            className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
          >
            <NeonInput
              label="Nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Maria Silva"
            />
            <NeonInput
              label="Telefone *"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="11988887777"
              icon={<Phone className="h-4 w-4" />}
              required
            />
            <NeonInput
              label="Empresa"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Opcional"
            />
            {/* Categoria com datalist pra autocompletar negócios já existentes */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
                Negócio
              </label>
              <input
                list="cats-existentes"
                value={novoCategoria}
                onChange={(e) => setNovoCategoria(e.target.value)}
                placeholder="Ex: Negócio A"
                className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 focus:border-[#FF0033]/60 focus:outline-none"
              />
              <datalist id="cats-existentes">
                {categorias.items.map((c) => (
                  <option key={c.categoria} value={c.categoria} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-2">
              <NeonButton type="submit" size="sm">
                Salvar
              </NeonButton>
              <NeonButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("idle")}
              >
                Cancelar
              </NeonButton>
            </div>
          </form>
          <p className="text-xs text-zinc-500 mt-3">
            Aceita DDD + número (10 ou 11 dígitos) — o 55 é adicionado
            automaticamente se faltar.
          </p>
        </GlassCard>
      )}

      <GlassCard>
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <p className="text-xs text-zinc-500">
            Importe de <b>CSV</b>, <b>Excel</b> ou <b>PDF</b>, ou cole uma
            lista em lote — o parser detecta números automaticamente. Linhas
            sem telefone válido são descartadas.
          </p>
          <div className="flex-1" />
          <div className="w-full md:w-72">
            <NeonInput
              placeholder="Buscar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              icon={<Search className="h-4 w-4" />}
            />
          </div>
        </div>

        {/* Filtro por categoria/negócio — aparece se tiver pelo menos 1 categoria */}
        {(categorias.items.length > 0 || categorias.semCategoria > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-1">
              Negócio:
            </span>
            <button
              onClick={() => setCategoriaFiltro(null)}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
                categoriaFiltro === null
                  ? "border-[#FF0033] bg-[#FF0033]/10 text-[#FF0033]"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              Todos
              <span className="tabular-nums opacity-70">
                {categorias.total}
              </span>
            </button>
            {categorias.items.map((c) => (
              <button
                key={c.categoria}
                onClick={() => setCategoriaFiltro(c.categoria)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
                  categoriaFiltro === c.categoria
                    ? "border-[#FF0033] bg-[#FF0033]/10 text-[#FF0033]"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {c.categoria}
                <span className="tabular-nums opacity-70">{c.count}</span>
              </button>
            ))}
            {categorias.semCategoria > 0 && (
              <button
                onClick={() => setCategoriaFiltro("__sem__")}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
                  categoriaFiltro === "__sem__"
                    ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                    : "border-amber-400/20 bg-amber-400/5 text-amber-300/80 hover:bg-amber-400/10"
                }`}
                title="Contatos sem categoria atribuída"
              >
                Sem categoria
                <span className="tabular-nums opacity-70">
                  {categorias.semCategoria}
                </span>
              </button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="h-10 w-10 mx-auto rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-3">
              <Users className="h-4 w-4 text-[#FF0033]" />
            </div>
            <p className="text-sm font-semibold text-white">
              {contatos.length === 0
                ? "Base vazia"
                : "Nenhum resultado"}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {contatos.length === 0
                ? "Importe CSV, Excel, PDF ou cole uma lista."
                : "Tente outra busca."}
            </p>
          </div>
        ) : (
          <>
            {/* Toolbar da seleção — aparece sempre que tem pelo menos 1 item marcado. */}
            {selected.size > 0 && (
              <div className="mb-3 rounded-md border border-[#FF0033]/30 bg-[#FF0033]/5 px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-200">
                  <span className="text-[#FF0033] font-semibold tabular-nums">
                    {selected.size}
                  </span>{" "}
                  selecionado{selected.size === 1 ? "" : "s"}
                </span>
                {selected.size < filtered.length && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-[11px] text-zinc-400 hover:text-white underline underline-offset-2"
                  >
                    Selecionar todos os {filtered.length}
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] text-zinc-400 hover:text-white px-2 py-1 rounded transition-colors"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white border border-white/15 hover:border-white/25 bg-black/30 hover:bg-black/40 px-2.5 py-1 rounded-md transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar {selected.size}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-red-300 hover:text-red-200 border border-red-400/40 hover:border-red-400/60 bg-red-400/5 hover:bg-red-400/10 px-2.5 py-1 rounded-md transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir {selected.size}
                </button>
              </div>
            )}

            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                    <th className="py-2 w-8">
                      <input
                        type="checkbox"
                        aria-label="Selecionar página"
                        checked={allPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !allPageSelected && somePageSelected;
                        }}
                        onChange={togglePage}
                        className="h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-[#FF0033] focus:ring-[#FF0033]/40 focus:ring-offset-0 cursor-pointer accent-[#FF0033]"
                      />
                    </th>
                    <th className="py-2 font-medium">Nome</th>
                    <th className="py-2 font-medium">Telefone</th>
                    <th className="py-2 font-medium hidden lg:table-cell">
                      Negócio
                    </th>
                    <th className="py-2 font-medium hidden md:table-cell">
                      Empresa
                    </th>
                    <th className="py-2 font-medium hidden md:table-cell">
                      Criado
                    </th>
                    <th className="py-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pageItems.map((c) => {
                    const isSelected = selected.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-white/[0.02] ${isSelected ? "bg-[#FF0033]/5" : ""}`}
                      >
                        <td className="py-2.5 w-8">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${c.nome || c.telefone}`}
                            checked={isSelected}
                            onChange={() => toggleOne(c.id)}
                            className="h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-[#FF0033] focus:ring-[#FF0033]/40 focus:ring-offset-0 cursor-pointer accent-[#FF0033]"
                          />
                        </td>
                        <td className="py-2.5 font-medium">
                          {c.nome || <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="py-2.5 text-zinc-300 tabular-nums">
                          {formatPhoneBR(c.telefone)}
                        </td>
                        <td className="py-2.5 hidden lg:table-cell">
                          {c.categoria ? (
                            <button
                              onClick={() => setCategoriaFiltro(c.categoria!)}
                              className="text-[11px] px-1.5 py-0.5 rounded border border-[#FF0033]/30 bg-[#FF0033]/10 text-[#FF0033] hover:bg-[#FF0033]/20 transition-colors"
                              title="Filtrar por este negócio"
                            >
                              {c.categoria}
                            </button>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-zinc-400 hidden md:table-cell">
                          {c.empresa || "—"}
                        </td>
                        <td className="py-2.5 text-zinc-500 hidden md:table-cell">
                          {formatDateBR(c.criadoEm)}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => setConfirmId(c.id)}
                            className="text-zinc-500 hover:text-[#FF0033] p-1"
                            aria-label="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-3 border-t border-white/5">
              <p className="text-xs text-zinc-500 tabular-nums">
                {filtered.length === 0
                  ? "Nenhum contato"
                  : `${pageStart + 1}–${pageEnd} de ${filtered.length} contato${filtered.length === 1 ? "" : "s"}`}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <NeonButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                  </NeonButton>
                  <span className="text-xs text-zinc-400 tabular-nums px-2">
                    Página {page} de {totalPages}
                  </span>
                  <NeonButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Próxima <ChevronRight className="h-3.5 w-3.5" />
                  </NeonButton>
                </div>
              )}
            </div>
          </>
        )}
      </GlassCard>

      {pasteOpen && (
        <BulkPasteModal
          onClose={() => setPasteOpen(false)}
          onImport={importRows}
          categoriasExistentes={categorias.items.map((c) => c.categoria)}
        />
      )}

      {pendingFileImport && (
        <ImportFileConfigModal
          rows={pendingFileImport.rows}
          source={pendingFileImport.source}
          fileName={pendingFileImport.fileName}
          categoriasExistentes={categorias.items.map((c) => c.categoria)}
          onClose={() => setPendingFileImport(null)}
          onConfirm={importRows}
        />
      )}

      <ImportPreviewModal
        open={!!importPreview}
        preview={importPreview}
        busy={importBusy}
        onCancel={cancelImport}
        onConfirm={confirmImport}
      />

      <ConfirmModal
        open={!!confirmId}
        title="Remover contato?"
        description={
          confirmTarget
            ? `${confirmTarget.nome || "(sem nome)"} · ${formatPhoneBR(confirmTarget.telefone)}\n\nEsta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmRemove}
        onClose={() => setConfirmId(null)}
      />

      <ConfirmModal
        open={bulkConfirmOpen}
        title={`Remover ${selected.size} contato${selected.size === 1 ? "" : "s"}?`}
        description={`Esta ação remove os contatos selecionados e seus vínculos com listas.\n\nNão pode ser desfeita.`}
        confirmLabel={deletingBulk ? "Removendo..." : `Remover ${selected.size}`}
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleBulkDelete}
        onClose={() => !deletingBulk && setBulkConfirmOpen(false)}
      />
    </>
  );
}
