"use client";
// Conector visual entre dois nodes da timeline.
// SVG inline — nada de libs externas. Mantém no bundle leve.
import { cn } from "@/lib/utils";

type Props = {
  /** Rótulo do delay, ex "15s" ou "6h depois". */
  label?: string;
  /** Variantes visuais: linha simples ou tracejada (condicional). */
  variant?: "solid" | "dashed";
  className?: string;
};

export function TimelineConnector({
  label,
  variant = "solid",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center py-2",
        className
      )}
      aria-hidden
    >
      <svg
        width="2"
        height="42"
        viewBox="0 0 2 42"
        className="shrink-0"
      >
        <line
          x1="1"
          y1="0"
          x2="1"
          y2="42"
          stroke="rgba(255,0,51,0.35)"
          strokeWidth="1.5"
          strokeDasharray={variant === "dashed" ? "4 4" : undefined}
        />
      </svg>
      {label && (
        <span
          className={cn(
            "absolute left-6 top-1/2 -translate-y-1/2",
            "text-[10px] uppercase tracking-widest text-zinc-500",
            "rounded border border-white/[0.08] bg-black/40 px-2 py-0.5",
            "cursor-pointer hover:border-[#FF0033]/40 hover:text-zinc-300 transition-colors"
          )}
          title="Editar delay"
        >
          {label}
        </span>
      )}
    </div>
  );
}
