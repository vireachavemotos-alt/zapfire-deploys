import { GlassCard } from "./GlassCard";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; up?: boolean };
  accent?: boolean;
};

export function KpiCard({ label, value, icon: Icon, trend, accent }: Props) {
  return (
    <GlassCard
      className={cn(
        "relative overflow-hidden",
        accent && "border-[#FF0033]/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
            {label}
          </p>
          <p className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-white truncate">
            {value}
          </p>
          {trend && (
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 text-[11px] font-medium",
                trend.up ? "text-emerald-400" : "text-red-400"
              )}
            >
              {trend.up ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend.value}
            </div>
          )}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 text-[#FF0033] shrink-0">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </GlassCard>
  );
}
