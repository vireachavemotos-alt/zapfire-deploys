"use client";
// Timeline avançada da campanha — wire real com o backend do orquestrador.
// Lê CampanhaStep (/api/orquestrador/campanhas/[id]/steps), edita com PATCH
// debounced (500ms), adiciona/remove/reordena, publica versão e inicia disparo.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Clock, Plus, Rocket, Send, X } from "lucide-react";
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
import { PageHeader } from "@/components/PageHeader";
import { NeonButton } from "@/components/NeonButton";
import { GlassCard } from "@/components/GlassCard";
import { StepCard } from "@/components/campaign-flow/StepCard";
import { TimelineConnector } from "@/components/campaign-flow/TimelineConnector";
import { SaveStatus, type SaveState } from "@/components/SaveStatus";
import { CampaignTabs } from "@/components/campaign-flow/CampaignTabs";
import type { MessageBlock, MessageKind } from "@/lib/message";

// Shape que a API retorna (CampanhaStep do Prisma, serializado).
interface ApiStep {
  id: string;
  campanhaId: string;
  posicao: number;
  nome: string;
  tipo: string;
  blocks: string; // JSON MessageBlock[]
  scheduleMode: string;
  delaySegundos: number;
  horarioAbsoluto: string | null;
  dependeDoStepId: string | null;
  condicao: string | null;
  ativo: boolean;
}

type Patchable = Partial<
  Pick<
    ApiStep,
    | "nome"
    | "tipo"
    | "scheduleMode"
    | "delaySegundos"
    | "horarioAbsoluto"
    | "ativo"
    | "condicao"
  >
> & { blocks?: unknown[] };

// Deriva o preview + kind de um step pro StepCard.
function previewOf(step: ApiStep): { kind: MessageKind; preview: string; variations?: number } {
  let blocks: MessageBlock[] = [];
  try {
    const parsed = JSON.parse(step.blocks);
    if (Array.isArray(parsed)) blocks = parsed as MessageBlock[];
  } catch {
    // ignora
  }
  const first = blocks[0];
  if (!first) {
    return { kind: "text", preview: "", variations: undefined };
  }
  const vars = Array.isArray(first.variations) ? first.variations : [];
  const text = vars[0] ?? "";
  return {
    kind: (first.kind ?? "text") as MessageKind,
    preview: text,
    variations: vars.length > 1 ? vars.length : undefined,
  };
}

function scheduleLabel(step: ApiStep): string {
  switch (step.scheduleMode) {
    case "immediate":
      return "imediato";
    case "delay":
      return `+${step.delaySegundos}s após anterior`;
    case "absolute":
      return step.horarioAbsoluto ?? "horário fixo";
    case "after_reply":
      return `${step.delaySegundos}s após resposta`;
    case "after_no_reply":
      return `${step.delaySegundos}s se não responder`;
    default:
      return step.scheduleMode;
  }
}

function SortableStep({
  step,
  onEdit,
  onDelete,
  onToggle,
  selected,
}: {
  step: ApiStep;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  selected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const { kind, preview, variations } = previewOf(step);
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <StepCard
        step={{
          id: step.id,
          kind,
          preview,
          label: step.nome || `Etapa ${step.posicao + 1}`,
          schedule: scheduleLabel(step),
          enabled: step.ativo,
          variations,
        }}
        selected={selected}
        dragging={isDragging}
        dragHandleProps={listeners}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggle}
      />
    </div>
  );
}

