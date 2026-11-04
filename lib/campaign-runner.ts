// Runner compartilhado de campanhas.
// Usado tanto pelo endpoint manual (/api/campanhas/[id]/start) quanto pelo
// scheduler (lib/scheduler.ts) quando a hora agendada chega.
//
// Diferente do /start antigo que lia o payload do body, aqui tudo vem do DB:
// a listaSnapshot salva no momento da criação é nossa fonte de verdade — mesmo
// que a lista original seja deletada entre o agendamento e o disparo.

import { prisma } from "@/lib/db";
import {
  sendText,
  sendMedia,
  sendAudio,
  sendSticker,
  sendLocation,
  sendFakeCall,
  getConnectionState,
} from "@/lib/evolution";
import {
  MessageBlock,
  renderText,
} from "@/lib/message";
import { logSend, getScores, type NumeroScore } from "@/lib/numero-score";
import {
  evaluateDrip,
  contarEnviadosHoje,
  hhmmToMinutes,
  nowMinutes,
} from "@/lib/drip";
import {
  listarBloqueadosAtivos,
  bloquearNumero,
  contarFalhasRecentes,
  AUTO_BLOCK_THRESHOLD,
  AUTO_BLOCK_DAYS,
} from "@/lib/blacklist";

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

/**
 * sleep com heartbeat: picota a espera em pedaços ≤90s e toca
 * `Campanha.atualizadoEm` a cada chunk. Serve pra duas coisas:
 *  1) scheduler.recoverOrphans NÃO pensar que a campanha morreu enquanto
 *     ela só está dormindo (delays de 20-45s entre contatos + rate-limit
 *     por hora podem ficar minutos sem UPDATE no row).
 *  2) permitir pausa cooperativa — se a campanha for marcada como
 *     "pausada" por fora (ex: user clicou pausar), devolvemos `false` e
 *     o chamador aborta o loop na próxima iteração.
 * Retorna `true` se dormiu até o fim, `false` se foi pausada no meio.
 */
async function heartbeatSleep(ms: number, campanhaId: string): Promise<boolean> {
  const CHUNK = 90_000; // 90s < HEARTBEAT_MS=120s do scheduler
  let restante = ms;
  while (restante > 0) {
    const slice = Math.min(CHUNK, restante);
    await new Promise<void>((res) => setTimeout(res, slice));
    restante -= slice;
    try {
      // touch atualizadoEm (@updatedAt) + checa se pausaram enquanto dormia.
      const c = await prisma.campanha.update({
        where: { id: campanhaId },
        data: {},
        select: { status: true },
      });
      if (c.status === "pausada") return false;
    } catch {
      // DB blip não deve matar o run; segue dormindo.
    }
  }
  return true;
}

