"use client";
// Card de uma sessão de aquecimento ativa.
import { ArrowLeftRight, Clock, Flame, History, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { cn } from "@/lib/utils";

export type WarmupSession = {
  id: string;
  instanciaA: string;
  instanciaB: string;
  ativo: boolean;
  totalEnviadas: number;
  enviadasHoje: number;
  limiteDiario: number;
  diasAtivo: number;
  proximoEnvioEm: string | null;
  iniciadoEm: string;
};

type Props = {
  session: WarmupSession;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
  onOpenHistory: () => void;
  pending?: boolean;
};

function fmtInSeconds(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "agora";
  if (diff < 60) return `em ${diff}s`;
  if (diff < 3600) return `em ${Math.round(diff / 60)}min`;
  return `em ${Math.round(diff / 3600)}h`;
}

export function WarmupSessionCard({
  session,
  onToggle,
  onDelete,
  onOpenHistory,
  pending,
}: Props) {
  const pct =
    session.limiteDiario > 0
      ? Math.min(100, Math.round((session.enviadasHoje / session.limiteDiario) * 100))
      : 0;

  return (
    <GlassCard className="relative">
      {/* Header: par de instâncias + switch */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center shrink-0">
            <Flame
              className={cn(
                "h-3.5 w-3.5",
                session.ativo ? "text-[#FF3355]" : "text-zinc-500"
              )}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <span className="truncate max-w-[7rem]">{session.instanciaA}</span>
              <ArrowLeftRight className="h-3 w-3 text-zinc-500 shrink-0" />
              <span className="truncate max-w-[7rem]">{session.instanciaB}</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              dia {session.diasAtivo} ativo · {session.totalEnviadas} msg no total
            </p>
          </div>
        </div>
        {/* Switch ativo/pausado */}
        <label
          className="inline-flex items-center cursor-pointer shrink-0"
          title={session.ativo ? "Pausar" : "Retomar"}
        >
          <input
            type="checkbox"
            className="sr-only peer"
            checked={session.ativo}
            disabled={pending}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors",
              session.ativo
                ? "bg-[#FF0033]/30 border-[#FF0033]/50"
                : "bg-white/[0.04] border-white/[0.1]",
              pending && "opacity-50"
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                session.ativo ? "translate-x-[18px]" : "translate-x-0.5"
              )}
            />
          </span>
        </label>
      </div>

      {/* Progresso diário */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-zinc-400">Mensagens hoje</span>
          <span className="font-mono text-white">
            {session.enviadasHoje}{" "}
            <span className="text-zinc-600">/ {session.limiteDiario}</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#FF0033] to-[#FF3355] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Próximo + ações */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 text-zinc-400">
          <Clock className="h-3 w-3" />
          Próximo {fmtInSeconds(session.proximoEnvioEm)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-zinc-400 hover:text-white hover:bg-white/[0.04]"
            title="Ver histórico"
          >
            <History className="h-3 w-3" /> Histórico
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/[0.08]"
            title="Remover sessão"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