export default function CampanhaSequenciaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campanhaId = params.id;

  const [steps, setSteps] = useState<ApiStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [starting, setStarting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Carga inicial. 404 do backend significa que a campanha ainda não foi
  // migrada pro orquestrador (não tem steps). Oferecemos botão de migração.
  const loadSteps = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/orquestrador/campanhas/${campanhaId}/steps`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { steps?: ApiStep[] };
      const arr = Array.isArray(data.steps) ? data.steps : [];
      arr.sort((a, b) => a.posicao - b.posicao);
      setSteps(arr);
      setNeedsMigration(arr.length === 0);
    } catch {
      // Mantém steps=[] e marca migração — operador decide se migra.
      setNeedsMigration(true);
    } finally {
      setLoading(false);
    }
  }, [campanhaId]);

  useEffect(() => {
    void loadSteps();
  }, [loadSteps]);

  async function migrar() {
    setMigrating(true);
    try {
      const r = await fetch(`/api/orquestrador/campanhas/${campanhaId}/migrar`, {
        method: "POST",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      toast.success("Migrada pro orquestrador — carregando sequência.");
      setNeedsMigration(false);
      await loadSteps();
    } catch (e) {
      toast.error(`Falha ao migrar: ${(e as Error).message}`);
    } finally {
      setMigrating(false);
    }
  }

  // Debounce por campo: ao digitar, mantemos a última mudança por 500ms antes
  // de bater no backend. Cada stepId tem seu próprio timer.
  const pendingPatches = useRef<Map<string, Patchable>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function schedulePatch(stepId: string, patch: Patchable) {
    const current = pendingPatches.current.get(stepId) ?? {};
    pendingPatches.current.set(stepId, { ...current, ...patch });
    setSaveState("saving");
    const prev = timers.current.get(stepId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => void flushPatch(stepId), 500);
    timers.current.set(stepId, t);
  }

  async function flushPatch(stepId: string) {
    const body = pendingPatches.current.get(stepId);
    pendingPatches.current.delete(stepId);
    timers.current.delete(stepId);
    if (!body) return;
    try {
      const r = await fetch(
        `/api/orquestrador/campanhas/${campanhaId}/steps/${stepId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSaveState("saved");
      setSavedAt(new Date());
    } catch (e) {
      setSaveState("error");
      toast.error(`Erro ao salvar: ${(e as Error).message}`);
      // reverte do servidor
      await loadSteps();
    }
  }

  function updateStep(stepId: string, partial: Partial<ApiStep>) {
    // otimista: aplica local primeiro
    setSteps((arr) =>
      arr.map((s) => (s.id === stepId ? { ...s, ...partial } : s))
    );
    // monta patch no shape que a API espera
    const toSend: Patchable = {};
    if (partial.nome !== undefined) toSend.nome = partial.nome;
    if (partial.tipo !== undefined) toSend.tipo = partial.tipo;
    if (partial.scheduleMode !== undefined) toSend.scheduleMode = partial.scheduleMode;
    if (partial.delaySegundos !== undefined) toSend.delaySegundos = partial.delaySegundos;
    if (partial.horarioAbsoluto !== undefined) toSend.horarioAbsoluto = partial.horarioAbsoluto;
    if (partial.ativo !== undefined) toSend.ativo = partial.ativo;
    if (partial.condicao !== undefined) toSend.condicao = partial.condicao;
    schedulePatch(stepId, toSend);
  }

  // Edição do primeiro bloco (conteúdo textual). Preserva o resto do array.
  function updateStepContent(stepId: string, texto: string) {
    const target = steps.find((s) => s.id === stepId);
    if (!target) return;
    let blocks: MessageBlock[] = [];
    try {
      const parsed = JSON.parse(target.blocks);
      if (Array.isArray(parsed)) blocks = parsed as MessageBlock[];
    } catch {
      // começa do zero
    }
    if (blocks.length === 0) {
      blocks = [{ id: crypto.randomUUID(), kind: "text", variations: [texto] }];
    } else {
      const first = { ...blocks[0] };
      first.variations = [texto, ...((first.variations ?? []).slice(1))];
      blocks[0] = first;
    }
    const blocksJson = JSON.stringify(blocks);
    setSteps((arr) =>
      arr.map((s) => (s.id === stepId ? { ...s, blocks: blocksJson } : s))
    );
    schedulePatch(stepId, { blocks });
  }

  async function addStep() {
    try {
      const r = await fetch(`/api/orquestrador/campanhas/${campanhaId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: [{ kind: "text", variations: [""] }] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { step: ApiStep };
      setSteps((arr) => [...arr, data.step]);
      setSelectedId(data.step.id);
      toast.success("Etapa adicionada.");
    } catch (e) {
      toast.error(`Falha ao adicionar: ${(e as Error).message}`);
    }
  }

  async function deleteStep(stepId: string) {
    if (!confirm("Excluir essa etapa? Vai sair do rascunho da próxima versão.")) return;
    const snapshot = steps;
    setSteps((arr) => arr.filter((s) => s.id !== stepId));
    if (selectedId === stepId) setSelectedId(null);
    try {
      const r = await fetch(
        `/api/orquestrador/campanhas/${campanhaId}/steps/${stepId}`,
        { method: "DELETE" }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // compacta posições local
      setSteps((arr) => arr.map((s, i) => ({ ...s, posicao: i })));
    } catch (e) {
      toast.error(`Falha ao excluir: ${(e as Error).message}`);
      setSteps(snapshot);
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = steps.map((s) => s.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const snapshot = steps;
    const reordered = arrayMove(steps, oldIndex, newIndex).map((s, i) => ({
      ...s,
      posicao: i,
    }));
    setSteps(reordered);
    setSaveState("saving");
    try {
      const r = await fetch(
        `/api/orquestrador/campanhas/${campanhaId}/steps/reordenar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordem: reordered.map((s) => s.id) }),
        }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSaveState("saved");
      setSavedAt(new Date());
    } catch (e) {
      toast.error(`Falha ao reordenar: ${(e as Error).message}`);
      setSteps(snapshot);
      setSaveState("error");
    }
  }

  async function publicar() {
    setPublishing(true);
    try {
      const r = await fetch(
        `/api/orquestrador/campanhas/${campanhaId}/publicar`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const data = (await r.json()) as { versaoNumero: number };
      toast.success(`Versão ${data.versaoNumero} publicada.`);
    } catch (e) {
      toast.error(`Falha ao publicar: ${(e as Error).message}`);
    } finally {
      setPublishing(false);
    }
  }

  async function iniciar() {
    setStarting(true);
    try {
      const r = await fetch(
        `/api/orquestrador/campanhas/${campanhaId}/iniciar`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const data = (await r.json()) as {
        novosContatos: number;
        suprimidos: number;
        primeirasExecucoes: number;
      };
      toast.success(
        `Disparo iniciado: ${data.primeirasExecucoes} execuções enfileiradas` +
          (data.suprimidos ? ` · ${data.suprimidos} suprimidos` : "")
      );
      router.push(`/campanhas/${campanhaId}/contatos`);
    } catch (e) {
      toast.error(`Falha ao iniciar: ${(e as Error).message}`);
    } finally {
      setStarting(false);
    }
  }

  const ids = useMemo(() => steps.map((s) => s.id), [steps]);
  const selected = steps.find((s) => s.id === selectedId) ?? null;
  const selectedContent = useMemo(() => {
    if (!selected) return "";
    try {
      const b = JSON.parse(selected.blocks) as MessageBlock[];
      return b[0]?.variations?.[0] ?? "";
    } catch {
      return "";
    }
  }, [selected]);

  return (
    <>
      <Link
        href={`/campanhas/${campanhaId}`}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-[#FF0033] mb-3 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>

      <PageHeader
        title="Sequência"
        subtitle="Edição em tempo real · auto-save a cada 500ms. Publique a versão pra os próximos envios usarem a nova config."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SaveStatus state={saveState} savedAt={savedAt} />
            <NeonButton
              variant="outline"
              size="sm"
              onClick={publicar}
              disabled={publishing || steps.length === 0}
            >
              <Rocket className="h-3.5 w-3.5" />
              {publishing ? "Publicando..." : "Publicar versão"}
            </NeonButton>
            <NeonButton
              variant="primary"
              size="sm"
              onClick={iniciar}
              disabled={starting || steps.length === 0}
            >
              <Send className="h-3.5 w-3.5" />
              {starting ? "Iniciando..." : "Iniciar disparo"}
            </NeonButton>
          </div>
        }
      />

      <CampaignTabs id={campanhaId} active="sequencia" />

      {loading ? (
        <GlassCard strong className="p-6 mt-4 text-sm text-zinc-500">
          Carregando sequência…
        </GlassCard>
      ) : needsMigration ? (
        <GlassCard strong className="p-6 mt-4">
          <h3 className="text-sm font-medium text-zinc-100 mb-1">
            Essa campanha ainda não usa o orquestrador
          </h3>
          <p className="text-sm text-zinc-400 mb-3">
            Pra editar em tempo real, programar follow-ups por resposta e ver
            timeline por contato, precisa migrar pro novo engine. Os blocos
            atuais viram etapas 1:1 — nada se perde.
          </p>
          <NeonButton
            variant="primary"
            size="sm"
            onClick={migrar}
            disabled={migrating}
          >
            {migrating ? "Migrando…" : "Migrar pro orquestrador"}
          </NeonButton>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 mt-4">
          <GlassCard strong className="p-4">
            {steps.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-zinc-500 mb-3">
                  Nenhuma etapa ainda — comece pela primeira mensagem.
                </p>
                <NeonButton variant="primary" size="sm" onClick={addStep}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar primeira mensagem
                </NeonButton>
              </div>
            ) : (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col">
                      {steps.map((step, i) => (
                        <div
                          key={step.id}
                          onClick={() => setSelectedId(step.id)}
                        >
                          <SortableStep
                            step={step}
                            selected={selectedId === step.id}
                            onEdit={() => setSelectedId(step.id)}
                            onDelete={() => deleteStep(step.id)}
                            onToggle={() =>
                              updateStep(step.id, { ativo: !step.ativo })
                            }
                          />
                          {i < steps.length - 1 && (
                            <TimelineConnector
                              label={
                                steps[i + 1].scheduleMode === "immediate"
                                  ? "imediato"
                                  : `${steps[i + 1].delaySegundos}s`
                              }
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                <div className="pt-4">
                  <NeonButton variant="ghost" size="sm" onClick={addStep}>
                    <Plus className="h-3.5 w-3.5" /> Adicionar etapa
                  </NeonButton>
                </div>
              </>
            )}
          </GlassCard>

          <aside className="lg:sticky lg:top-4 self-start">
            <GlassCard strong className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-zinc-100">
                  {selected
                    ? `Editar · ${selected.nome || `Etapa ${selected.posicao + 1}`}`
                    : "Selecione uma etapa"}
                </h3>
                {selected && (
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-zinc-500 hover:text-zinc-200"
                    aria-label="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {selected ? (
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                      Nome
                    </span>
                    <input
                      type="text"
                      value={selected.nome}
                      onChange={(e) =>
                        updateStep(selected.id, { nome: e.target.value })
                      }
                      className="w-full rounded border border-white/[0.08] bg-black/40 p-2 text-sm text-zinc-100 outline-none focus:border-[#FF0033]/50"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                      Conteúdo (primeira variação)
                    </span>
                    <textarea
                      value={selectedContent}
                      onChange={(e) =>
                        updateStepContent(selected.id, e.target.value)
                      }
                      rows={4}
                      className="w-full rounded border border-white/[0.08] bg-black/40 p-2 text-sm text-zinc-100 outline-none focus:border-[#FF0033]/50"
                      placeholder="Olá {nome}, tudo bem?"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                      Quando disparar
                    </span>
                    <select
                      value={selected.scheduleMode}
                      onChange={(e) =>
                        updateStep(selected.id, { scheduleMode: e.target.value })
                      }
                      className="w-full rounded border border-white/[0.08] bg-black/40 p-2 text-sm text-zinc-100 outline-none focus:border-[#FF0033]/50"
                    >
                      <option value="immediate">Imediato</option>
                      <option value="delay">Delay após anterior</option>
                      <option value="absolute">Horário fixo (HH:MM)</option>
                      <option value="after_reply">Após resposta do lead</option>
                      <option value="after_no_reply">Caso não responda</option>
                    </select>
                  </label>

                  {selected.scheduleMode === "absolute" ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                        Horário (HH:MM)
                      </span>
                      <input
                        type="time"
                        value={selected.horarioAbsoluto ?? ""}
                        onChange={(e) =>
                          updateStep(selected.id, {
                            horarioAbsoluto: e.target.value || null,
                          })
                        }
                        className="w-32 rounded border border-white/[0.08] bg-black/40 p-1.5 text-sm text-zinc-100 outline-none focus:border-[#FF0033]/50"
                      />
                    </label>
                  ) : selected.scheduleMode !== "immediate" ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                        Delay (segundos)
                      </span>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-zinc-500" />
                        <input
                          type="number"
                          min={0}
                          value={selected.delaySegundos}
                          onChange={(e) =>
                            updateStep(selected.id, {
                              delaySegundos: Number(e.target.value) || 0,
                            })
                          }
                          className="w-24 rounded border border-white/[0.08] bg-black/40 p-1.5 text-sm text-zinc-100 outline-none focus:border-[#FF0033]/50"
                        />
                      </div>
                    </label>
                  ) : null}

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.ativo}
                      onChange={(e) =>
                        updateStep(selected.id, { ativo: e.target.checked })
                      }
                      className="accent-[#FF0033]"
                    />
                    <span className="text-sm text-zinc-300">Etapa ativa</span>
                  </label>

                  <div className="mt-2 rounded border border-emerald-400/20 bg-emerald-400/5 p-2 text-[11px] text-emerald-200/80">
                    Alterações entram em vigor nas <strong>próximas</strong> execuções
                    após publicar a versão. Jobs já em voo continuam no snapshot
                    anterior — zero duplicata.
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">
                  Clique numa etapa à esquerda pra editar aqui. O save é
                  automático (500ms após parar de digitar).
                </p>
              )}
            </GlassCard>
          </aside>
        </div>
      )}
    </>
  );
}
