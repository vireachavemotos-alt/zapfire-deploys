import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

type ContatoIn = {
  nome?: string;
  telefone: string;
  empresa?: string;
  categoria?: string;
  tags?: string[];
};

// GET /api/contatos?q=...&categoria=...&page=1&limit=50
// `limit` máximo é 50.000 — o hydrate do client puxa tudo de uma vez pra
// popular a store. Para bases muito grandes, paginar no client via ?page=.
//
// `categoria` filtra por agrupador de negócio. Valores especiais:
//   - "__sem__" → contatos sem categoria
//   - vazio/ausente → todos
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const categoriaParam = url.searchParams.get("categoria");
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(
    50000,
    Math.max(1, Number(url.searchParams.get("limit") || 50))
  );

  // Compõe where: q (busca livre) + filtro por categoria
  const conditions: Record<string, unknown>[] = [];
  if (q) {
    conditions.push({
      OR: [
        { nome: { contains: q } },
        { telefone: { contains: q.replace(/\D/g, "") } },
        { empresa: { contains: q } },
        { categoria: { contains: q } },
      ],
    });
  }
  if (categoriaParam) {
    if (categoriaParam === "__sem__") {
      conditions.push({ categoria: null });
    } else {
      conditions.push({ categoria: categoriaParam });
    }
  }
  const where = conditions.length === 0 ? {} : { AND: conditions };

  const [total, contatos] = await Promise.all([
    prisma.contato.count({ where }),
    prisma.contato.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    items: contatos.map(formatContato),
  });
}

// POST /api/contatos
//   Single: { nome, telefone, empresa, categoria, tags }
//   Bulk:   { bulk: ContatoIn[], categoria?: string, criarLista?: { nome: string, descricao?: string } }
//
// `categoria` no top-level do bulk é aplicada a TODOS os itens da leva
// (sobrescreve o categoria individual). Útil quando o usuário escolhe
// "Importar como Negócio X" e não quer preencher coluna no CSV.
//
// `criarLista` opcional: se passado, depois do insert cria uma lista nova
// com TODOS os contatos da leva (incluindo duplicados que já existiam, pra
// que o usuário tenha a leva inteira agrupada).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as
    | ContatoIn
    | {
        bulk: ContatoIn[];
        categoria?: string;
        criarLista?: { nome: string; descricao?: string };
      };

  if ("bulk" in body && Array.isArray(body.bulk)) {
    // Opções novas sem quebrar callers antigos:
    //  - preview=true  → só conta {total,novos,duplicados,invalidos}, NÃO salva
    //  - atualizarExistentes=true → sobrescreve nome/empresa/categoria dos
    //    telefones duplicados; default (false) mantém o comportamento
    //    atual de só criar os novos
    const extra = body as {
      preview?: boolean;
      atualizarExistentes?: boolean;
    };
    return bulkInsert(
      body.bulk,
      (body.categoria || "").trim() || undefined,
      body.criarLista,
      { preview: !!extra.preview, atualizarExistentes: !!extra.atualizarExistentes }
    );
  }

  const input = body as ContatoIn;
  const tel = normalizePhone(input.telefone || "");
  if (!tel) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }

  const existing = await prisma.contato.findUnique({ where: { telefone: tel } });
  if (existing) {
    return NextResponse.json(
      { duplicate: true, contato: formatContato(existing) },
      { status: 200 }
    );
  }

  const created = await prisma.contato.create({
    data: {
      nome: (input.nome || "").trim() || null,
      telefone: tel,
      empresa: (input.empresa || "").trim() || null,
      categoria: (input.categoria || "").trim() || null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
    },
  });

  return NextResponse.json({ contato: formatContato(created) }, { status: 201 });
}