function randomDelay(min: number, max: number) {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendBlock(
  instanceName: string,
  numero: string,
  block: MessageBlock,
  vars: Record<string, string>
) {
  const texto = block.variations.length
    ? renderText(block.variations, vars, { antiBan: block.antiBan })
    : "";

  switch (block.kind) {
    case "text":
      if (!texto) throw new Error("Texto vazio");
      await sendText(instanceName, { number: numero, text: texto });
      return;

    case "image":
    case "video":
    case "document":
      if (!block.mediaUrl) throw new Error("Mídia ausente");
      await sendMedia(instanceName, {
        number: numero,
        mediatype: block.kind,
        mimetype:
          block.mediaMimetype ||
          (block.kind === "image"
            ? "image/jpeg"
            : block.kind === "video"
              ? "video/mp4"
              : "application/pdf"),
        media: block.mediaUrl,
        caption: texto || undefined,
        fileName: block.mediaFileName,
      });
      return;

    case "audio":
      if (!block.mediaUrl) throw new Error("Áudio ausente");
      await sendAudio(instanceName, numero, block.mediaUrl);
      return;

    case "sticker":
      if (!block.mediaUrl) throw new Error("Sticker ausente");
      await sendSticker(instanceName, {
        number: numero,
        sticker: block.mediaUrl,
      });
      return;

    case "location":
      if (
        typeof block.latitude !== "number" ||
        typeof block.longitude !== "number"
      ) {
        throw new Error("Coordenadas inválidas");
      }
      await sendLocation(instanceName, {
        number: numero,
        latitude: block.latitude,
        longitude: block.longitude,
        name: block.locationName,
        address: block.locationAddress,
      });
      return;

    case "call":
      await sendFakeCall(instanceName, {
        number: numero,
        isVideo: block.callIsVideo ?? false,
        callDuration: block.callDurationSeconds ?? 10,
      });
      return;

    default:
      throw new Error(`Tipo não suportado: ${(block as { kind: string }).kind}`);
  }
}

interface SnapshotContato {
  id: string;
  nome: string | null;
  telefone: string;
  empresa: string | null;
}

interface ListaSnapshot {
  id: string;
  nome: string;
  contatos: SnapshotContato[];
}

export interface ResultadoItem {
  numero: string;
  /** "pulado" = contato marcado como whatsappValido=false na pré-validação.
   *  Não consome delay, não conta como envio nem como falha. */
  status: "ok" | "erro" | "pulado";
  detail?: string;
  timestamp?: string;
}

export interface RunResult {
  total: number;
  enviadas: number;
  falhas: number;
  resultados: ResultadoItem[];
  /** true se o loop saiu por pausa (usuário pediu); false se completou. */
  paused: boolean;
}

/**
 * Carrega a campanha do DB, roda o loop de envio e persiste o resultado.
 * Retorna o resultado final (ou null se a campanha não existe / não está pronta).
 *
 * Entradas válidas: status='agendada' (fresh) ou 'pausada' (resume).
 * Qualquer outro status → noop (evita re-entry concorrente).
 *
 * Comportamento de pausa: a cada iteração a gente checa o status no DB.
 * Se virou 'pausada' (via API /pause), sai do loop salvando o parcial —
 * status fica 'pausada' e os resultados-até-agora ficam preservados.
 */
export async function runCampaignFromDb(
  campanhaId: string
): Promise<RunResult | null> {
  const campanha = await prisma.campanha.findUnique({
    where: { id: campanhaId },
  });
  if (!campanha) {
    console.warn(`[Runner] Campanha ${campanhaId} não encontrada`);
    return null;
  }

  const entradaValida =
    campanha.status === "agendada" || campanha.status === "pausada";
  if (!entradaValida) {
    console.warn(
      `[Runner] Campanha ${campanhaId} em status ${campanha.status}, pulando`
    );
    return null;
  }

  const isResume = campanha.status === "pausada";

  const instanceNames: string[] = JSON.parse(campanha.instanceNames || "[]");
  const messages: MessageBlock[] = JSON.parse(campanha.messages || "[]");
  const snapshot: ListaSnapshot | null = campanha.listaSnapshot
    ? JSON.parse(campanha.listaSnapshot)
    : null;
  const resultadosPrevios: ResultadoItem[] = campanha.resultados
    ? JSON.parse(campanha.resultados)
    : [];

  if (!instanceNames.length) {
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: { status: "erro" },
    });
    console.error(`[Runner] Campanha ${campanhaId}: sem instâncias`);
    return null;
  }
  if (!messages.length) {
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: { status: "erro" },
    });
    console.error(`[Runner] Campanha ${campanhaId}: sem mensagens`);
    return null;
  }
  if (!snapshot || !snapshot.contatos.length) {
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: { status: "erro" },
    });
    console.error(`[Runner] Campanha ${campanhaId}: snapshot vazio`);
    return null;
  }

  // Transita para em_execucao. No resume a gente preserva iniciadaEm/resultados.
  //
  // NOTA sobre `dripUltimaDataExecutada`: antes marcávamos aqui logo na
  // transição, pra o scheduler não re-disparar no mesmo tick. Mas isso
  // criava um bug: se a campanha pausava sem enviar nada (janela fechada,
  // dia errado, erro no boot), o campo ficava marcado como hoje e o
  // scheduler não re-ativava a campanha nem mais tarde no mesmo dia. Agora
  // só marcamos APÓS o primeiro envio bem-sucedido (ver dripMarkedToday
  // abaixo, no laço principal). Enquanto não enviar, re-ativação natural
  // pelo scheduler continua possível.
  await prisma.campanha.update({
    where: { id: campanhaId },
    data: isResume
      ? { status: "em_execucao" }
      : {
          status: "em_execucao",
          iniciadaEm: new Date(),
          total: snapshot.contatos.length,
          resultados: JSON.stringify([]),
        },
  });
  // Flag local do run: só grava dripUltimaDataExecutada uma vez por run,
  // após o primeiro envio bem-sucedido.
  let dripMarkedToday = false;
  const hojeKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // Contatos já processados num run anterior (pausa/retomada) — skip.
  const jaProcessados = new Set(
    resultadosPrevios.map((r) => r.numero.replace(/\D/g, ""))
  );
  const results: ResultadoItem[] = isResume ? [...resultadosPrevios] : [];

  // Bulk: pega o status de validação WhatsApp atual de todos os contatos do
  // snapshot. Contatos com `whatsappValido === false` serão pulados sem
  // gastar delay nem entrar no rate-limit. `null`/`true` tentam normal
  // (por que podem não ter sido validados ainda, ou estarem válidos).
  const snapshotIds = snapshot.contatos.map((c) => c.id).filter(Boolean);
  const validityMap = new Map<string, boolean | null>();
  if (snapshotIds.length > 0) {
    const freshContatos = await prisma.contato.findMany({
      where: { id: { in: snapshotIds } },
      select: { id: true, whatsappValido: true },
    });
    for (const fc of freshContatos) {
      validityMap.set(fc.id, fc.whatsappValido);
    }
  }

  // Blacklist temporária: números com falhas repetidas em campanhas
  // recentes ficam bloqueados por X dias. Pré-carregamos uma vez no início
  // pra não bater no DB toda iteração — auto-blocks novos durante esta run
  // são adicionados ao Set local também.
  const blacklist: Set<string> = await listarBloqueadosAtivos();

  let instanceIndex = 0;
  let sentThisHour = 0;
  let hourStart = Date.now();
  let paused = false;

  // Detecção de ban: contador de falhas consecutivas por instância. Se uma
  // instância empilhar N falhas em sequência E `connectionState` retornar
  // 'close', pausamos a campanha e sinalizamos o motivo no log.
  // Threshold deliberado de 3 falhas: 1-2 podem ser blip, 3+ raramente é
  // coincidência — costuma ser ban ou desconexão.
  const FAILSTREAK_LIMIT = 3;
  const failStreak: Record<string, number> = {};
  for (const n of instanceNames) failStreak[n] = 0;

  // Configs editáveis em runtime — lidas do DB a cada iteração. Assim
  // o usuário pode ajustar delay / limite / mensagens enquanto a campanha
  // está rodando e a mudança aparece no próximo contato.
  let delayMin = campanha.delayMin;
  let delayMax = campanha.delayMax;
  let delayEntreBlocos = campanha.delayEntreBlocos;
  let limitePorHora = campanha.limitePorHora;
  let messagesLive: MessageBlock[] = messages;

  // Score/aquecimento — usado pra priorizar instâncias veteranas e
  // respeitar o cap diário calculado por `lib/numero-score`.
  const scoreMap: Record<string, NumeroScore> = await getScores(instanceNames);
  // Ordem de prioridade: score maior → cap restante maior.
  const sortedInstances = [...instanceNames].sort((a, b) => {
    const sa = scoreMap[a];
    const sb = scoreMap[b];
    if (sa.score !== sb.score) return sb.score - sa.score;
    return sb.restanteHoje - sa.restanteHoje;
  });
  // Contabiliza envios desta run por instância — soma ao `enviadasHoje` do
  // DB pra detectar quando uma instância atinge o cap mid-execução.
  const usageLocal: Record<string, number> = {};
  for (const n of instanceNames) usageLocal[n] = 0;

  for (let i = 0; i < snapshot.contatos.length; i++) {
    const c = snapshot.contatos[i];
    const numero = c.telefone.replace(/\D/g, "");
    if (jaProcessados.has(numero)) continue;

    // Pré-filtro: contato marcado como inválido no WhatsApp → pula sem delay.
    // Registrado como "pulado" no resultado pra o usuário ver na UI.
    if (validityMap.get(c.id) === false) {
      results.push({
        numero,
        status: "pulado",
        detail: "número sem WhatsApp (pré-validação)",
        timestamp: new Date().toISOString(),
      });
      // Persiste o parcial pra UI ver o skip em tempo real.
      await prisma.campanha.update({
        where: { id: campanhaId },
        data: { resultados: JSON.stringify(results) },
      });
      continue;
    }

    // Pré-filtro: número na blacklist temporária → pula sem delay.
    if (blacklist.has(numero)) {
      results.push({
        numero,
        status: "pulado",
        detail: "número em blacklist temporária",
        timestamp: new Date().toISOString(),
      });
      await prisma.campanha.update({
        where: { id: campanhaId },
        data: { resultados: JSON.stringify(results) },
      });
      continue;
    }

    // Checa no DB se o usuário pediu pausa desde o último envio e, de quebra,
    // re-lê as configs editáveis (delays/limite/mensagens). Edit-em-runtime:
    // o usuário pode mudar e a mudança aparece no próximo contato.
    const state = await prisma.campanha.findUnique({
      where: { id: campanhaId },
      select: {
        status: true,
        delayMin: true,
        delayMax: true,
        delayEntreBlocos: true,
        limitePorHora: true,
        messages: true,
        modo: true,
        dripLotePorDia: true,
        dripDiasSemana: true,
        dripHoraInicio: true,
        dripHoraFim: true,
        dripUltimaDataExecutada: true,
      },
    });
    if (!state || state.status === "pausada") {
      paused = true;
      console.log(
        `[Runner ${campanhaId}] Pausa detectada após ${results.length - resultadosPrevios.length} envios desta sessão`
      );
      break;
    }
    // Aplica configs atuais. `messages` pode vir como JSON inválido num edit
    // mal-formado — mantém o valor anterior nesse caso.
    delayMin = state.delayMin;
    delayMax = state.delayMax;
    delayEntreBlocos = state.delayEntreBlocos;
    limitePorHora = state.limitePorHora;
    try {
      const parsed = JSON.parse(state.messages || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) messagesLive = parsed;
    } catch {
      /* mantém messagesLive anterior */
    }

    // ─── Checkpoint DRIP ──────────────────────────────────────
    // Campanha programada: checa janela horária + cota diária antes
    // de cada envio. Se estourou, auto-pausa (o scheduler retoma amanhã).
    if (state.modo === "drip") {
      const dripStatus = evaluateDrip({
        lotePorDia: state.dripLotePorDia,
        diasSemana: state.dripDiasSemana,
        horaInicio: state.dripHoraInicio,
        horaFim: state.dripHoraFim,
        ultimaDataExecutada: state.dripUltimaDataExecutada,
      });
      // Saiu da janela (passou do horário fim OU dia não ativo agora): pausa.
      if (!dripStatus.dentroJanela || !dripStatus.diaAtivo) {
        paused = true;
        console.log(
          `[Runner ${campanhaId}] Drip: ${dripStatus.motivo}. Pausando.`
        );
        await prisma.campanha.update({
          where: { id: campanhaId },
          data: { status: "pausada" },
        });
        break;
      }
      // Atingiu a cota do dia: pausa (scheduler re-ativa no próximo dia ativo).
      const enviadosHoje = contarEnviadosHoje(results);
      if (state.dripLotePorDia > 0 && enviadosHoje >= state.dripLotePorDia) {
        paused = true;
        console.log(
          `[Runner ${campanhaId}] Drip: cota diária atingida (${enviadosHoje}/${state.dripLotePorDia}). Pausando.`
        );
        await prisma.campanha.update({
          where: { id: campanhaId },
          data: { status: "pausada" },
        });
        break;
      }
      // Segurança extra: se o delay do próximo contato empurrar pra fora da
      // janela, também pausa agora em vez de dormir através da fronteira.
      // "00:00" vira 24h (meia-noite seguinte) — bate com evaluateDrip.
      const fimRaw = hhmmToMinutes(state.dripHoraFim);
      const fim = fimRaw === 0 ? 24 * 60 : fimRaw;
      if (!isNaN(fim) && nowMinutes() >= fim) {
        paused = true;
        console.log(
          `[Runner ${campanhaId}] Drip: atingiu horário de fim. Pausando.`
        );
        await prisma.campanha.update({
          where: { id: campanhaId },
          data: { status: "pausada" },
        });
        break;
      }
    }

    // Seleção de instância consciente do cap diário: percorre em ordem de
    // score a partir de `instanceIndex`, escolhe a primeira que ainda tem
    // `restanteHoje > 0` considerando o que já mandou nesta run. Se todas
    // estouraram, pausa a campanha com motivo explícito pra UI mostrar.
    let instanceName: string | null = null;
    for (let tries = 0; tries < sortedInstances.length; tries++) {
      const cand = sortedInstances[(instanceIndex + tries) % sortedInstances.length];
      const s = scoreMap[cand];
      const jaUsouNesseRun = usageLocal[cand];
      if (s.enviadasHoje + jaUsouNesseRun < s.capacidadeHoje) {
        instanceName = cand;
        instanceIndex = (instanceIndex + tries + 1) % sortedInstances.length;
        break;
      }
    }
    if (!instanceName) {
      paused = true;
      console.log(
        `[Runner ${campanhaId}] Cap diário atingido em todas as instâncias. Pausando.`
      );
      await prisma.campanha.update({
        where: { id: campanhaId },
        data: { status: "pausada" },
      });
      break;
    }
    const vars: Record<string, string> = {
      nome: c.nome || "",
      empresa: c.empresa || "",
    };

    const elapsed = Date.now() - hourStart;
    if (sentThisHour >= limitePorHora && elapsed < 3_600_000) {
      const waitMs = 3_600_000 - elapsed + 1000;
      console.log(
        `[Runner ${campanhaId}] Limite/hora atingido. Aguardando ${Math.round(
          waitMs / 1000
        )}s`
      );
      const ok = await heartbeatSleep(waitMs, campanhaId);
      if (!ok) { paused = true; break; }
      sentThisHour = 0;
      hourStart = Date.now();
    }

    let blockError: string | null = null;
    for (let b = 0; b < messagesLive.length; b++) {
      try {
        await sendBlock(instanceName, numero, messagesLive[b], vars);
      } catch (err: unknown) {
        blockError = `bloco ${b + 1} (${messagesLive[b].kind}): ${(err as Error).message}`;
        break;
      }
      if (b < messagesLive.length - 1 && delayEntreBlocos > 0) {
        await sleep(delayEntreBlocos);
      }
    }

    const now = new Date().toISOString();
    if (blockError) {
      results.push({ numero, status: "erro", detail: blockError, timestamp: now });
      // Auto-block: se este número tem N+ falhas em 24h (incluindo a atual),
      // adiciona à blacklist por AUTO_BLOCK_DAYS dias. Não bloqueia o loop:
      // só checa pra futuros contatos / próximas campanhas.
      contarFalhasRecentes(numero)
        .then((n) => {
          if (n >= AUTO_BLOCK_THRESHOLD) {
            return bloquearNumero({
              telefone: numero,
              motivo: `${n} falhas em campanhas nas últimas 24h`,
              falhas: n,
              origem: "auto",
              diasValidade: AUTO_BLOCK_DAYS,
            }).then(() => {
              blacklist.add(numero);
              console.log(
                `[Runner ${campanhaId}] Auto-block: ${numero} bloqueado por ${AUTO_BLOCK_DAYS}d (${n} falhas/24h)`
              );
            });
          }
        })
        .catch(() => {
          /* não trava o run por causa disso */
        });
    } else {
      results.push({ numero, status: "ok", timestamp: now });
      sentThisHour++;
      // Primeiro envio OK do run numa campanha drip: marca
      // `dripUltimaDataExecutada` pra o scheduler não disparar outra
      // instância da mesma campanha no mesmo dia. Idempotente.
      if (state.modo === "drip" && !dripMarkedToday) {
        dripMarkedToday = true;
        await prisma.campanha
          .update({
            where: { id: campanhaId },
            data: { dripUltimaDataExecutada: hojeKey },
          })
          .catch((e) => console.error("[Runner] marcar drip hoje:", e));
      }
    }
    // Registra no histórico da instância pro cálculo de score/aquecimento.
    // Não bloqueia o loop se falhar (ex: DB momentaneamente indisponível).
    logSend(instanceName, blockError ? "erro" : "ok").catch((e) =>
      console.error(`[Runner] logSend falhou: ${(e as Error).message}`)
    );
    // Incrementa uso local (usado pra decidir se a instância estourou cap).
    usageLocal[instanceName] = (usageLocal[instanceName] || 0) + 1;

    // Detecção de ban: rastreia streak de falhas por instância. Se hit o
    // limite, confirma com getConnectionState — só pausa se a Evolution
    // confirmar que a instância está realmente fora ('close'). Evita pausar
    // por uma série de erros de payload (números inválidos em sequência).
    if (blockError) {
      failStreak[instanceName] = (failStreak[instanceName] || 0) + 1;
      if (failStreak[instanceName] >= FAILSTREAK_LIMIT) {
        try {
          const stateResp = (await getConnectionState(instanceName)) as
            | { instance?: { state?: string } }
            | { state?: string }
            | null;
          // Evolution v2.x retorna { instance: { state: "open"|"close"|"connecting" } }
          const connState =
            (stateResp as { instance?: { state?: string } } | null)?.instance
              ?.state ||
            (stateResp as { state?: string } | null)?.state ||
            "";
          if (connState !== "open") {
            paused = true;
            console.log(
              `[Runner ${campanhaId}] Instância "${instanceName}" desconectada (state=${connState || "desconhecido"}) após ${failStreak[instanceName]} falhas seguidas. Pausando campanha.`
            );
            await prisma.campanha.update({
              where: { id: campanhaId },
              data: {
                status: "pausada",
                resultados: JSON.stringify(results),
              },
            });
            break;
          }
          // Conexão ok — provavelmente são erros de payload. Reseta o streak
          // pra não pausar à toa nos próximos erros distintos.
          failStreak[instanceName] = 0;
        } catch (e) {
          // Falha ao consultar a Evolution: pausa por precaução. É melhor
          // parar e o usuário ver o que aconteceu do que continuar cego.
          paused = true;
          console.log(
            `[Runner ${campanhaId}] Não consegui consultar connectionState de "${instanceName}" (${(e as Error).message}). Pausando por segurança.`
          );
          await prisma.campanha.update({
            where: { id: campanhaId },
            data: {
              status: "pausada",
              resultados: JSON.stringify(results),
            },
          });
          break;
        }
      }
    } else {
      // Sucesso quebra o streak.
      failStreak[instanceName] = 0;
    }

    // Persiste parciais a cada envio — assim a UI reflete o progresso em real-time
    // e um kill abrupto do processo não perde tudo.
    const okAteAgora = results.filter((r) => r.status === "ok").length;
    const errosAteAgora = results.filter((r) => r.status === "erro").length;
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: {
        enviadas: okAteAgora,
        falhas: errosAteAgora,
        resultados: JSON.stringify(results),
      },
    });

    if (i < snapshot.contatos.length - 1) {
      const delay = randomDelay(delayMin, delayMax);
      // heartbeatSleep porque delays podem passar HEARTBEAT_MS do scheduler.
      // Também permite "pausar" cooperativo durante o sleep.
      const ok = await heartbeatSleep(delay, campanhaId);
      if (!ok) { paused = true; break; }
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const erros = results.filter((r) => r.status === "erro").length;

  if (paused) {
    // O status já está 'pausada' (foi quem acionou o break). Só garantimos
    // que os resultados parciais ficaram salvos.
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: {
        enviadas: ok,
        falhas: erros,
        resultados: JSON.stringify(results),
      },
    });
  } else {
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: {
        status: erros > 0 && ok === 0 ? "erro" : "concluida",
        enviadas: ok,
        falhas: erros,
        resultados: JSON.stringify(results),
        concluidaEm: new Date(),
      },
    });
  }

  return {
    total: snapshot.contatos.length,
    enviadas: ok,
    falhas: erros,
    resultados: results,
    paused,
  };
}
