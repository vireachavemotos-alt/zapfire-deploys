"use client";
// Nó de bifurcação da timeline: aguarda resposta e divide em
// "respondeu" (segue um caminho) / "não respondeu" (follow-up).
// Visual puro — sem lógica de execução.
import { CornerDownRight, MessageCircleReply } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Janela de espera formatada. Ex: "6h" ou "24h". */
  waitFor?: string;
  className?: string;
};

export function BranchFork({ waitFor = "6h", className }: Props) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-amber-400/30 bg-amber-400/5 p-3",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <MessageCircleReply className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-xs font-medium text-amber-200">
          Aguardar resposta
        </span>
        <span className="text-[10px] text-amber-200/70 ml-auto">
          Janela: {waitFor}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded border border-emerald-400/20 bg-emerald-400/5 p-2">
          <div className="flex items-center gap-1 text-emerald-300 mb-0.5">
            <CornerDownRight className="h-3 w-3" />
            Respondeu
          </div>
          <div className="text-zinc-400">Segue caminho A</div>
        </div>
        <div className="rounded border border-zinc-500/20 bg-zinc-500/5 p-2">
          <div className="flex items-center gap-1 text-zinc-300 mb-0.5">
            <CornerDownRight className="h-3 w-3" />
            Não respondeu
          </div>
          <div className="text-zinc-400">Dispara follow-up</div>
        </div>
      </div>
    </div>
  );
}