async function bulkInsert(
  list: ContatoIn[],
  categoriaGlobal?: string,
  criarLista?: { nome: string; descricao?: string },
  opts: { preview?: boolean; atualizarExistentes?: boolean } = {}
) {
  // Pre-fetch: telefones existentes pra dedup + categoria atual deles (pra
  // saber se precisamos atualizar quando categoriaGlobal vier).
  const existingRows = await prisma.contato.findMany({
    select: { id: true, telefone: true, categoria: true },
  });
  const byPhone = new Map(existingRows.map((r) => [r.telefone, r]));

  let invalidos = 0;
  let duplicados = 0;
  const idsParaLista: string[] = []; // ids de TODOS desta leva (novos + duplicados)
  // Em modo "atualizar existentes" guardamos nome/empresa/categoria novos.
  const toUpdate: Array<{
    id: string;
    nome?: string | null;
    empresa?: string | null;
    categoria?: string | null;
  }> = [];
  const toCreate: Array<{
    nome: string | null;
    telefone: string;
    empresa: string | null;
    categoria: string | null;
    tags: string | null;
  }> = [];
  const seenInThisBatch = new Set<string>();

  for (const c of list) {
    const tel = normalizePhone(c.telefone || "");
    if (!tel) {
      invalidos++;
      continue;
    }
    if (seenInThisBatch.has(tel)) {
      duplicados++;
      continue;
    }
    seenInThisBatch.add(tel);

    const cat =
      (categoriaGlobal || c.categoria || "").trim() || undefined;
    const existing = byPhone.get(tel);

    if (existing) {
      duplicados++;
      idsParaLista.push(existing.id);
      if (opts.atualizarExistentes) {
        // Sobrescreve nome/empresa/categoria (só os campos vindos não-vazios).
        const upd: {
          id: string;
          nome?: string | null;
          empresa?: string | null;
          categoria?: string | null;
        } = { id: existing.id };
        const nomeNovo = (c.nome || "").trim();
        const empresaNovo = (c.empresa || "").trim();
        if (nomeNovo) upd.nome = nomeNovo;
        if (empresaNovo) upd.empresa = empresaNovo;
        if (cat) upd.categoria = cat;
        if (upd.nome || upd.empresa || upd.categoria) toUpdate.push(upd);
      } else if (cat && !existing.categoria) {
        // Comportamento legado: só preenche categoria vazia.
        toUpdate.push({ id: existing.id, categoria: cat });
      }
      continue;
    }

    toCreate.push({
      nome: (c.nome || "").trim() || null,
      telefone: tel,
      empresa: (c.empresa || "").trim() || null,
      categoria: cat || null,
      tags: c.tags ? JSON.stringify(c.tags) : null,
    });
  }

  // Modo preview: devolve só a contagem, não grava nada.
  if (opts.preview) {
    return NextResponse.json({
      preview: true,
      total: list.length,
      novos: toCreate.length,
      duplicados,
      invalidos,
    });
  }

  // Insere novos e captura ids
  if (toCreate.length > 0) {
    const created = await prisma.$transaction(
      toCreate.map((d) => prisma.contato.create({ data: d }))
    );
    for (const r of created) idsParaLista.push(r.id);
  }

  // Atualiza existentes — campos variam conforme modo (categoria-only
  // legado ou nome/empresa/categoria no modo "atualizar existentes").
  if (toUpdate.length > 0) {
    await prisma.$transaction(
      toUpdate.map((u) => {
        const data: Record<string, string | null> = {};
        if (u.nome !== undefined) data.nome = u.nome;
        if (u.empresa !== undefined) data.empresa = u.empresa;
        if (u.categoria !== undefined) data.categoria = u.categoria;
        return prisma.contato.update({ where: { id: u.id }, data });
      })
    );
  }

  // Cria lista automática se pedido
  let listaCriada: { id: string; nome: string } | null = null;
  if (criarLista && criarLista.nome.trim() && idsParaLista.length > 0) {
    const lista = await prisma.lista.create({
      data: {
        nome: criarLista.nome.trim(),
        descricao: criarLista.descricao?.trim() || null,
      },
    });
    await prisma.$transaction(
      idsParaLista.map((cid) =>
        prisma.contatoLista.create({
          data: { listaId: lista.id, contatoId: cid },
        })
      )
    );
    listaCriada = { id: lista.id, nome: lista.nome };
  }

  return NextResponse.json({
    adicionados: toCreate.length,
    duplicados,
    invalidos,
    categoriaAplicada: categoriaGlobal || null,
    atualizados: toUpdate.length,
    listaCriada,
  });
}

// DELETE /api/contatos
//   - Com body { ids: [...] } → apaga apenas esses contatos (e os vínculos de lista).
//   - Sem body, com header x-confirm-delete-all: yes → apaga TODOS.
export async function DELETE(req: Request) {
  // Tenta ler body JSON. Se não vier, cai no modo "delete-all".
  const body = await req.json().catch(() => null) as { ids?: unknown } | null;

  if (body && Array.isArray(body.ids)) {
    const ids = body.ids.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Lista de ids vazia" },
        { status: 400 }
      );
    }
    // Remove vínculos de lista primeiro (FK onDelete: Cascade já cuidaria,
    // mas fazemos explícito pra retornar o count).
    const [listasDel, contatosDel] = await prisma.$transaction([
      prisma.contatoLista.deleteMany({ where: { contatoId: { in: ids } } }),
      prisma.contato.deleteMany({ where: { id: { in: ids } } }),
    ]);
    return NextResponse.json({
      contatosRemovidos: contatosDel.count,
      vinculosRemovidos: listasDel.count,
    });
  }

  // Modo delete-all — requer header explícito.
  const confirm = req.headers.get("x-confirm-delete-all");
  if (confirm !== "yes") {
    return NextResponse.json(
      { error: "Confirmação ausente (header x-confirm-delete-all: yes) ou body { ids }" },
      { status: 400 }
    );
  }
  const [contatosDel, listasDel] = await prisma.$transaction([
    prisma.contato.deleteMany({}),
    prisma.contatoLista.deleteMany({}),
  ]);
  return NextResponse.json({
    contatosRemovidos: contatosDel.count,
    vinculosRemovidos: listasDel.count,
  });
}

// Formata saída: tags sai como array.
function formatContato<T extends { tags: string | null }>(c: T) {
  const { tags, ...rest } = c;
  let tagsArr: string[] = [];
  if (tags) {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) tagsArr = parsed;
    } catch {
      tagsArr = [];
    }
  }
  return { ...rest, tags: tagsArr };
}
