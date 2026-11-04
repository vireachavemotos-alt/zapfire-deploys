import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        className
      )}
      {...props}
    />
  );
}
