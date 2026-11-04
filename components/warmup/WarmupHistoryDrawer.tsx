"use client";
// Drawer lateral com o histórico recente de mensagens trocadas em uma
// sessão de aquecimento. Monta ao abrir, fetcha /messages?limit=50 e
// desmonta ao fechar.
import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { Portal } from "@/components/Portal";

export type WarmupMessage = {
  id: string;
  from: string;
  to: string;
  texto: string;
  enviadoEm: string;
  status: "sent" | "failed" | "pending" | string;
  erroDetalhe?: string | null;
};

type Props = {
  sessionId: string | null; // null = fechado
  onClose: () => void;
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function WarmupHistoryDrawer({ sessionId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [messages, setMessages] = useState<WarmupMessage[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    setErro(null);
    fetch(`/api/warmup/sessions/${sessionId}/messages?limit=50`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ messages: WarmupMessage[] }>;
      })
      .then((d) => {
        if (cancelled) return;
        setMessages(d.messages ?? []);
      })
      .catch((e) => {
        if (!cancelled) setErro(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!sessionId) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-[#0a0a0a] border-l border-white/10 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Histórico da sessão
              </h3>
              <p className="text-[11px] text-zinc-500">
                Últimas 50 mensagens trocadas
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="text-zinc-500 hover:text-white p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && (
              <p className="text-xs text-zinc-500 text-center py-6">
                Carregando...
              </p>
            )}
            {erro && (
              <p className="text-xs text-rose-400 text-center py-6">
                Falhou: {erro}
              </p>
            )}
            {!loading && !erro && messages.length === 0 && (
              <p className="text-xs text-zinc-500 text-center py-6">
                Ainda sem mensagens nesta sessão.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 mb-1">
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <span className="truncate max-w-[6rem] font-medium text-zinc-300">
                      {m.from}
                    </span>
                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate max-w-[6rem] font-medium text-zinc-300">
                      {m.to}
                    </span>
                  </span>
                  <span className="shrink-0">{fmtTime(m.enviadoEm)}</span>
                </div>
                <p className="text-xs text-zinc-200 whitespace-pre-wrap break-words">
                  {m.texto || <em className="text-zinc-600">(sem texto)</em>}
                </p>
                {m.status !== "sent" && (
                  <p
                    className={
                      m.status === "failed"
                        ? "mt-1 text-[10px] text-rose-400"
                        : "mt-1 text-[10px] text-amber-400"
                    }
                  >
                    {m.status}
                    {m.erroDetalhe ? ` — ${m.erroDetalhe}` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}
