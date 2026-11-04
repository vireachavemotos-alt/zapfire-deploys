// Migração one-shot: recebe o payload do localStorage e popula o banco SQLite.
// Idempotente — pula contatos/listas que já existem (por telefone/nome).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

interface LegacyContato {
  id?: string;
  nome?: string;
  telefone: string;
  empresa?: string;
  tags?: string[];
  criadoEm?: string;
}
interface LegacyLista {
  id?: string;
  nome: string;
  descricao?: string;
  contatoIds?: string[];
  criadaEm?: string;
}
interface LegacyCampanha {
  id?: string;
  nome: string;
  status?: string;
  instanceNames?: string[];
  listaId?: string;
  copies?: string[];
  messages?: unknown[];
  delayMin?: number;
  delayMax?: number;
  delayEntreBlocos?: number;
  limitePorHora?: number;
  total?: number;
  enviadas?: number;
  falhas?: number;
  resultados?: unknown[];
  criadaEm?: string;
  iniciadaEm?: string;
  concluidaEm?: string;
}

interface Payload {
  contatos?: LegacyContato[];
  listas?: LegacyLista[];
  campanhas?: LegacyCampanha[];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;
  const relog = { contatos: 0, listas: 0, campanhas: 0, pulados: 0 };

  // Mapa legacyId → novoId para remapear referências.
  const contatoIdMap = new Map<string, string>();
  const listaIdMap = new Map<string, string>();

  // ─── contatos
  if (Array.isArray(body.contatos)) {
    // pré-carrega telefones existentes
    const existing = new Map(
      (await prisma.contato.findMany({ select: { id: true, telefone: true } })).map(
        (c) => [c.telefone, c.id]
      )
    );

    for (const c of body.contatos) {
      const tel = normalizePhone(c.telefone || "");
      if (!tel) {
        relog.pulados++;
        continue;
      }
      const existingId = existing.get(tel);
      if (existingId) {
        if (c.id) contatoIdMap.set(c.id, existingId);
        relog.pulados++;
        continue;
      }
      const criadoEm = c.criadoEm ? new Date(c.criadoEm) : new Date();
      const created = await prisma.contato.create({
        data: {
          nome: (c.nome || "").trim() || null,
          telefone: tel,
          empresa: (c.empresa || "").trim() || null,
          tags: c.tags && c.tags.length ? JSON.stringify(c.tags) : null,
          criadoEm,
        },
      });
      existing.set(tel, created.id);
      if (c.id) contatoIdMap.set(c.id, created.id);
      relog.contatos++;
    }
  }

  // ─── listas
  if (Array.isArray(body.listas)) {
    for (const l of body.listas) {
      const nome = (l.nome || "").trim();
      if (!nome) {
        relog.pulados++;
        continue;
      }

      const contatoIds = (l.contatoIds || [])
        .map((cid) => contatoIdMap.get(cid) || cid)
        .filter(Boolean);

      const criadaEm = l.criadaEm ? new Date(l.criadaEm) : new Date();
      const created = await prisma.lista.create({
        data: {
          nome,
          descricao: (l.descricao || "").trim() || null,
          criadoEm: criadaEm,
          contatos: {
            // connectOrCreate não ajuda aqui — usa create com contatoId se existe
            create: contatoIds.map((cid) => ({ contatoId: cid })),
          },
        },
      });
      if (l.id) listaIdMap.set(l.id, created.id);
      relog.listas++;
    }
  }

  // ─── campanhas
  if (Array.isArray(body.campanhas)) {
    for (const camp of body.campanhas) {
      try {
        const messages = Array.isArray(camp.messages)
          ? camp.messages
          : // legacy: copies[] viram 1 bloco de texto com variações
            (camp.copies || []).length > 0
            ? [
                {
                  id: Math.random().toString(36).slice(2, 10),
                  kind: "text",
                  variations: camp.copies,
                },
              ]
            : [];

        const listaId = camp.listaId ? listaIdMap.get(camp.listaId) || null : null;

        await prisma.campanha.create({
          data: {
            nome: camp.nome,
            status: camp.status || "concluida",
            instanceNames: JSON.stringify(camp.instanceNames || []),
            listaId,
            messages: JSON.stringify(messages),
            delayMin: camp.delayMin ?? 8000,
            delayMax: camp.delayMax ?? 20000,
            delayEntreBlocos: camp.delayEntreBlocos ?? 2000,
            limitePorHora: camp.limitePorHora ?? 60,
            total: camp.total ?? 0,
            enviadas: camp.enviadas ?? 0,
            falhas: camp.falhas ?? 0,
            resultados:
              camp.resultados && camp.resultados.length
                ? JSON.stringify(camp.resultados)
                : null,
            criadoEm: camp.criadaEm ? new Date(camp.criadaEm) : new Date(),
            iniciadaEm: camp.iniciadaEm ? new Date(camp.iniciadaEm) : null,
            concluidaEm: camp.concluidaEm ? new Date(camp.concluidaEm) : null,
          },
        });
        relog.campanhas++;
      } catch (e) {
        console.error("[migrate] falha ao criar campanha", camp.nome, e);
        relog.pulados++;
      }
    }
  }

  return NextResponse.json(relog);
}
