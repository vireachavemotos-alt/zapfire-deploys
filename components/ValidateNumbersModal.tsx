"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, X, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { NeonButton } from "./NeonButton";
import { Portal } from "./Portal";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Props {
  listaId: string;
  listaNome: string;
  totalContatos: number;
  onClose: () => void;
}

interface Instance {
  name?: string;
  connectionStatus?: string;
}

interface Stats {
  total: number;
  validos: number;
  invalidos: number;
  erroRede: boolean;
}

/**
 * Modal de validação de números. Fluxo:
 * 1. Carrega instâncias da Evolution e mostra só as CONECTADAS (sem instância
 *    conectada não dá pra validar).
 * 2. Usuário escolhe uma instância e confirma → dispara POST /validate-numbers.
 * 3. Ao terminar, mostra stats + botão "Fechar".
 */
export function ValidateNumbersModal({
  listaId,
  listaNome,
  totalContatos,
  onClose,
}: Props) {
  const validate = useStore((s) => s.validateListaNumeros);

  const [instances, setInstances] = useState<Instance[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingInst, setLoadingInst] = useState(true);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/instances");
        const data = await res.json();
        const list: Instance[] = Array.isArray(data) ? data : [];
        const connected = list.filter((i) => i.connectionStatus === "open");
        setInstances(connected);
        if (connected.length === 1 && connected[0].name) {
          setSelected(connected[0].name);
        }
      } catch {
        /* swallow — instâncias ficam vazias, UI avisa */
      } finally {
        setLoadingInst(false);
      }
    })();
  }, []);

  async function handleRun() {
    if (!selected) return;
    setRunning(true);
    try {
      const result = await validate(listaId, selected);
      setStats(result);
      if (result.erroRede) {
        toast.warning("Validação parcial: alguns lotes falharam.");
      } else {
        toast.success(
          `${result.validos} válidos, ${result.invalidos} inválidos.`
        );
      }
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={running ? undefined : onClose}
    >
      <GlassCard
        strong
        className="w-full max-w-md relative p-6 animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {!running && (
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
            <ShieldCheck className="h-4 w-4 text-[#FF3355]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Validar números
            </h2>
            <p className="text-xs text-zinc-500">
              {listaNome} · <span className="tabular-nums">{totalContatos}</span> contato{totalContatos === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="neon-divider my-4" />

        {/* ─── Estado: mostrando stats ─── */}
        {stats && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatBox
                label="Total"
                value={stats.total}
                tone="neutral"
                icon={null}
              />
              <StatBox
                label="Válidos"
                value={stats.validos}
                tone="ok"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              />
              <StatBox
                label="Inválidos"
                value={stats.invalidos}
                tone="bad"
                icon={<XCircle className="h-3.5 w-3.5" />}
              />
            </div>
            {stats.erroRede && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <p>
                  Alguns lotes não responderam. Rode de novo pra completar.
                </p>
              </div>
            )}
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Os contatos inválidos <b>não serão disparados</b> automaticamente em novas campanhas desta lista.
            </p>
            <NeonButton
              onClick={onClose}
              size="sm"
              className="w-full mt-2"
            >
              Concluído
            </NeonButton>
          </div>
        )}

        {/* ─── Estado: escolhendo instância ─── */}
        {!stats && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              A validação usa uma instância conectada para perguntar ao WhatsApp se cada número existe. Dura alguns segundos.
            </p>

            {loadingInst ? (
              <div className="py-6 flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-[#FF3355] animate-spin" />
              </div>
            ) : instances.length === 0 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                Nenhuma instância conectada. Conecte um número na aba{" "}
                <b>Instâncias</b> primeiro.
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                  Instância
                </p>
                <div className="flex flex-col gap-1.5">
                  {instances.map((inst) => {
                    const name = inst.name!;
                    const on = selected === name;
                    return (
                      <button
                        key={name}
                        onClick={() => setSelected(name)}
                        className={cn(
                          "flex items-center justify-between rounded-md border px-3 py-2.5 text-sm text-left transition-all",
                          on
                            ? "border-[#FF0033]/60 bg-[#FF0033]/[0.06] text-white"
                            : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-white"
                        )}
                      >
                        <span className="truncate font-medium">{name}</span>
                        <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Conectada
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <NeonButton
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={onClose}
                disabled={running}
              >
                Cancelar
              </NeonButton>
              <NeonButton
                size="sm"
                className="flex-1"
                onClick={handleRun}
                disabled={!selected || running}
              >
                {running ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Validando...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Validar agora
                  </>
                )}
              </NeonButton>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
    </Portal>
  );
}

function StatBox({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "ok" | "bad" | "neutral";
  icon: React.ReactNode;
}) {
  const toneMap = {
    ok: "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300",
    bad: "border-red-500/30 bg-red-500/[0.06] text-red-300",
    neutral: "border-white/10 bg-white/[0.02] text-zinc-300",
  };
  return (
    <div
      className={cn(
        "rounded-md border p-3 flex flex-col items-center justify-center",
        toneMap[tone]
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest opacity-80">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
