"use client";
import { cn } from "@/lib/utils";
import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  icon?: React.ReactNode;
};

export const NeonInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, icon, ...props }, ref) => (
    <label className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-300">
          {label}
        </span>
      )}
      <div
        className={cn(
          "group flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 transition-all",
          "focus-within:border-neon/80 focus-within:shadow-neon-sm",
          className
        )}
      >
        {icon && <span className="text-neon/80 shrink-0">{icon}</span>}
        <input
          ref={ref}
          className="h-11 flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          {...props}
        />
      </div>
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </label>
  )
);
NeonInput.displayName = "NeonInput";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
};

export const NeonTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, ...props }, ref) => (
    <label className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-300">
          {label}
        </span>
      )}
      <textarea
        ref={ref}
        className={cn(
          "min-h-[120px] rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-all resize-y",
          "focus:border-neon/80 focus:shadow-neon-sm",
          className
        )}
        {...props}
      />
      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </label>
  )
);
NeonTextarea.displayName = "NeonTextarea";
