"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, QrCode, Smartphone, Activity } from "lucide-react";
import ConnectModal from "@/components/ConnectModal";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";
import { StatusDot } from "@/components/StatusDot";
import { cn } from "@/lib/utils";
import { formatPhoneBR } from "@/lib/store";

// Shape real retornada pela Evolution API v2.3.7
interface Instance {
  id?: string;
  name?: string;
  connectionStatus?: string;
  profilePicUrl?: string | null;
  profileName?: string | null;
  ownerJid?: string | null;
  number?: string | null;
}

interface ProbeData {
  ok: boolean;
  state: string;
  jid: string | null;
  motivo: string;
  detalhe: string | null;
  disconnectReasonCode: number | null;
  disconnectAt: string | null;
  testadoEm: string;
}

function jidToPhone(jid?: string | null): string | null {
  if (!jid) return null;
  const digits = jid.split("@")[0]?.replace(/\D/g, "");
  return digits || null;
}

function InstanceAvatar({
  name,
  url,
  status,
}: {
  name: string;
  url?: string | null;
  status: "conectado" | "desconectado" | "conectando";
}) {
  const [broken, setBroken] = useState(false);
  const showImg = url && !broken;
  return (
    <div className="relative shrink-0">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          onError={() => setBroken(true)}
          className="h-10 w-10 rounded-md object-cover border border-white/10 bg-black"
        />
      ) : (
        <div className="h-10 w-10 rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 text-[#FF0033] flex items-center justify-center font-semibold uppercase text-xs">
          {name.slice(0, 2)}
        </div>
      )}
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-black",
          status === "conectado" && "bg-emerald-400",
          status === "desconectado" && "bg-zinc-600",
          status === "conectando" && "bg-amber-400"
        )}
      />
    </div>
  );
}

type UiStatus = "conectado" | "desconectado" | "conectando";

const uiMap: Record<UiStatus, { dot: "on" | "off" | "pending"; label: string }> = {
  conectado: { dot: "on", label: "Conectado" },
  conectando: { dot: "pending", label: "Conectando" },
  desconectado: { dot: "off", label: "Desconectado" },
};

interface ScoreInfo {
  score: number;
  tier: "novo" | "aquecendo" | "estavel" | "veterano" | "degradado";
  idadeDias: number;
  failureRate: number;
  totalEnviadas: number;
  capacidadeHoje: number;
  restanteHoje: number;
  enviadasHoje: number;
  falhasHoje: number;
  estouradoHoje: boolean;
  delaySugerido: { min: number; max: number };
}

const TIER_LABEL: Record<ScoreInfo["tier"], string> = {
  novo: "Novo",
  aquecendo: "Aquecendo",
  estavel: "Estável",
  veterano: "Veterano",
  degradado: "Degradado",
};

const TIER_COLOR: Record<ScoreInfo["tier"], string> = {
  novo: "text-sky-300 border-sky-400/30 bg-sky-400/5",
  aquecendo: "text-amber-300 border-amber-400/30 bg-amber-400/5",
  estavel: "text-emerald-300 border-emerald-400/30 bg-emerald-400/5",
  veterano: "text-[#FF0033] border-[#FF0033]/40 bg-[#FF0033]/10",
  degradado: "text-red-300 border-red-400/40 bg-red-400/10",
};

