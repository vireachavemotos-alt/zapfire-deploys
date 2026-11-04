"use client";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStore, CampanhaStatus, formatPhoneBR } from "@/lib/store";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { PageHeader } from "@/components/PageHeader";
import { StatusDot } from "@/components/StatusDot";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CampaignRatingModal } from "@/components/CampaignRatingModal";
import { CampaignTabs } from "@/components/campaign-flow/CampaignTabs";
import { OrchestratorMigrateBanner } from "@/components/campaign-flow/OrchestratorMigrateBanner";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils";
import {
  ArrowLeft,
  Send,
  XCircle,
  Rocket,
  CheckCircle2,
  Smartphone,
  ListChecks,
  Trash2,
  Type,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  Sticker as StickerIcon,
  MapPin,
  Phone,
  Shuffle,
  Pause,
  Play,
  Copy,
  Users,
  Hourglass,
  RotateCcw,
  Trash,
} from "lucide-react";
import { MessageBlock, MessageKind, messageKindLabels } from "@/lib/message";
import { MessageComposer } from "@/components/MessageComposer";
import { Portal } from "@/components/Portal";
import { formatError, categoryLabel, type ErrorCategory } from "@/lib/error-format";
import {
  evaluateDrip,
  contarEnviadosHoje,
  WEEKDAY_LABEL,
  parseDiasSemana,
} from "@/lib/drip";
import {
  ChevronDown,
  ChevronRight,
  AlertCircle,
  SkipForward,
  ImageOff,
  ShieldAlert,
  Clock,
  WifiOff,
  Download,
} from "lucide-react";
import { rowsToCSV, downloadCSV, csvFilename } from "@/lib/csv";

const CATEGORY_ICON: Record<ErrorCategory, React.ComponentType<{ className?: string }>> = {
  media: ImageOff,
  not_found: SkipForward,
  auth: ShieldAlert,
  rate_limit: Clock,
  network: WifiOff,
  server: AlertCircle,
  client: AlertCircle,
  unknown: XCircle,
};

const BLOCK_ICON: Record<MessageKind, React.ComponentType<{ className?: string }>> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  audio: Mic,
  document: FileText,
  sticker: StickerIcon,
  location: MapPin,
  call: Phone,
};

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

