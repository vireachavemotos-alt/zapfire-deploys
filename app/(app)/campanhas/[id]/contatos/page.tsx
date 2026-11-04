"use client";
// Drill-down por contato — split-pane com dados reais do orquestrador.
// Esquerda: lista de CampanhaContato, filtro por status, busca por nome/telefone.
// Direita: timeline cronológica (MessageExecution + Attempts + InboundMessage).

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  MessageCircleReply,
  Search,
  Ban,
  AlertTriangle,
  Send,
  Loader2,
  XCircle,
  Pause,
  Inbox,
  Rocket,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/GlassCard";
import { CampaignTabs } from "@/components/campaign-flow/CampaignTabs";
import { cn } from "@/lib/utils";

type ContatoRow = {
  id: string;
  contatoId: string;
  nome: string;
  telefone: string;
  status: string;
  respondeuEm: string | null;
  ultimaRespostaId: string | null;
  stepAtualId: string | null;
  proximoEnvioEm: string | null;
  criadoEm: string;
};

type TimelineEvent = {
  tipo: string;
  label: string;
  timestamp: string;
  detail?: string;
  status?: string;
  textoEnviado?: string;
  textoRecebido?: string;
  erro?: string;
  snapshotNome?: string;
  stepPosicao?: number;
  versaoNumero?: number;
  instanceName?: string;
};

type TimelineResp = {
  contato: {
    id: string;
    nome: string;
    telefone: string;
    empresa?: string | null;
    status: string;
    respondeuEm: string | null;
    proximoEnvioEm: string | null;
    versaoFixada: number | null;
    stepAtualId: string | null;
    criadoEm: string;
  };
  timeline: TimelineEvent[];
};

const STATUS_META: Record<
  string,
  { color: string; bg: string; label: string; icon: typeof CheckCircle2 }
