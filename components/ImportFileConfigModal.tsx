"use client";
import { useState } from "react";
import { toast } from "sonner";
import { FileType, X, Users, Loader2 } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { NeonButton } from "./NeonButton";
import { Portal } from "./Portal";
import { type ParsedContact } from "@/lib/contact-parser";
import { formatPhoneBR } from "@/lib/store";
import { normalizePhone } from "@/lib/phone";

interface Props {
  /** Rows já parseados do arquivo (CSV/Excel/PDF). */
  rows: ParsedContact[];
  /** Tipo da fonte (só pra label). */
  source: "csv" | "excel" | "pdf";
  /** Nome do arquivo original (label). */
  fileName?: string;
  /** Categorias existentes pra autocompletar. */
  categoriasExistentes?: string[];
  onClose: () => void;
  onConfirm: (
    rows: ParsedContact[],
    opts: {
      categoria?: string;
      criarLista?: { nome: string; descricao?: string };
    }
  ) => Promise<void>;
}

const SOURCE_LABEL: Record<Props["source"], string> = {
  csv: "CSV",
  excel: "Excel",
  pdf: "PDF",
};

/**
 * Modal pós-parse: depois que o arquivo foi lido e os números extraídos,
 * mostra preview + form de categoria + opção de criar lista.
 *
 * Funciona como "etapa 2" do fluxo de importação por arquivo. O fluxo de
 * colar tem o BulkPasteModal que já junta tudo num modal só.
 */
export function ImportFileConfigModal({
  rows,
  source,
  fileName,
  categoriasExistentes = [],
  onClose,
  onConfirm,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [categoria, setCategoria] = useState("");
  const [criarLista, setCriarLista] = useState(false);
  const [nomeLista, setNomeLista] = useState("");

  const validos = rows.filter((r) => normalizePhone(r.telefone)).length;
  const invalidos = rows.length - validos;

  async function handleConfirm() {
    if (validos === 0) {
      toast.error("Nenhum contato válido pra importar.");
      return;
    }
    setSubmitting(true);
    try {
      const cat = categoria.trim();
      const dataStr = new Date().toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      const defaultListName = cat
        ? `${cat} — ${dataStr}`
        : `Importação ${dataStr}`;
      await onConfirm(rows, {
        categoria: cat || undefined,
        criarLista: criarLista
          ? { nome: nomeLista.trim() || defaultListName }
          : undefined,
      });
      onClose();
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        onClick={submitting ? undefined : onClose}
      >
        <GlassCard
          strong
          className="w-full max-w-xl relative p-6 animate-pop"
          onClick={(e) => e.stopPropagation()}
        >
          {!submitting && (
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-[#FF0033]/20 to-[#FF0033]/5 border border-[#FF0033]/30 flex items-center justify-center">
              <FileType className="h-4 w-4 text-[#FF3355]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Importar {SOURCE_LABEL[source]}
              </h2>
              <p className="text-xs text-zinc-500 truncate">
                {fileName || "arquivo selecionado"} ·{" "}
                <b className="text-emerald-400 tabular-nums">{validos}</b>{" "}
                contato{validos === 1 ? "" : "s"} válido
                {validos === 1 ? "" : "s"}
                {invalidos > 0 && (
                  <>
                    {" · "}
                    <b className="text-amber-400 tabular-nums">{invalidos}</b>{" "}
                    inválido{invalidos === 1 ? "" : "s"} (descartado
                    {invalidos === 1 ? "" : "s"})
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="neon-divider my-4" />

          {/* Mini preview */}
          {rows.length > 0 && (
            <div className="rounded-md border border-white/5 max-h-32 overflow-y-auto mb-4">
              <table className="w-full text-xs">
                <tbody>
                  {rows.slice(0, 8).map((r, i) => {
                    const norm = normalizePhone(r.telefone);
                    return (
                      <tr
                        key={i}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="px-2 py-1 text-zinc-300">
                          {r.nome || (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1 tabular-nums text-right">
                          {norm ? (
                            <span className="text-white">
                              {formatPhoneBR(norm)}
                            </span>
                          ) : (
                            <span className="text-amber-400">{r.telefone}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 8 && (
                <p className="text-[10px] text-zinc-500 text-center py-1 bg-white/[0.02]">
                  + {rows.length - 8} contatos a seguir
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
                Negócio (opcional, mas recomendado)
              </label>
              <input
                list="importfile-cats"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Ex: Negócio A, Cliente Imóveis…"
                disabled={submitting}
                className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 focus:border-[#FF0033]/60 focus:outline-none disabled:opacity-50"
              />
              <datalist id="importfile-cats">
                {categoriasExistentes.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-[10px] text-zinc-500 mt-1">
                Aplicado a todos os {validos || ""} contatos desta importação.
              </p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={criarLista}
                onChange={(e) => setCriarLista(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-[#FF0033] focus:ring-[#FF0033]/40 focus:ring-offset-0 cursor-pointer accent-[#FF0033]"
              />
              <div className="flex-1">
                <p className="text-xs text-zinc-200">
                  Criar uma lista com esses contatos
                </p>
                <p className="text-[10px] text-zinc-500">
                  A lista já sai pronta pra usar em campanha.
                </p>
              </div>
            </label>

            {criarLista && (
              <input
                value={nomeLista}
                onChange={(e) => setNomeLista(e.target.value)}
                placeholder={
                  categoria.trim()
                    ? `${categoria.trim()} — ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
                    : `Importação ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
                }
                disabled={submitting}
                className="w-full bg-black/40 border border-[#FF0033]/30 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 focus:border-[#FF0033]/60 focus:outline-none disabled:opacity-50"
              />
            )}
          </div>

          <div className="flex items-center gap-2 pt-4 mt-4 border-t border-white/5">
            <NeonButton
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </NeonButton>
            <NeonButton
              size="sm"
              className="flex-1"
              onClick={handleConfirm}
              disabled={validos === 0 || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Users className="h-3.5 w-3.5" />
                  Importar {validos}
                </>
              )}
            </NeonButton>
          </div>
        </GlassCard>
      </div>
    </Portal>
  );
}
