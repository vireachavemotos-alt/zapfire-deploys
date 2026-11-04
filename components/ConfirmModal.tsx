"use client";
import { AlertTriangle, X } from "lucide-react";
import { NeonButton } from "./NeonButton";
import { Portal } from "./Portal";

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#0a0a0a] border border-white/10 rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex gap-3">
          <div
            className={`h-8 w-8 rounded-md border flex items-center justify-center shrink-0 ${
              variant === "danger"
                ? "bg-red-500/10 border-red-500/40 text-red-400"
                : "bg-[#FF0033]/10 border-[#FF0033]/40 text-[#FF0033]"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            {description && (
              <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <NeonButton variant="ghost" size="sm" onClick={onClose}>
            {cancelLabel}
          </NeonButton>
          <NeonButton
            variant={variant}
            size="sm"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </NeonButton>
        </div>
      </div>
    </div>
    </Portal>
  );
}