> = {
  pendente: { color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20", label: "Pendente", icon: Clock },
  em_andamento: { color: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/20", label: "Em andamento", icon: Loader2 },
  respondeu: { color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Respondeu", icon: MessageCircleReply },
  nao_respondeu: { color: "text-sky-300", bg: "bg-sky-500/10 border-sky-500/20", label: "Sem resposta", icon: Clock },
  concluido: { color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Concluído", icon: CheckCircle2 },
  opted_out: { color: "text-zinc-500", bg: "bg-zinc-500/10 border-zinc-500/20", label: "Opt-out", icon: Ban },
  bloqueado: { color: "text-red-300", bg: "bg-red-500/10 border-red-500/20", label: "Bloqueado", icon: Ban },
  falhou: { color: "text-red-300", bg: "bg-red-500/10 border-red-500/20", label: "Falhou", icon: AlertTriangle },
};

const EVENT_ICON: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  execution_pending: { icon: Clock, color: "text-zinc-400" },
  execution_scheduled: { icon: Clock, color: "text-zinc-400" },
  execution_running: { icon: Loader2, color: "text-amber-300" },
  execution_sent: { icon: Send, color: "text-sky-300" },
  execution_delivered: { icon: CheckCircle2, color: "text-emerald-300" },
  execution_read: { icon: CheckCircle2, color: "text-emerald-300" },
  execution_replied: { icon: MessageCircleReply, color: "text-emerald-300" },
  execution_failed: { icon: AlertTriangle, color: "text-red-300" },
  execution_blocked: { icon: Ban, color: "text-red-300" },
  execution_canceled: { icon: Pause, color: "text-zinc-400" },
  attempt_sent: { icon: Send, color: "text-sky-300" },
  attempt_failed: { icon: XCircle, color: "text-red-300" },
  inbound: { icon: Inbox, color: "text-emerald-300" },
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ContatosPage() {
  const params = useParams();
  const id = String(params.id);

  const [engine, setEngine] = useState<string | null>(null);
  const [contatos, setContatos] = useState<ContatoRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineResp | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/orquestrador/campanhas/${id}/contatos${
          statusFilter !== "todos" ? `?status=${statusFilter}` : ""
        }`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLoadError(err.error || `Erro ${res.status}`);
        setContatos([]);
        return;
      }
      const data = await res.json();
      setContatos(data.contatos ?? []);
      setEngine(data.engine ?? null);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [id, statusFilter]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!selectedId) {
      setTimeline(null);
      return;
    }
    let cancel = false;
    setTimelineLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/orquestrador/campanhas/${id}/contatos/${selectedId}/timeline`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TimelineResp;
        if (!cancel) setTimeline(data);
      } catch {
        if (!cancel) setTimeline(null);
      } finally {
        if (!cancel) setTimelineLoading(false);
      }
    })();
    const t = setInterval(() => {
      if (!cancel) {
        fetch(`/api/orquestrador/campanhas/${id}/contatos/${selectedId}/timeline`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .then((d) => !cancel && setTimeline(d))
          .catch(() => {});
      }
    }, 4000);
    return () => {
      cancel = true;
      clearInterval(t);
    };
  }, [id, selectedId]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contatos ?? []) {
      map.set(c.status, (map.get(c.status) ?? 0) + 1);
    }
    return map;
  }, [contatos]);

  const filtered = useMemo(() => {
    if (!contatos) return [];
    const q = search.trim().toLowerCase();
    if (!q) return contatos;
    return contatos.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        c.telefone.toLowerCase().includes(q)
    );
  }, [contatos, search]);

  const legacyFallback = engine === "legacy";

  return (
    <div className="p-4 md:p-6">
      <Link
        href={`/campanhas/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar
      </Link>

      <PageHeader
        title="Base da campanha"
        subtitle="Timeline individual: cada envio, resposta e follow-up por contato."
      />

      <CampaignTabs id={id} active="contatos" />

      {legacyFallback && (
        <GlassCard className="border-amber-500/30 bg-amber-500/5 mb-4">
          <div className="flex items-start gap-3">
            <Rocket className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-amber-100">Campanha ainda no runner legacy</div>
              <div className="text-sm text-zinc-400 mt-1">
                A visão por contato (steps individuais, timeline, follow-ups por resposta)
                só existe no engine orquestrador. Migre a campanha pra habilitar.
              </div>
            </div>
            <Link
              href={`/campanhas/${id}`}
              className="px-3 py-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-100 text-sm hover:bg-amber-500/30 whitespace-nowrap"
            >
              Migrar
            </Link>
          </div>
        </GlassCard>
      )}

      {loadError && (
        <GlassCard className="border-red-500/30 bg-red-500/5 mb-4">
          <div className="text-sm text-red-200">
            Erro ao carregar: <span className="font-mono">{loadError}</span>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 mt-4">
        {/* Esquerda: lista */}
        <GlassCard className="flex flex-col max-h-[calc(100vh-220px)] p-0 overflow-hidden">
          <div className="p-3 border-b border-white/5 flex flex-col gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar nome ou telefone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-md pl-8 pr-2 py-1.5 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-[#FF0033]/50"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {["todos", "em_andamento", "respondeu", "concluido", "falhou", "bloqueado", "opted_out"].map((s) => {
                const label =
                  s === "todos"
                    ? `Todos (${contatos?.length ?? 0})`
                    : `${STATUS_META[s]?.label ?? s} (${statusCounts.get(s) ?? 0})`;
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] border transition-colors",
                      active
                        ? "bg-[#FF0033]/15 border-[#FF0033]/40 text-white"
                        : "bg-white/[0.02] border-white/5 text-zinc-500 hover:text-zinc-200"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {contatos === null ? (
              <div className="p-6 text-center text-sm text-zinc-500">Carregando…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">
                {contatos.length === 0
                  ? "Nenhum contato nesta campanha ainda."
                  : "Nenhum contato bate com o filtro."}
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {filtered.map((c) => {
                  const meta = STATUS_META[c.status] ?? STATUS_META.pendente;
                  const Icon = meta.icon;
                  const active = selectedId === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 hover:bg-white/[0.03] transition-colors border-l-2",
                          active
                            ? "border-[#FF0033] bg-white/[0.04]"
                            : "border-transparent"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm truncate">{c.nome}</div>
                          <span
                            className={cn(
                              "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap",
                              meta.bg,
                              meta.color
                            )}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {meta.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                          {c.telefone}
                        </div>
                        {c.proximoEnvioEm && (
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            Próx: {fmtTime(c.proximoEnvioEm)}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </GlassCard>

        {/* Direita: timeline */}
        <GlassCard className="min-h-[400px]">
          {!selectedId ? (
            <div className="text-center py-16 text-zinc-500 text-sm">
              Selecione um contato à esquerda pra ver a timeline.
            </div>
          ) : timelineLoading && !timeline ? (
            <div className="text-center py-16 text-zinc-500 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando timeline…
            </div>
          ) : timeline ? (
            <>
              <div className="pb-4 mb-4 border-b border-white/5">
                <div className="text-lg font-medium">{timeline.contato.nome}</div>
                <div className="text-sm text-zinc-500 font-mono mt-0.5">
                  {timeline.contato.telefone}
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-zinc-400">
                  <span>
                    Status:{" "}
                    <span className="text-zinc-200">
                      {STATUS_META[timeline.contato.status]?.label ?? timeline.contato.status}
                    </span>
                  </span>
                  {timeline.contato.versaoFixada != null && (
                    <span>
                      Versão: <span className="text-zinc-200">v{timeline.contato.versaoFixada}</span>
                    </span>
                  )}
                  {timeline.contato.respondeuEm && (
                    <span>
                      Respondeu:{" "}
                      <span className="text-emerald-300">
                        {fmtTime(timeline.contato.respondeuEm)}
                      </span>
                    </span>
                  )}
                  {timeline.contato.proximoEnvioEm && (
                    <span>
                      Próx.:{" "}
                      <span className="text-zinc-200">
                        {fmtTime(timeline.contato.proximoEnvioEm)}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {timeline.timeline.length === 0 ? (
                <div className="text-sm text-zinc-500 text-center py-8">
                  Nenhum evento registrado ainda.
                </div>
              ) : (
                <ol className="relative pl-7 space-y-3">
                  <div className="absolute left-[11px] top-1 bottom-1 w-px bg-white/5" />
                  {timeline.timeline.map((e, i) => {
                    const meta = EVENT_ICON[e.tipo] ?? EVENT_ICON.execution_pending;
                    const Icon = meta.icon;
                    return (
                      <li key={i} className="relative">
                        <span
                          className={cn(
                            "absolute -left-7 top-0.5 w-6 h-6 rounded-full flex items-center justify-center bg-black border border-white/10",
                            meta.color
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">{e.label}</div>
                            {e.textoEnviado && (
                              <div className="mt-1 text-[12px] text-zinc-400 bg-white/[0.02] border border-white/5 rounded px-2 py-1 whitespace-pre-wrap break-words">
                                {e.textoEnviado}
                              </div>
                            )}
                            {e.textoRecebido && (
                              <div className="mt-1 text-[12px] text-emerald-200 bg-emerald-500/5 border border-emerald-500/20 rounded px-2 py-1 whitespace-pre-wrap break-words">
                                → {e.textoRecebido}
                              </div>
                            )}
                            {e.erro && (
                              <div className="mt-1 text-[11px] text-red-300 font-mono bg-red-500/5 border border-red-500/20 rounded px-2 py-1">
                                {e.erro}
                              </div>
                            )}
                            {(e.snapshotNome || e.versaoNumero != null) && (
                              <div className="text-[10px] text-zinc-500 mt-1">
                                {e.snapshotNome && (
                                  <>
                                    step: <span className="text-zinc-400">{e.snapshotNome}</span>
                                  </>
                                )}
                                {e.versaoNumero != null && (
                                  <>
                                    {" "}· versão: <span className="text-zinc-400">v{e.versaoNumero}</span>
                                  </>
                                )}
                                {e.instanceName && (
                                  <>
                                    {" "}· via: <span className="text-zinc-400">{e.instanceName}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono whitespace-nowrap">
                            {fmtTime(e.timestamp)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-zinc-500 text-sm">
              Não consegui carregar a timeline desse contato.
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
