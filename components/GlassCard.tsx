import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  strong?: boolean;
  glow?: boolean;
};

export const GlassCard = forwardRef<HTMLDivElement, Props>(
  ({ className, strong, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        strong ? "glass-strong" : "glass",
        "rounded-lg p-5 relative",
        className
      )}
      {...props}
    />
  )
);
GlassCard.displayName = "GlassCard";
