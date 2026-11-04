"use client";
// Indicador de save pro editor avançado.
// Visual-only por enquanto; estado real virá quando o backend plug.
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  state: SaveState;
  savedAt?: Date | null;
  message?: string;
  className?: string;
};

function fmt(d: Date) {
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SaveStatus({ state, savedAt, message, className }: Props) {
  if (state === "idle") return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs tracking-tight",
        state === "error" ? "text-red-400" : "text-zinc-400",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {state === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Salvando…
        </>
      )}
      {state === "saved" && (
        <>
          <Check className="h-3 w-3 text-emerald-400" />
          Salvo {savedAt ? `às ${fmt(savedAt)}` : ""}
        </>
      )}
      {state === "error" && (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          {message || "Falha ao salvar"}
        </>
      )}
    </div>
  );
}
