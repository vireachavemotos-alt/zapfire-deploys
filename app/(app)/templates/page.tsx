"use client";

// Biblioteca de Templates — snapshots de MessageBlock[] reutilizáveis em
// qualquer campanha nova. É CRUD simples: nome, descrição e os blocos.
// A gente não compartilha estado com o store porque templates são isolados
// do resto do app (não afeta listas, contatos, campanhas em execução).

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  FileStack,
  Trash2,
  Edit3,
  X,
  Copy,
  Type,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  Sticker as StickerIcon,
  MapPin,
  Phone,
} from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmModal } from "@/components/ConfirmModal";
import { MessageComposer } from "@/components/MessageComposer";
import {
  MessageBlock,
  MessageKind,
  isBlockValid,
  messageKindLabels,
  newBlock,
} from "@/lib/message";
import { formatDateBR } from "@/lib/utils";

interface Template {
  id: string;
  nome: string;
  descricao: string | null;
  blocks: MessageBlock[];
  criadoEm: string;
  atualizadoEm: string;
}

const KIND_ICON: Record<MessageKind, React.ComponentType<{ className?: string }>> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  audio: Mic,
  document: FileText,
  sticker: StickerIcon,
  location: MapPin,
  call: Phone,
};

type Editing =
  | { mode: "new" }
  | { mode: "edit"; template: Template };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/templates");
      const d = await r.json();
      setTemplates(Array.isArray(d.items) ? d.items : []);
    } catch (err) {
      toast.error(`Falha ao carregar templates: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmTarget = confirmId
    ? templates.find((t) => t.id === confirmId) || null
    : null;

  async function handleSave(
    dados: { nome: string; descricao?: string },
    blocks: MessageBlock[]
  ) {
    if (!editing) return;
    try {
      if (editing.mode === "new") {
        const r = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...dados, blocks }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Erro ${r.status}`);
        }
        toast.success("Template criado.");
      } else {
        const r = await fetch(`/api/templates/${editing.template.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...dados, blocks }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Erro ${r.status}`);
        }
        toast.success("Template atualizado.");
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(`Falha ao salvar: ${(err as Error).message}`);
    }
  }

  async function handleRemove() {
    if (!confirmId) return;
    try {
      const r = await fetch(`/api/templates/${confirmId}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      toast.success("Template removido.");
      setTemplates((prev) => prev.filter((t) => t.id !== confirmId));
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
    }
    setConfirmId(null);
  }

  async function handleDuplicate(t: Template) {
    try {
      const r = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: `${t.nome} (cópia)`,
          descricao: t.descricao || undefined,
          blocks: t.blocks,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${r.status}`);
      }
      toast.success("Template duplicado.");
      await load();
    } catch (err) {
      toast.error(`Falha ao duplicar: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Biblioteca de mensagens salvas. Reutilize em qualquer campanha com 1 clique."
        actions={
          <NeonButton onClick={() => setEditing({ mode: "new" })}>
            <Plus className="h-4 w-4" /> Novo template
          </NeonButton>
        }
      />

      {loading ? (
        <GlassCard className="py-12 text-center">
          <p className="text-sm text-zinc-500">Carregando templates...</p>
        </GlassCard>
      ) : templates.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <div className="h-10 w-10 mx-auto rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-3">
            <FileStack className="h-4 w-4 text-[#FF0033]" />
          </div>
          <p className="text-sm font-semibold text-white">
            Nenhum template salvo
          </p>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Crie templates das suas mensagens mais usadas — depois
            aplique em 1 clique ao montar uma nova campanha.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((t) => {
            const preview = previewText(t.blocks);
            return (
              <GlassCard key={t.id} className="animate-fade-up">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{t.nome}</p>
                    {t.descricao && (
                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {t.descricao}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDuplicate(t)}
                      className="text-zinc-500 hover:text-[#FF3355] p-1 transition-colors"
                      aria-label="Duplicar"
                      title="Duplicar"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditing({ mode: "edit", template: t })}
                      className="text-zinc-500 hover:text-[#FF3355] p-1 transition-colors"
                      aria-label="Editar"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmId(t.id)}
                      className="text-zinc-500 hover:text-[#FF3355] p-1 transition-colors"
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Chips: tipos de bloco */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {t.blocks.map((b, i) => {
                    const Icon = KIND_ICON[b.kind];
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] text-zinc-300"
                        title={messageKindLabels[b.kind]}
                      >
                        <Icon className="h-3 w-3 text-[#FF0033]" />
                        {messageKindLabels[b.kind]}
                      </span>
                    );
                  })}
                </div>

                {preview && (
                  <p className="text-xs text-zinc-400 mt-3 line-clamp-3 leading-snug">
                    {preview}
                  </p>
                )}

                <p className="text-[10px] text-zinc-600 mt-3">
                  {t.blocks.length} bloco{t.blocks.length === 1 ? "" : "s"} ·
                  criado {formatDateBR(t.criadoEm)}
                </p>
              </GlassCard>
            );
          })}
        </div>
      )}

      {editing && (
        <TemplateModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      <ConfirmModal
        open={!!confirmId}
        title="Remover template?"
        description={
          confirmTarget
            ? `"${confirmTarget.nome}" será removido permanentemente.\n\nCampanhas que já usaram este template continuam intactas — o conteúdo é copiado no momento da criação.`
            : undefined
        }
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleRemove}
        onClose={() => setConfirmId(null)}
      />
    </>
  );
}

function previewText(blocks: MessageBlock[]): string {
  for (const b of blocks) {
    if (b.kind === "text" && b.variations.length > 0) {
      const first = b.variations.find((v) => v.trim().length > 0);
      if (first) return first;
    }
  }
  // Fallback: legenda do primeiro bloco de mídia
  for (const b of blocks) {
    if (b.variations.length > 0) {
      const first = b.variations.find((v) => v.trim().length > 0);
      if (first) return first;
    }
  }
  return "";
}

// ───────────────────── Modal de criação/edição ─────────────────────

function TemplateModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Editing;
  onClose: () => void;
  onSave: (
    dados: { nome: string; descricao?: string },
    blocks: MessageBlock[]
  ) => void | Promise<void>;
}) {
  const initial = editing.mode === "edit" ? editing.template : null;

  const [nome, setNome] = useState(initial?.nome || "");
  const [descricao, setDescricao] = useState(initial?.descricao || "");
  const [blocks, setBlocks] = useState<MessageBlock[]>(
    initial?.blocks || [newBlock("text")]
  );
  const [saving, setSaving] = useState(false);

  const validBlocks = useMemo(() => blocks.filter(isBlockValid), [blocks]);
  const allValid =
    blocks.length > 0 && validBlocks.length === blocks.length;

  const canSave = nome.trim().length > 0 && blocks.length > 0 && allValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(
        { nome: nome.trim(), descricao: descricao.trim() || undefined },
        blocks
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] bg-[#0a0a0a] border border-white/10 rounded-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                {editing.mode === "new"
                  ? "Novo template"
                  : `Editar: ${initial?.nome}`}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Monte a sequência de mensagens. Você pode reutilizar em
                qualquer campanha nova.
              </p>
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

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-white/5">
            <NeonInput
              label="Nome *"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Boas-vindas leads frios"
              required
            />
            <NeonInput
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <MessageComposer value={blocks} onChange={setBlocks} />

            {blocks.length > 0 && !allValid && (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                Um ou mais blocos estão incompletos (texto vazio, mídia
                faltando, coordenadas inválidas…). Revise antes de salvar.
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/5 flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              {blocks.length} bloco{blocks.length === 1 ? "" : "s"}
              {blocks.length > 0 && ` · ${validBlocks.length} válido${
                validBlocks.length === 1 ? "" : "s"
              }`}
            </p>
            <div className="flex gap-2">
              <NeonButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </NeonButton>
              <NeonButton
                type="submit"
                size="sm"
                disabled={!canSave || saving}
              >
                {saving
                  ? "Salvando..."
                  : editing.mode === "new"
                    ? "Criar template"
                    : "Salvar"}
              </NeonButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
