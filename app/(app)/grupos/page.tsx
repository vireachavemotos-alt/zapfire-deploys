"use client";
// Página /grupos — gerencia grupos de WhatsApp por instância conectada.
// Fluxo principal:
//   1. selecionar instância no filtro do topo
//   2. entrar em grupo novo via link (com preview antes)
//   3. ver grid dos grupos que a instância participa
//   4. em cada card: sincronizar membros, listar membros, importar como lista
//      ou sair do grupo
//
// Backend das rotas `/api/grupos/*` é entregue por outro agente — este
// arquivo depende do contrato documentado no handoff.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  UsersRound,
  RefreshCw,
  Users,
  Download,
  LogOut,
  AlertTriangle,
  Loader2,
  Smartphone,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { JoinGroupCard } from "@/components/grupos/JoinGroupCard";
import { MembersModal } from "@/components/grupos/MembersModal";
import { GroupAvatar } from "@/components/grupos/GroupAvatar";

type Instancia = { name: string; connectionStatus?: string };

type Grupo = {
  id: string;
  jid: string;
  nome: string;
  descricao?: string | null;
  pictureUrl?: string | null;
  totalMembros: number;
  ultimaSincEm?: string | null;
  instanceName: string;
};

function tempoRelativo(iso?: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}m atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

