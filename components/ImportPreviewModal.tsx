"use client";

// Mostra "Encontrados X, Y novos, Z duplicados" antes de confirmar a
// importação. Dois botões: "Ignorar duplicados" (default, só cria novos) e
// "Atualizar existentes" (sobrescreve nome/empresa/categoria).

import { X } from "lucide-react";
import { NeonButton } from "@/components/NeonButton";

export type ImportPreview = {
  total: number;
  novos: number;
  duplicados: number;
  invalidos: number;
};

type Props = {
  open: boolean;
  preview: ImportPreview | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (atualizarExistentes: boolean) => void;
};

export function ImportPreviewModal({ open, preview, busy, onCancel, onConfirm }: Props) {
  if (!open || !preview) return null;
  const { total, novos, duplicados, invalidos } = preview;
  const temDuplicados = duplicados > 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Confirmar importação</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Nenhum contato foi salvo ainda — revise o resumo abaixo.
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
          <Metric label="Encontrados" value={total} tone="neutral" />
          <Metric label="Novos" value={novos} tone="ok" />
          <Metric label="Duplicados" value={duplicados} tone={temDuplicados ? "warn" : "neutral"} />
          <Metric label="Inválidos" value={invalidos} tone={invalidos > 0 ? "err" : "neutral"} />
        </dl>

        <p className="mt-4 text-xs text-zinc-500">
          {temDuplicados ? (
            <>
              <strong className="text-zinc-300">Duplicados</strong> são telefones que já
              estão na sua base (comparando pelo número normalizado — ignora formatação).
              Escolha o que fazer com eles:
            </>
          ) : (
            "Sem duplicados — vai criar todos os novos."
          )}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50"
          >
            Cancelar
          </button>
          {temDuplicados && (
            <button
              onClick={() => onConfirm(true)}
              disabled={busy}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
            >
              Atualizar existentes
            </button>
          )}
          <NeonButton
            onClick={() => onConfirm(false)}
            disabled={busy || novos === 0}
            size="sm"
          >
            {busy
              ? "Importando…"
              : temDuplicados
                ? "Ignorar duplicados"
                : "Importar"}
          </NeonButton>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "err" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "err"
          ? "text-rose-300"
          : "text-zinc-300";
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-2">
      <div className={`text-lg font-semibold ${toneClass}`}>{value.toLocaleString("pt-BR")}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}
