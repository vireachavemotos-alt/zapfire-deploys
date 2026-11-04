"use client";
// Card de criação de nova sessão de aquecimento entre duas instâncias.
import { useState } from "react";
import { Flame, ArrowLeftRight } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";

type InstanceOption = { name: string; label: string };

type Props = {
  instances: InstanceOption[];
  onCreate: (a: string, b: string) => Promise<void>;
};

export function CreateSessionCard({ instances, onCreate }: Props) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const canCreate = !!a && !!b && a !== b && !loading;

  async function submit() {
    if (!canCreate) return;
    setLoading(true);
    setErro(null);
    try {
      await onCreate(a, b);
      setA("");
      setB("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const selectCls =
    "h-10 flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-[#FF0033]/50 focus:bg-white/[0.05] disabled:opacity-50";

  return (
    <GlassCard className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center">
          <Flame className="h-3.5 w-3.5 text-[#FF3355]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Criar nova sessão</h2>
          <p className="text-[11px] text-zinc-500">
            Duas instâncias conversam entre si pra ganhar reputação de chip saudável.
          </p>
        </div>
      </div>
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
        <select
          value={a}
          onChange={(e) => setA(e.target.value)}
          className={selectCls}
          disabled={loading}
          aria-label="Instância A"
        >
          <option value="">Instância A</option>
          {instances.map((i) => (
            <option key={i.name} value={i.name} disabled={i.name === b}>
              {i.label}
            </option>
          ))}
        </select>
        <ArrowLeftRight className="h-4 w-4 text-zinc-500 shrink-0 self-center" />
        <select
          value={b}
          onChange={(e) => setB(e.target.value)}
          className={selectCls}
          disabled={loading}
          aria-label="Instância B"
        >
          <option value="">Instância B</option>
          {instances.map((i) => (
            <option key={i.name} value={i.name} disabled={i.name === a}>
              {i.label}
            </option>
          ))}
        </select>
        <NeonButton
          variant="primary"
          size="md"
          onClick={submit}
          disabled={!canCreate}
          className="shrink-0"
        >
          {loading ? "Criando..." : "Iniciar aquecimento"}
        </NeonButton>
      </div>
      {erro && <p className="mt-2 text-xs text-rose-400">Falhou: {erro}</p>}
      {instances.length < 2 && (
        <p className="mt-2 text-xs text-amber-400">
          Conecte pelo menos 2 números em{" "}
          <a href="/numeros" className="underline">
            /numeros
          </a>{" "}
          pra começar.
        </p>
      )}
    </GlassCard>
  );
}
