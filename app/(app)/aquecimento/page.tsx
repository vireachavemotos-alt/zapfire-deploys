"use client";
// Página de Aquecimento de Números.
// Pares de instâncias conversam entre si pra ganhar reputação de chip.
// Backend (`/api/warmup/sessions`) rodado por outro agente.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/GlassCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CreateSessionCard } from "@/components/warmup/CreateSessionCard";
import {
  WarmupSessionCard,
  type WarmupSession,
} from "@/components/warmup/WarmupSessionCard";
import { WarmupHistoryDrawer } from "@/components/warmup/WarmupHistoryDrawer";

interface Instance {
  name?: string;
  profileName?: string | null;
  connectionStatus?: string;
}

const POLL_MS = 10_000;

export default function AquecimentoPage() {
  const [sessions, setSessions] = useState<WarmupSession[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarmupSession | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [sRes, iRes] = await Promise.all([
        fetch("/api/warmup/sessions", { cache: "no-store" }),
        fetch("/api/instances", { cache: "no-store" }),
      ]);
      if (!sRes.ok) throw new Error(`sessões: HTTP ${sRes.status}`);
      const sData = (await sRes.json()) as { sessions: WarmupSession[] };
      setSessions(sData.sessions ?? []);
      if (iRes.ok) {
        const iData = (await iRes.json()) as Instance[] | { instances: Instance[] };
        const list = Array.isArray(iData) ? iData : iData.instances ?? [];
        setInstances(list);
      }
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, POLL_MS);
    return () => clearInterval(id);
  }, [loadAll]);

  const instanceOptions = useMemo(
    () =>
      instances
        .filter((i) => !!i.name)
        .map((i) => ({
          name: i.name as string,
          label: i.profileName
            ? `${i.profileName} (${i.name})`
            : (i.name as string),
        })),
    [instances]
  );

  const markPending = (id: string, v: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  async function handleCreate(a: string, b: string) {
    const res = await fetch("/api/warmup/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanciaA: a, instanciaB: b }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    await loadAll();
  }

  async function handleToggle(session: WarmupSession, next: boolean) {
    markPending(session.id, true);
    // otimista
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, ativo: next } : s))
    );
    try {
      const res = await fetch(`/api/warmup/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // reverte
      setSessions((prev) =>
        prev.map((s) =>
          s.id === session.id ? { ...s, ativo: !next } : s
        )
      );
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      markPending(session.id, false);
    }
  }

  async function handleDelete(session: WarmupSession) {
    markPending(session.id, true);
    try {
      const res = await fetch(`/api/warmup/sessions/${session.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      markPending(session.id, false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Aquecimento de Instâncias"
        subtitle="Suas instâncias conversam entre si pra ganhar reputação de chip saudável. Ritmo progressivo, delays naturais, frases variadas."
      />

      <CreateSessionCard instances={instanceOptions} onCreate={handleCreate} />

      {erro && (
        <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-300">
          Falhou: {erro}
        </div>
      )}

      {loading && sessions.length === 0 && (
        <p className="text-xs text-zinc-500">Carregando sessões…</p>
      )}

      {!loading && sessions.length === 0 && (
        <GlassCard strong className="text-center py-10">
          <div className="mx-auto h-12 w-12 rounded-xl bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-3">
            <Flame className="h-5 w-5 text-[#FF3355]" />
          </div>
          <h3 className="text-sm font-semibold text-white">
            Crie sua primeira sessão de aquecimento
          </h3>
          <p className="mt-2 text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
            <strong className="text-zinc-300">Ritmo progressivo</strong> (5→100
            msg/dia), <strong className="text-zinc-300">delays naturais</strong>{" "}
            de 10–60min entre envios, e um pool com{" "}
            <strong className="text-zinc-300">100+ frases em PT-BR</strong> pra
            variar o conteúdo. Nenhum número seu será marcado como spam —
            fingimos conversa humana entre duas das suas instâncias.
          </p>
        </GlassCard>
      )}

      {sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map((s) => (
            <WarmupSessionCard
              key={s.id}
              session={s}
              pending={pending.has(s.id)}
              onToggle={(next) => handleToggle(s, next)}
              onDelete={() => setDeleteTarget(s)}
              onOpenHistory={() => setHistoryOpenFor(s.id)}
            />
          ))}
        </div>
      )}

      <WarmupHistoryDrawer
        sessionId={historyOpenFor}
        onClose={() => setHistoryOpenFor(null)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Remover sessão de aquecimento?"
        description={
          deleteTarget
            ? `A sessão entre ${deleteTarget.instanciaA} ↔ ${deleteTarget.instanciaB} será apagada. O histórico de mensagens vai junto. Essa ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Remover"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
