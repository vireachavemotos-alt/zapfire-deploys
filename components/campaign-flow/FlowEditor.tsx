"use client";
// Editor de fluxo linear — reutilizável. Compartilha a mesma estética
// da timeline do /sequencia mas SEM forks (fork é conceito do orquestrador).
//
// Fase de scaffolding: foca em reordenar blocos (drag-and-drop) e expor
// chip de delay entre eles. O onChange devolve os blocos reordenados pro
// consumidor persistir (wizard de nova campanha, por enquanto).
import { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { StepCard, type StepCardData } from "./StepCard";
import { TimelineConnector } from "./TimelineConnector";
import { NeonButton } from "@/components/NeonButton";
import type { MessageBlock } from "@/lib/message";

type Props = {
  value: MessageBlock[];
  onChange: (next: MessageBlock[]) => void;
  /** Delay global entre blocos (ms) — vem da campanha. */
  delayEntreBlocosMs?: number;
  /** Callback pra editar um bloco (abre painel/modal no consumidor). */
  onEditBlock?: (id: string) => void;
  /** Callback pra adicionar bloco (abre o composer tradicional). */
  onAddBlock?: () => void;
};

function blockPreview(b: MessageBlock): string {
  if (b.kind === "text") return b.variations.find((v) => v.trim())?.slice(0, 90) || "";
  if (b.kind === "call")
    return `${b.callIsVideo ? "Vídeo" : "Áudio"} · ${b.callDurationSeconds ?? 10}s`;
  if (b.kind === "location")
    return b.locationName || `${b.latitude ?? "?"}, ${b.longitude ?? "?"}`;
  if (b.mediaFileName) return b.mediaFileName;
  return b.mediaUrl ? "arquivo anexado" : "";
}

function toCardData(b: MessageBlock, idx: number): StepCardData {
  return {
    id: b.id,
    kind: b.kind,
    preview: blockPreview(b),
    label: `Mensagem ${idx + 1}`,
    variations: b.variations.length,
  };
}

function SortableRow({
  block,
  index,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  block: MessageBlock;
  index: number;
  onEdit?: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <StepCard
        step={toCardData(block, index)}
        dragging={isDragging}
        dragHandleProps={listeners}
        onEdit={onEdit ? () => onEdit(block.id) : undefined}
        onDelete={() => onDelete(block.id)}
        onDuplicate={() => onDuplicate(block.id)}
      />
    </div>
  );
}

export function FlowEditor({
  value,
  onChange,
  delayEntreBlocosMs = 2000,
  onEditBlock,
  onAddBlock,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = useMemo(() => value.map((b) => b.id), [value]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(value, oldIndex, newIndex));
  }

  function handleDelete(id: string) {
    onChange(value.filter((b) => b.id !== id));
  }

  function handleDuplicate(id: string) {
    const idx = value.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const dup: MessageBlock = {
      ...value[idx],
      id: Math.random().toString(36).slice(2, 10),
    };
    const next = [...value.slice(0, idx + 1), dup, ...value.slice(idx + 1)];
    onChange(next);
  }

  const delayLabel =
    delayEntreBlocosMs >= 1000
      ? `${Math.round(delayEntreBlocosMs / 1000)}s`
      : `${delayEntreBlocosMs}ms`;

  return (
    <div className="w-full">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {value.map((block, i) => (
              <div key={block.id}>
                <SortableRow
                  block={block}
                  index={i}
                  onEdit={onEditBlock}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
                {i < value.length - 1 && (
                  <TimelineConnector label={delayLabel} />
                )}
              </div>
            ))}
            {value.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/[0.08] p-6 text-center text-sm text-zinc-500">
                Nenhum bloco ainda — adicione o primeiro para começar.
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {onAddBlock && (
        <div className="pt-3">
          <NeonButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddBlock}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar bloco
          </NeonButton>
        </div>
      )}
    </div>
  );
}
