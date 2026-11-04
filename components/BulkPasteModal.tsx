"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardPaste, X, Users, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { NeonButton } from "./NeonButton";
import { Portal } from "./Portal";
import { extractContacts, type ParsedContact } from "@/lib/contact-parser";
import { formatPhoneBR } from "@/lib/store";
import { normalizePhone } from "@/lib/phone";

interface Props {
  onClose: () => void;
  /** Lista de categorias existentes pra autocompletar o campo Negócio. */
  categoriasExistentes?: string[];
  onImport: (
    rows: ParsedContact[],
    opts?: {
      categoria?: string;
      criarLista?: { nome: string; descricao?: string };
    }
  ) => Promise<void>;
}

/**
 * Modal de colagem em lote.
 * O usuário cola QUALQUER blob de texto (lista do WhatsApp, export do Excel,
 * números separados por vírgula, etc) e o parser detecta automaticamente
 * o que é telefone e o que é nome.
 *
 * Preview em tempo real: mostra quantos contatos válidos foram detectados
 * antes de importar, pra dar confiança pro usuário.
 */
export function BulkPasteModal({ onClose, onImport, categoriasExistentes = [] }: Props) {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [categoria, setCategoria] = useState("");
  const [criarLista, setCriarLista] = useState(false);
  const [nomeLista, setNomeLista] = useState("");

  const parsed = useMemo(() => {
    if (!raw.trim()) return { rows: [] as ParsedContact[], validos: 0, invalidos: 0 };
    const rows = extractContacts(raw);
    let validos = 0;
    let invalidos = 0;
    for (const r of rows) {
      if (normalizePhone(r.telefone)) validos++;
      else invalidos++;
    }
    return { rows, validos, invalidos };
  }, [raw]);

  async function handleImport() {
    if (parsed.validos === 0) return;
    setSubmitting(true);
    try {
      const cat = categoria.trim();
      // Sugestão default pro nome da lista quando o usuário marca o checkbox
      // mas não digita um nome: usa categoria ou "Importação DD/MM"
      const dataStr = new Date().toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
      const defaultListName = cat
        ? `${cat} — ${dataStr}`
        : `Importação ${dataStr}`;
      const listaPayload =
        criarLista
          ? { nome: nomeLista.trim() || defaultListName }
          : undefined;
      await onImport(parsed.rows, {
        categoria: cat || undefined,
        criarLista: listaPayload,
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
        className="w-full max-w-2xl relative p-6 animate-pop"
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
            <ClipboardPaste className="h-4 w-4 text-[#FF3355]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Colar contatos em lote
            </h2>
            <p className="text-xs text-zinc-500">
              Cole qualquer texto — a gente detecta os números e nomes
              automaticamente.
            </p>
          </div>
        </div>

        <div className="neon-divider my-4" />

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`Aceita vários formatos. Exemplos:

Maria Silva - 11 99887-7766
João Pedro, (21) 98765-4321, Padaria do Zé
+5511988877766
11 99887-7766
`}
          className="w-full h-56 resize-none rounded-md bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF0033]/50 font-mono"
          spellCheck={false}
          disabled={submitting}
        />

        {/* Preview em tempo real */}
        {raw.trim() && (
          <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-4 mb-2 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <b className="tabular-nums">{parsed.validos}</b> válidos
              </span>
              {parsed.invalidos > 0 && (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <b className="tabular-nums">{parsed.invalidos}</b> inválidos
                </span>
              )}
              <span className="text-zinc-500 ml-auto">
                Duplicados no lote serão ignorados automaticamente.
              </span>
            </div>

            {parsed.rows.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border border-white/5">
                <table className="w-full text-xs">
                  <tbody>
                    {parsed.rows.slice(0, 20).map((r, i) => {
                      const norm = normalizePhone(r.telefone);
                      return (
                        <tr
                          key={i}
                          className="border-b border-white/5 last:border-0"
                        >
                          <td className="px-2 py-1.5 text-zinc-300">
                            {r.nome || (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums text-right">
                            {norm ? (
                              <span className="text-white">
                                {formatPhoneBR(norm)}
                              </span>
                            ) : (
                              <span className="text-amber-400">
                                {r.telefone}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {parsed.rows.length > 20 && (
                  <p className="text-[10px] text-zinc-500 text-center py-1.5 bg-white/[0.02]">
                    + {parsed.rows.length - 20} contatos a seguir
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Atribuição de Negócio + criar lista. Sempre visível, mesmo
            sem texto colado — assim o usuário já entende que pode separar. */}
        <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
              Negócio (opcional, mas recomendado)
            </label>
            <input
              list="bulkpaste-cats"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex: Negócio A, Cliente Imóveis…"
              disabled={submitting}
              className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 focus:border-[#FF0033]/60 focus:outline-none disabled:opacity-50"
            />
            <datalist id="bulkpaste-cats">
              {categoriasExistentes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-[10px] text-zinc-500 mt-1">
              Aplicado a todos os {parsed.validos || ""} contatos desta importação. Pra contatos que já existem, só preenche se ainda não tinham negócio.
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
                Atalho — em vez de criar a lista depois manualmente, ela já sai pronta pra usar em campanha.
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

        <div className="flex items-center gap-2 pt-4">
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
            onClick={handleImport}
            disabled={parsed.validos === 0 || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5" />
                Importar {parsed.validos > 0 ? parsed.validos : ""}
              </>
            )}
          </NeonButton>
        </div>
      </GlassCard>
    </div>
    </Portal>
  );
}