export default function GruposPage() {
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [instanciaSel, setInstanciaSel] = useState<string>("");
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalMembros, setModalMembros] = useState<{ id: string; nome: string } | null>(null);
  const [confirmSair, setConfirmSair] = useState<Grupo | null>(null);
  const [acaoLoading, setAcaoLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Carrega instâncias conectadas.
  useEffect(() => {
    fetch("/api/instancias", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: unknown) => {
        const lista = Array.isArray(data) ? (data as Instancia[]) : [];
        const conectadas = lista.filter(
          (i) => (i.connectionStatus ?? "").toLowerCase() === "open"
        );
        setInstancias(conectadas);
        if (!instanciaSel && conectadas[0]) setInstanciaSel(conectadas[0].name);
      })
      .catch((e) =>
        setErro("Falha carregando instâncias: " + (e instanceof Error ? e.message : String(e)))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGrupos = useCallback(async (instanceName: string) => {
    if (!instanceName) {
      setGrupos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(
        `/api/grupos?instanceName=${encodeURIComponent(instanceName)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setGrupos(data.grupos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setGrupos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (instanciaSel) void loadGrupos(instanciaSel);
  }, [instanciaSel, loadGrupos]);

  async function sincronizar(g: Grupo) {
    setAcaoLoading(`sinc-${g.id}`);
    try {
      const res = await fetch(`/api/grupos/${g.id}/sincronizar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setToast(
        `Sincronizado "${g.nome}": +${data.membrosNovos ?? 0} novos, -${data.membrosRemovidos ?? 0} removidos`
      );
      await loadGrupos(instanciaSel);
    } catch (e) {
      setToast(`Falha ao sincronizar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAcaoLoading(null);
    }
  }

  async function sairDoGrupo(g: Grupo) {
    setAcaoLoading(`sair-${g.id}`);
    try {
      const res = await fetch(`/api/grupos/${g.id}/sair`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setToast(`Saiu de "${g.nome}"`);
      await loadGrupos(instanciaSel);
    } catch (e) {
      setToast(`Falha ao sair: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConfirmSair(null);
      setAcaoLoading(null);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const semInstancias = instancias.length === 0;

  const headerActions = useMemo(
    () =>
      instancias.length > 0 && (
        <select
          value={instanciaSel}
          onChange={(e) => setInstanciaSel(e.target.value)}
          className="h-9 rounded-md bg-black/40 border border-white/10 px-3 text-xs text-zinc-100 focus:border-[#FF0033] focus:outline-none"
        >
          {instancias.map((i) => (
            <option key={i.name} value={i.name}>
              {i.name}
            </option>
          ))}
        </select>
      ),
    [instancias, instanciaSel]
  );

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Grupos"
        subtitle="Entre em grupos via link, veja quem participa e importe membros como listas de disparo."
        actions={headerActions}
      />

      {semInstancias ? (
        <GlassCard strong className="flex items-center gap-3 text-sm">
          <Smartphone className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-zinc-200 font-medium">Nenhuma instância conectada</p>
            <p className="text-zinc-500 text-xs mt-0.5">
              Conecte um WhatsApp em <Link href="/numeros" className="underline hover:text-white">/numeros</Link> antes
              de gerenciar grupos.
            </p>
          </div>
        </GlassCard>
      ) : (
        <>
          <JoinGroupCard
            instancias={instancias}
            onEntered={() => void loadGrupos(instanciaSel)}
          />

          {erro && (
            <GlassCard className="mb-6 border-rose-500/30">
              <div className="flex items-start gap-2 text-sm text-rose-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{erro}</span>
              </div>
            </GlassCard>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-widest text-zinc-500">
              Grupos de {instanciaSel}
            </h2>
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={() => void loadGrupos(instanciaSel)}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Atualizar</span>
            </NeonButton>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <GlassCard key={i} className="h-40">
                  <div className="h-full w-full animate-pulse bg-white/[0.03] rounded" />
                </GlassCard>
              ))}
            </div>
          ) : grupos.length === 0 ? (
            <GlassCard className="text-center py-10 text-sm text-zinc-500">
              <UsersRound className="h-6 w-6 mx-auto mb-2 opacity-50" />
              Essa instância ainda não participa de nenhum grupo. Cole um link acima pra entrar.
            </GlassCard>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {grupos.map((g) => (
                <GlassCard key={g.id} className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <GroupAvatar nome={g.nome} pictureUrl={g.pictureUrl} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">{g.nome}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {g.totalMembros} membros · sinc {tempoRelativo(g.ultimaSincEm)}
                      </p>
                      {g.descricao && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{g.descricao}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                    <NeonButton
                      size="sm"
                      variant="outline"
                      onClick={() => sincronizar(g)}
                      disabled={acaoLoading === `sinc-${g.id}`}
                    >
                      {acaoLoading === `sinc-${g.id}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      <span>Sincronizar</span>
                    </NeonButton>
                    <NeonButton
                      size="sm"
                      variant="outline"
                      onClick={() => setModalMembros({ id: g.id, nome: g.nome })}
                    >
                      <Users className="h-3 w-3" />
                      <span>Membros</span>
                    </NeonButton>
                    <NeonButton
                      size="sm"
                      variant="outline"
                      onClick={() => setModalMembros({ id: g.id, nome: g.nome })}
                      title="Abre o modal de membros com opção de importar"
                    >
                      <Download className="h-3 w-3" />
                      <span>Importar</span>
                    </NeonButton>
                    <NeonButton
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmSair(g)}
                      disabled={acaoLoading === `sair-${g.id}`}
                      noShine
                    >
                      <LogOut className="h-3 w-3" />
                    </NeonButton>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md border border-white/10 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-200 shadow-lg">
          {toast}
        </div>
      )}

      {modalMembros && (
        <MembersModal
          grupoId={modalMembros.id}
          grupoNome={modalMembros.nome}
          open
          onClose={() => setModalMembros(null)}
          onImported={(listaId) => {
            setToast(`Lista criada. Abra em /listas`);
            setModalMembros(null);
            void listaId;
          }}
        />
      )}

      <ConfirmModal
        open={!!confirmSair}
        title={`Sair de "${confirmSair?.nome}"?`}
        description="O número vai sair do grupo imediatamente. Pra voltar, você precisa de um novo link de convite."
        confirmLabel="Sair do grupo"
        onConfirm={() => confirmSair && sairDoGrupo(confirmSair)}
        onClose={() => setConfirmSair(null)}
      />
    </div>
  );
}
