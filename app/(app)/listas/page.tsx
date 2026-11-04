"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  Plus,
  ListChecks,
  Trash2,
  Rocket,
  Search,
  Users,
  Edit3,
  X,
  Check,
  ShieldCheck,
  Copy,
  GitMerge,
  Loader2,
} from "lucide-react";
import { Portal } from "@/components/Portal";
import { useStore, formatPhoneBR, Lista } from "@/lib/store";
import { formatDateBR } from "@/lib/utils";
import { ValidateNumbersModal } from "@/components/ValidateNumbersModal";

type Editing =
  | { mode: "new" }
  | { mode: "edit"; lista: Lista };

export default function ListasPage() {
  const listas = useStore((s) => s.listas);
  const contatos = useStore((s) => s.contatos);
  const addLista = useStore((s) => s.addLista);
  const removeLista = useStore((s) => s.removeLista);
  const updateLista = useStore((s) => s.updateLista);

  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [validating, setValidating] = useState<Lista | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeNome, setMergeNome] = useState("");
  const [mergeDescricao, setMergeDescricao] = useState("");
  const [savingMerge, setSavingMerge] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Mapa contatoId → whatsappValido (lookup O(1) na render das listas).
  const validityById = useMemo(() => {
    const m = new Map<string, boolean | null | undefined>();
    for (const c of contatos) m.set(c.id, c.whatsappValido);
    return m;
  }, [contatos]);
  const confirmTarget = confirmId
    ? listas.find((l) => l.id === confirmId)
    : null;

  // Toggle de seleção pra merge
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Preview rápido: total de contatos únicos nas listas selecionadas
  const mergePreview = useMemo(() => {
    if (selectedIds.size < 2) return { total: 0, listasNomes: [] as string[] };
    const uniq = new Set<string>();
    const nomes: string[] = [];
    for (const l of listas) {
      if (!selectedIds.has(l.id)) continue;
      nomes.push(l.nome);
      for (const cid of l.contatoIds) uniq.add(cid);
    }
    return { total: uniq.size, listasNomes: nomes };
  }, [selectedIds, listas]);

  function abrirMerge() {
    if (selectedIds.size < 2) {
      toast.warning("Selecione pelo menos 2 listas.");
      return;
    }
    const dataStr = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    setMergeNome(`Mesclada ${dataStr}`);
    setMergeDescricao(
      `Mesclagem de ${mergePreview.listasNomes.length} listas: ${mergePreview.listasNomes.join(", ")}`
    );
    setMergeOpen(true);
  }

  async function handleMerge() {
    if (!mergeNome.trim()) {
      toast.warning("Dê um nome pra lista nova.");
      return;
    }
    setSavingMerge(true);
    try {
      const r = await fetch("/api/listas/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listaIds: Array.from(selectedIds),
          nome: mergeNome.trim(),
          descricao: mergeDescricao.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${r.status}`);
      }
      const d = await r.json();
      toast.success(
        `"${d.listaCriada.nome}" criada com ${d.contatosAdicionados} contato${d.contatosAdicionados === 1 ? "" : "s"}.`
      );
      setMergeOpen(false);
      setSelectedIds(new Set());
      await useStore.getState().reloadListas();
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setSavingMerge(false);
    }
  }

  async function handleDuplicate(l: Lista) {
    setDuplicatingId(l.id);
    try {
      const r = await fetch(`/api/listas/${l.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${r.status}`);
      }
      const d = await r.json();
      toast.success(
        `"${d.listaCriada.nome}" criada com ${d.contatosCopiados} contato${d.contatosCopiados === 1 ? "" : "s"}.`
      );
      await useStore.getState().reloadListas();
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleConfirmRemove() {
    if (!confirmId) return;
    try {
      await removeLista(confirmId);
      toast.success("Lista removida.");
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
    }
    setConfirmId(null);
  }

  async function handleSave(
    dados: { nome: string; descricao?: string },
    contatoIds: string[]
  ) {
    try {
      if (!editing) return;
      if (editing.mode === "new") {
        await addLista({ nome: dados.nome, descricao: dados.descricao, contatoIds });
        toast.success("Lista criada.");
      } else {
        await updateLista(editing.lista.id, {
          nome: dados.nome,
          descricao: dados.descricao,
          contatoIds,
        });
        toast.success("Lista atualizada.");
      }
      setEditing(null);
    } catch (err) {
      toast.error(`Falha ao salvar: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <PageHeader
        title="Listas"
        subtitle="Agrupe contatos para disparar em campanhas segmentadas."
        actions={
          <NeonButton
            onClick={() => setEditing({ mode: "new" })}
            disabled={contatos.length === 0}
          >
            <Plus className="h-4 w-4" /> Nova lista
          </NeonButton>
        }
      />

      {contatos.length === 0 && (
        <GlassCard className="mb-5 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-amber-200">
            Importe contatos antes de criar uma lista.{" "}
            <Link href="/contatos" className="text-[#FF0033] hover:underline">
              Ir para Base →
            </Link>
          </p>
        </GlassCard>
      )}

      {listas.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <div className="h-10 w-10 mx-auto rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-3">
            <ListChecks className="h-4 w-4 text-[#FF0033]" />
          </div>
          <p className="text-sm font-semibold text-white">
            Nenhuma lista criada
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {contatos.length === 0
              ? "Importe contatos primeiro."
              : "Crie uma lista para segmentar seus disparos."}
          </p>
        </GlassCard>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[#FF0033]/40 bg-[#FF0033]/10 px-3 py-2 animate-fade-in">
              <p className="text-xs text-zinc-200 tabular-nums">
                <b className="text-[#FF6680]">{selectedIds.size}</b> lista
                {selectedIds.size === 1 ? "" : "s"} selecionada
                {selectedIds.size === 1 ? "" : "s"}
                {selectedIds.size >= 2 && (
                  <span className="text-zinc-500">
                    {" "}
                    · ~{mergePreview.total} contato{mergePreview.total === 1 ? "" : "s"} únicos pra mesclar
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <NeonButton
                  size="sm"
                  onClick={abrirMerge}
                  disabled={selectedIds.size < 2}
                  title={
                    selectedIds.size < 2
                      ? "Selecione pelo menos 2 listas"
                      : "Mesclar selecionadas numa lista nova"
                  }
                >
                  <GitMerge className="h-3.5 w-3.5" /> Mesclar
                </NeonButton>
                <NeonButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="h-3.5 w-3.5" /> Limpar
                </NeonButton>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {listas.map((l) => {
            // Estatística de validação dos contatos desta lista
            let validos = 0;
            let invalidos = 0;
            let naoVerificados = 0;
            for (const cid of l.contatoIds) {
              const v = validityById.get(cid);
              if (v === true) validos++;
              else if (v === false) invalidos++;
              else naoVerificados++;
            }
            const temValidacao = validos + invalidos > 0;

            return (
              <GlassCard
                key={l.id}
                className={`animate-fade-up ${selectedIds.has(l.id) ? "ring-1 ring-[#FF0033]/60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(l.id)}
                      onChange={() => toggleSelected(l.id)}
                      aria-label={`Selecionar ${l.nome} pra merge`}
                      className="mt-1 h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-[#FF0033] focus:ring-[#FF0033]/40 focus:ring-offset-0 cursor-pointer accent-[#FF0033]"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{l.nome}</p>
                      {l.descricao && (
                        <p className="text-xs text-zinc-500 truncate mt-0.5">
                          {l.descricao}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDuplicate(l)}
                      disabled={duplicatingId === l.id}
                      className="text-zinc-500 hover:text-[#FF3355] p-1 transition-colors disabled:opacity-30"
                      aria-label="Duplicar"
                      title="Duplicar lista (cópia independente, mesmos contatos)"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditing({ mode: "edit", lista: l })}
                      className="text-zinc-500 hover:text-[#FF3355] p-1 transition-colors"
                      aria-label="Editar"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmId(l.id)}
                      className="text-zinc-500 hover:text-[#FF3355] p-1 transition-colors"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-2xl font-bold tabular-nums">
                    {l.contatoIds.length}
                  </span>
                  <span className="text-xs text-zinc-500">
                    de {contatos.length} contatos
                  </span>
                </div>

                {/* Badges de validação */}
                {l.contatoIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {temValidacao && validos > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300 tabular-nums">
                        <span className="h-1 w-1 rounded-full bg-emerald-400" />
                        {validos} válido{validos === 1 ? "" : "s"}
                      </span>
                    )}
                    {temValidacao && invalidos > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] text-red-300 tabular-nums">
                        <span className="h-1 w-1 rounded-full bg-red-400" />
                        {invalidos} inválido{invalidos === 1 ? "" : "s"}
                      </span>
                    )}
                    {naoVerificados > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 tabular-nums">
                        <span className="h-1 w-1 rounded-full bg-zinc-500" />
                        {naoVerificados} sem verificação
                      </span>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-zinc-600 mt-2">
                  Criada {formatDateBR(l.criadaEm)}
                </p>

                <div className="neon-divider my-4" />

                <div className="grid grid-cols-3 gap-2">
                  <NeonButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing({ mode: "edit", lista: l })}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Editar
                  </NeonButton>
                  <NeonButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setValidating(l)}
                    disabled={l.contatoIds.length === 0}
                    title="Validar se os números têm WhatsApp"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Validar
                  </NeonButton>
                  <Link href={`/campanhas/nova?lista=${l.id}`}>
                    <NeonButton
                      size="sm"
                      className="w-full"
                      disabled={l.contatoIds.length === 0}
                    >
                      <Rocket className="h-3.5 w-3.5" /> Disparar
                    </NeonButton>
                  </Link>
                </div>
              </GlassCard>
            );
          })}
          </div>
        </>
      )}

      {/* Modal: mesclar listas selecionadas */}
      {mergeOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={savingMerge ? undefined : () => setMergeOpen(false)}
          >
            <GlassCard
              strong
              className="w-full max-w-lg relative p-6 animate-pop"
              onClick={(e) => e.stopPropagation()}
            >
              {!savingMerge && (
                <button
                  onClick={() => setMergeOpen(false)}
                  className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <div className="flex items-center gap-2.5 mb-1">
                <div className="h-8 w-8 rounded-md bg-gradient-to-br from-[#FF0033]/20 to-[#FF0033]/5 border border-[#FF0033]/30 flex items-center justify-center">
                  <GitMerge className="h-4 w-4 text-[#FF3355]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Mesclar listas
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {mergePreview.listasNomes.length} listas → 1 nova. Contatos duplicados entram só uma vez.
                  </p>
                </div>
              </div>

              <div className="neon-divider my-4" />

              <div className="rounded-md border border-white/10 bg-black/40 p-3 mb-4">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
                  Listas de origem
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {mergePreview.listasNomes.map((n) => (
                    <span
                      key={n}
                      className="text-[11px] px-2 py-0.5 rounded border border-white/10 bg-white/5 text-zinc-300"
                    >
                      {n}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-zinc-300 mt-3">
                  Total de contatos únicos:{" "}
                  <b className="text-[#FF6680] tabular-nums">{mergePreview.total}</b>
                </p>
              </div>

              <NeonInput
                label="Nome da lista nova *"
                value={mergeNome}
                onChange={(e) => setMergeNome(e.target.value)}
                autoFocus
              />
              <div className="h-3" />
              <NeonInput
                label="Descrição (opcional)"
                value={mergeDescricao}
                onChange={(e) => setMergeDescricao(e.target.value)}
              />

              <div className="flex items-center gap-2 pt-4 mt-4 border-t border-white/5">
                <NeonButton
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => setMergeOpen(false)}
                  disabled={savingMerge}
                >
                  Cancelar
                </NeonButton>
                <NeonButton
                  size="sm"
                  className="flex-1"
                  onClick={handleMerge}
                  disabled={savingMerge || !mergeNome.trim()}
                >
                  {savingMerge ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mesclando…
                    </>
                  ) : (
                    `Mesclar ${mergePreview.total} contato${mergePreview.total === 1 ? "" : "s"}`
                  )}
                </NeonButton>
              </div>
            </GlassCard>
          </div>
        </Portal>
      )}

      {editing && (
        <ListaModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {validating && (
        <ValidateNumbersModal
          listaId={validating.id}
          listaNome={validating.nome}
          totalContatos={validating.contatoIds.length}
          onClose={() => setValidating(null)}
        />
      )}

      <ConfirmModal
        open={!!confirmId}
        title="Remover lista?"
        description={
          confirmTarget
            ? `"${confirmTarget.nome}" · ${confirmTarget.contatoIds.length} contato${confirmTarget.contatoIds.length === 1 ? "" : "s"} vinculado${confirmTarget.contatoIds.length === 1 ? "" : "s"}.\n\nOs contatos em si não serão apagados — só o agrupamento.`
            : undefined
        }
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmRemove}
        onClose={() => setConfirmId(null)}
      />
    </>
  );
}

// ----------------- Modal de criação/edição com seletor de contatos -----------------

function ListaModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Editing;
  onClose: () => void;
  onSave: (
    dados: { nome: string; descricao?: string },
    contatoIds: string[]
  ) => void | Promise<void>;
}) {
  const contatos = useStore((s) => s.contatos);

  const initial = editing.mode === "edit" ? editing.lista : null;

  const [nome, setNome] = useState(initial?.nome || "");
  const [descricao, setDescricao] = useState(initial?.descricao || "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial?.contatoIds || contatos.map((c) => c.id))
  );
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return contatos;
    return contatos.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.telefone.includes(q.replace(/\D/g, "")) ||
        (c.empresa || "").toLowerCase().includes(q)
    );
  }, [contatos, query]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filtered.forEach((c) => next.delete(c.id));
      } else {
        filtered.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    onSave(
      { nome: nome.trim(), descricao: descricao.trim() || undefined },
      Array.from(selected)
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-[#0a0a0a] border border-white/10 rounded-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                {editing.mode === "new" ? "Nova lista" : `Editar: ${initial?.nome}`}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Selecione os contatos que farão parte da lista.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-white p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <NeonInput
              label="Nome *"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Leads frios SP"
              required
            />
            <NeonInput
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="px-5 pb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Users className="h-3.5 w-3.5" />
              <span className="text-[#FF0033] font-semibold tabular-nums">
                {selected.size}
              </span>
              de {contatos.length} selecionado{selected.size === 1 ? "" : "s"}
            </div>
            <div className="w-64">
              <NeonInput
                placeholder="Buscar contato..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                icon={<Search className="h-3.5 w-3.5" />}
              />
            </div>
          </div>

          <div className="px-5 pb-3">
            <button
              type="button"
              onClick={toggleAllVisible}
              className="text-xs text-[#FF0033] hover:underline inline-flex items-center gap-1"
            >
              {allVisibleSelected
                ? "Desmarcar visíveis"
                : "Marcar todos visíveis"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto border-t border-white/5">
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500">
                {contatos.length === 0
                  ? "Sem contatos na base."
                  : "Nenhum resultado."}
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {filtered.map((c) => {
                  const on = selected.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors ${
                          on
                            ? "bg-[#FF0033]/5"
                            : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                            on
                              ? "bg-[#FF0033] border-[#FF0033]"
                              : "border-white/20"
                          }`}
                        >
                          {on && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {c.nome || (
                              <span className="text-zinc-600">— sem nome —</span>
                            )}
                          </p>
                          <p className="text-xs text-zinc-500 tabular-nums">
                            {formatPhoneBR(c.telefone)}
                            {c.empresa && ` · ${c.empresa}`}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="p-4 border-t border-white/5 flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              Lista sem contatos pode ser criada, mas não dispara.
            </p>
            <div className="flex gap-2">
              <NeonButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Cancelar
              </NeonButton>
              <NeonButton
                type="submit"
                size="sm"
                disabled={!nome.trim()}
              >
                {editing.mode === "new" ? "Criar lista" : "Salvar"}
              </NeonButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
