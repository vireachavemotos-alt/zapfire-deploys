// Dispatcher do aquecimento. A cada tick: pega sessões ativas com
// `proximoEnvioEm <= now`, pra cada uma:
//   1. Verifica/atualiza `diasAtivo` + `limiteDiario` (curva de progressão)
//   2. Checa cota diária (zera com `diaRef` != hoje)
//   3. Resolve número da instância de destino via `fetchInstances`
//   4. Alterna direção A→B / B→A
//   5. Sorteia frase do pool
//   6. Dispara via sendText com delay humano
//   7. Loga WarmupMessage + reagenda próximoEnvioEm

import { prisma } from "@/lib/db";
import { sendText, fetchInstances } from "@/lib/evolution";
import { pickFrase } from "@/lib/warmup/pool";
import {
  calcLimiteDiario,
  intervaloEntreEnvios,
} from "@/lib/warmup/progression";

export interface WarmupStats {
  processadas: number;
  enviadas: number;
  falhas: number;
  puladas: number;
}

function hojeKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Mapa em cache (por 60s) de instanceName → telefone, pra não bater
// /instance/fetchInstances a cada envio.
interface InstanceCache {
  byName: Map<string, string>;
  loadedAt: number;
}
let instanceCache: InstanceCache | null = null;

async function instanceNumeroMap(): Promise<Map<string, string>> {
  if (instanceCache && Date.now() - instanceCache.loadedAt < 60_000) {
    return instanceCache.byName;
  }
  const map = new Map<string, string>();
  try {
    const raw = (await fetchInstances()) as unknown;
    const list = Array.isArray(raw) ? raw : [];
    for (const i of list as Array<Record<string, unknown>>) {
      const name = (i.name ?? i.instanceName) as string | undefined;
      const ownerJid =
        (i.ownerJid as string | undefined) ??
        (i.owner as string | undefined) ??
        null;
      if (!name || !ownerJid) continue;
      const numero = String(ownerJid).split("@")[0]?.replace(/\D/g, "");
      if (numero) map.set(name, numero);
    }
  } catch {
    // sem conexão com Evolution, cache fica vazio e envios falham com msg clara
  }
  instanceCache = { byName: map, loadedAt: Date.now() };
  return map;
}

export async function warmupTick(): Promise<WarmupStats> {
  const now = new Date();
  const stats: WarmupStats = { processadas: 0, enviadas: 0, falhas: 0, puladas: 0 };

  const candidatas = await prisma.warmupSession.findMany({
    where: { ativo: true, proximoEnvioEm: { lte: now } },
    orderBy: { proximoEnvioEm: "asc" },
    take: 10,
  });

  if (candidatas.length === 0) return stats;

  // Claim atômico contra concorrência: só continua com as sessões cujo
  // proximoEnvioEm ainda bate (outro tick/worker pode ter avançado). O
  // claim empurra o proximoEnvioEm pra +2min como placeholder — se o
  // envio terminar antes, sobrescreve com o delay real; se o processo
  // crashar, outro tick pega em 2min.
  const claimPlaceholder = new Date(now.getTime() + 2 * 60_000);
  const sessoes: typeof candidatas = [];
  for (const c of candidatas) {
    const claim = await prisma.warmupSession.updateMany({
      where: { id: c.id, ativo: true, proximoEnvioEm: c.proximoEnvioEm },
      data: { proximoEnvioEm: claimPlaceholder },
    });
    if (claim.count === 1) sessoes.push(c);
  }
  if (sessoes.length === 0) return stats;

  const nums = await instanceNumeroMap();

  for (const s of sessoes) {
    stats.processadas++;

    // Reset diário de contagem + atualizar diasAtivo + limiteDiario.
    const hoje = hojeKey(now);
    let enviadasHoje = s.enviadasHoje;
    let diaRef = s.diaRef;
    let diasAtivo = s.diasAtivo;
    let limiteDiario = s.limiteDiario;
    if (diaRef !== hoje) {
      diasAtivo = diaRef === "" ? 1 : diasAtivo + 1;
      limiteDiario = calcLimiteDiario(diasAtivo);
      enviadasHoje = 0;
      diaRef = hoje;
    }

    if (enviadasHoje >= limiteDiario) {
      // Cota do dia batida: reagenda só pra amanhã bem cedo (6h).
      const amanha = new Date(now);
      amanha.setDate(amanha.getDate() + 1);
      amanha.setHours(6, 0, 0, 0);
      await prisma.warmupSession.update({
        where: { id: s.id },
        data: {
          enviadasHoje,
          diaRef,
          diasAtivo,
          limiteDiario,
          proximoEnvioEm: amanha,
        },
      });
      stats.puladas++;
      continue;
    }

    // Alterna direção.
    const direcao = s.ultimaDirecao === "A" ? "B" : "A";
    const from = direcao === "A" ? s.instanciaA : s.instanciaB;
    const to = direcao === "A" ? s.instanciaB : s.instanciaA;
    const numeroDestino = nums.get(to);

    if (!numeroDestino) {
      await prisma.warmupMessage.create({
        data: {
          sessionId: s.id,
          from,
          to,
          texto: "",
          status: "failed",
          erroDetalhe: `instância "${to}" sem ownerJid conhecido (não conectada ou Evolution offline)`,
        },
      });
      // Tenta de novo em 10 min.
      await prisma.warmupSession.update({
        where: { id: s.id },
        data: { proximoEnvioEm: new Date(now.getTime() + 10 * 60_000) },
      });
      stats.falhas++;
      continue;
    }

    // Pool de categoria rotaciona pra parecer conversa real.
    // Passa `ultimaFraseId` como excludeId pra não repetir a última frase.
    const categoria = enviadasHoje % 3 === 0 ? "saudacao" : enviadasHoje % 3 === 1 ? "pergunta" : "resposta";
    const frase = (await pickFrase(categoria, s.ultimaFraseId)) ?? (await pickFrase("geral", s.ultimaFraseId));
    if (!frase) {
      await prisma.warmupSession.update({
        where: { id: s.id },
        data: { proximoEnvioEm: new Date(now.getTime() + 30 * 60_000) },
      });
      stats.puladas++;
      continue;
    }

    // Delay natural 3-15s no sendText (humaniza).
    const delaySend = 3000 + Math.floor(Math.random() * 12_000);
    let ok = true;
    let erro = "";
    try {
      await sendText(from, { number: numeroDestino, text: frase.texto, delay: delaySend });
    } catch (e) {
      ok = false;
      erro = e instanceof Error ? e.message : String(e);
    }

    await prisma.warmupMessage.create({
      data: {
        sessionId: s.id,
        from,
        to,
        texto: frase.texto,
        status: ok ? "sent" : "failed",
        erroDetalhe: ok ? null : erro.slice(0, 500),
      },
    });

    const proximo = ok
      ? new Date(now.getTime() + intervaloEntreEnvios(limiteDiario))
      : new Date(now.getTime() + 5 * 60_000); // backoff 5min em erro

    await prisma.warmupSession.update({
      where: { id: s.id },
      data: {
        enviadasHoje: ok ? enviadasHoje + 1 : enviadasHoje,
        totalEnviadas: ok ? { increment: 1 } : undefined,
        diaRef,
        diasAtivo,
        limiteDiario,
        ultimaDirecao: direcao,
        ultimaFraseId: frase.id,
        proximoEnvioEm: proximo,
      },
    });

    if (ok) stats.enviadas++;
    else stats.falhas++;
  }

  return stats;
}
