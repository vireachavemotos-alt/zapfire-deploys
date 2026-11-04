import { cn } from "@/lib/utils";

type Props = {
  status: "on" | "off" | "pending" | "error";
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

export function StatusDot({ status, label, size = "md", className }: Props) {
  const color = {
    on: "bg-emerald-400",
    off: "bg-zinc-600",
    pending: "bg-amber-400",
    error: "bg-[#FF0033]",
  }[status];

  const text = {
    on: "text-emerald-300",
    off: "text-zinc-500",
    pending: "text-amber-300",
    error: "text-[#FF0033]",
  }[status];

  const sz = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("inline-block rounded-full", sz, color)} />
      {label && (
        <span className={cn("text-xs font-medium tracking-tight", text)}>
          {label}
        </span>
      )}
    </span>
  );
}
