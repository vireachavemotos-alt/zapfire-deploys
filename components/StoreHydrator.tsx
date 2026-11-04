"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { Loader2, AlertTriangle } from "lucide-react";
import { NeonButton } from "./NeonButton";

/**
 * Dispara o hydrate() uma única vez no mount, exibe um overlay enquanto
 * os dados não vieram e renderiza os filhos só quando o store está pronto.
 *
 * Sem persist no store, a primeira renderização das páginas começa com
 * arrays vazios — sem esse overlay o usuário veria "nenhum contato" por
 * uma fração de segundo em cada load.
 */
export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const hydrateError = useStore((s) => s.hydrateError);
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hydrated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="flex items-center gap-3 text-zinc-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[#FF0033]" />
          Carregando dados…
        </div>
      </div>
    );
  }

  if (hydrateError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-6">
        <div className="max-w-md w-full rounded-lg border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-300">
              Falha ao carregar dados
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mb-4">{hydrateError}</p>
          <NeonButton size="sm" onClick={() => hydrate()}>
            Tentar novamente
          </NeonButton>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
