// Inicia uma campanha orquestrada: cria 1 CampanhaContato por contato
// escolhido (respeitando suppression) e enfileira a primeira MessageExecution
// usando o snapshot da versão corrente.
//
// É idempotente: rodar duas vezes não duplica (UNIQUE em
// (campanhaId, contatoId) e (campanhaId, campanhaContatoId, stepOriginalId,
// versaoNumero)).

import { prisma } from "@/lib/db";
import { isSuppressed } from "@/lib/suppression";
import { normalizePhone } from "@/lib/phone";

export interface IniciarResult {
  campanhaId: string;
  versaoNumero: number;
  totalContatos: number;
  novosContatos: number;
  suprimidos: number;
  jaExistentes: number;
  primeirasExecucoes: number;
}

export interface IniciarOpts {
  contatoIds?: string[]; // se null, usa listaSnapshot ou Lista.contatos
}

export async function iniciarCampanhaOrquestrada(
  campanhaId: string,
  opts: IniciarOpts = {}
): Promise<IniciarResult> {
  const campanha = await prisma.campanha.findUnique({
    where: { id: campanhaId },
    include: {
      versoes: { orderBy: { numero: "desc" }, take: 1, include: { snapshots: { orderBy: { posicao: "asc" }, take: 1 } } },
    },
  });
  if (!campanha) throw new Error(`Campanha ${campanhaId} não existe`);
  if (campanha.engine !== "orchestrator") {
    throw new Error("Campanha não está no engine 'orchestrator'. Mude engine antes.");
  }
  const versao = campanha.versoes[0];
  if (!versao) throw new Error("Nenhuma versão publicada — chame publicarVersao() primeiro.");
  const primeiroSnapshot = versao.snapshots[0];
  if (!primeiroSnapshot) throw new Error("Versão publicada não tem steps.");

  // 1. Resolver quais contatoIds iremos processar.
  let contatoIds: string[] = opts.contatoIds ?? [];
  if (contatoIds.length === 0 && campanha.listaId) {
    const vinculos = await prisma.contatoLista.findMany({
      where: { listaId: campanha.listaId },
      select: { contatoId: true },
    });
    contatoIds = vinculos.map((v) => v.contatoId);
  }
  if (contatoIds.length === 0 && campanha.listaSnapshot) {
    try {
      const snap = JSON.parse(campanha.listaSnapshot) as { contatoIds?: string[] };
      contatoIds = snap.contatoIds ?? [];
    } catch {
      // snapshot em formato antigo — segue sem.
    }
  }
  if (contatoIds.length === 0) {
    throw new Error("Sem contatos pra enfileirar — vincule uma lista à campanha.");
  }

  // 2. Carregar os contatos pra pegar telefone (pra suppression check).
  const contatos = await prisma.contato.findMany({
    where: { id: { in: contatoIds } },
    select: { id: true, telefone: true },
  });

  const now = new Date();
  let novosContatos = 0;
  let suprimidos = 0;
  let jaExistentes = 0;
  let primeirasExecucoes = 0;

  for (const c of contatos) {
    const telNorm = normalizePhone(c.telefone) ?? c.telefone;

    // Suppression check (opt-out, bloqueio ativo).
    if (await isSuppressed(telNorm)) {
      suprimidos++;
      continue;
    }

    // UPSERT CampanhaContato (idempotente via @@unique).
    const campContato = await prisma.campanhaContato.upsert({
      where: { campanhaId_contatoId: { campanhaId, contatoId: c.id } },
      update: {}, // não bate em contatos já criados
      create: {
        campanhaId,
        contatoId: c.id,
        stepAtualId: primeiroSnapshot.stepOriginalId,
        versaoFixada: versao.numero,
        status: "em_andamento",
        proximoEnvioEm: computeAgendadoPara(now, primeiroSnapshot),
      },
    });

    const criado = campContato.criadoEm.getTime() >= now.getTime() - 2000;
    if (criado) novosContatos++;
    else jaExistentes++;

    // Enfileira a primeira MessageExecution (UNIQUE evita duplicar).
    try {
      await prisma.messageExecution.create({
        data: {
          campanhaId,
          campanhaContatoId: campContato.id,
          stepOriginalId: primeiroSnapshot.stepOriginalId,
          versaoNumero: versao.numero,
          versaoId: versao.id,
          snapshotId: primeiroSnapshot.id,
          status: "pending",
          agendadoPara: computeAgendadoPara(now, primeiroSnapshot),
        },
      });
      primeirasExecucoes++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|UNIQUE/i.test(msg)) throw e;
      // já existia essa execução — segue
    }
  }

  await prisma.campanhaAudit.create({
    data: {
      campanhaId,
      autor: "sistema",
      acao: "orquestrador_iniciado",
      payload: JSON.stringify({
        versao: versao.numero,
        totalContatos: contatos.length,
        novosContatos,
        suprimidos,
        jaExistentes,
        primeirasExecucoes,
      }),
    },
  });

  // Marca a campanha como em execução (reusa estado existente).
  if (campanha.status === "rascunho" || campanha.status === "agendada" || campanha.status === "pausada") {
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: { status: "em_execucao", iniciadaEm: campanha.iniciadaEm ?? now },
    });
  }

  return {
    campanhaId,
    versaoNumero: versao.numero,
    totalContatos: contatos.length,
    novosContatos,
    suprimidos,
    jaExistentes,
    primeirasExecucoes,
  };
}

// Dado um snapshot, computa quando a mensagem deve rodar.
// Para "immediate" / "delay" usamos a hora atual + delay.
// "absolute" só suporta HH:MM — pega o próximo horário do dia.
export function computeAgendadoPara(
  base: Date,
  snap: { scheduleMode: string; delaySegundos: number; horarioAbsoluto: string | null }
): Date {
  switch (snap.scheduleMode) {
    case "immediate":
      return base;
    case "absolute": {
      if (!snap.horarioAbsoluto) return base;
      const [h, m] = snap.horarioAbsoluto.split(":").map((n) => parseInt(n, 10));
      const target = new Date(base);
      target.setHours(h, m, 0, 0);
      if (target <= base) target.setDate(target.getDate() + 1);
      return target;
    }
    case "delay":
    case "after_reply":
    case "after_no_reply":
    default:
      return new Date(base.getTime() + (snap.delaySegundos ?? 0) * 1000);
  }
}
