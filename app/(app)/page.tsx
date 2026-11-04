"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { KpiCard } from "@/components/KpiCard";
import { GlassCard } from "@/components/GlassCard";
import { PageHeader } from "@/components/PageHeader";
import { NeonButton } from "@/components/NeonButton";
import { StatusDot } from "@/components/StatusDot";
import { useStore, CampanhaStatus } from "@/lib/store";
import { formatDateBR } from "@/lib/utils";
import {
  Smartphone,
  Send,
  Rocket,
  ArrowUpRight,
  Users,
  ListChecks,
  Plus,
  XCircle,
  TrendingUp,
  Trophy,
  AlertTriangle,
} from "lucide-react";
import {
  formatError,
  categoryLabel,
  type ErrorCategory,
} from "@/lib/error-format";

interface EvoInstance {
  id?: string;
  name?: string;
  connectionStatus?: string;
}

interface ScoreInfo {
  instanceName: string;
  score: number;
  tier: "novo" | "aquecendo" | "estavel" | "veterano" | "degradado";
  idadeDias: number;
  totalEnviadas: number;
  capacidadeHoje: number;
  enviadasHoje: number;
  failureRate: number;
}

const TIER_COLOR: Record<ScoreInfo["tier"], string> = {
  veterano: "text-emerald-300",
  estavel: "text-cyan-300",
  aquecendo: "text-amber-300",
  novo: "text-zinc-300",
  degradado: "text-red-300",
};

const statusUi: Record<
  CampanhaStatus,
  { dot: "on" | "off" | "pending" | "error"; label: string }
> = {
  rascunho: { dot: "off", label: "Rascunho" },
  agendada: { dot: "pending", label: "Agendada" },
  em_execucao: { dot: "pending", label: "Em execução" },
  pausada: { dot: "off", label: "Pausada" },
  concluida: { dot: "on", label: "Concluída" },
  erro: { dot: "error", label: "Erro" },
};

