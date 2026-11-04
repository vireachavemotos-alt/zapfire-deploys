"use client";
// Banner que aparece em campanhas legacy convidando pra migrar pro
// engine orquestrador. Chamada direta a POST /api/orquestrador/.../migrar
// — a resposta flipa engine='orchestrator' e redireciona pra /sequencia.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";

type Props = {
  campanhaId: string;
  engine: "legacy" | "orchestrator";
  status: string;
};

export function OrchestratorMigrateBanner({ campanhaId, engine, status }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (engine === "orchestrator") {
    return (
      <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2.5 text-xs text-emerald-200">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" /> Esta campanha usa o <b>Modo Avançado</b>.
        </span>
        <Link
          href={`/campanhas/${campanhaId}/sequencia`}
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/20"
        >
          Abrir editor da sequência →
        </Link>
      </div>
    );
  }

  if (dismissed) return null;

  async function migrar() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/orquestrador/campanhas/${campanhaId}/migrar`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/campanhas/${campanhaId}/sequencia`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  const bloqueado = status === "em_execucao";

  return (
    <div className="mb-4 rounded-xl border border-[#FF0033]/30 bg-gradient-to-br from-[#FF0033]/[0.08] to-transparent p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-[#FF0033]/15 p-2">
          <Sparkles className="h-5 w-5 text-[#FF0033]" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">
              Modo Avançado disponível
            </h3>
            <button
              onClick={() => setDismissed(true)}
              className="text-zinc-500 hover:text-zinc-300"
              aria-label="Dispensar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Converta esta campanha pro orquestrador pra ganhar edição em tempo real,
            follow-ups por resposta, timeline por contato e versionamento com snapshot
            imutável. Nenhum dado é perdido — a campanha legacy continua acessível.
          </p>
          {erro && (
            <p className="mt-2 text-xs text-rose-400">Falhou: {erro}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={migrar}
              disabled={loading || bloqueado}
              className="rounded-md bg-[#FF0033] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#FF0033]/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Migrando..." : "Migrar pro Modo Avançado"}
            </button>
            {bloqueado && (
              <span className="text-[11px] text-amber-400">
                Pause a campanha antes de migrar.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
