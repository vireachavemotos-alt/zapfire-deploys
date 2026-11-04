"use client";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger" | "secondary";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  pulsing?: boolean;
  /** desabilita efeito de shine sweep no primary/secondary (útil em botões de ícone) */
  noShine?: boolean;
};

export const NeonButton = forwardRef<HTMLButtonElement, Props>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      children,
      pulsing,
      noShine,
      ...props
    },
    ref
  ) => {
    const sizes: Record<Size, string> = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 text-sm",
      lg: "h-11 px-6 text-[15px]",
    };
    // Todos os variants mantêm o mesmo shape (radius, tracking); só o fill muda.
    // Primary é o único com gradient + glow real. Secondary é gradient escuro
    // pra CTAs secundários sem confundir com primary.
    const variants: Record<Variant, string> = {
      primary: cn(
        "text-white border border-[#FF0033]/60",
        "bg-gradient-to-b from-[#FF3355] via-[#FF0033] to-[#D50000]",
        "shadow-neon-sm hover:shadow-neon",
        "hover:brightness-110",
        !noShine && "shine"
      ),
      secondary: cn(
        "text-white border border-white/[0.08]",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.02]",
        "hover:from-white/[0.12] hover:to-white/[0.04] hover:border-white/[0.14]",
        !noShine && "shine"
      ),
      ghost:
        "bg-transparent text-zinc-300 border border-white/[0.08] hover:border-white/[0.18] hover:text-white hover:bg-white/[0.03]",
      outline:
        "bg-transparent text-[#FF3355] border border-[#FF0033]/40 hover:border-[#FF0033]/70 hover:bg-[#FF0033]/[0.06]",
      danger:
        "bg-transparent text-red-400 border border-red-500/30 hover:border-red-500/60 hover:bg-red-500/[0.06] hover:text-red-300",
    };

    return (
      <button
        ref={ref}
        className={cn(
          // base: layout + tipografia + estados
          "inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-tight whitespace-nowrap select-none",
          "transition-[background,border-color,box-shadow,transform,filter] duration-200",
          // micro-interação: leve afunda no click (nada agressivo)
          "active:scale-[0.97] active:duration-75",
          // foco acessível
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0033]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-0)]",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
          sizes[size],
          variants[variant],
          pulsing && "animate-pulse",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
NeonButton.displayName = "NeonButton";