export default function DashboardPage() {
  const contatos = useStore((s) => s.contatos);
  const listas = useStore((s) => s.listas);
  const campanhas = useStore((s) => s.campanhas);

  const [instances, setInstances] = useState<EvoInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [scores, setScores] = useState<ScoreInfo[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const r = await fetch("/api/instances", { cache: "no-store" });
        const d = await r.json();
        if (mounted) setInstances(Array.isArray(d) ? d : []);
      } catch {
        if (mounted) setInstances([]);
      } finally {
        if (mounted) setLoadingInstances(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Carrega scores de TODAS as instâncias com métrica registrada (sem
  // `?names=` o endpoint devolve todas). Usado pro ranking de top números.
  useEffect(() => {
    let mounted = true;
    async function loadScores() {
      try {
        const r = await fetch("/api/numero-scores", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!mounted) return;
        const arr: ScoreInfo[] = Object.values(d.scores || {});
        setScores(arr);
      } catch {
        /* silencia — score é informativo */
      }
    }
    loadScores();
    const id = setInterval(loadScores, 30000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Série de 7 dias (hoje incluído). Cada bucket = {dia, enviadas, falhas}
  // derivado dos `resultados[].timestamp` das campanhas em memória.
  // É O(N×M) onde N=campanhas, M=resultados/cada — aceitável pro dashboard
  // (dez de milhares de pontos roda em ms).
  const serie7d = useMemo(() => {
    const buckets: { dia: string; label: string; enviadas: number; falhas: number; data: Date }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      buckets.push({ dia: key, label, enviadas: 0, falhas: 0, data: d });
    }
    const idxByKey: Record<string, number> = {};
    buckets.forEach((b, i) => (idxByKey[b.dia] = i));
    for (const c of campanhas) {
      const rs = c.resultados || [];
      for (const r of rs as Array<{
        status: "ok" | "erro" | "pulado";
        timestamp?: string;
      }>) {
        if (r.status !== "ok" && r.status !== "erro") continue;
        const ts = r.timestamp;
        if (!ts) continue;
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const idx = idxByKey[key];
        if (idx === undefined) continue;
        if (r.status === "ok") buckets[idx].enviadas++;
        else buckets[idx].falhas++;
      }
    }
    const max = Math.max(1, ...buckets.map((b) => b.enviadas + b.falhas));
    const totalSemana = buckets.reduce((acc, b) => acc + b.enviadas, 0);
    const falhasSemana = buckets.reduce((acc, b) => acc + b.falhas, 0);
    return { buckets, max, totalSemana, falhasSemana };
  }, [campanhas]);

  // Top falhas globais — agrupa todos resultados com erro pelas categorias
  // que o formatError extrai. Top 5 categorias mais frequentes.
  const topFalhas = useMemo(() => {
    const groups = new Map<ErrorCategory, number>();
    let total = 0;
    for (const c of campanhas) {
      const rs = c.resultados || [];
      for (const r of rs) {
        if (r.status !== "erro") continue;
        const cat = formatError(r.detail).category;
        groups.set(cat, (groups.get(cat) || 0) + 1);
        total++;
      }
    }
    const sorted = Array.from(groups.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { sorted, total };
  }, [campanhas]);

  // Top números — ordenados por total de envios OK lifetime. Top 5.
  const topNumeros = useMemo(() => {
    return [...scores]
      .sort((a, b) => b.totalEnviadas - a.totalEnviadas)
      .slice(0, 5);
  }, [scores]);

  const conectados = instances.filter((i) => i.connectionStatus === "open");
  const totalEnviadas = campanhas.reduce((acc, c) => acc + c.enviadas, 0);
  const totalFalhas = campanhas.reduce((acc, c) => acc + c.falhas, 0);
  const ativas = campanhas.filter(
    (c) => c.status === "em_execucao" || c.status === "agendada"
  ).length;

  const recent = campanhas.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral dos seus números, contatos e disparos."
        actions={
          <Link href="/campanhas/nova">
            <NeonButton size="sm">
              <Plus className="h-4 w-4" /> Nova campanha
            </NeonButton>
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Instâncias conectadas"
          value={
            loadingInstances
              ? "..."
              : `${conectados.length} / ${instances.length}`
          }
          icon={Smartphone}
          accent
        />
        <KpiCard
          label="Base" /* era "Contatos na base" — renomeamos pra só "Base" */
          value={String(contatos.length)}
          icon={Users}
        />
        <KpiCard
          label="Mensagens enviadas"
          value={String(totalEnviadas)}
          icon={Send}
        />
        <KpiCard
          label="Campanhas ativas"
          value={String(ativas)}
          icon={Rocket}
        />
      </div>

      {/* Insights — chart 7d + top números + top falhas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        {/* Chart 7 dias */}
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#FF0033]" />
              <h2 className="text-sm font-semibold text-white">
                Envios — últimos 7 dias
              </h2>
            </div>
            <div className="flex items-center gap-3 text-[11px] tabular-nums">
              <span className="text-emerald-300">
                {serie7d.totalSemana} ok
              </span>
              {serie7d.falhasSemana > 0 && (
                <span className="text-red-300">
                  {serie7d.falhasSemana} falhas
                </span>
              )}
            </div>
          </div>
          {serie7d.totalSemana + serie7d.falhasSemana === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              Sem registros nos últimos 7 dias.
            </div>
          ) : (
            <div className="flex items-end justify-between gap-1.5 h-32 mt-2">
              {serie7d.buckets.map((b) => {
                const total = b.enviadas + b.falhas;
                const heightPct = (total / serie7d.max) * 100;
                const okPct =
                  total > 0 ? (b.enviadas / total) * 100 : 0;
                return (
                  <div
                    key={b.dia}
                    className="flex-1 flex flex-col items-center gap-1.5"
                    title={`${b.label}: ${b.enviadas} ok / ${b.falhas} falhas`}
                  >
                    <div className="w-full flex items-end h-full">
                      <div
                        className="w-full rounded-t-sm relative overflow-hidden bg-white/[0.03] transition-all"
                        style={{
                          height: `${total === 0 ? 4 : Math.max(4, heightPct)}%`,
                        }}
                      >
                        {total > 0 && (
                          <>
                            {/* Falhas (base, vermelho) */}
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-red-400/70"
                              style={{ height: `${100 - okPct}%` }}
                            />
                            {/* OK em cima, neon */}
                            <div
                              className="absolute left-0 right-0 bg-gradient-to-t from-[#FF0033] to-[#FF3355]"
                              style={{
                                bottom: `${100 - okPct}%`,
                                height: `${okPct}%`,
                              }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[9px] text-zinc-500 tabular-nums">
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* Top números */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[#FF0033]" />
              <h3 className="text-sm font-semibold">Top números</h3>
            </div>
            {topNumeros.length > 0 && (
              <Link
                href="/numeros"
                className="text-[10px] text-[#FF0033] hover:underline inline-flex items-center gap-1"
              >
                Ver todos <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          {topNumeros.length === 0 ? (
            <p className="text-xs text-zinc-500 py-2">
              Sem registros de envio ainda.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {topNumeros.map((n, i) => (
                <li
                  key={n.instanceName}
                  className="flex items-center gap-2.5"
                >
                  <span className="text-[10px] text-zinc-500 tabular-nums w-4 text-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {n.instanceName}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      <span className={TIER_COLOR[n.tier]}>{n.tier}</span>
                      {" · "}
                      <span className="tabular-nums">{n.idadeDias}d</span>
                      {" · "}
                      <span className="tabular-nums">
                        {n.enviadasHoje}/{n.capacidadeHoje} hoje
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-zinc-200">
                    {n.totalEnviadas}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Top falhas — só aparece se houver falhas registradas */}
      {topFalhas.total > 0 && (
        <GlassCard className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold">
                Causas mais comuns de falha
              </h3>
            </div>
            <span className="text-[11px] text-zinc-500 tabular-nums">
              {topFalhas.total} falha{topFalhas.total === 1 ? "" : "s"} no
              total
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {topFalhas.sorted.map(([cat, count]) => {
              const pct = (count / topFalhas.total) * 100;
              return (
                <div
                  key={cat}
                  className="rounded-md border border-white/10 bg-black/30 p-2.5"
                >
                  <p className="text-xs font-medium text-zinc-200 truncate">
                    {categoryLabel(cat)}
                  </p>
                  <div className="flex items-baseline justify-between mt-1.5 gap-2">
                    <span className="text-lg font-bold tabular-nums text-white">
                      {count}
                    </span>
                    <span className="text-[10px] text-zinc-500 tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1 mt-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-400 to-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Side panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Últimas campanhas
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {campanhas.length} no total
              </p>
            </div>
            {campanhas.length > 0 && (
              <Link
                href="/campanhas"
                className="text-xs text-[#FF0033] hover:underline inline-flex items-center gap-1"
              >
                Ver todas <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="py-10 text-center">
              <div className="h-10 w-10 mx-auto rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-3">
                <Rocket className="h-4 w-4 text-[#FF0033]" />
              </div>
              <p className="text-sm font-semibold text-white">
                Nenhuma campanha ainda
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Conecte um número, importe contatos e dispare sua primeira
                campanha.
              </p>
              <Link href="/campanhas/nova" className="inline-block mt-4">
                <NeonButton size="sm">
                  <Plus className="h-4 w-4" /> Nova campanha
                </NeonButton>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                    <th className="py-2 font-medium">Nome</th>
                    <th className="py-2 font-medium hidden sm:table-cell">
                      Status
                    </th>
                    <th className="py-2 font-medium text-right">Enviadas</th>
                    <th className="py-2 font-medium text-right hidden md:table-cell">
                      Progresso
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recent.map((c) => {
                    const ui = statusUi[c.status];
                    const prog =
                      c.total > 0
                        ? ((c.enviadas + c.falhas) / c.total) * 100
                        : 0;
                    return (
                      <tr key={c.id} className="hover:bg-white/[0.02]">
                        <td className="py-3">
                          <Link
                            href={`/campanhas/${c.id}`}
                            className="font-medium hover:text-[#FF0033]"
                          >
                            {c.nome}
                          </Link>
                          <p className="text-[10px] text-zinc-600 mt-0.5">
                            {formatDateBR(c.criadaEm)}
                          </p>
                        </td>
                        <td className="py-3 hidden sm:table-cell">
                          <StatusDot
                            status={ui.dot}
                            label={ui.label}
                            size="sm"
                          />
                        </td>
                        <td className="py-3 text-right tabular-nums text-zinc-300">
                          {c.enviadas} / {c.total}
                        </td>
                        <td className="py-3 text-right hidden md:table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1 w-20 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-full bg-[#FF0033]"
                                style={{ width: `${prog}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-500 w-8 tabular-nums">
                              {prog.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-[#FF0033]" /> Instâncias
            </h3>
            {loadingInstances ? (
              <p className="text-xs text-zinc-500">Carregando...</p>
            ) : instances.length === 0 ? (
              <>
                <p className="text-xs text-zinc-400">
                  Nenhuma instância criada.
                </p>
                <Link
                  href="/numeros"
                  className="text-xs text-[#FF0033] hover:underline mt-2 inline-block"
                >
                  Conectar primeiro →
                </Link>
              </>
            ) : (
              <ul className="space-y-2">
                {instances.slice(0, 5).map((i) => (
                  <li
                    key={i.id || i.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{i.name}</span>
                    <StatusDot
                      status={
                        i.connectionStatus === "open"
                          ? "on"
                          : i.connectionStatus === "connecting"
                          ? "pending"
                          : "off"
                      }
                      size="sm"
                    />
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[#FF0033]" /> Listas
            </h3>
            {listas.length === 0 ? (
              <p className="text-xs text-zinc-400">Nenhuma lista criada.</p>
            ) : (
              <ul className="space-y-2">
                {listas.slice(0, 4).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{l.nome}</span>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {l.contatoIds.length}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {totalFalhas > 0 && (
            <GlassCard className="border-red-500/30">
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-300">
                    {totalFalhas} falha{totalFalhas === 1 ? "" : "s"} registrada
                    {totalFalhas === 1 ? "" : "s"}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Confira os detalhes nas campanhas com erro.
                  </p>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </>
  );
}