export default function CampanhaDetalhePage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const campanha = useStore((s) =>
    s.campanhas.find((c) => c.id === params.id)
  );
  const listas = useStore((s) => s.listas);
  const contatosStore = useStore((s) => s.contatos);
  const removeCampanha = useStore((s) => s.removeCampanha);
  const pauseCampanha = useStore((s) => s.pauseCampanha);
  const resumeCampanha = useStore((s) => s.resumeCampanha);
  const reloadCampanhas = useStore((s) => s.reloadCampanhas);
  const updateCampanha = useStore((s) => s.updateCampanha);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filterCat, setFilterCat] = useState<ErrorCategory | "pulado" | null>(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  // Buffer local do form — só envia no "Salvar".
  const [cfgForm, setCfgForm] = useState({
    delayMinSec: 0,
    delayMaxSec: 0,
    delayEntreBlocosSec: 0,
    limitePorHora: 0,
  });

  const toggleExpand = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // Edit em runtime: liberado em qualquer status exceto os terminais.
  // Durante em_execucao, o runner re-lê os valores a cada contato.
  const podeEditarConfig =
    campanha?.status !== "concluida" && campanha?.status !== "erro";

  function abrirEdicao() {
    if (!campanha) return;
    setCfgForm({
      delayMinSec: Math.round(campanha.delayMin / 1000),
      delayMaxSec: Math.round(campanha.delayMax / 1000),
      delayEntreBlocosSec: Math.round((campanha.delayEntreBlocos || 0) / 1000),
      limitePorHora: campanha.limitePorHora,
    });
    setEditingConfig(true);
  }

  async function salvarConfig() {
    if (!campanha) return;
    const min = Math.max(0, Math.floor(cfgForm.delayMinSec)) * 1000;
    const max = Math.max(min, Math.floor(cfgForm.delayMaxSec)) * 1000;
    const blk = Math.max(0, Math.floor(cfgForm.delayEntreBlocosSec)) * 1000;
    const lim = Math.max(1, Math.floor(cfgForm.limitePorHora));
    setSavingConfig(true);
    try {
      await updateCampanha(campanha.id, {
        delayMin: min,
        delayMax: max,
        delayEntreBlocos: blk,
        limitePorHora: lim,
      });
      toast.success(
        campanha.status === "em_execucao"
          ? "Configuração salva. Aplica a partir do próximo envio."
          : "Configuração salva."
      );
      setEditingConfig(false);
    } catch (err) {
      toast.error(`Falha ao salvar: ${(err as Error).message}`);
    } finally {
      setSavingConfig(false);
    }
  }

  // ─── Re-enfileirar erros ────────────────────────────────────
  // Chama /api/campanhas/[id]/retry-errors. Erros "not_found" (número não tem
  // WhatsApp) são descartados; o resto volta pra fila pra ser tentado de novo.
  // Bloqueado durante em_execucao — runner reescreve resultados a cada send,
  // mexer junto causa race.
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Preview da classificação (calculado antes de chamar o endpoint pra mostrar
  // ao usuário no confirm modal o que vai acontecer). Lê direto de `campanha`
  // pra não depender da ordem de declaração de `resultados` mais abaixo.
  const retryPreview = useMemo(() => {
    let descartar = 0;
    let reenfileirar = 0;
    const porCat: Record<ErrorCategory, number> = {
      media: 0, not_found: 0, auth: 0, rate_limit: 0,
      network: 0, server: 0, client: 0, unknown: 0,
    };
    const arr = campanha?.resultados || [];
    for (const r of arr) {
      if (r.status !== "erro") continue;
      const fe = formatError(r.detail);
      porCat[fe.category] = (porCat[fe.category] || 0) + 1;
      if (fe.category === "not_found") descartar++;
      else reenfileirar++;
    }
    return { descartar, reenfileirar, porCat };
  }, [campanha?.resultados]);

  async function handleRetryErrors() {
    if (!campanha) return;
    setRetrying(true);
    try {
      const res = await fetch(
        `/api/campanhas/${campanha.id}/retry-errors`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Erro ${res.status}`);
      }
      const partes: string[] = [];
      if (data.reenfileirados > 0)
        partes.push(`${data.reenfileirados} re-enfileirado${data.reenfileirados === 1 ? "" : "s"}`);
      if (data.descartados > 0)
        partes.push(`${data.descartados} descartado${data.descartados === 1 ? "" : "s"} (sem WhatsApp)`);
      toast.success(
        partes.length > 0
          ? `Pronto: ${partes.join(" · ")}.`
          : "Nenhum erro pra re-enfileirar."
      );
      setRetryConfirmOpen(false);
      await reloadCampanhas().catch(() => {});
    } catch (err) {
      toast.error(`Falha: ${(err as Error).message}`);
    } finally {
      setRetrying(false);
    }
  }

  // ─── Editor de mensagens em runtime ──────────────────────────
  // O runner re-lê `messages` do DB a cada iteração (lib/campaign-runner
  // linha que chama JSON.parse(state.messages)). Então salvar aqui durante
  // em_execucao já reflete no PRÓXIMO contato disparado.
  // Cuidado: mudar `kind` ou tirar mídia de um bloco que está mid-send pode
  // gerar erros — por isso o composer mantém kind imutável e a gente avisa.
  const [editingMessages, setEditingMessages] = useState(false);
  const [savingMessages, setSavingMessages] = useState(false);
  const [messagesDraft, setMessagesDraft] = useState<MessageBlock[]>([]);

  function abrirEdicaoMensagens() {
    if (!campanha?.messages) return;
    // Deep clone pra editar sem afetar o cache da store por engano
    setMessagesDraft(
      JSON.parse(JSON.stringify(campanha.messages)) as MessageBlock[]
    );
    setEditingMessages(true);
  }

  async function salvarMensagens() {
    if (!campanha) return;
    // Validação básica: não deixa salvar com bloco vazio
    const algumVazio = messagesDraft.some((b) => {
      if (b.kind === "text") {
        return !b.variations.some((v) => v.trim());
      }
      return false; // mídia/location/call não validamos aqui
    });
    if (algumVazio) {
      toast.error("Algum bloco de texto está sem nenhuma variação preenchida.");
      return;
    }
    setSavingMessages(true);
    try {
      await updateCampanha(campanha.id, { messages: messagesDraft });
      toast.success(
        campanha.status === "em_execucao"
          ? "Mensagens atualizadas. Aplica a partir do próximo contato disparado."
          : "Mensagens atualizadas."
      );
      setEditingMessages(false);
    } catch (err) {
      toast.error(`Falha ao salvar: ${(err as Error).message}`);
    } finally {
      setSavingMessages(false);
    }
  }

  // Enquanto está rodando: poll mais agressivo (1.5s) pra a barra de progresso
  // andar visivelmente em tempo real. Pausada: poll mais lento (5s) — só pra
  // pegar transição quando o usuário retomar.
  const isExec = campanha?.status === "em_execucao";
  const isLive =
    campanha?.status === "em_execucao" || campanha?.status === "pausada";
  useEffect(() => {
    if (!isLive) return;
    const intervalMs = isExec ? 1500 : 5000;
    // Faz um reload imediato pra não esperar o primeiro tick
    reloadCampanhas().catch(() => {});
    const id = setInterval(() => {
      reloadCampanhas().catch(() => {});
    }, intervalMs);
    return () => clearInterval(id);
  }, [isLive, isExec, reloadCampanhas]);

  // Auto-abre modal de avaliação quando a campanha vira "concluida" e ainda
  // não tem rating. Uma vez só por campanha (rating=null → modal; rating=0
  // significa que o usuário pulou; qualquer valor >=1 significa que avaliou).
  useEffect(() => {
    if (!campanha) return;
    if (campanha.status === "concluida" && (campanha.rating == null)) {
      setRatingModalOpen(true);
    }
  }, [campanha?.status, campanha?.rating, campanha]);

  async function handlePause() {
    if (!campanha) return;
    setPauseBusy(true);
    try {
      await pauseCampanha(campanha.id);
      toast.success("Campanha pausada. Envios em andamento terminam o contato atual.");
    } catch (err) {
      toast.error(`Falha ao pausar: ${(err as Error).message}`);
    } finally {
      setPauseBusy(false);
    }
  }
  async function handleResume() {
    if (!campanha) return;
    setPauseBusy(true);
    try {
      await resumeCampanha(campanha.id);
      toast.success("Retomando envio de onde parou…");
    } catch (err) {
      toast.error(`Falha ao retomar: ${(err as Error).message}`);
    } finally {
      setPauseBusy(false);
    }
  }

  async function handleConfirmRemove() {
    if (!campanha) return;
    try {
      await removeCampanha(campanha.id);
      toast.success("Campanha removida.");
      router.push("/campanhas");
    } catch (err) {
      toast.error(`Falha ao remover: ${(err as Error).message}`);
      setConfirmOpen(false);
    }
  }

  const lista = useMemo(
    () => (campanha?.listaId ? listas.find((l) => l.id === campanha.listaId) : null),
    [campanha, listas]
  );

  // Agrupa falhas por categoria — resumo em cima da tabela. Calcula sempre
  // (mesmo quando a campanha não existe) pra manter a ordem de hooks estável.
  const erroResumo = useMemo(() => {
    const resultados = campanha?.resultados || [];
    const groups = new Map<ErrorCategory, number>();
    let pulados = 0;
    for (const r of resultados) {
      if (r.status === "pulado") {
        pulados++;
        continue;
      }
      if (r.status === "erro") {
        const cat = formatError(r.detail).category;
        groups.set(cat, (groups.get(cat) || 0) + 1);
      }
    }
    return {
      pulados,
      grupos: Array.from(groups.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [campanha?.resultados]);

  // Lista completa de contatos da campanha — junta a lista (com pendentes)
  // com os resultados (ok/erro/pulado). Usa o store de contatos pra resolver
  // nomes via contatoIds da lista. Pra campanhas com lista que foi alterada
  // após disparo, mostra apenas os contatos atuais da lista — pode divergir
  // levemente do snapshot real, mas é frontend-only e não interfere no runner.
  const contatosCampanha = useMemo(() => {
    const camp = campanha;
    if (!camp) return [];
    const listaAlvo = camp.listaId
      ? listas.find((l) => l.id === camp.listaId)
      : null;
    if (!listaAlvo) return [];
    const idIndex = new Map(contatosStore.map((c) => [c.id, c]));
    const tBlocos = camp.messages?.length ?? camp.copies?.length ?? 1;

    // Index dos resultados por número normalizado pra match O(1)
    const resByNum = new Map<
      string,
      { numero: string; status: "ok" | "erro" | "pulado"; detail?: string; timestamp?: string }
    >();
    for (const r of camp.resultados || []) {
      const norm = (r.numero || "").replace(/\D/g, "");
      if (norm)
        resByNum.set(norm, r as {
          numero: string;
          status: "ok" | "erro" | "pulado";
          detail?: string;
          timestamp?: string;
        });
    }

    // Parse "bloco N (kind):" do detail pra saber em qual bloco falhou
    const blocoMatch = /bloco\s+(\d+)\s*\(([^)]+)\)/i;

    return listaAlvo.contatoIds
      .map((cid) => {
        const ct = idIndex.get(cid);
        if (!ct) return null;
        const num = ct.telefone.replace(/\D/g, "");
        const r = resByNum.get(num);
        let blocoIdxFalha: number | null = null;
        if (r && r.status === "erro" && r.detail) {
          const m = blocoMatch.exec(r.detail);
          if (m) blocoIdxFalha = parseInt(m[1], 10);
        }
        return {
          id: ct.id,
          nome: ct.nome || "",
          telefone: ct.telefone,
          telefoneFmt: formatPhoneBR(ct.telefone),
          status: (r?.status || "pendente") as
            | "ok"
            | "erro"
            | "pulado"
            | "pendente",
          blocosEntregues:
            r?.status === "ok"
              ? tBlocos
              : r?.status === "erro" && blocoIdxFalha
                ? blocoIdxFalha - 1
                : 0,
          totalBlocos: tBlocos,
          detail: r?.detail || "",
          timestamp: r?.timestamp || "",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [campanha, listas, contatosStore]);

  // Filtro do per-contact view
  const [contatoFilter, setContatoFilter] = useState<
    "todos" | "ok" | "erro" | "pulado" | "pendente"
  >("todos");
  const [contatoSearch, setContatoSearch] = useState("");
  const contatosFiltrados = useMemo(() => {
    let arr = contatosCampanha;
    if (contatoFilter !== "todos") {
      arr = arr.filter((c) => c.status === contatoFilter);
    }
    if (contatoSearch.trim()) {
      const q = contatoSearch.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, "");
      arr = arr.filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          (qDigits && c.telefone.includes(qDigits))
      );
    }
    return arr;
  }, [contatosCampanha, contatoFilter, contatoSearch]);

  if (!campanha) {
    return (
      <>
        <Link
          href="/campanhas"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-[#FF0033] mb-3 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para campanhas
        </Link>
        <GlassCard className="py-12 text-center">
          <div className="h-10 w-10 mx-auto rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center mb-3">
            <Rocket className="h-4 w-4 text-[#FF0033]" />
          </div>
          <p className="text-sm font-semibold text-white">
            Campanha não encontrada
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Ela pode ter sido removida ou o link está inválido.
          </p>
          <Link href="/campanhas" className="inline-block mt-4">
            <NeonButton size="sm">Voltar para campanhas</NeonButton>
          </Link>
        </GlassCard>
      </>
    );
  }

  const ui = statusUi[campanha.status];
  const resultados = campanha.resultados || [];

  // Contagem real por status — fonte de verdade pra barra e métricas.
  // `enviadas/falhas` no DB às vezes ficam atrás do `resultados` em poucos
  // milissegundos durante a persistência, então conto tudo aqui pelo array.
  const cntOk = resultados.filter((r) => r.status === "ok").length;
  const cntErro = resultados.filter((r) => r.status === "erro").length;
  const cntPulado = resultados.filter((r) => r.status === "pulado").length;
  const cntProcessados = cntOk + cntErro + cntPulado;
  const cntPendentes = Math.max(0, campanha.total - cntProcessados);

  // Progresso = quantos foram processados (ok + erro + pulado) / total.
  // Antes só contava `ok` — barra ficava parada se tudo dava erro.
  const progresso =
    campanha.total > 0 ? (cntProcessados / campanha.total) * 100 : 0;
  // Taxa de sucesso só faz sentido nas tentativas reais (ok + erro), ignora
  // pulados (que não são tentativa, só skip pré-validação/blacklist).
  const taxaSucesso =
    cntOk + cntErro > 0 ? (cntOk / (cntOk + cntErro)) * 100 : 0;

  return (
    <>
      <Link
        href="/campanhas"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-[#FF0033] mb-3 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para campanhas
      </Link>

      <PageHeader
        title={campanha.nome}
        subtitle={`Criada ${formatDateBR(campanha.criadaEm)}${
          campanha.status === "agendada" && campanha.agendadoPara
            ? ` · agendada para ${formatDateTimeBR(campanha.agendadoPara)}`
            : campanha.concluidaEm
              ? ` · concluída ${formatDateBR(campanha.concluidaEm)}`
              : ""
        }`}
        actions={
          <>
            <StatusDot status={ui.dot} label={ui.label} size="sm" />
            {campanha.status === "em_execucao" && (
              <NeonButton
                variant="ghost"
                size="sm"
                onClick={handlePause}
                disabled={pauseBusy}
              >
                <Pause className="h-3.5 w-3.5" />
                {pauseBusy ? "Pausando…" : "Pausar"}
              </NeonButton>
            )}
            {campanha.status === "pausada" && (
              <NeonButton
                size="sm"
                onClick={handleResume}
                disabled={pauseBusy}
              >
                <Play className="h-3.5 w-3.5" />
                {pauseBusy ? "Retomando…" : "Retomar"}
              </NeonButton>
            )}
            <Link href={`/campanhas/nova?clone=${campanha.id}`}>
              <NeonButton variant="ghost" size="sm">
                <Copy className="h-3.5 w-3.5" /> Duplicar
              </NeonButton>
            </Link>
            <NeonButton
              variant="danger"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </NeonButton>
          </>
        }
      />

      <CampaignTabs id={campanha.id} active="overview" />

      {/* Banner "Migrar pra Orquestrador" (só pra campanhas legacy) */}
      <OrchestratorMigrateBanner
        campanhaId={campanha.id}
        engine={campanha.engine ?? "legacy"}
        status={campanha.status}
      />

      {/* Progresso */}
      <GlassCard strong className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Progresso
              </p>
              {isExec && (
                <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-emerald-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                  </span>
                  ao vivo
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-200 mt-1 tabular-nums">
              {cntProcessados} de {campanha.total} processadas
              {cntPendentes > 0 && (
                <span className="text-zinc-500"> · {cntPendentes} restam</span>
              )}
            </p>
          </div>
          <span className="text-3xl font-bold text-[#FF0033] tabular-nums">
            {progresso.toFixed(1)}%
          </span>
        </div>
        {/* Barra segmentada — verde (ok) · vermelho (erro) · âmbar (pulado) */}
        <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
          <div
            className="h-full bg-emerald-400 transition-all"
            style={{
              width: `${campanha.total > 0 ? (cntOk / campanha.total) * 100 : 0}%`,
            }}
            title={`${cntOk} enviadas`}
          />
          <div
            className="h-full bg-red-400 transition-all"
            style={{
              width: `${campanha.total > 0 ? (cntErro / campanha.total) * 100 : 0}%`,
            }}
            title={`${cntErro} erros`}
          />
          <div
            className="h-full bg-amber-400 transition-all"
            style={{
              width: `${campanha.total > 0 ? (cntPulado / campanha.total) * 100 : 0}%`,
            }}
            title={`${cntPulado} pulados`}
          />
        </div>
        {/* Legenda inline da barra */}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-emerald-300">{cntOk}</span> enviadas
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span className="text-red-300">{cntErro}</span> erros
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-amber-300">{cntPulado}</span> pulados
          </span>
          <span className="inline-flex items-center gap-1 ml-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
            <span className="text-zinc-400">{cntPendentes}</span> pendentes
          </span>
        </div>
      </GlassCard>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          {
            l: "Total",
            v: campanha.total,
            icon: ListChecks,
            color: "text-zinc-300",
          },
          {
            l: "Enviadas",
            v: campanha.enviadas,
            icon: Send,
            color: "text-emerald-400",
          },
          {
            l: "Falhas",
            v: campanha.falhas,
            icon: XCircle,
            color: "text-red-400",
          },
          {
            l: "Taxa sucesso",
            v: `${taxaSucesso.toFixed(0)}%`,
            icon: CheckCircle2,
            color: "text-[#FF0033]",
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <GlassCard key={s.l} className="py-3">
              <div className="flex items-center gap-2.5">
                <Icon className={`h-4 w-4 ${s.color}`} />
                <div>
                  <p className="text-[10px] uppercase text-zinc-500 tracking-widest">
                    {s.l}
                  </p>
                  <p className="text-lg font-semibold tabular-nums">{s.v}</p>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Config + Resultados */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <GlassCard>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-[#FF0033]" />
              Instâncias usadas
            </h3>
            {campanha.instanceNames.length === 0 ? (
              <p className="text-xs text-zinc-500">Nenhum.</p>
            ) : (
              <ul className="space-y-1.5">
                {campanha.instanceNames.map((n) => (
                  <li
                    key={n}
                    className="text-sm flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
                  >
                    <span className="truncate">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {campanha.modo === "drip" && (
            <DripStatusCard campanha={campanha} />
          )}

          <GlassCard>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[#FF0033]" />
              Lista
            </h3>
            <p className="text-sm">{lista?.nome || "—"}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {lista?.contatoIds.length ?? 0} contatos
            </p>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Configuração</h3>
              {podeEditarConfig && !editingConfig && (
                <button
                  onClick={abrirEdicao}
                  className="text-[11px] text-[#FF0033] hover:underline"
                >
                  Editar
                </button>
              )}
            </div>
            {editingConfig ? (
              <div className="space-y-2.5">
                {campanha.status === "em_execucao" && (
                  <p className="text-[11px] text-amber-300/80 bg-amber-400/5 border border-amber-400/20 rounded-md px-2 py-1.5 leading-snug">
                    Mudança aplica no próximo contato da fila.
                  </p>
                )}
                <ConfigNumberField
                  label="Delay mín (s)"
                  value={cfgForm.delayMinSec}
                  onChange={(v) => setCfgForm((f) => ({ ...f, delayMinSec: v }))}
                />
                <ConfigNumberField
                  label="Delay máx (s)"
                  value={cfgForm.delayMaxSec}
                  onChange={(v) => setCfgForm((f) => ({ ...f, delayMaxSec: v }))}
                />
                <ConfigNumberField
                  label="Entre blocos (s)"
                  value={cfgForm.delayEntreBlocosSec}
                  onChange={(v) =>
                    setCfgForm((f) => ({ ...f, delayEntreBlocosSec: v }))
                  }
                />
                <ConfigNumberField
                  label="Limite / hora"
                  value={cfgForm.limitePorHora}
                  onChange={(v) =>
                    setCfgForm((f) => ({ ...f, limitePorHora: v }))
                  }
                />
                <div className="flex gap-2 pt-1">
                  <NeonButton
                    size="sm"
                    onClick={salvarConfig}
                    disabled={savingConfig}
                  >
                    {savingConfig ? "Salvando…" : "Salvar"}
                  </NeonButton>
                  <NeonButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingConfig(false)}
                    disabled={savingConfig}
                  >
                    Cancelar
                  </NeonButton>
                </div>
              </div>
            ) : (
              <dl className="text-xs space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Delay mín</dt>
                  <dd className="text-zinc-300 tabular-nums">
                    {(campanha.delayMin / 1000).toFixed(0)}s
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Delay máx</dt>
                  <dd className="text-zinc-300 tabular-nums">
                    {(campanha.delayMax / 1000).toFixed(0)}s
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Entre blocos</dt>
                  <dd className="text-zinc-300 tabular-nums">
                    {((campanha.delayEntreBlocos || 0) / 1000).toFixed(0)}s
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Limite / hora</dt>
                  <dd className="text-zinc-300 tabular-nums">
                    {campanha.limitePorHora}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Blocos</dt>
                  <dd className="text-zinc-300 tabular-nums">
                    {campanha.messages?.length ?? campanha.copies?.length ?? 0}
                  </dd>
                </div>
              </dl>
            )}
          </GlassCard>
        </div>

        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">Resultados</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-zinc-500">
                {resultados.length} registro{resultados.length === 1 ? "" : "s"}
              </span>

              {/* Re-enfileirar erros — só aparece se tem erro */}
              {cntErro > 0 && (
                <button
                  type="button"
                  onClick={() => setRetryConfirmOpen(true)}
                  disabled={isExec}
                  title={
                    isExec
                      ? "Pause a campanha primeiro pra re-enfileirar erros"
                      : `Re-tenta os ${cntErro} contato${cntErro === 1 ? "" : "s"} com erro. Números sem WhatsApp são descartados.`
                  }
                  className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded transition-colors border ${
                    isExec
                      ? "border-white/5 bg-black/20 text-zinc-600 cursor-not-allowed"
                      : "border-amber-400/30 bg-amber-400/5 text-amber-200 hover:bg-amber-400/10"
                  }`}
                >
                  <RotateCcw className="h-3 w-3" /> Re-tentar erros ({cntErro})
                </button>
              )}

              {resultados.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const headers = [
                      "numero",
                      "status",
                      "categoria_erro",
                      "detalhe_curto",
                      "http_status",
                      "bloco_index",
                      "bloco_tipo",
                      "timestamp",
                      "detalhe_bruto",
                    ];
                    const data = resultados.map((r) => {
                      const fe =
                        r.status === "erro" ? formatError(r.detail) : null;
                      return [
                        r.numero,
                        r.status,
                        fe ? categoryLabel(fe.category) : "",
                        r.status === "erro"
                          ? fe?.short || r.detail || ""
                          : r.status === "pulado"
                            ? r.detail || ""
                            : "",
                        fe?.httpStatus ?? "",
                        fe?.blockIndex ?? "",
                        fe?.blockKind ?? "",
                        (r as { timestamp?: string }).timestamp || "",
                        r.detail || "",
                      ];
                    });
                    const csv = rowsToCSV(headers, data);
                    downloadCSV(
                      csvFilename(["resultados", campanha.nome]),
                      csv
                    );
                    toast.success(
                      `${resultados.length} resultado${resultados.length === 1 ? "" : "s"} exportado${resultados.length === 1 ? "" : "s"}.`
                    );
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300 hover:text-white border border-white/10 hover:border-white/25 bg-black/30 hover:bg-black/40 px-2 py-1 rounded transition-colors"
                  title="Exportar resultados em CSV"
                >
                  <Download className="h-3 w-3" /> CSV
                </button>
              )}
            </div>
          </div>

          {resultados.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-zinc-400">
                {campanha.status === "em_execucao"
                  ? "Disparando... aguarde."
                  : campanha.status === "pausada"
                    ? "Pausada antes do primeiro envio."
                    : campanha.status === "agendada"
                      ? "Aguardando a hora agendada."
                      : "Sem resultados registrados."}
              </p>
            </div>
          ) : (
            <>
              {/* Resumo por categoria de erro + pulados. Clique filtra a tabela. */}
              {(erroResumo.grupos.length > 0 || erroResumo.pulados > 0) && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {filterCat !== null && (
                    <button
                      onClick={() => setFilterCat(null)}
                      className="text-[11px] px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
                    >
                      Limpar filtro
                    </button>
                  )}
                  {erroResumo.pulados > 0 && (
                    <button
                      onClick={() =>
                        setFilterCat((c) => (c === "pulado" ? null : "pulado"))
                      }
                      className={`text-[11px] px-2 py-1 rounded-md border inline-flex items-center gap-1.5 transition-colors ${
                        filterCat === "pulado"
                          ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                          : "border-amber-400/20 bg-amber-400/5 text-amber-300/80 hover:bg-amber-400/10"
                      }`}
                    >
                      <SkipForward className="h-3 w-3" />
                      {erroResumo.pulados} pulado{erroResumo.pulados === 1 ? "" : "s"}
                    </button>
                  )}
                  {erroResumo.grupos.map(([cat, count]) => {
                    const Icon = CATEGORY_ICON[cat];
                    const active = filterCat === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() =>
                          setFilterCat((c) => (c === cat ? null : cat))
                        }
                        className={`text-[11px] px-2 py-1 rounded-md border inline-flex items-center gap-1.5 transition-colors ${
                          active
                            ? "border-red-400/60 bg-red-400/15 text-red-300"
                            : "border-red-400/20 bg-red-400/5 text-red-300/80 hover:bg-red-400/10"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {count} {categoryLabel(cat).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="rounded-md border border-white/5 max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0a0a0a] border-b border-white/5 z-10">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                      <th className="py-2 px-3 font-medium w-6"></th>
                      <th className="py-2 px-3 font-medium">Número</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {resultados.map((r, i) => {
                      const fe = r.status === "erro" ? formatError(r.detail) : null;
                      // Aplica filtro por categoria / "pulado"
                      if (filterCat !== null) {
                        if (filterCat === "pulado" && r.status !== "pulado") return null;
                        if (filterCat !== "pulado" && (r.status !== "erro" || fe?.category !== filterCat)) return null;
                      }
                      const isExpanded = expanded.has(i);
                      const canExpand = r.status === "erro" && !!r.detail;
                      const Icon = fe ? CATEGORY_ICON[fe.category] : null;
                      return (
                        <React.Fragment key={i}>
                          <tr
                            className={`hover:bg-white/[0.02] ${canExpand ? "cursor-pointer" : ""}`}
                            onClick={() => canExpand && toggleExpand(i)}
                          >
                            <td className="py-2 px-3 text-zinc-500">
                              {canExpand ? (
                                isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )
                              ) : null}
                            </td>
                            <td className="py-2 px-3 tabular-nums text-zinc-300">
                              {r.numero}
                            </td>
                            <td className="py-2 px-3">
                              {r.status === "ok" ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs whitespace-nowrap">
                                  <CheckCircle2 className="h-3 w-3" /> Enviada
                                </span>
                              ) : r.status === "pulado" ? (
                                <span className="inline-flex items-center gap-1 text-amber-400 text-xs whitespace-nowrap">
                                  <SkipForward className="h-3 w-3" /> Pulado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-400 text-xs whitespace-nowrap">
                                  {Icon ? <Icon className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{" "}
                                  {fe ? categoryLabel(fe.category) : "Falha"}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-xs text-zinc-400">
                              <div className="truncate max-w-[360px]">
                                {r.status === "erro"
                                  ? fe?.short || r.detail || "—"
                                  : r.status === "pulado"
                                    ? r.detail || "—"
                                    : "—"}
                              </div>
                            </td>
                          </tr>
                          {canExpand && isExpanded && (
                            <tr className="bg-black/30">
                              <td colSpan={4} className="py-2 px-3">
                                <div className="text-[11px] text-zinc-400 space-y-1">
                                  {fe?.blockIndex !== undefined && (
                                    <div>
                                      <span className="text-zinc-500">Bloco:</span>{" "}
                                      <span className="tabular-nums">
                                        {fe.blockIndex}
                                      </span>{" "}
                                      {fe.blockKind && (
                                        <span className="text-zinc-500">
                                          ({fe.blockKind})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {fe?.httpStatus && (
                                    <div>
                                      <span className="text-zinc-500">HTTP:</span>{" "}
                                      <span className="tabular-nums">
                                        {fe.httpStatus}
                                      </span>
                                    </div>
                                  )}
                                  <pre className="mt-1.5 whitespace-pre-wrap break-all font-mono text-[10.5px] text-zinc-500 bg-black/40 border border-white/5 rounded p-2 max-h-48 overflow-y-auto">
                                    {r.detail}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </GlassCard>
      </div>

      {/* Contatos da campanha — visão completa, com pendentes */}
      {contatosCampanha.length > 0 && (
        <GlassCard className="mt-6">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-[#FF0033]" />
                Base da campanha
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {contatosFiltrados.length} de {contatosCampanha.length} contato
                {contatosCampanha.length === 1 ? "" : "s"}
                {contatoFilter !== "todos" && (
                  <button
                    onClick={() => setContatoFilter("todos")}
                    className="ml-2 text-[#FF0033] hover:underline"
                  >
                    limpar filtro
                  </button>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Buscar nome / telefone…"
                value={contatoSearch}
                onChange={(e) => setContatoSearch(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 focus:border-[#FF0033]/60 focus:outline-none w-56"
              />
            </div>
          </div>

          {/* Filtros por status */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(
              [
                { id: "todos", label: "Todos", count: contatosCampanha.length, color: "zinc" },
                {
                  id: "ok",
                  label: "Enviados",
                  count: contatosCampanha.filter((c) => c.status === "ok").length,
                  color: "emerald",
                },
                {
                  id: "erro",
                  label: "Erros",
                  count: contatosCampanha.filter((c) => c.status === "erro").length,
                  color: "red",
                },
                {
                  id: "pulado",
                  label: "Pulados",
                  count: contatosCampanha.filter((c) => c.status === "pulado").length,
                  color: "amber",
                },
                {
                  id: "pendente",
                  label: "Pendentes",
                  count: contatosCampanha.filter((c) => c.status === "pendente").length,
                  color: "zinc",
                },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setContatoFilter(f.id)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
                  contatoFilter === f.id
                    ? f.color === "emerald"
                      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-300"
                      : f.color === "red"
                        ? "border-red-400/60 bg-red-400/15 text-red-300"
                        : f.color === "amber"
                          ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                          : "border-[#FF0033] bg-[#FF0033]/10 text-[#FF0033]"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {f.label}
                <span className="tabular-nums opacity-70">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Lista virtualizada-friendly: max-h + overflow */}
          <div className="rounded-md border border-white/5 max-h-[520px] overflow-y-auto">
            {contatosFiltrados.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">
                Nenhum contato com este filtro.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {contatosFiltrados.map((c) => (
                  <ContatoStatusRow key={c.id} c={c} />
                ))}
              </ul>
            )}
          </div>
        </GlassCard>
      )}

      {/* Blocos da campanha */}
      <GlassCard className="mt-6">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold">Mensagens utilizadas</h3>
          {podeEditarConfig && campanha.messages && campanha.messages.length > 0 && (
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={abrirEdicaoMensagens}
              title={
                isExec
                  ? "Editar copy ao vivo. Aplica a partir do próximo contato disparado."
                  : "Editar copy / variações"
              }
            >
              <Type className="h-3.5 w-3.5" /> Editar copy
              {isExec && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-emerald-300">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  ao vivo
                </span>
              )}
            </NeonButton>
          )}
        </div>
        {campanha.messages && campanha.messages.length > 0 ? (
          <div className="space-y-2">
            {campanha.messages.map((b, i) => (
              <MessageBlockPreview key={b.id} index={i} block={b} />
            ))}
          </div>
        ) : campanha.copies && campanha.copies.length > 0 ? (
          <div className="space-y-2">
            {campanha.copies.map((c, i) => (
              <div
                key={i}
                className="rounded-md border border-white/5 bg-black/40 p-3 text-xs text-zinc-300 whitespace-pre-wrap font-mono"
              >
                {c}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Sem mensagens registradas.</p>
        )}
      </GlassCard>

      {/* Modal: editor de copy em runtime */}
      {editingMessages && (
        <Portal>
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={savingMessages ? undefined : () => setEditingMessages(false)}
          >
            <GlassCard
              strong
              className="w-full max-w-3xl my-8 relative p-6 animate-pop"
              onClick={(e) => e.stopPropagation()}
            >
              {!savingMessages && (
                <button
                  onClick={() => setEditingMessages(false)}
                  className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}

              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-8 w-8 rounded-md bg-gradient-to-br from-[#FF0033]/20 to-[#FF0033]/5 border border-[#FF0033]/30 flex items-center justify-center">
                  <Type className="h-4 w-4 text-[#FF3355]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    Editar mensagens
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {isExec ? (
                      <>
                        Campanha rodando AGORA — mudanças aplicam no{" "}
                        <b className="text-emerald-300">próximo contato</b>{" "}
                        disparado. Contatos já processados não são afetados.
                      </>
                    ) : campanha.status === "pausada" ? (
                      <>
                        Campanha pausada — mudanças entram em vigor quando você retomar.
                      </>
                    ) : (
                      "Edite as variações, copy e mídias da campanha."
                    )}
                  </p>
                </div>
              </div>

              {isExec && (
                <div className="mb-3 rounded-md border border-amber-400/30 bg-amber-400/5 p-2.5 text-[11px] text-amber-200">
                  <b>Cuidado:</b> não recomendado alterar o <i>tipo</i> dos blocos
                  (texto/imagem/etc) ou remover blocos durante execução — isso pode
                  bater erro no contato em andamento. Pra isso, prefira pausar
                  primeiro.
                </div>
              )}

              <div className="neon-divider mb-4" />

              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <MessageComposer
                  value={messagesDraft}
                  onChange={setMessagesDraft}
                />
              </div>

              <div className="flex items-center gap-2 pt-4 mt-4 border-t border-white/5">
                <NeonButton
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditingMessages(false)}
                  disabled={savingMessages}
                >
                  Cancelar
                </NeonButton>
                <NeonButton
                  size="sm"
                  className="flex-1"
                  onClick={salvarMensagens}
                  disabled={savingMessages || messagesDraft.length === 0}
                >
                  {savingMessages ? "Salvando…" : "Salvar mensagens"}
                </NeonButton>
              </div>
            </GlassCard>
          </div>
        </Portal>
      )}

      {/* Modal: re-enfileirar erros com preview da classificação */}
      {retryConfirmOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={retrying ? undefined : () => setRetryConfirmOpen(false)}
          >
            <GlassCard
              strong
              className="w-full max-w-lg relative p-6 animate-pop"
              onClick={(e) => e.stopPropagation()}
            >
              {!retrying && (
                <button
                  onClick={() => setRetryConfirmOpen(false)}
                  className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}

              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-8 w-8 rounded-md bg-gradient-to-br from-amber-400/20 to-amber-400/5 border border-amber-400/30 flex items-center justify-center">
                  <RotateCcw className="h-4 w-4 text-amber-300" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Re-enfileirar erros
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Vou classificar os {cntErro} erro{cntErro === 1 ? "" : "s"} e decidir o que fazer com cada tipo.
                  </p>
                </div>
              </div>

              <div className="neon-divider mb-4" />

              {/* Resumo: quantos vão pra fila vs descartados */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-md border border-emerald-400/30 bg-emerald-400/5 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-emerald-300 mb-1 flex items-center gap-1.5">
                    <RotateCcw className="h-3 w-3" />
                    Vão pra fila de novo
                  </p>
                  <p className="text-2xl font-bold text-emerald-300 tabular-nums leading-none">
                    {retryPreview.reenfileirar}
                  </p>
                  <p className="text-[10px] text-emerald-200/70 mt-1">
                    Erros transitórios (rede, servidor, mídia, auth…) que podem ter sido resolvidos.
                  </p>
                </div>
                <div className="rounded-md border border-red-400/30 bg-red-400/5 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-red-300 mb-1 flex items-center gap-1.5">
                    <Trash className="h-3 w-3" />
                    Descartados
                  </p>
                  <p className="text-2xl font-bold text-red-300 tabular-nums leading-none">
                    {retryPreview.descartar}
                  </p>
                  <p className="text-[10px] text-red-200/70 mt-1">
                    Números sem WhatsApp. Vão ser marcados como inválidos pra futuras campanhas pularem.
                  </p>
                </div>
              </div>

              {/* Detalhamento por categoria */}
              {Object.entries(retryPreview.porCat).filter(([, n]) => n > 0).length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
                    Quebra por categoria
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(retryPreview.porCat)
                      .filter(([, n]) => n > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, n]) => {
                        const isDescarte = cat === "not_found";
                        return (
                          <span
                            key={cat}
                            className={`text-[11px] px-2 py-1 rounded-md border inline-flex items-center gap-1.5 ${
                              isDescarte
                                ? "border-red-400/30 bg-red-400/5 text-red-300"
                                : "border-white/10 bg-white/5 text-zinc-300"
                            }`}
                          >
                            {categoryLabel(cat as ErrorCategory)}
                            <span className="tabular-nums opacity-70">{n}</span>
                            {isDescarte && (
                              <span className="text-[9px] uppercase opacity-70">descarte</span>
                            )}
                          </span>
                        );
                      })}
                  </div>
                </div>
              )}

              {retryPreview.reenfileirar > 0 && (
                <p className="text-[11px] text-zinc-400 mb-1 leading-relaxed">
                  Os <b className="text-white">{retryPreview.reenfileirar}</b> re-enfileirados saem do array de resultados — quando você retomar a campanha, o runner vai disparar de novo pra esses números.
                </p>
              )}

              <div className="flex items-center gap-2 pt-4 mt-2 border-t border-white/5">
                <NeonButton
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => setRetryConfirmOpen(false)}
                  disabled={retrying}
                >
                  Cancelar
                </NeonButton>
                <NeonButton
                  size="sm"
                  className="flex-1"
                  onClick={handleRetryErrors}
                  disabled={retrying || cntErro === 0}
                >
                  {retrying ? "Processando…" : "Confirmar"}
                </NeonButton>
              </div>
            </GlassCard>
          </div>
        </Portal>
      )}

      {ratingModalOpen && campanha && (
        <CampaignRatingModal
          campanhaId={campanha.id}
          campanhaNome={campanha.nome}
          onClose={() => setRatingModalOpen(false)}
          onSaved={() => {
            setRatingModalOpen(false);
            reloadCampanhas().catch(() => {});
          }}
        />
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Remover campanha?"
        description={`"${campanha.nome}" · ${campanha.enviadas} enviada${campanha.enviadas === 1 ? "" : "s"} · ${campanha.falhas} falha${campanha.falhas === 1 ? "" : "s"}.\n\nO histórico de resultados será perdido.`}
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmRemove}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}

// ─── Helpers visuais do preview de mensagens ─────────────────

/** Letras pra rotular variações (A, B, C…). Limita em 26 — improvável passar disso. */
const VARIATION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Renderiza texto com placeholders `{nome}`, `{empresa}` em destaque.
 * Quem lê a copy vê na hora quais variáveis são interpoladas no envio.
 */
function HighlightVariables({ text }: { text: string }) {
  // Split mantendo os tokens — `(...)` no regex preserva o match na saída
  const parts = text.split(/(\{\w+\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\w+\}$/.test(p) ? (
          <span
            key={i}
            className="inline-flex items-baseline px-1 mx-px rounded bg-[#FF0033]/15 border border-[#FF0033]/30 text-[#FF6680] font-medium not-italic"
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/** Card individual de uma variação. Header com letra/contadores + corpo com texto. */
function VariationCard({
  letra,
  total,
  text,
  isCaption,
}: {
  letra: string;
  total: number;
  text: string;
  isCaption?: boolean;
}) {
  const chars = text.length;
  const linhas = text.split("\n").length;
  const pct = Math.round(100 / total);
  return (
    <div className="rounded-md border border-white/10 bg-black/40 overflow-hidden hover:border-white/20 transition-colors">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white/[0.025] border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-[#FF0033]/15 border border-[#FF0033]/30 text-[10px] font-bold text-[#FF6680] tabular-nums">
            {letra}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-400">
            {isCaption ? "Legenda" : "Variação"} {letra}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 tabular-nums shrink-0">
          <span title="Caracteres">{chars} chars</span>
          {linhas > 1 && (
            <>
              <span className="opacity-50">·</span>
              <span title="Linhas">{linhas} linhas</span>
            </>
          )}
          {total > 1 && (
            <>
              <span className="opacity-50">·</span>
              <span
                className="text-[#FF6680]"
                title="Probabilidade desta variação ser usada por contato"
              >
                {pct}%
              </span>
            </>
          )}
        </div>
      </div>
      <div className="px-3 py-2.5 text-[13px] text-zinc-100 whitespace-pre-wrap leading-relaxed">
        <HighlightVariables text={text} />
      </div>
    </div>
  );
}

function MessageBlockPreview({
  index,
  block,
}: {
  index: number;
  block: MessageBlock;
}) {
  const Icon = BLOCK_ICON[block.kind];
  const isImage = block.kind === "image" || block.kind === "sticker";
  const isVideo = block.kind === "video";
  const isMedia =
    block.kind === "image" ||
    block.kind === "video" ||
    block.kind === "audio" ||
    block.kind === "document" ||
    block.kind === "sticker";
  const isMediaCaptionContext =
    block.kind === "image" ||
    block.kind === "video" ||
    block.kind === "document";

  // Variações não vazias — só mostra as preenchidas. Mantém o índice
  // original pra letra A/B/C bater com a posição real.
  const variacoesPreenchidas = block.variations
    .map((v, i) => ({ text: v, originalIndex: i }))
    .filter((x) => x.text.trim().length > 0);
  const totalReal = variacoesPreenchidas.length;

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-b from-black/50 to-black/30 overflow-hidden">
      {/* ── Cabeçalho da mensagem ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-white/[0.015]">
        <div className="h-9 w-9 rounded-md bg-gradient-to-br from-[#FF0033]/40 to-[#FF0033]/5 border border-[#FF0033]/40 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-bold tabular-nums text-white">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-[#FF0033]" />
            Mensagem {index + 1}
            <span className="text-zinc-500 font-normal">·</span>
            <span className="text-zinc-300 font-normal">
              {messageKindLabels[block.kind]}
            </span>
          </p>
          {totalReal > 1 ? (
            <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
              <Shuffle className="h-3 w-3 text-[#FF0033]/70" />
              {totalReal} variações · uma é sorteada aleatoriamente por contato
            </p>
          ) : isMediaCaptionContext && totalReal === 0 ? (
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Sem legenda — a mídia vai sem texto.
            </p>
          ) : null}
        </div>
        {totalReal > 1 && (
          <span className="text-[10px] uppercase tracking-widest text-[#FF6680] bg-[#FF0033]/10 border border-[#FF0033]/30 px-2 py-1 rounded-md inline-flex items-center gap-1.5 shrink-0">
            A/B
            {totalReal > 2 && "/…"}
          </span>
        )}
      </div>

      {/* ── Corpo: mídia (se houver) ── */}
      {isMedia && (block.mediaUrl || block.mediaFileName) && (
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            Mídia anexada
          </p>
          {isImage && block.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.mediaUrl}
              alt=""
              className="max-h-44 rounded-md border border-white/10 object-contain"
            />
          ) : isVideo && block.mediaUrl ? (
            <div className="rounded-md border border-white/10 bg-black/60 p-3 flex items-center gap-3 max-w-md">
              <div className="h-10 w-10 rounded bg-[#FF0033]/10 border border-[#FF0033]/30 flex items-center justify-center shrink-0">
                <Play className="h-4 w-4 text-[#FF0033]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-200 truncate">
                  {block.mediaFileName || "video"}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {block.mediaMimetype || "video/*"}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-white/10 bg-black/60 p-3 flex items-center gap-3 max-w-md">
              <div className="h-10 w-10 rounded bg-zinc-700/40 border border-white/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-zinc-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-200 truncate">
                  {block.mediaFileName || "anexo"}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {block.mediaMimetype || "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Corpo: variações de texto / legenda ── */}
      {totalReal > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
            {isMediaCaptionContext ? "Legendas" : "Copy"}
            <span className="text-zinc-600">({totalReal})</span>
          </p>
          <div className="space-y-2">
            {variacoesPreenchidas.map((v) => (
              <VariationCard
                key={v.originalIndex}
                letra={
                  VARIATION_LETTERS[v.originalIndex] ||
                  String(v.originalIndex + 1)
                }
                total={totalReal}
                text={v.text}
                isCaption={isMediaCaptionContext}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Detalhes específicos: location / call ── */}
      {block.kind === "location" && (
        <div className="px-4 py-3 border-t border-white/5 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">
              Coordenadas
            </p>
            <p className="text-zinc-200 font-mono tabular-nums">
              {block.latitude}, {block.longitude}
            </p>
          </div>
          {(block.locationName || block.locationAddress) && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">
                Local
              </p>
              {block.locationName && (
                <p className="text-zinc-200">{block.locationName}</p>
              )}
              {block.locationAddress && (
                <p className="text-zinc-400 text-[11px]">
                  {block.locationAddress}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {block.kind === "call" && (
        <div className="px-4 py-3 border-t border-white/5 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-[#FF0033]" />
            <span className="text-zinc-200">
              Chamada {block.callIsVideo ? "de vídeo" : "de voz"}
            </span>
          </div>
          <span className="text-zinc-500">·</span>
          <div>
            <span className="text-zinc-500">Duração: </span>
            <span className="text-zinc-200 tabular-nums">
              {block.callDurationSeconds}s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigNumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
        {label}
      </span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 tabular-nums focus:border-[#FF0033]/60 focus:outline-none transition-colors"
      />
    </label>
  );
}

// ───────────────────── DripStatusCard ─────────────────────
// Mostra config drip + onde está agora (próxima janela / cota usada hoje).
function DripStatusCard({
  campanha,
}: {
  campanha: {
    status: string;
    total: number;
    enviadas: number;
    falhas: number;
    dripLotePorDia?: number;
    dripDiasSemana?: string;
    dripHoraInicio?: string;
    dripHoraFim?: string;
    dripUltimaDataExecutada?: string;
    resultados?: Array<{ status: string; timestamp?: string }>;
  };
}) {
  const lote = campanha.dripLotePorDia || 0;
  const dias = campanha.dripDiasSemana || "";
  const hi = campanha.dripHoraInicio || "09:00";
  const hf = campanha.dripHoraFim || "18:00";
  const enviadosHoje = contarEnviadosHoje(campanha.resultados || []);
  const ds = evaluateDrip({
    lotePorDia: lote,
    diasSemana: dias,
    horaInicio: hi,
    horaFim: hf,
    ultimaDataExecutada: campanha.dripUltimaDataExecutada || "",
  });
  const restantesNaCampanha = Math.max(
    0,
    campanha.total - campanha.enviadas - campanha.falhas
  );
  const diasAtivos = parseDiasSemana(dias);
  const diasAtivosLista = Array.from(diasAtivos)
    .sort((a, b) => a - b)
    .map((n) => WEEKDAY_LABEL[n].curto);
  const diasParaTerminar =
    lote > 0 && diasAtivos.size > 0
      ? Math.ceil(restantesNaCampanha / lote)
      : 0;

  function fmtMin(min: number): string {
    if (!isFinite(min)) return "—";
    if (min < 60) return `${Math.max(0, Math.round(min))} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h < 24) return m === 0 ? `${h}h` : `${h}h${m}m`;
    const d = Math.floor(h / 24);
    const hRest = h - d * 24;
    return hRest === 0 ? `${d}d` : `${d}d ${hRest}h`;
  }

  const podeRodarAgora = ds.diaAtivo && ds.dentroJanela && !ds.jaRodouHoje;
  const corStatus = podeRodarAgora
    ? "text-emerald-300"
    : ds.diaAtivo && ds.dentroJanela
      ? "text-amber-300"
      : "text-zinc-400";

  return (
    <GlassCard>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-[#FF0033]" />
        Programação (drip)
      </h3>

      <dl className="text-xs space-y-1.5">
        <div className="flex justify-between">
          <dt className="text-zinc-500">Lote / dia</dt>
          <dd className="text-zinc-300 tabular-nums">{lote}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">Janela</dt>
          <dd className="text-zinc-300 tabular-nums">
            {hi} – {hf}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500 shrink-0">Dias ativos</dt>
          <dd className="text-zinc-300 text-right">
            {diasAtivosLista.length === 7
              ? "Todos"
              : diasAtivosLista.join(" · ")}
          </dd>
        </div>
      </dl>

      <div className="my-3 border-t border-white/5" />

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
            <span>Hoje</span>
            <span className="tabular-nums">
              {enviadosHoje}/{lote || "?"}
            </span>
          </div>
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full transition-all ${
                lote > 0 && enviadosHoje >= lote ? "bg-amber-400" : "bg-[#FF0033]"
              }`}
              style={{
                width: `${Math.min(100, lote > 0 ? (enviadosHoje / lote) * 100 : 0)}%`,
              }}
            />
          </div>
        </div>

        <p className={`text-[11px] ${corStatus}`}>
          {campanha.status === "em_execucao"
            ? "Disparando agora…"
            : podeRodarAgora
              ? "Pronto pro próximo lote — scheduler vai retomar em breve."
              : ds.jaRodouHoje && ds.diaAtivo
                ? `Lote de hoje completo. Próxima janela em ${fmtMin(ds.proximaJanelaEmMin)}.`
                : !ds.diaAtivo
                  ? `Hoje não é dia ativo. Próxima janela em ${fmtMin(ds.proximaJanelaEmMin)}.`
                  : ds.dentroJanela
                    ? "Aguardando…"
                    : `Fora da janela horária. Próxima abre em ${fmtMin(ds.proximaJanelaEmMin)}.`}
        </p>

        {restantesNaCampanha > 0 && lote > 0 && (
          <p className="text-[10px] text-zinc-500">
            {restantesNaCampanha} contato{restantesNaCampanha === 1 ? "" : "s"}{" "}
            restante{restantesNaCampanha === 1 ? "" : "s"} · termina em ~
            {diasParaTerminar} dia{diasParaTerminar === 1 ? "" : "s"} ativo
            {diasParaTerminar === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </GlassCard>
  );
}

// ───────────────────── ContatoStatusRow ─────────────────────
// Linha individual do per-contact view. Pure visual.
function ContatoStatusRow({
  c,
}: {
  c: {
    id: string;
    nome: string;
    telefone: string;
    telefoneFmt: string;
    status: "ok" | "erro" | "pulado" | "pendente";
    blocosEntregues: number;
    totalBlocos: number;
    detail: string;
    timestamp: string;
  };
}) {
  // Cor + ícone por status
  const cfg =
    c.status === "ok"
      ? {
          icon: CheckCircle2,
          color: "text-emerald-300",
          bg: "bg-emerald-400/5",
          border: "border-l-emerald-400/40",
          label: "Enviada",
        }
      : c.status === "erro"
        ? {
            icon: XCircle,
            color: "text-red-300",
            bg: "bg-red-400/5",
            border: "border-l-red-400/40",
            label: "Erro",
          }
        : c.status === "pulado"
          ? {
              icon: SkipForward,
              color: "text-amber-300",
              bg: "bg-amber-400/5",
              border: "border-l-amber-400/40",
              label: "Pulado",
            }
          : {
              icon: Hourglass,
              color: "text-zinc-500",
              bg: "",
              border: "border-l-zinc-700/50",
              label: "Pendente",
            };
  const Icon = cfg.icon;

  // Mini timeline dos blocos: bolinhas verde/vermelho/cinza
  const bolinhas = Array.from({ length: c.totalBlocos }, (_, i) => {
    const num = i + 1;
    if (num <= c.blocosEntregues) return "ok";
    if (
      c.status === "erro" &&
      c.blocosEntregues + 1 === num // bloco que falhou
    )
      return "erro";
    return "pendente";
  });

  // Timestamp no formato HH:MM:SS local
  const tsLabel = c.timestamp
    ? new Date(c.timestamp).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  return (
    <li
      className={`px-3 py-2 hover:bg-white/[0.02] border-l-2 ${cfg.border} ${cfg.bg}`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-200 truncate">
              {c.nome || (
                <span className="text-zinc-500 italic">sem nome</span>
              )}
            </span>
            <span className="text-[11px] text-zinc-500 tabular-nums">
              {c.telefoneFmt}
            </span>
          </div>
          {c.status === "erro" && c.detail && (
            <p className="text-[11px] text-red-300/80 mt-0.5 truncate">
              {formatError(c.detail).short}
            </p>
          )}
          {c.status === "pulado" && c.detail && (
            <p className="text-[11px] text-amber-300/80 mt-0.5 truncate">
              {c.detail}
            </p>
          )}
        </div>

        {/* Indicador de blocos: bolinhas + label X/N */}
        {c.totalBlocos > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex gap-0.5">
              {bolinhas.map((b, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    b === "ok"
                      ? "bg-emerald-400"
                      : b === "erro"
                        ? "bg-red-400"
                        : "bg-zinc-700"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-zinc-500 tabular-nums w-7 text-right">
              {c.blocosEntregues}/{c.totalBlocos}
            </span>
          </div>
        )}

        {tsLabel && (
          <span className="text-[10px] text-zinc-500 tabular-nums shrink-0 hidden sm:inline">
            {tsLabel}
          </span>
        )}
      </div>
    </li>
  );
}