export default function NumerosPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `connecting` guarda a instância + o número (para habilitar pairing code
  // quando ele existir; null = só QR).
  const [connecting, setConnecting] = useState<{ name: string; number: string | null } | null>(null);
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadScores = useCallback(async (names: string[]) => {
    if (!names.length) return;
    try {
      const url = `/api/numero-scores?names=${encodeURIComponent(names.join(","))}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setScores(data.scores || {});
    } catch {
      /* score é enfeite; falhar não quebra a página */
    }
  }, []);

  const loadInstances = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/instances", { cache: "no-store" });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      const list: Instance[] = Array.isArray(data) ? data : [];
      setInstances(list);
      const names = list.map((i) => i.name).filter(Boolean) as string[];
      loadScores(names);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadScores]);

  useEffect(() => {
    loadInstances();
    const interval = setInterval(loadInstances, 10000);
    return () => clearInterval(interval);
  }, [loadInstances]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const sanitized = newName.trim().replace(/\s+/g, "_");
      const numberDigits = newNumber.replace(/\D/g, "");
      // Exige DDI+DDD+número (mínimo 10 dígitos) se o usuário informou algo.
      if (numberDigits && numberDigits.length < 10) {
        throw new Error("Número inválido — use DDI+DDD+número (ex: 5511987654321)");
      }
      const res = await fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceName: sanitized,
          ...(numberDigits ? { number: numberDigits } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Erro ao criar instância");
      }
      setNewName("");
      setNewNumber("");
      setShowNewForm(false);
      await loadInstances();
      setConnecting({ name: sanitized, number: numberDigits || null });
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(instanceName: string) {
    if (
      !confirm(
        `Remover "${instanceName}"? Esta ação desconecta e apaga permanentemente.`
      )
    )
      return;
    try {
      const res = await fetch(
        `/api/instances/${encodeURIComponent(instanceName)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        toast.error(`Falha ao remover: ${res.status} ${body.slice(0, 200)}`);
        return;
      }
      toast.success(`Instância "${instanceName}" removida.`);
    } catch (e) {
      toast.error(`Erro ao remover: ${(e as Error).message}`);
    } finally {
      await loadInstances();
    }
  }

  async function handleRestart(instanceName: string) {
    try {
      const res = await fetch(
        `/api/instances/${encodeURIComponent(instanceName)}/restart`,
        { method: "PUT" }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        toast.error(`Falha ao reiniciar: ${res.status} ${body.slice(0, 200)}`);
      } else {
        toast.success(`Instância "${instanceName}" reiniciada.`);
      }
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      await loadInstances();
    }
  }

  // Probe de conexão real — usa o endpoint /api/instances/[name]/probe que
  // faz uma chamada ATIVA na Evolution (não confia só no connectionState
  // que pode ficar "open" mesmo com a sessão morta).
  const [probing, setProbing] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<
    Record<string, ProbeData>
  >({});

  async function handleProbe(instanceName: string) {
    setProbing(instanceName);
    try {
      const r = await fetch(`/api/instances/${instanceName}/probe`, { cache: "no-store" });
      const data: ProbeData = await r.json();
      setProbeResult((prev) => ({ ...prev, [instanceName]: data }));
    } catch (err) {
      setProbeResult((prev) => ({
        ...prev,
        [instanceName]: {
          ok: false,
          state: "unknown",
          jid: null,
          motivo: "Erro de rede ao chamar o painel.",
          detalhe: (err as Error).message,
          disconnectReasonCode: null,
          disconnectAt: null,
          testadoEm: new Date().toISOString(),
        },
      }));
    } finally {
      setProbing(null);
    }
  }

  const getStatus = (inst: Instance): UiStatus => {
    const s = inst.connectionStatus || "";
    if (s === "open") return "conectado";
    if (s === "connecting") return "conectando";
    return "desconectado";
  };

  const evoUrl = process.env.NEXT_PUBLIC_EVO_URL || "http://localhost:8080";

  return (
    <>
      <PageHeader
        title="Instâncias"
        subtitle="Conecte e gerencie WhatsApps via Evolution API."
        actions={
          <NeonButton onClick={() => setShowNewForm((v) => !v)}>
            <Plus className="h-4 w-4" /> Conectar nova instância
          </NeonButton>
        }
      />

      {showNewForm && (
        <GlassCard strong className="mb-5">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <NeonInput
                label="Nome da instância"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Vendas_SP, Suporte_01"
                icon={<Smartphone className="h-4 w-4" />}
                required
              />
              <NeonInput
                label="Telefone (opcional — para código)"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="5511987654321"
                inputMode="numeric"
              />
            </div>
            <p className="text-[11px] text-zinc-500 -mt-1">
              Preencha o telefone para conectar por <b className="text-zinc-300">código de pareamento</b> (8 dígitos) em vez de QR. Use DDI+DDD+número, só dígitos.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <NeonButton type="submit" disabled={creating}>
                {creating ? "Criando..." : "Criar e conectar"}
              </NeonButton>
              <NeonButton
                type="button"
                variant="ghost"
                onClick={() => setShowNewForm(false)}
              >
                Cancelar
              </NeonButton>
            </div>
          </form>
        </GlassCard>
      )}

      {error && (
        <GlassCard className="mb-5 border-red-500/30">
          <p className="text-sm text-red-300">
            <b>{error}</b>
            <br />
            <span className="text-zinc-500 text-xs">
              Evolution API não responde em{" "}
              <code className="text-[#FF0033]">{evoUrl}</code>. Rode{" "}
              <code className="text-[#FF0033]">docker compose up -d</code>.
            </span>
          </p>
        </GlassCard>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          {
            l: "Total",
            v: String(instances.length),
            dot: "on" as const,
          },
          {
            l: "Conectadas",
            v: String(
              instances.filter((i) => getStatus(i) === "conectado").length
            ),
            dot: "on" as const,
          },
          {
            l: "Desconectadas",
            v: String(
              instances.filter((i) => getStatus(i) === "desconectado").length
            ),
            dot: "off" as const,
          },
          {
            l: "Conectando",
            v: String(
              instances.filter((i) => getStatus(i) === "conectando").length
            ),
            dot: "pending" as const,
          },
        ].map((s) => (
          <GlassCard key={s.l} className="py-3">
            <div className="flex items-center gap-2.5">
              <StatusDot status={s.dot} size="sm" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {s.l}
                </p>
                <p className="text-lg font-semibold">{s.v}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-40 rounded-lg glass animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && instances.length === 0 && !error && (
        <GlassCard className="py-12 text-center">
          <div className="h-10 w-10 mx-auto rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-4">
            <Smartphone className="h-4 w-4 text-[#FF0033]" />
          </div>
          <p className="text-base font-semibold text-white">
            Nenhuma instância conectada
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            Clique em &quot;Conectar nova instância&quot; para começar
          </p>
          <NeonButton
            className="mt-4"
            onClick={() => setShowNewForm(true)}
          >
            <Plus className="h-4 w-4" /> Conectar primeiro número
          </NeonButton>
        </GlassCard>
      )}

      {!loading && instances.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {instances.map((inst) => {
            const name = inst.name || "—";
            const status = getStatus(inst);
            const ui = uiMap[status];
            const phone = jidToPhone(inst.ownerJid) || inst.number || "";
            const phoneLabel = phone ? formatPhoneBR(phone) : null;
            const score = scores[name];
            return (
              <GlassCard key={inst.id || name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <InstanceAvatar
                      name={name}
                      url={inst.profilePicUrl}
                      status={status}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold truncate text-sm">{name}</p>
                      {inst.profileName && (
                        <p className="text-xs text-zinc-400 truncate">
                          {inst.profileName}
                        </p>
                      )}
                      {phoneLabel && (
                        <p className="text-[11px] text-zinc-500 tabular-nums truncate">
                          {phoneLabel}
                        </p>
                      )}
                      <div className="mt-1">
                        <StatusDot
                          status={ui.dot}
                          label={ui.label}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                  {score && (
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xl font-bold text-white tabular-nums leading-none">
                        {score.score}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border",
                          TIER_COLOR[score.tier]
                        )}
                      >
                        {TIER_LABEL[score.tier]}
                      </span>
                    </div>
                  )}
                </div>

                {score && (
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                        <span>
                          Uso hoje · {score.enviadasHoje}/{score.capacidadeHoje}
                        </span>
                        <span
                          className={cn(
                            "tabular-nums",
                            score.estouradoHoje ? "text-amber-300" : "text-zinc-500"
                          )}
                        >
                          {score.estouradoHoje
                            ? "limite atingido"
                            : `${score.restanteHoje} restam`}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            score.estouradoHoje
                              ? "bg-amber-400"
                              : score.tier === "degradado"
                                ? "bg-red-400"
                                : "bg-[#FF0033]"
                          )}
                          style={{
                            width: `${Math.min(100, (score.enviadasHoje / Math.max(1, score.capacidadeHoje)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500 tabular-nums">
                      <span>
                        {score.idadeDias === 0
                          ? "Novo"
                          : `${score.idadeDias}d de uso`}
                      </span>
                      <span>
                        {score.totalEnviadas} env ·{" "}
                        {score.failureRate.toFixed(1)}% falha
                      </span>
                    </div>
                  </div>
                )}

                <div className="neon-divider my-4" />

                {/* Resultado do último Testar — fica visível enquanto não fecha */}
                {probeResult[name] && (
                  <div
                    className={cn(
                      "mb-3 rounded-md border p-2.5 text-xs",
                      probeResult[name].ok
                        ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200"
                        : "border-red-400/30 bg-red-400/5 text-red-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="mt-0.5 shrink-0">
                          {probeResult[name].ok ? "✓" : "✗"}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium leading-snug">
                            {probeResult[name].motivo}
                          </p>
                          {probeResult[name].detalhe && (
                            <p className="text-[10px] opacity-70 mt-0.5 truncate">
                              {probeResult[name].detalhe}
                            </p>
                          )}
                          <p className="text-[10px] opacity-50 mt-0.5">
                            Testado{" "}
                            {new Date(
                              probeResult[name].testadoEm
                            ).toLocaleTimeString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setProbeResult((p) => {
                            const np = { ...p };
                            delete np[name];
                            return np;
                          })
                        }
                        className="text-current opacity-50 hover:opacity-100 shrink-0"
                        aria-label="Fechar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {status !== "conectado" && (
                    <NeonButton
                      size="sm"
                      className="flex-1"
                      onClick={() =>
                        setConnecting({
                          name,
                          // Número vinculado (se existir) habilita pairing code.
                          number:
                            jidToPhone(inst.ownerJid) || inst.number || null,
                        })
                      }
                    >
                      <QrCode className="h-3.5 w-3.5" /> Conectar
                    </NeonButton>
                  )}
                  <NeonButton
                    variant="ghost"
                    size="sm"
                    className={status === "conectado" ? "flex-1" : ""}
                    onClick={() => handleProbe(name)}
                    disabled={probing === name}
                    title="Faz uma chamada real na Evolution para confirmar se está mesmo conectado"
                  >
                    <Activity className="h-3.5 w-3.5" />
                    {probing === name ? "Testando…" : "Testar conexão"}
                  </NeonButton>
                  <NeonButton
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestart(name)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reiniciar
                  </NeonButton>
                  <NeonButton
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </NeonButton>
                </div>
              </GlassCard>
            );
          })}

          <button
            onClick={() => setShowNewForm(true)}
            className="rounded-lg border border-dashed border-white/10 hover:border-[#FF0033]/40 bg-transparent p-5 flex flex-col items-center justify-center gap-3 text-center min-h-[200px] transition-colors"
          >
            <div className="h-10 w-10 rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center">
              <Plus className="h-4 w-4 text-[#FF0033]" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Conectar nova instância</p>
              <p className="text-xs text-zinc-500 mt-1">
                Escaneie o QR em segundos
              </p>
            </div>
          </button>
        </div>
      )}

      {connecting && (
        <ConnectModal
          instanceName={connecting.name}
          number={connecting.number}
          onClose={() => setConnecting(null)}
          onConnected={() => {
            setConnecting(null);
            loadInstances();
          }}
        />
      )}
    </>
  );
}
