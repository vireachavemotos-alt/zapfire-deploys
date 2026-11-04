"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Star, X, Loader2 } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { NeonButton } from "./NeonButton";
import { Portal } from "./Portal";

interface Props {
  campanhaId: string;
  campanhaNome: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal que aparece automaticamente quando uma campanha vira "concluida"
 * (uma vez só, enquanto `rating` ainda é null). Permite nota 1-5 estrelas
 * + comentário opcional. Serve como "retrospectiva rápida" pro usuário
 * aprender o que funcionou e o que falhou — ajuda a melhorar as próximas.
 */
export function CampaignRatingModal({
  campanhaId,
  campanhaNome,
  onClose,
  onSaved,
}: Props) {
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (rating < 1) {
      toast.warning("Escolhe uma nota de 1 a 5 estrelas antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/campanhas/${campanhaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          ratingComment: comment.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${res.status}`);
      }
      toast.success("Avaliação salva. Valeu!");
      onSaved();
    } catch (err) {
      toast.error(`Falha ao salvar: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    // Marca como "avaliada" com rating=0 pra não reabrir o modal (0 = pulou).
    try {
      await fetch(`/api/campanhas/${campanhaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 0 }),
      });
    } catch {
      /* não bloqueia o fechar */
    }
    onClose();
  }

  const shown = hover || rating;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        onClick={saving ? undefined : handleSkip}
      >
        <GlassCard
          strong
          className="w-full max-w-md relative p-6 animate-pop"
          onClick={(e) => e.stopPropagation()}
        >
          {!saving && (
            <button
              onClick={handleSkip}
              className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
              aria-label="Pular avaliação"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="mb-2">
            <h2 className="text-base font-semibold text-white">
              Como foi essa campanha?
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {campanhaNome} · sua avaliação ajuda a melhorar as próximas.
            </p>
          </div>

          <div className="neon-divider my-4" />

          {/* Estrelas */}
          <div className="flex items-center justify-center gap-2 mb-5">
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = n <= shown;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={saving}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  className="transition-transform hover:scale-110 disabled:opacity-50"
                  aria-label={`${n} estrela${n === 1 ? "" : "s"}`}
                >
                  <Star
                    className={`h-9 w-9 ${
                      filled
                        ? "fill-[#FF0033] text-[#FF0033] drop-shadow-[0_0_6px_rgba(255,0,51,0.4)]"
                        : "text-zinc-600"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {shown > 0 && (
            <p className="text-center text-xs text-zinc-400 mb-4 h-4">
              {shown === 1 && "Terrível — nada funcionou."}
              {shown === 2 && "Ruim — quase ninguém engajou."}
              {shown === 3 && "Mediano — foi ok."}
              {shown === 4 && "Boa — bom retorno."}
              {shown === 5 && "Excelente — repetir essa fórmula."}
            </p>
          )}

          <label className="block">
            <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
              Comentário (opcional)
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={saving}
              placeholder="O que funcionou? O que falhou? Qual copy teve mais retorno?"
              rows={3}
              className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-2 text-sm text-zinc-100 focus:border-[#FF0033]/60 focus:outline-none disabled:opacity-50 resize-none"
            />
          </label>

          <div className="flex items-center gap-2 pt-4 mt-4 border-t border-white/5">
            <NeonButton
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={handleSkip}
              disabled={saving}
            >
              Pular
            </NeonButton>
            <NeonButton
              size="sm"
              className="flex-1"
              onClick={handleSave}
              disabled={saving || rating < 1}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
                </>
              ) : (
                "Salvar avaliação"
              )}
            </NeonButton>
          </div>
        </GlassCard>
      </div>
    </Portal>
  );
}
