"use client";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type Step = { label: string; description?: string };

type Props = {
  steps: Step[];
  current: number;
  onStepClick?: (i: number) => void;
};

export function StepperNeon({ steps, current, onStepClick }: Props) {
  return (
    <div className="flex items-center w-full gap-2">
      {steps.map((s, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={i} className="flex items-center flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onStepClick?.(i)}
              className="flex items-center gap-3 min-w-0"
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all",
                  done &&
                    "bg-neon/20 border-neon text-neon shadow-neon-sm",
                  active &&
                    "bg-gradient-to-b from-[#FF0033] to-[#D50000] border-[#FF335A] text-white shadow-neon animate-pulse-neon",
                  !active && !done && "bg-black/40 border-white/10 text-zinc-500"
                )}
              >
                {done ? <Check className="h-5 w-5" /> : i + 1}
              </span>
              <div className="flex flex-col items-start min-w-0">
                <span
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wider whitespace-nowrap",
                    (active || done) ? "text-white" : "text-zinc-500"
                  )}
                >
                  {s.label}
                </span>
                {s.description && (
                  <span className="text-[11px] text-zinc-500 truncate max-w-[180px]">
                    {s.description}
                  </span>
                )}
              </div>
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-3 h-px flex-1 transition-all",
                  done
                    ? "bg-neon shadow-[0_0_8px_#FF0033]"
                    : "bg-white/10"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
