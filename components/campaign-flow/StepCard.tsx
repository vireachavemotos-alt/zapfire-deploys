"use client";
// Card de um step da sequência. Visual isolado, sem Prisma — recebe tudo
// via props pra ser reutilizável no editor ao vivo (/sequencia) e no
// FlowEditor do wizard.
import { Copy, GripVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { messageKindLabels, type MessageKind } from "@/lib/message";

export type StepCardData = {
  id: string;
  kind: MessageKind;
  /** Preview curto. Em text: variação sorteada, em media: nome do arquivo. */
  preview: string;
  /** Rótulo opcional ("Mensagem 1", "Follow-up 1"). */
  label?: string;
  /** Horário absoluto ou nota. Ex: "10:00:15" ou "+15s após anterior". */
  schedule?: string;
  enabled?: boolean;
  variations?: number;
};

type Props = {
  step: StepCardData;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleEnabled?: () => void;
  dragHandleProps?: Record<string, unknown>;
  dragging?: boolean;
  selected?: boolean;
  className?: string;
};

const kindBadge: Record<MessageKind, string> = {
  text: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  image: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  video: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20",
  audio: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  document: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  sticker: "bg-pink-500/10 text-pink-300 border-pink-500/20",
  location: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  call: "bg-red-500/10 text-red-300 border-red-500/20",
};

export function StepCard({
  step,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleEnabled,
  dragHandleProps,
  dragging,
  selected,
  className,
}: Props) {
  const enabled = step.enabled !== false;

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-black/40 backdrop-blur-sm",
        "transition-all",
        selected
          ? "border-[#FF0033]/70 shadow-neon-sm"
          : "border-white/[0.08] hover:border-white/[0.18]",
        dragging && "opacity-70 scale-[1.01]",
        !enabled && "opacity-50",
        className
      )}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          className="flex items-center px-2 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Arrastar para reordenar"
          {...dragHandleProps}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 p-3">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={cn(
                "text-[10px] uppercase tracking-widest font-medium px-1.5 py-0.5 rounded border",
                kindBadge[step.kind]
              )}
            >
              {messageKindLabels[step.kind]}
            </span>
            {step.label && (
              <span className="text-xs font-medium text-zinc-200">
                {step.label}
              </span>
            )}
            {step.schedule && (
              <span className="text-[10px] text-zinc-500 tracking-tight">
                · {step.schedule}
              </span>
            )}
            {step.variations && step.variations > 1 && (
              <span className="text-[10px] text-zinc-500">
                · {step.variations} variações
              </span>
            )}
            {!enabled && (
              <span className="ml-auto text-[10px] uppercase tracking-widest text-zinc-500">
                Desativado
              </span>
            )}
          </div>

          <p className="text-sm text-zinc-300 truncate pr-20">
            {step.preview || <span className="italic text-zinc-600">sem conteúdo</span>}
          </p>
        </div>

        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onToggleEnabled && (
            <button
              type="button"
              onClick={onToggleEnabled}
              className="p-1.5 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200"
              title={enabled ? "Desativar etapa" : "Ativar etapa"}
            >
              <span
                className={cn(
                  "block h-2 w-2 rounded-full",
                  enabled ? "bg-emerald-400" : "bg-zinc-600"
                )}
              />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className="p-1.5 rounded hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200"
              title="Duplicar"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-red-500/[0.1] text-zinc-400 hover:text-red-300"
              title="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
