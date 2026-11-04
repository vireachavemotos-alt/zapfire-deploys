"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Ban, Plus, Trash2, RefreshCw, X, UserX, AlertTriangle, Loader2 } from "lucide-react";
import { Portal } from "@/components/Portal";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";
import { ConfirmModal } from "@/components/ConfirmModal";
import { formatPhoneBR, normalizePhone } from "@/lib/store";
import { formatDateTimeBR } from "@/lib/utils";

type BloqueioOrigem = "auto" | "manual" | "optout";

interface BloqueioItem {
  telefone: string;
  motivo: string;
  falhas: number;
  origem: BloqueioOrigem;
  bloqueadoEm: string;
  validoAte: string | null;
  ativo: boolean;
}

export default function BlacklistPage() {
  const [items, setItems] = useState<BloqueioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [novoTel, setNovoTel] = useState("");
  const [novoMotivo, setNovoMotivo] = useState("");
  const [novoDias, setNovoDias] = useState(7);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "todos" | "ativos" | "auto" | "manual" | "optout"
  >("ativos");
  const [optoutModalOpen, setOptoutModalOpen] = useState(false);
  const [optoutText, setOptoutText] = useState("");
  const [optoutMotivo, setOptoutMotivo] = useState("");
  const [savingOptout, setSavingOptout] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await fetch("/api/blacklist");
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd() {
    const tel = normalizePhone(novoTel);
    if (!tel) {
      toast.error("Telefone inválido.");
      return;
    }
    setAdding(true);
    try {
      const r = await fetch("/api/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefone: tel,
          motivo: novoMotivo.trim() || "bloqueado manualmente",
          diasValidade: novoDias,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${r.status}`);
      }
      toast.success("Número bloqueado.");
      setNovoTel("");
      setNovoMotivo("");
      load();
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(tel: string) {
    try {
      const r = await fetch(`/api/blacklist?telefone=${encodeURIComponent(tel)}`, {
        method: "DELETE",
      });
      if (!r.ok && r.status !== 404) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${r.status}`);
      }
      toast.success("Desbloqueado.");
      load();
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setRemovingId(null);
    }
  }

  const visible = items.filter((i) => {
    if (filter === "ativos") return i.ativo;
    if (filter === "todos") return true;
    // auto / manual / optout: filtra por origem (só os ativos)
    return i.ativo && i.origem === filter;
  });
  const ativos = items.filter((i) => i.ativo).length;
  const countBy = (o: BloqueioOrigem) =>
    items.filter((i) => i.ativo && i.origem === o).length;

  async function handleOptoutSubmit() {
    const tels = optoutText
      .split(/[\s,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tels.length === 0) {
      toast.warning("Cole pelo menos 1 telefone.");
      return;
    }
    setSavingOptout(true);
    try {
      const r = await fetch("/api/blacklist/optout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefones: tels,
          motivo: optoutMotivo.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${r.status}`);
      }
      const d = await r.json();
      const partes: string[] = [];
      if (d.adicionados > 0) partes.push(`${d.adicionados} novos opt-outs`);
      if (d.jaEraOptOut > 0) partes.push(`${d.jaEraOptOut} já era opt-out`);
      if (d.invalidos > 0) partes.push(`${d.invalidos} inválidos`);
      toast.success(partes.join(" · ") || "Processado.");
      setOptoutText("");
      setOptoutMotivo("");
      setOptoutModalOpen(false);
      load();
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setSavingOptout(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Blacklist"
        subtitle={`${ativos} número${ativos === 1 ? "" : "s"} bloqueado${ativos === 1 ? "" : "s"} no momento. Auto-block dispara após 3 falhas em 24h.`}
        actions={
          <>
            <NeonButton
              size="sm"
              onClick={() => setOptoutModalOpen(true)}
              title="Marca vários números como opt-out (contato pediu pra sair). Nunca mais recebem."
            >
              <X className="h-3.5 w-3.5" /> Opt-out em massa
            </NeonButton>
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setLoading(true);
                load();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </NeonButton>
          </>
        }
      />

      <GlassCard className="mb-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-[#FF0033]" />
          Bloquear número manualmente
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <div className="md:col-span-4">
            <NeonInput
              label="Telefone"
              placeholder="11999998888"
              value={novoTel}
              onChange={(e) => setNovoTel(e.target.value)}
            />
          </div>
          <div className="md:col-span-5">
            <NeonInput
              label="Motivo (opcional)"
              placeholder="Cliente pediu para parar"
              value={novoMotivo}
              onChange={(e) => setNovoMotivo(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <NeonInput
              label="Dias"
              type="number"
              min="0"
              value={String(novoDias)}
              onChange={(e) => setNovoDias(Number(e.target.value) || 0)}
              hint="0 = permanente"
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <NeonButton
              size="sm"
              onClick={handleAdd}
              disabled={adding || !novoTel.trim()}
              className="w-full"
            >
              {adding ? "..." : "Bloquear"}
            </NeonButton>
          </div>
        </div>
      </GlassCard>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(
          [
            { k: "ativos", label: "Ativos", count: ativos, cls: "[#FF0033]" },
            { k: "auto", label: "Auto-block", count: countBy("auto"), cls: "amber-300" },
            { k: "manual", label: "Manual", count: countBy("manual"), cls: "zinc-300" },
            { k: "optout", label: "Opt-out", count: countBy("optout"), cls: "red-300" },
            { k: "todos", label: "Todos (histórico)", count: items.length, cls: "zinc-400" },
          ] as const
        ).map((p) => (
          <button
            key={p.k}
            onClick={() => setFilter(p.k)}
            className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
              filter === p.k
                ? "border-[#FF0033] bg-[#FF0033]/10 text-[#FF0033]"
                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {p.label}
            <span className="tabular-nums opacity-70">{p.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <GlassCard className="py-12 text-center">
          <p className="text-sm text-zinc-500">Carregando…</p>
        </GlassCard>
      ) : error ? (
        <GlassCard className="py-12 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </GlassCard>
      ) : visible.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <div className="h-10 w-10 mx-auto rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-3">
            <Ban className="h-4 w-4 text-[#FF0033]" />
          </div>
          <p className="text-sm font-semibold text-white">
            {filter === "ativos"
              ? "Nenhum número bloqueado no momento"
              : "Histórico vazio"}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Números com 3+ falhas em 24h aparecem aqui automaticamente.
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 bg-[#0a0a0a]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="py-2.5 px-3 font-medium">Número</th>
                <th className="py-2.5 px-3 font-medium">Motivo</th>
                <th className="py-2.5 px-3 font-medium">Origem</th>
                <th className="py-2.5 px-3 font-medium">Bloqueado em</th>
                <th className="py-2.5 px-3 font-medium">Vence</th>
                <th className="py-2.5 px-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visible.map((it) => (
                <tr key={it.telefone} className="hover:bg-white/[0.02]">
                  <td className="py-2 px-3 font-mono tabular-nums">
                    {formatPhoneBR(it.telefone)}
                    {!it.ativo && (
                      <span className="ml-1.5 text-[9px] text-zinc-500 uppercase tracking-wider">
                        expirado
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-zinc-300 max-w-xs truncate">
                    {it.motivo}
                    {it.falhas > 0 && (
                      <span className="ml-1.5 text-zinc-500">
                        · {it.falhas} falha{it.falhas === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                        it.origem === "auto"
                          ? "border-amber-400/30 bg-amber-400/5 text-amber-300"
                          : it.origem === "optout"
                            ? "border-red-400/40 bg-red-400/10 text-red-300"
                            : "border-white/10 bg-white/5 text-zinc-300"
                      }`}
                      title={
                        it.origem === "auto"
                          ? "Auto-bloqueado pelo runner após falhas"
                          : it.origem === "optout"
                            ? "Opt-out: o contato pediu pra sair (permanente)"
                            : "Bloqueio manual"
                      }
                    >
                      {it.origem === "auto" && <AlertTriangle className="h-2.5 w-2.5" />}
                      {it.origem === "optout" && <UserX className="h-2.5 w-2.5" />}
                      {it.origem}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-zinc-400 tabular-nums">
                    {formatDateTimeBR(it.bloqueadoEm)}
                  </td>
                  <td className="py-2 px-3 text-xs text-zinc-400 tabular-nums">
                    {it.validoAte
                      ? formatDateTimeBR(it.validoAte)
                      : "permanente"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {it.ativo && (
                      <button
                        onClick={() => setRemovingId(it.telefone)}
                        className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                        title="Desbloquear"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}

      {/* Modal: opt-out em massa */}
      {optoutModalOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={savingOptout ? undefined : () => setOptoutModalOpen(false)}
          >
            <GlassCard
              strong
              className="w-full max-w-xl relative p-6 animate-pop"
              onClick={(e) => e.stopPropagation()}
            >
              {!savingOptout && (
                <button
                  onClick={() => setOptoutModalOpen(false)}
                  className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <div className="flex items-center gap-2.5 mb-1">
                <div className="h-8 w-8 rounded-md bg-gradient-to-br from-red-400/20 to-red-400/5 border border-red-400/30 flex items-center justify-center">
                  <UserX className="h-4 w-4 text-red-300" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Opt-out em massa
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Nunca mais recebem mensagem. Permanente — só desbloqueio manual tira.
                  </p>
                </div>
              </div>

              <div className="neon-divider my-4" />

              <label className="block mb-3">
                <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
                  Telefones (um por linha ou separados por vírgula)
                </span>
                <textarea
                  value={optoutText}
                  onChange={(e) => setOptoutText(e.target.value)}
                  disabled={savingOptout}
                  placeholder={"11988887777\n21999998888\n+55 85 94321 5566"}
                  rows={6}
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#FF0033]/60 focus:outline-none disabled:opacity-50 resize-none font-mono"
                  spellCheck={false}
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  {optoutText.split(/[\s,;\n]+/).filter(Boolean).length} número(s) detectado(s)
                </p>
              </label>

              <label className="block">
                <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
                  Motivo (opcional)
                </span>
                <input
                  value={optoutMotivo}
                  onChange={(e) => setOptoutMotivo(e.target.value)}
                  disabled={savingOptout}
                  placeholder="Contato pediu para sair"
                  className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 focus:border-[#FF0033]/60 focus:outline-none disabled:opacity-50"
                />
              </label>

              <div className="flex items-center gap-2 pt-4 mt-4 border-t border-white/5">
                <NeonButton
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => setOptoutModalOpen(false)}
                  disabled={savingOptout}
                >
                  Cancelar
                </NeonButton>
                <NeonButton
                  size="sm"
                  className="flex-1"
                  onClick={handleOptoutSubmit}
                  disabled={savingOptout || !optoutText.trim()}
                >
                  {savingOptout ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processando…
                    </>
                  ) : (
                    "Confirmar opt-out"
                  )}
                </NeonButton>
              </div>
            </GlassCard>
          </div>
        </Portal>
      )}

      <ConfirmModal
        open={!!removingId}
        title="Desbloquear número?"
        description={
          removingId
            ? `${formatPhoneBR(removingId)} voltará a receber mensagens nas próximas campanhas.`
            : ""
        }
        confirmLabel="Desbloquear"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => removingId && handleRemove(removingId)}
        onClose={() => setRemovingId(null)}
      />
    </>
  );
}
