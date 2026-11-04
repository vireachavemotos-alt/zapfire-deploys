"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { PageHeader } from "@/components/PageHeader";
import { StatusDot } from "@/components/StatusDot";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useStore } from "@/lib/store";
import {
  Globe,
  Key,
  RefreshCw,
  Zap,
  Database,
  Trash2,
  AlertTriangle,
} from "lucide-react";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; version?: string; message?: string; latencyMs: number }
  | { status: "error"; error: string };

export default function ConfiguracoesPage() {
  const contatos = useStore((s) => s.contatos);
  const listas = useStore((s) => s.listas);
  const campanhas = useStore((s) => s.campanhas);
  const clearContatos = useStore((s) => s.clearContatos);

  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [confirmReset, setConfirmReset] = useState(false);

  const evoUrl = process.env.NEXT_PUBLIC_EVO_URL || "http://localhost:8080";

  async function testConnection() {
    setHealth({ status: "loading" });
    const t0 = performance.now();
    try {
      const res = await fetch("/api/instances", { cache: "no-store" });
      const latencyMs = Math.round(performance.now() - t0);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setHealth({
        status: "ok",
        latencyMs,
        message: `${Array.isArray(data) ? data.length : 0} instância(s) encontrada(s)`,
      });
    } catch (err: unknown) {
      setHealth({ status: "error", error: (err as Error).message });
    }
  }

  useEffect(() => {
    testConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleResetData() {
    try {
      await clearContatos();
      toast.success("Base e vínculos removidos do banco.");
    } catch (err) {
      toast.error(`Falha ao apagar: ${(err as Error).message}`);
    }
    setConfirmReset(false);
  }

  return (
    <>
      <PageHeader
        title="Configurações"
        subtitle="Integração com Evolution API e dados locais do navegador."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Integration */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-[#FF0033]" />
              <h2 className="text-base font-semibold">Evolution API</h2>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Todos os disparos e QR codes passam pelo container Evolution API.
              Configure via variáveis de ambiente (
              <code className="text-[#FF0033]">.env.local</code>) — nunca
              hardcode a chave no front.
            </p>

            <dl className="text-xs space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <dt className="text-zinc-500 w-24">URL</dt>
                <dd className="flex-1 font-mono text-zinc-300 truncate">
                  {evoUrl}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <dt className="text-zinc-500 w-24">API Key</dt>
                <dd className="flex-1 font-mono text-zinc-500">
                  definida no servidor (<code>EVO_API_KEY</code>)
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-md border border-white/5 bg-black/40 px-4 py-3 flex items-center justify-between gap-3">
              {health.status === "loading" && (
                <StatusDot
                  status="pending"
                  label="Testando conexão..."
                  size="sm"
                />
              )}
              {health.status === "ok" && (
                <StatusDot
                  status="on"
                  label={`Conectado · ${health.latencyMs}ms · ${health.message}`}
                  size="sm"
                />
              )}
              {health.status === "error" && (
                <StatusDot
                  status="error"
                  label={`Sem conexão: ${health.error}`}
                  size="sm"
                />
              )}
              <NeonButton
                variant="ghost"
                size="sm"
                onClick={testConnection}
                disabled={health.status === "loading"}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Testar
              </NeonButton>
            </div>

            {health.status === "error" && (
              <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Evolution API não responde.</p>
                  <p className="text-zinc-500 mt-1">
                    Rode{" "}
                    <code className="text-[#FF0033]">
                      docker compose up -d
                    </code>{" "}
                    e verifique se o container ficou{" "}
                    <code className="text-[#FF0033]">healthy</code>.
                  </p>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Dados locais */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-4 w-4 text-[#FF0033]" />
              <h2 className="text-base font-semibold">Dados locais</h2>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Base, listas e histórico de campanhas ficam salvos no banco
              SQLite local (<code>prisma/dev.db</code>). Limpar a base aqui
              apaga também os vínculos com listas, mas preserva o histórico de
              campanhas já disparadas (via snapshot da lista).
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-md border border-white/5 bg-black/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Base
                </p>
                <p className="text-xl font-semibold mt-1 tabular-nums">
                  {contatos.length}
                </p>
              </div>
              <div className="rounded-md border border-white/5 bg-black/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Listas
                </p>
                <p className="text-xl font-semibold mt-1 tabular-nums">
                  {listas.length}
                </p>
              </div>
              <div className="rounded-md border border-white/5 bg-black/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Campanhas
                </p>
                <p className="text-xl font-semibold mt-1 tabular-nums">
                  {campanhas.length}
                </p>
              </div>
            </div>

            <NeonButton
              variant="danger"
              size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={contatos.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpar base e vínculos
            </NeonButton>
          </GlassCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <GlassCard strong>
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-3">
              Sobre o ZapFire
            </h3>
            <p className="text-sm text-zinc-300">
              Plataforma de disparo em massa para WhatsApp baseada em Evolution
              API v2.
            </p>
            <p className="text-xs text-zinc-500 mt-3 leading-relaxed">
              Use rotação de números, delays aleatórios e limites por hora para
              reduzir o risco de bloqueio. Esta ferramenta não garante imunidade
              contra banimentos do WhatsApp.
            </p>
          </GlassCard>

          <GlassCard>
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold mb-3">
              Boas práticas
            </h3>
            <ul className="text-xs text-zinc-400 space-y-2">
              <li className="flex gap-2">
                <span className="text-[#FF0033]">•</span>
                <span>
                  Aqueça novos números antes de disparar em volume (envio
                  orgânico de 2 a 7 dias).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#FF0033]">•</span>
                <span>
                  Mantenha delays mínimos acima de 8s e no máx 60 msgs/hora
                  por número.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#FF0033]">•</span>
                <span>
                  Varie o copy com <code>---</code> para evitar detecção por
                  repetição.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#FF0033]">•</span>
                <span>
                  Use <code>{"{nome}"}</code> e <code>{"{empresa}"}</code> para
                  personalização mínima.
                </span>
              </li>
            </ul>
          </GlassCard>
        </div>
      </div>

      <ConfirmModal
        open={confirmReset}
        title="Apagar toda a base?"
        description={`Vai remover ${contatos.length} contato${contatos.length === 1 ? "" : "s"} e os vínculos com as ${listas.length} lista${listas.length === 1 ? "" : "s"}. Campanhas já disparadas mantêm o histórico (snapshot).\n\nEsta ação não pode ser desfeita.`}
        confirmLabel="Apagar tudo"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleResetData}
        onClose={() => setConfirmReset(false)}
      />
    </>
  );
}
