"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";
import { PageHeader } from "@/components/PageHeader";
import { StatusDot } from "@/components/StatusDot";
import { MessageComposer } from "@/components/MessageComposer";
import { FlowEditor } from "@/components/campaign-flow/FlowEditor";
import { useStore } from "@/lib/store";
import {
  MessageBlock,
  isBlockValid,
  newBlock,
} from "@/lib/message";
import { Smartphone, ListChecks, MessageSquare, Rocket, Clock, Sparkles, FileStack, Save, X, Search } from "lucide-react";
import { toast } from "sonner";

interface EvoInstance {
  id?: string;
  name?: string;
  connectionStatus?: string;
}

interface InstanceScore {
  instanceName: string;
  score: number;
  tier: "novo" | "aquecendo" | "estavel" | "veterano" | "degradado";
  idadeDias: number;
  capacidadeHoje: number;
  restanteHoje: number;
  enviadasHoje: number;
  delaySugerido: { min: number; max: number };
}

interface TemplateSummary {
  id: string;
  nome: string;
  descricao: string | null;
  blocks: MessageBlock[];
  criadoEm: string;
  atualizadoEm: string;
}

export default function NovaCampanhaPage() {
  const router = useRouter();
  const params = useSearchParams();
  const preListaId = params.get("lista");
  const cloneId = params.get("clone");

  const listas = useStore((s) => s.listas);
  const contatos = useStore((s) => s.contatos);
  const campanhas = useStore((s) => s.campanhas);
  const addCampanha = useStore((s) => s.addCampanha);
  const updateCampanha = useStore((s) => s.updateCampanha);

  // Source campanha pra clonar (resolvida do query string).
  // Deep-cloning blocks evita o caso do user editar mensagens aqui e
  // mexer sem querer no objeto da campanha original em memória.
  const cloneSource = cloneId
    ? campanhas.find((c) => c.id === cloneId)
    : null;

  const [instances, setInstances] = useState<EvoInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [scores, setScores] = useState<Record<string, InstanceScore>>({});

  // form state — quando há cloneSource, os defaults vêm dele (mas ainda
  // podem ser editados pelo user antes de disparar).
  const [step, setStep] = useState(0);
  const [nome, setNome] = useState(
    cloneSource ? `${cloneSource.nome} (cópia)` : ""
  );
  const [selectedInstances, setSelectedInstances] = useState<string[]>(
    cloneSource?.instanceNames ?? []
  );
  const [listaId, setListaId] = useState<string>(
    preListaId || cloneSource?.listaId || ""
  );
  const [messages, setMessages] = useState<MessageBlock[]>(() => {
    if (cloneSource && cloneSource.messages?.length > 0) {
      // deep clone via JSON; blocks só carregam strings/números/buffers já
      // serializáveis (texto, dataURL, etc), então isso é seguro.
      return JSON.parse(JSON.stringify(cloneSource.messages));
    }
    return [newBlock("text")];
  });
  // Preview do editor avançado — ainda cosmético: salva do mesmo jeito que
  // o composer tradicional. A implementação real vem na fase 2 do orquestrador.
  const [modoAvancado, setModoAvancado] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("zapfire_modo_avancado");
      if (saved === "1") setModoAvancado(true);
    } catch {}
  }, []);
  function toggleModoAvancado(next: boolean) {
    setModoAvancado(next);
    try {
      window.localStorage.setItem("zapfire_modo_avancado", next ? "1" : "0");
    } catch {}
  }
  // Os delays em Campanha são em ms; o form aqui usa segundos.
  const [delayMin, setDelayMin] = useState(
    cloneSource ? Math.round(cloneSource.delayMin / 1000) : 8
  );
  const [delayMax, setDelayMax] = useState(
    cloneSource ? Math.round(cloneSource.delayMax / 1000) : 20
  );
  const [delayEntreBlocos, setDelayEntreBlocos] = useState(
    cloneSource ? Math.round((cloneSource.delayEntreBlocos || 2000) / 1000) : 2
  );
  const [limitePorHora, setLimitePorHora] = useState(
    cloneSource?.limitePorHora ?? 60
  );
  const [modoEnvio, setModoEnvio] = useState<"agora" | "agendar">("agora");
  const [agendadoPara, setAgendadoPara] = useState(""); // formato datetime-local

  // Drip / programado: dispara N por dia em janela horária.
  const [modoDisparo, setModoDisparo] = useState<"imediato" | "drip">(
    cloneSource?.modo === "drip" ? "drip" : "imediato"
  );
  const [dripLotePorDia, setDripLotePorDia] = useState(
    cloneSource?.dripLotePorDia || 20
  );
  const [dripDiasSemana, setDripDiasSemana] = useState<string>(
    cloneSource?.dripDiasSemana || "1,2,3,4,5"
  );
  const [dripHoraInicio, setDripHoraInicio] = useState(
    cloneSource?.dripHoraInicio || "09:00"
  );
  const [dripHoraFim, setDripHoraFim] = useState(
    cloneSource?.dripHoraFim || "18:00"
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Template save/load — os botões aparecem em cima do composer (step 3).
  // "Carregar" substitui os blocos atuais (com confirmação se já tem conteúdo).
  // "Salvar como template" pede um nome e grava no banco.
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/instances");
        const d = await r.json();
        setInstances(Array.isArray(d) ? d : []);
      } catch {
        setInstances([]);
      } finally {
        setLoadingInstances(false);
      }
    })();
  }, []);

  // Puxa o score das instâncias selecionadas — usado pra sugerir cadência.
  useEffect(() => {
    if (selectedInstances.length === 0) {
      setScores({});
      return;
    }
    (async () => {
      try {
        const url = `/api/numero-scores?names=${encodeURIComponent(selectedInstances.join(","))}`;
        const r = await fetch(url);
        if (!r.ok) return;
        const d = await r.json();
        setScores(d.scores || {});
      } catch {
        /* score é só sugestão; silenciar */
      }
    })();
  }, [selectedInstances]);

  // Agregação conservadora: delay mín/máx do chip mais frágil (maior sugestão),
  // limite/hora = soma do restante de hoje dividido por uma janela razoável.
  // A ideia é que a sugestão nunca queime o chip novo, mesmo tendo um veterano
  // junto — quem define o ritmo é o mais fraco.
  const sugestao = (() => {
    const lista = selectedInstances.map((n) => scores[n]).filter(Boolean) as InstanceScore[];
    if (lista.length === 0) return null;
    let minSug = 0, maxSug = 0;
    for (const s of lista) {
      if (s.delaySugerido.min > minSug) minSug = s.delaySugerido.min;
      if (s.delaySugerido.max > maxSug) maxSug = s.delaySugerido.max;
    }
    // Capacidade/hora ≈ total restante hoje ÷ 8h (janela comum de trabalho).
    const totalRestante = lista.reduce((a, s) => a + s.restanteHoje, 0);
    const porHora = Math.max(5, Math.round(totalRestante / 8));
    const temDegradado = lista.some((s) => s.tier === "degradado");
    const temNovo = lista.some((s) => s.tier === "novo");
    return {
      delayMinSec: Math.round(minSug / 1000),
      delayMaxSec: Math.round(maxSug / 1000),
      limitePorHora: porHora,
      totalRestanteHoje: totalRestante,
      piorTier: temDegradado ? "degradado" : temNovo ? "novo" : "estavel",
      chips: lista,
    };
  })();

  function aplicarSugestao() {
    if (!sugestao) return;
    setDelayMin(sugestao.delayMinSec);
    setDelayMax(sugestao.delayMaxSec);
    setLimitePorHora(sugestao.limitePorHora);
  }

  const jaAplicada =
    !!sugestao &&
    delayMin === sugestao.delayMinSec &&
    delayMax === sugestao.delayMaxSec &&
    limitePorHora === sugestao.limitePorHora;

  const connected = instances.filter((i) => i.connectionStatus === "open");
  const listaSelecionada = listas.find((l) => l.id === listaId);
  const contatosDaLista = listaSelecionada
    ? contatos.filter((c) => listaSelecionada.contatoIds.includes(c.id))
    : [];
  const validMessages = messages.filter(isBlockValid);

  function toggleInstance(name: string) {
    setSelectedInstances((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  // Data mínima pro datetime-local: daqui a 1 minuto (evita agendar "no passado").
  const minAgendavel = new Date(Date.now() + 60_000)
    .toISOString()
    .slice(0, 16);
  const agendamentoValido =
    modoEnvio === "agora" ||
    (!!agendadoPara && new Date(agendadoPara).getTime() > Date.now());

  const canAdvance = [
    nome.trim().length > 0,
    selectedInstances.length > 0,
    !!listaId && contatosDaLista.length > 0,
    validMessages.length > 0 &&
      validMessages.length === messages.length &&
      agendamentoValido,
  ][step];

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const isDrip = modoDisparo === "drip";
    const agendando = !isDrip && modoEnvio === "agendar" && !!agendadoPara;
    // Drip sempre passa pelo scheduler — agendamos pra "agora" e o tick pega.
    const agendadoISO = agendando
      ? new Date(agendadoPara).toISOString()
      : isDrip
        ? new Date().toISOString()
        : undefined;

    let campanha;
    try {
      campanha = await addCampanha({
        nome,
        tipo: messages.length === 1 ? (messages[0].kind === "text" ? "text" : "multi") : "multi",
        status: agendando || isDrip ? "agendada" : "em_execucao",
        instanceNames: selectedInstances,
        listaId,
        messages,
        delayMin: delayMin * 1000,
        delayMax: delayMax * 1000,
        delayEntreBlocos: delayEntreBlocos * 1000,
        limitePorHora,
        total: contatosDaLista.length,
        enviadas: 0,
        falhas: 0,
        agendadoPara: agendadoISO,
        iniciadaEm: agendando || isDrip ? undefined : new Date().toISOString(),
        modo: isDrip ? "drip" : "imediato",
        dripLotePorDia: isDrip ? dripLotePorDia : 0,
        dripDiasSemana: isDrip ? dripDiasSemana : "",
        dripHoraInicio: isDrip ? dripHoraInicio : "09:00",
        dripHoraFim: isDrip ? dripHoraFim : "18:00",
      });
    } catch (err) {
      setSubmitError(`Falha ao criar campanha: ${(err as Error).message}`);
      setSubmitting(false);
      return;
    }

    // Modo Avançado: migra pro orquestrador imediatamente após criar.
    // Redireciona pra o editor da sequência pra o user montar os steps.
    if (modoAvancado) {
      try {
        await fetch(`/api/orquestrador/campanhas/${campanha.id}/migrar`, {
          method: "POST",
        });
      } catch {
        // segue mesmo se migrar falhar (ex: já é orchestrator)
      }
      router.push(`/campanhas/${campanha.id}/sequencia`);
      return;
    }

    // Agendada (incluindo drip): o scheduler vai disparar quando a hora chegar.
    if (agendando || isDrip) {
      router.push(`/campanhas/${campanha.id}`);
      return;
    }

    try {
      const res = await fetch(`/api/campanhas/${campanha.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceNames: selectedInstances,
          contatos: contatosDaLista.map((c) => ({
            numero: c.telefone,
            variaveis: { nome: c.nome, empresa: c.empresa || "" },
          })),
          messages,
          delayMin: delayMin * 1000,
          delayMax: delayMax * 1000,
          delayEntreBlocos: delayEntreBlocos * 1000,
          limitePorHora,
        }),
      });

      if (!res.ok && res.status !== 202) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${res.status}`);
      }

      // Backend agora é fire-and-forget (202 Accepted). O disparo roda em
      // background, independente do browser. A tela da campanha faz polling
      // 1.5s pra mostrar progresso em tempo real.
      router.push(`/campanhas/${campanha.id}`);
    } catch (err: unknown) {
      await updateCampanha(campanha.id, { status: "erro" }).catch(() => {});
      setSubmitError((err as Error).message);
      setSubmitting(false);
    }
  }

  const steps = [
    { num: 1, label: "Nome", icon: Rocket },
    { num: 2, label: "Instâncias", icon: Smartphone },
    { num: 3, label: "Lista", icon: ListChecks },
    { num: 4, label: "Mensagem", icon: MessageSquare },
  ];

  return (
    <>
      <PageHeader
        title={cloneSource ? "Duplicar campanha" : "Nova campanha"}
        subtitle={
          cloneSource
            ? `Baseada em "${cloneSource.nome}" — revise antes de disparar.`
            : "Defina os números, a lista e as mensagens. Dispare em segundos."
        }
      />

      {cloneId && !cloneSource && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          Não consegui encontrar a campanha original (ID inválido ou removida).
          Os campos abertos estão em branco.
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        {steps.map((s, i) => {
          const active = i === step;
          const done = i < step;
          const Icon = s.icon;
          return (
            <button
              key={s.num}
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 px-3 h-9 rounded-md border whitespace-nowrap transition-colors ${
                active
                  ? "border-[#FF0033] bg-[#FF0033]/10 text-[#FF0033]"
                  : done
                  ? "border-emerald-500/30 text-emerald-400"
                  : "border-white/10 text-zinc-500"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                {s.num}. {s.label}
              </span>
            </button>
          );
        })}
      </div>

      <GlassCard strong>
        {step === 0 && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-base font-semibold">Nome da campanha</h3>
            <NeonInput
              label="Nome interno *"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Leads frios março"
              required
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">
              Instâncias para disparo
              <span className="text-xs text-zinc-500 font-normal ml-2">
                (rotação automática)
              </span>
            </h3>
            {loadingInstances ? (
              <p className="text-sm text-zinc-500">Carregando...</p>
            ) : connected.length === 0 ? (
              <p className="text-sm text-zinc-400">
                Nenhum número conectado.{" "}
                <a href="/numeros" className="text-[#FF0033] hover:underline">
                  Conecte um número primeiro
                </a>
                .
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {connected.map((inst) => {
                  const name = inst.name || "—";
                  const selected = selectedInstances.includes(name);
                  return (
                    <button
                      key={inst.id || name}
                      type="button"
                      onClick={() => toggleInstance(name)}
                      className={`flex items-center gap-3 p-3 rounded-md border text-left transition-colors ${
                        selected
                          ? "border-[#FF0033] bg-[#FF0033]/5"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="h-8 w-8 rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 text-[#FF0033] flex items-center justify-center font-semibold uppercase text-xs">
                        {name.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <StatusDot status="on" label="Conectado" size="sm" />
                      </div>
                      <span
                        className={`h-4 w-4 rounded border ${
                          selected
                            ? "bg-[#FF0033] border-[#FF0033]"
                            : "border-white/20"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">Selecione a lista</h3>
            {listas.length === 0 ? (
              <p className="text-sm text-zinc-400">
                Nenhuma lista criada.{" "}
                <a href="/listas" className="text-[#FF0033] hover:underline">
                  Crie uma lista primeiro
                </a>
                .
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {listas.map((l) => {
                  const selected = listaId === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setListaId(l.id)}
                      className={`flex items-center justify-between p-3 rounded-md border text-left transition-colors ${
                        selected
                          ? "border-[#FF0033] bg-[#FF0033]/5"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.nome}</p>
                        <p className="text-xs text-zinc-500">
                          {l.contatoIds.length} contatos
                        </p>
                      </div>
                      <span
                        className={`h-4 w-4 rounded-full border ${
                          selected
                            ? "bg-[#FF0033] border-[#FF0033]"
                            : "border-white/20"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
            {listaSelecionada && (
              <p className="text-xs text-zinc-500">
                {contatosDaLista.length} contatos vão receber a campanha.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-base font-semibold mb-0.5">Mensagens</h3>
                <p className="text-xs text-zinc-500">
                  Monte a sequência que cada contato vai receber. Use{" "}
                  <b>+ Variação</b> para alternativas no mesmo bloco (uma é
                  sorteada por contato) e <b>+ Adicionar mensagem</b> para
                  encadear blocos.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <NeonButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLoadOpen(true)}
                  title="Aplicar um template salvo"
                >
                  <FileStack className="h-3.5 w-3.5" /> Carregar template
                </NeonButton>
                <NeonButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSaveOpen(true)}
                  disabled={validMessages.length === 0}
                  title="Salvar estas mensagens como template reutilizável"
                >
                  <Save className="h-3.5 w-3.5" /> Salvar como template
                </NeonButton>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 -mt-2">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={modoAvancado}
                  onChange={(e) => toggleModoAvancado(e.target.checked)}
                  className="accent-[#FF0033]"
                />
                Modo avançado <span className="text-zinc-500">(preview)</span>
              </label>
            </div>

            {modoAvancado ? (
              <FlowEditor
                value={messages}
                onChange={setMessages}
                delayEntreBlocosMs={delayEntreBlocos * 1000}
              />
            ) : (
              <MessageComposer value={messages} onChange={setMessages} />
            )}

            <div className="pt-4 border-t border-white/5">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                Cadência de envio
              </p>

              {sugestao && (
                <div
                  className={`mb-3 rounded-md border p-3 ${
                    sugestao.piorTier === "degradado"
                      ? "border-red-400/30 bg-red-400/5"
                      : sugestao.piorTier === "novo"
                        ? "border-amber-400/30 bg-amber-400/5"
                        : "border-[#FF0033]/25 bg-[#FF0033]/5"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Sparkles
                      className={`h-4 w-4 mt-0.5 shrink-0 ${
                        sugestao.piorTier === "degradado"
                          ? "text-red-300"
                          : sugestao.piorTier === "novo"
                            ? "text-amber-300"
                            : "text-[#FF0033]"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white">
                        Sugestão baseada no score dos números
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                        {sugestao.piorTier === "degradado"
                          ? "Pelo menos um número tem taxa de falha alta. Vai devagar pra não queimar mais — "
                          : sugestao.piorTier === "novo"
                            ? "Número novo misturado no grupo — ritmo lento de aquecimento: "
                            : "Cadência estimada pra esta combinação: "}
                        <span className="text-zinc-200 tabular-nums">
                          {sugestao.delayMinSec}–{sugestao.delayMaxSec}s
                        </span>{" "}
                        entre contatos,{" "}
                        <span className="text-zinc-200 tabular-nums">
                          {sugestao.limitePorHora}/hora
                        </span>
                        {sugestao.totalRestanteHoje > 0 && (
                          <>
                            {" "}
                            (capacidade restante hoje ≈{" "}
                            <span className="text-zinc-200 tabular-nums">
                              {sugestao.totalRestanteHoje}
                            </span>
                            )
                          </>
                        )}
                        .
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sugestao.chips.map((c) => (
                          <span
                            key={c.instanceName}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-black/40 text-zinc-400"
                          >
                            <span className="text-zinc-200">{c.instanceName}</span>{" "}
                            · {c.tier} · {c.idadeDias}d · {c.enviadasHoje}/{c.capacidadeHoje}
                          </span>
                        ))}
                      </div>
                      {!jaAplicada && (
                        <button
                          type="button"
                          onClick={aplicarSugestao}
                          className="mt-2.5 text-[11px] px-2 py-1 rounded-md border border-[#FF0033]/40 bg-[#FF0033]/10 text-[#FF0033] hover:bg-[#FF0033]/20 transition-colors inline-flex items-center gap-1.5"
                        >
                          <Sparkles className="h-3 w-3" /> Aplicar sugestão
                        </button>
                      )}
                      {jaAplicada && (
                        <p className="mt-2.5 text-[10px] text-emerald-300">
                          ✓ Sugestão aplicada
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <NeonInput
                  label="Delay mín (seg)"
                  type="number"
                  value={String(delayMin)}
                  onChange={(e) => setDelayMin(Number(e.target.value) || 0)}
                  hint="Entre contatos"
                />
                <NeonInput
                  label="Delay máx (seg)"
                  type="number"
                  value={String(delayMax)}
                  onChange={(e) => setDelayMax(Number(e.target.value) || 0)}
                  hint="Entre contatos"
                />
                <NeonInput
                  label="Entre blocos (seg)"
                  type="number"
                  value={String(delayEntreBlocos)}
                  onChange={(e) =>
                    setDelayEntreBlocos(Number(e.target.value) || 0)
                  }
                  hint="Mesmo contato"
                />
                <NeonInput
                  label="Limite / hora"
                  type="number"
                  value={String(limitePorHora)}
                  onChange={(e) =>
                    setLimitePorHora(Number(e.target.value) || 0)
                  }
                />
              </div>
            </div>

            {messages.length > 0 && validMessages.length !== messages.length && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                Um ou mais blocos estão incompletos (texto vazio, mídia
                faltando, coordenadas inválidas…). Revise antes de avançar.
              </div>
            )}

            <div className="pt-4 border-t border-white/5">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Modo de disparo
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setModoDisparo("imediato")}
                  className={`p-3 rounded-md border text-left transition-colors ${
                    modoDisparo === "imediato"
                      ? "border-[#FF0033] bg-[#FF0033]/5"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <p className="text-sm font-medium">Imediato</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Dispara tudo de uma vez (agora ou em data marcada).
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setModoDisparo("drip")}
                  className={`p-3 rounded-md border text-left transition-colors ${
                    modoDisparo === "drip"
                      ? "border-[#FF0033] bg-[#FF0033]/5"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <p className="text-sm font-medium">
                    Programado (drip){" "}
                    <span className="text-[10px] text-[#FF0033] ml-1">novo</span>
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    N por dia, em janela horária. Pausa e retoma sozinho.
                  </p>
                </button>
              </div>

              {modoDisparo === "imediato" ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setModoEnvio("agora")}
                      className={`p-3 rounded-md border text-left transition-colors ${
                        modoEnvio === "agora"
                          ? "border-[#FF0033] bg-[#FF0033]/5"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <p className="text-sm font-medium">Disparar agora</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Começa assim que eu clicar em disparar.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoEnvio("agendar")}
                      className={`p-3 rounded-md border text-left transition-colors ${
                        modoEnvio === "agendar"
                          ? "border-[#FF0033] bg-[#FF0033]/5"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <p className="text-sm font-medium">Agendar</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Dispara sozinho na data/hora escolhida.
                      </p>
                    </button>
                  </div>
                  {modoEnvio === "agendar" && (
                    <div className="space-y-2">
                      <NeonInput
                        label="Data e hora"
                        type="datetime-local"
                        value={agendadoPara}
                        min={minAgendavel}
                        onChange={(e) => setAgendadoPara(e.target.value)}
                        hint="Fuso: local do seu navegador."
                      />
                      {agendadoPara &&
                        new Date(agendadoPara).getTime() <= Date.now() && (
                          <p className="text-xs text-amber-400">
                            Escolha uma data/hora no futuro.
                          </p>
                        )}
                    </div>
                  )}
                </>
              ) : (
                <DripConfigSection
                  contatosTotal={contatosDaLista.length}
                  lotePorDia={dripLotePorDia}
                  onLote={setDripLotePorDia}
                  diasSemana={dripDiasSemana}
                  onDias={setDripDiasSemana}
                  horaInicio={dripHoraInicio}
                  onHoraInicio={setDripHoraInicio}
                  horaFim={dripHoraFim}
                  onHoraFim={setDripHoraFim}
                />
              )}
            </div>
          </div>
        )}

        {submitError && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
            {submitError}
          </div>
        )}

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
          <NeonButton
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            Voltar
          </NeonButton>

          {step < 3 ? (
            <NeonButton
              size="sm"
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
            >
              Avançar
            </NeonButton>
          ) : (
            <NeonButton
              size="sm"
              disabled={!canAdvance || submitting}
              onClick={handleSubmit}
            >
              {modoEnvio === "agendar" ? (
                <Clock className="h-4 w-4" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {submitting
                ? modoEnvio === "agendar"
                  ? "Agendando..."
                  : "Disparando..."
                : modoEnvio === "agendar"
                  ? "Agendar campanha"
                  : "Disparar campanha"}
            </NeonButton>
          )}
        </div>
      </GlassCard>

      {loadOpen && (
        <LoadTemplateModal
          currentCount={messages.length}
          hasContent={validMessages.length > 0}
          onClose={() => setLoadOpen(false)}
          onLoad={(blocks) => {
            setMessages(blocks);
            setLoadOpen(false);
            toast.success("Template aplicado.");
          }}
        />
      )}

      {saveOpen && (
        <SaveTemplateModal
          blocks={messages}
          defaultName={nome}
          onClose={() => setSaveOpen(false)}
          onSaved={() => setSaveOpen(false)}
        />
      )}
    </>
  );
}

// ───────────────────── Modal: carregar template ─────────────────────

function LoadTemplateModal({
  currentCount,
  hasContent,
  onClose,
  onLoad,
}: {
  currentCount: number;
  hasContent: boolean;
  onClose: () => void;
  onLoad: (blocks: MessageBlock[]) => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/templates");
        const d = await r.json();
        setTemplates(Array.isArray(d.items) ? d.items : []);
      } catch {
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = templates.filter((t) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      t.nome.toLowerCase().includes(q) ||
      (t.descricao || "").toLowerCase().includes(q)
    );
  });

  function apply(t: TemplateSummary) {
    if (hasContent) {
      setPendingId(t.id);
      return;
    }
    onLoad(t.blocks);
  }

  const pending = pendingId ? templates.find((t) => t.id === pendingId) : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Carregar template</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Aplique uma mensagem salva. Seus blocos atuais serão substituídos.
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

        <div className="p-5 pb-3">
          <NeonInput
            placeholder="Buscar template..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon={<Search className="h-3.5 w-3.5" />}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {loading ? (
            <p className="text-sm text-zinc-500 py-6 text-center">
              Carregando...
            </p>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <FileStack className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">
                {templates.length === 0
                  ? "Nenhum template salvo ainda."
                  : "Nenhum resultado."}
              </p>
              {templates.length === 0 && (
                <p className="text-xs text-zinc-500 mt-1">
                  Crie templates em{" "}
                  <a
                    href="/templates"
                    className="text-[#FF0033] hover:underline"
                  >
                    /templates
                  </a>
                  .
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => apply(t)}
                    className="w-full text-left p-3 rounded-md border border-white/10 hover:border-[#FF0033]/50 hover:bg-[#FF0033]/[0.04] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.nome}</p>
                        {t.descricao && (
                          <p className="text-xs text-zinc-500 truncate mt-0.5">
                            {t.descricao}
                          </p>
                        )}
                        <p className="text-[10px] text-zinc-600 mt-1">
                          {t.blocks.length} bloco
                          {t.blocks.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pending && (
          <div className="p-4 border-t border-amber-500/20 bg-amber-500/[0.03] flex items-center justify-between gap-2">
            <p className="text-xs text-amber-200">
              Isso vai substituir {currentCount} bloco
              {currentCount === 1 ? "" : "s"} atual
              {currentCount === 1 ? "" : "is"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <NeonButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPendingId(null)}
              >
                Cancelar
              </NeonButton>
              <NeonButton
                type="button"
                size="sm"
                onClick={() => onLoad(pending.blocks)}
              >
                Substituir
              </NeonButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────── Modal: salvar como template ─────────────────────

function SaveTemplateModal({
  blocks,
  defaultName,
  onClose,
  onSaved,
}: {
  blocks: MessageBlock[];
  defaultName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(defaultName || "");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = nome.trim();
    if (!clean) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: clean,
          descricao: descricao.trim() || undefined,
          blocks,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Erro ${r.status}`);
      }
      toast.success("Template salvo.");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
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
        className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Salvar como template</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Vai salvar {blocks.length} bloco{blocks.length === 1 ? "" : "s"}
                {" "}pra reutilizar depois.
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

          <div className="p-5 space-y-3">
            <NeonInput
              label="Nome *"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Boas-vindas leads frios"
              required
              autoFocus
            />
            <NeonInput
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Opcional"
            />
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/5 flex justify-end gap-2">
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
              disabled={!nome.trim() || saving}
            >
              {saving ? "Salvando..." : "Salvar template"}
            </NeonButton>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────────────────── DripConfigSection ─────────────────────
// Form do modo programado: lote/dia, dias da semana, janela horária.

const DRIP_PRESETS_UI = [
  { id: "uteis", label: "Dias úteis", csv: "1,2,3,4,5" },
  { id: "alternado", label: "Dia sim, dia não", csv: "1,3,5" },
  { id: "todos", label: "Todos os dias", csv: "1,2,3,4,5,6,7" },
  { id: "fds", label: "Só fim de semana", csv: "6,7" },
];

const WEEKDAYS_UI: Array<{ n: number; label: string }> = [
  { n: 1, label: "Seg" },
  { n: 2, label: "Ter" },
  { n: 3, label: "Qua" },
  { n: 4, label: "Qui" },
  { n: 5, label: "Sex" },
  { n: 6, label: "Sáb" },
  { n: 7, label: "Dom" },
];

function DripConfigSection({
  contatosTotal,
  lotePorDia,
  onLote,
  diasSemana,
  onDias,
  horaInicio,
  onHoraInicio,
  horaFim,
  onHoraFim,
}: {
  contatosTotal: number;
  lotePorDia: number;
  onLote: (n: number) => void;
  diasSemana: string;
  onDias: (csv: string) => void;
  horaInicio: string;
  onHoraInicio: (s: string) => void;
  horaFim: string;
  onHoraFim: (s: string) => void;
}) {
  const ativos = new Set(
    diasSemana
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => n >= 1 && n <= 7)
  );

  function toggleDia(n: number) {
    const next = new Set(ativos);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    const csv = WEEKDAYS_UI.filter((w) => next.has(w.n))
      .map((w) => w.n)
      .join(",");
    onDias(csv);
  }

  // Estimativa de duração: contatos / (lote × dias-ativos por semana)
  const diasAtivosPorSemana = ativos.size || 1;
  const semanas =
    lotePorDia > 0 && contatosTotal > 0
      ? contatosTotal / (lotePorDia * diasAtivosPorSemana)
      : 0;
  const diasCorridos = Math.ceil(semanas * 7);

  const presetAtivo = DRIP_PRESETS_UI.find((p) => p.csv === diasSemana)?.id;

  return (
    <div className="space-y-4 rounded-md border border-[#FF0033]/20 bg-[#FF0033]/5 p-3.5">
      <div>
        <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
          Quantos contatos por dia
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={5000}
            value={lotePorDia}
            onChange={(e) => onLote(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 tabular-nums focus:border-[#FF0033]/60 focus:outline-none"
          />
          <span className="text-xs text-zinc-500">por dia ativo</span>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
          Dias da semana
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DRIP_PRESETS_UI.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onDias(p.csv)}
              className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                presetAtivo === p.id
                  ? "border-[#FF0033] bg-[#FF0033]/15 text-[#FF0033]"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS_UI.map((w) => (
            <button
              key={w.n}
              type="button"
              onClick={() => toggleDia(w.n)}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors min-w-[42px] ${
                ativos.has(w.n)
                  ? "border-[#FF0033]/60 bg-[#FF0033]/10 text-white"
                  : "border-white/10 bg-black/30 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
            Hora de início
          </label>
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => onHoraInicio(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 tabular-nums focus:border-[#FF0033]/60 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
            Hora de fim
          </label>
          <input
            type="time"
            value={horaFim}
            onChange={(e) => onHoraFim(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 tabular-nums focus:border-[#FF0033]/60 focus:outline-none"
          />
        </div>
      </div>

      {contatosTotal > 0 && lotePorDia > 0 && ativos.size > 0 && (
        <div className="rounded-md bg-black/40 border border-white/5 p-2.5">
          <p className="text-[11px] text-zinc-400">
            Disparando <span className="text-white">{lotePorDia}/dia</span> em{" "}
            <span className="text-white">{ativos.size} dia{ativos.size === 1 ? "" : "s"}</span>{" "}
            da semana, {contatosTotal} contatos terminam em{" "}
            <span className="text-[#FF0033] font-medium">
              ~{diasCorridos} dia{diasCorridos === 1 ? "" : "s"}
            </span>{" "}
            corridos.
          </p>
        </div>
      )}
    </div>
  );
}
