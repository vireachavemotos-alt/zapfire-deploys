"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { PageHeader } from "@/components/PageHeader";
import { StatusDot } from "@/components/StatusDot";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useStore, CampanhaStatus } from "@/lib/store";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils";
import { Plus, Rocket, Trash2, Clock, Copy } from "lucide-react";

const statusUi: Record<
  CampanhaStatus,
  { dot: "on" | "off" | "pending" | "error"; label: string }
> = {
  rascunho: { dot: "off", label: "Rascunho" },
  agendada: { dot: "pending", label: "Agendada" },
  em_execucao: { dot: "pending", label: "Em execução" },
  pausada: { dot: "off", label: "Pausada" },
  concluida: { dot: "on", label: "Concluída" },
  erro: { dot: "error", label: "Erro" },
};

export default function CampanhasPage() {
  const campanhas = useStore((s) => s.campanhas);
  const removeCampanha = useStore((s) => s.removeCampanha);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTarget = confirmId
    ? campanhas.find((c) => c.id === confirmId)
    : null;

  async function handleConfirmRemove() {
    if (!confirmId) return;
    try {
      await removeCampanha(confirmId);
      toast.success("Campanha removida.");
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
    }
    setConfirmId(null);
  }

  return (
    <>
      <PageHeader
        title="Campanhas"
        subtitle={`${campanhas.length} campanha${campanhas.length === 1 ? "" : "s"} registrada${campanhas.length === 1 ? "" : "s"}.`}
        actions={
          <Link href="/campanhas/nova">
            <NeonButton>
              <Plus className="h-4 w-4" /> Nova campanha
            </NeonButton>
          </Link>
        }
      />

      {campanhas.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <div className="h-10 w-10 mx-auto rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-3">
            <Rocket className="h-4 w-4 text-[#FF0033]" />
          </div>
          <p className="text-sm font-semibold text-white">
            Nenhuma campanha criada
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Crie uma campanha para começar a disparar.
          </p>
          <Link href="/campanhas/nova" className="inline-block mt-4">
            <NeonButton>
              <Plus className="h-4 w-4" /> Criar primeira campanha
            </NeonButton>
          </Link>
        </GlassCard>
      ) : (
        <GlassCard>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                  <th className="py-2 font-medium">Nome</th>
                  <th className="py-2 font-medium hidden sm:table-cell">
                    Status
                  </th>
                  <th className="py-2 font-medium hidden md:table-cell">
                    Enviadas
                  </th>
                  <th className="py-2 font-medium hidden md:table-cell">
                    Criada
                  </th>
                  <th className="py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {campanhas.map((c) => {
                  const ui = statusUi[c.status];
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="py-3">
                        <Link
                          href={`/campanhas/${c.id}`}
                          className="font-medium hover:text-[#FF0033]"
                        >
                          {c.nome}
                        </Link>
                        {c.status === "agendada" && c.agendadoPara && (
                          <div className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTimeBR(c.agendadoPara)}
                          </div>
                        )}
                        <div className="text-[10px] text-zinc-600 mt-0.5 sm:hidden">
                          <StatusDot
                            status={ui.dot}
                            label={ui.label}
                            size="sm"
                          />
                        </div>
                      </td>
                      <td className="py-3 hidden sm:table-cell">
                        <StatusDot
                          status={ui.dot}
                          label={ui.label}
                          size="sm"
                        />
                      </td>
                      <td className="py-3 text-zinc-300 tabular-nums hidden md:table-cell">
                        {c.enviadas} / {c.total}
                      </td>
                      <td className="py-3 text-zinc-500 hidden md:table-cell">
                        {formatDateBR(c.criadaEm)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Link href={`/campanhas/${c.id}`}>
                            <NeonButton variant="ghost" size="sm">
                              Ver
                            </NeonButton>
                          </Link>
                          <Link
                            href={`/campanhas/nova?clone=${c.id}`}
                            className="text-zinc-500 hover:text-[#FF3355] p-1.5"
                            aria-label="Duplicar"
                            title="Duplicar campanha"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => setConfirmId(c.id)}
                            className="text-zinc-500 hover:text-[#FF0033] p-1.5"
                            aria-label="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      <ConfirmModal
        open={!!confirmId}
        title="Remover campanha?"
        description={
          confirmTarget
            ? `"${confirmTarget.nome}" · ${confirmTarget.enviadas} enviada${confirmTarget.enviadas === 1 ? "" : "s"} · ${confirmTarget.falhas} falha${confirmTarget.falhas === 1 ? "" : "s"}.\n\nO histórico de resultados será perdido. Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmRemove}
        onClose={() => setConfirmId(null)}
      />
    </>
  );
}
