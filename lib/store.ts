// Store Zustand agora respaldado pelo banco (SQLite via Prisma) através das rotas /api/*.
// - Sem middleware persist: o navegador é só cache em memória.
// - hydrate() é chamado uma vez no mount (StoreHydrator no layout).
// - Mutations são async: disparam fetch e espelham a resposta no state local.

import { create } from "zustand";
import type { MessageBlock } from "./message";

export interface Contato {
  id: string;
  nome: string;
  telefone: string;
  empresa?: string;
  /** Categoria/Negócio — agrupador de alto nível usado pra separar bases de
   *  nichos diferentes ("Negócio A", "Cliente X"). */
  categoria?: string;
  tags?: string[];
  /**
   * Status da validação WhatsApp:
   *  - `undefined` / `null`: ainda não validado
   *  - `true`: número tem conta WhatsApp ativa
   *  - `false`: número inválido (não tem WhatsApp) — runner pula no disparo
   */
  whatsappValido?: boolean | null;
  criadoEm: string;
}

export interface Lista {
  id: string;
  nome: string;
  descricao?: string;
  contatoIds: string[];
  criadaEm: string;
}

export type CampanhaStatus =
  | "rascunho"
  | "agendada"
  | "em_execucao"
  | "pausada"
  | "concluida"
  | "erro";

export interface Campanha {
  id: string;
  nome: string;
  tipo: "text" | "image" | "video" | "document" | "audio" | "multi";
  status: CampanhaStatus;
  instanceNames: string[];
  listaId?: string;
  /** @deprecated — use messages. Mantido só para campanhas antigas. */
  copies?: string[];
  /** Sequência de blocos que serão enviados para cada contato. */
  messages: MessageBlock[];
  /** @deprecated */
  mediaUrl?: string;
  /** @deprecated */
  mediaType?: string;
  /** @deprecated */
  mimetype?: string;
  /** @deprecated */
  caption?: string;
  delayMin: number;
  delayMax: number;
  /** Delay entre blocos para o MESMO contato (ms). */
  delayEntreBlocos?: number;
  limitePorHora: number;
  total: number;
  enviadas: number;
  falhas: number;
  /** ISO string quando a campanha deve começar automaticamente. Null = dispara já. */
  agendadoPara?: string;
  criadaEm: string;
  iniciadaEm?: string;
  concluidaEm?: string;
  resultados?: Array<{ numero: string; status: "ok" | "erro" | "pulado"; detail?: string }>;
  // Drip / programado
  modo?: "imediato" | "drip";
  dripLotePorDia?: number;
  dripDiasSemana?: string;
  dripHoraInicio?: string;
  dripHoraFim?: string;
  dripUltimaDataExecutada?: string;
  // Avaliação pós-conclusão
  rating?: number | null;
  ratingComment?: string | null;
  /** Engine ativo: 'legacy' (runner clássico) ou 'orchestrator'. */
  engine?: "legacy" | "orchestrator";
  versaoAtual?: number;
}

interface AppStore {
  contatos: Contato[];
  listas: Lista[];
  campanhas: Campanha[];

  /** true após hydrate() ter rodado com sucesso ao menos uma vez. */
  hydrated: boolean;
  /** erro da última tentativa de hydrate (se houver). */
  hydrateError: string | null;

  hydrate: () => Promise<void>;
  reloadContatos: () => Promise<void>;
  reloadListas: () => Promise<void>;
  reloadCampanhas: () => Promise<void>;

  addContato: (
    c: Omit<Contato, "id" | "criadoEm">
  ) => Promise<{ contato: Contato | null; duplicate: boolean; error?: string }>;
  addContatos: (
    list: Array<Omit<Contato, "id" | "criadoEm">>,
    opts?: {
      /** Categoria aplicada a todos os contatos da leva (sobrescreve individual). */
      categoria?: string;
      /** Se passado, cria uma lista nova com todos os contatos da leva. */
      criarLista?: { nome: string; descricao?: string };
      /** Se true, sobrescreve nome/empresa/categoria dos telefones duplicados.
       *  Default false mantém o comportamento legado (só cria novos). */
      atualizarExistentes?: boolean;
    }
  ) => Promise<{
    adicionados: number;
    duplicados: number;
    invalidos: number;
    categoriaAplicada?: string | null;
    atualizados?: number;
    listaCriada?: { id: string; nome: string } | null;
  }>;
  /** Prévia sem persistir: conta quantos seriam novos/duplicados/inválidos
   *  antes de confirmar a importação. */
  previewContatos: (
    list: Array<Omit<Contato, "id" | "criadoEm">>
  ) => Promise<{ total: number; novos: number; duplicados: number; invalidos: number }>;
  /** Atualiza campos de um contato existente (nome, empresa, categoria, tags). */
  updateContato: (
    id: string,
    patch: Partial<Pick<Contato, "nome" | "empresa" | "categoria" | "tags" | "whatsappValido">>
  ) => Promise<Contato | null>;
  removeContato: (id: string) => Promise<void>;
  /** Apaga múltiplos contatos de uma vez. Retorna quantos foram removidos. */
  removeContatosBulk: (ids: string[]) => Promise<{ contatosRemovidos: number; vinculosRemovidos: number }>;
  clearContatos: () => Promise<void>;

  addLista: (l: Omit<Lista, "id" | "criadaEm">) => Promise<Lista>;
  updateLista: (id: string, patch: Partial<Lista>) => Promise<void>;
  removeLista: (id: string) => Promise<void>;

  addCampanha: (c: Omit<Campanha, "id" | "criadaEm">) => Promise<Campanha>;
  updateCampanha: (id: string, patch: Partial<Campanha>) => Promise<void>;
  removeCampanha: (id: string) => Promise<void>;
  pauseCampanha: (id: string) => Promise<void>;
  resumeCampanha: (id: string) => Promise<void>;

  /**
   * Valida via Evolution todos os números da lista. Ao terminar, sincroniza
   * `whatsappValido` nos contatos em memória. Retorna stats pra UI.
   */
  validateListaNumeros: (
    listaId: string,
    instanceName: string
  ) => Promise<{
    total: number;
    validos: number;
    invalidos: number;
    erroRede: boolean;
  }>;
}

// Re-export pra manter compatibilidade com imports existentes.
export { normalizePhone, formatPhoneBR } from "./phone";

// ───── DTO → shape interno (normaliza datas / nomes de campos)

interface ContatoDTO {
  id: string;
  nome: string | null;
  telefone: string;
  empresa: string | null;
  categoria: string | null;
  tags: string[];
  whatsappValido?: boolean | null;
  criadoEm: string;
}
function fromContatoDTO(c: ContatoDTO): Contato {
  return {
    id: c.id,
    whatsappValido: c.whatsappValido ?? null,
    nome: c.nome || "",
    telefone: c.telefone,
    empresa: c.empresa || undefined,
    categoria: c.categoria || undefined,
    tags: c.tags && c.tags.length ? c.tags : undefined,
    criadoEm: c.criadoEm,
  };
}

interface ListaDTO {
  id: string;
  nome: string;
  descricao: string | null;
  contatoIds: string[];
  criadaEm: string;
}
function fromListaDTO(l: ListaDTO): Lista {
  return {
    id: l.id,
    nome: l.nome,
    descricao: l.descricao || undefined,
    contatoIds: l.contatoIds,
    criadaEm: l.criadaEm,
  };
}

interface CampanhaDTO {
  id: string;
  nome: string;
  status: string;
  instanceNames: string[];
  listaId: string | null;
  messages: MessageBlock[];
  delayMin: number;
  delayMax: number;
  delayEntreBlocos: number;
  limitePorHora: number;
  total: number;
  enviadas: number;
  falhas: number;
  resultados?: Array<{ numero: string; status: "ok" | "erro" | "pulado"; detail?: string }>;
  agendadoPara: string | null;
  criadaEm: string;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  modo?: "imediato" | "drip";
  dripLotePorDia?: number;
  dripDiasSemana?: string;
  dripHoraInicio?: string;
  dripHoraFim?: string;
  dripUltimaDataExecutada?: string;
  rating?: number | null;
  ratingComment?: string | null;
}
function fromCampanhaDTO(c: CampanhaDTO): Campanha {
  return {
    id: c.id,
    nome: c.nome,
    tipo: c.messages.length === 1 && c.messages[0].kind === "text" ? "text" : "multi",
    status: (c.status as CampanhaStatus) || "rascunho",
    instanceNames: c.instanceNames,
    listaId: c.listaId || undefined,
    messages: c.messages,
    delayMin: c.delayMin,
    delayMax: c.delayMax,
    delayEntreBlocos: c.delayEntreBlocos,
    limitePorHora: c.limitePorHora,
    total: c.total,
    enviadas: c.enviadas,
    falhas: c.falhas,
    agendadoPara: c.agendadoPara || undefined,
    criadaEm: c.criadaEm,
    iniciadaEm: c.iniciadaEm || undefined,
    concluidaEm: c.concluidaEm || undefined,
    resultados: c.resultados,
    modo: c.modo,
    dripLotePorDia: c.dripLotePorDia,
    dripDiasSemana: c.dripDiasSemana,
    dripHoraInicio: c.dripHoraInicio,
    dripHoraFim: c.dripHoraFim,
    dripUltimaDataExecutada: c.dripUltimaDataExecutada,
    rating: c.rating ?? null,
    ratingComment: c.ratingComment ?? null,
  };
}

// ───── Helpers de fetch (erros viram exceções com mensagem útil)

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export const useStore = create<AppStore>()((set, get) => ({
  contatos: [],
  listas: [],
  campanhas: [],
  hydrated: false,
  hydrateError: null,

  hydrate: async () => {
    try {
      // Contatos paginados — pegamos até 50k de uma vez pra popular a store.
      // Base maior que isso é raro; se acontecer, trocar pra paginação server-side
      // na página de contatos (lista/disparo sempre resolve pela lista.contatos).
      const [contatosResp, listasResp, campanhasResp] = await Promise.all([
        jsonFetch<{
          total: number;
          items: ContatoDTO[];
        }>("/api/contatos?limit=50000"),
        jsonFetch<ListaDTO[]>("/api/listas"),
        jsonFetch<CampanhaDTO[]>("/api/campanhas"),
      ]);
      set({
        contatos: contatosResp.items.map(fromContatoDTO),
        listas: listasResp.map(fromListaDTO),
        campanhas: campanhasResp.map(fromCampanhaDTO),
        hydrated: true,
        hydrateError: null,
      });
    } catch (err) {
      set({ hydrateError: (err as Error).message, hydrated: true });
    }
  },

  reloadContatos: async () => {
    const resp = await jsonFetch<{ items: ContatoDTO[] }>(
      "/api/contatos?limit=50000"
    );
    set({ contatos: resp.items.map(fromContatoDTO) });
  },
  reloadListas: async () => {
    const resp = await jsonFetch<ListaDTO[]>("/api/listas");
    set({ listas: resp.map(fromListaDTO) });
  },
  reloadCampanhas: async () => {
    const resp = await jsonFetch<CampanhaDTO[]>("/api/campanhas");
    set({ campanhas: resp.map(fromCampanhaDTO) });
  },

  addContato: async (c) => {
    try {
      const resp = await jsonFetch<{
        contato: ContatoDTO;
        duplicate?: boolean;
      }>("/api/contatos", {
        method: "POST",
        body: JSON.stringify({
          nome: c.nome,
          telefone: c.telefone,
          empresa: c.empresa,
          categoria: c.categoria,
          tags: c.tags,
        }),
      });
      const novo = fromContatoDTO(resp.contato);
      if (resp.duplicate) {
        // Já existia — não re-adiciona; só garante que está no cache.
        set((s) =>
          s.contatos.some((x) => x.id === novo.id)
            ? s
            : { contatos: [novo, ...s.contatos] }
        );
        return { contato: novo, duplicate: true };
      }
      set((s) => ({ contatos: [novo, ...s.contatos] }));
      return { contato: novo, duplicate: false };
    } catch (err) {
      return {
        contato: null,
        duplicate: false,
        error: (err as Error).message,
      };
    }
  },

  addContatos: async (list, opts) => {
    // Sem try/catch aqui — deixa o erro borbulhar pro chamador, que tem
    // contexto pra mostrar toast com a mensagem exata.
    const resp = await jsonFetch<{
      adicionados: number;
      duplicados: number;
      invalidos: number;
      categoriaAplicada?: string | null;
      atualizados?: number;
      listaCriada?: { id: string; nome: string } | null;
    }>("/api/contatos", {
      method: "POST",
      body: JSON.stringify({
        bulk: list,
        categoria: opts?.categoria,
        criarLista: opts?.criarLista,
        atualizarExistentes: opts?.atualizarExistentes,
      }),
    });
    // Recarrega o cache — bulk insert não retorna os contatos individualmente.
    // Recarrega TAMBÉM se criou lista ou atualizou campos de existentes.
    if (resp.adicionados > 0 || resp.atualizados || resp.listaCriada) {
      await get().reloadContatos();
      if (resp.listaCriada) {
        await get().reloadListas();
      }
    }
    return resp;
  },

  previewContatos: async (list) => {
    return jsonFetch<{
      total: number;
      novos: number;
      duplicados: number;
      invalidos: number;
    }>("/api/contatos", {
      method: "POST",
      body: JSON.stringify({ bulk: list, preview: true }),
    });
  },

  updateContato: async (id, patch) => {
    const body: Record<string, unknown> = {};
    if ("nome" in patch) body.nome = patch.nome;
    if ("empresa" in patch) body.empresa = patch.empresa;
    if ("categoria" in patch) body.categoria = patch.categoria;
    if ("tags" in patch) body.tags = patch.tags;
    if ("whatsappValido" in patch) body.whatsappValido = patch.whatsappValido;
    try {
      const resp = await jsonFetch<ContatoDTO>(`/api/contatos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const atualizado = fromContatoDTO(resp);
      set((s) => ({
        contatos: s.contatos.map((c) => (c.id === id ? atualizado : c)),
      }));
      return atualizado;
    } catch {
      return null;
    }
  },

  removeContato: async (id) => {
    await jsonFetch(`/api/contatos/${id}`, { method: "DELETE" });
    set((s) => ({
      contatos: s.contatos.filter((c) => c.id !== id),
      // Remove o contato de todas as listas em cache (o DB já fez cascade).
      listas: s.listas.map((l) => ({
        ...l,
        contatoIds: l.contatoIds.filter((x) => x !== id),
      })),
    }));
  },

  removeContatosBulk: async (ids) => {
    if (ids.length === 0) return { contatosRemovidos: 0, vinculosRemovidos: 0 };
    const res = await jsonFetch<{
      contatosRemovidos: number;
      vinculosRemovidos: number;
    }>("/api/contatos", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });
    const idSet = new Set(ids);
    set((s) => ({
      contatos: s.contatos.filter((c) => !idSet.has(c.id)),
      listas: s.listas.map((l) => ({
        ...l,
        contatoIds: l.contatoIds.filter((x) => !idSet.has(x)),
      })),
    }));
    return res;
  },

  clearContatos: async () => {
    await jsonFetch("/api/contatos", {
      method: "DELETE",
      headers: { "x-confirm-delete-all": "yes" },
    });
    set((s) => ({
      contatos: [],
      listas: s.listas.map((l) => ({ ...l, contatoIds: [] })),
    }));
  },

  addLista: async (l) => {
    const resp = await jsonFetch<ListaDTO>("/api/listas", {
      method: "POST",
      body: JSON.stringify({
        nome: l.nome,
        descricao: l.descricao,
        contatoIds: l.contatoIds,
      }),
    });
    const nova = fromListaDTO(resp);
    set((s) => ({ listas: [nova, ...s.listas] }));
    return nova;
  },
  updateLista: async (id, patch) => {
    const resp = await jsonFetch<ListaDTO>(`/api/listas/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        nome: patch.nome,
        descricao: patch.descricao,
        contatoIds: patch.contatoIds,
      }),
    });
    const updated = fromListaDTO(resp);
    set((s) => ({
      listas: s.listas.map((l) => (l.id === id ? updated : l)),
    }));
  },
  removeLista: async (id) => {
    await jsonFetch(`/api/listas/${id}`, { method: "DELETE" });
    set((s) => ({ listas: s.listas.filter((l) => l.id !== id) }));
  },

  addCampanha: async (c) => {
    const resp = await jsonFetch<CampanhaDTO>("/api/campanhas", {
      method: "POST",
      body: JSON.stringify({
        nome: c.nome,
        status: c.status,
        instanceNames: c.instanceNames,
        listaId: c.listaId,
        messages: c.messages,
        delayMin: c.delayMin,
        delayMax: c.delayMax,
        delayEntreBlocos: c.delayEntreBlocos,
        limitePorHora: c.limitePorHora,
        total: c.total,
        agendadoPara: c.agendadoPara,
        iniciadaEm: c.iniciadaEm,
        modo: c.modo,
        dripLotePorDia: c.dripLotePorDia,
        dripDiasSemana: c.dripDiasSemana,
        dripHoraInicio: c.dripHoraInicio,
        dripHoraFim: c.dripHoraFim,
      }),
    });
    const nova = fromCampanhaDTO(resp);
    set((s) => ({ campanhas: [nova, ...s.campanhas] }));
    return nova;
  },
  updateCampanha: async (id, patch) => {
    // Monta payload apenas com campos conhecidos.
    const body: Record<string, unknown> = {};
    const keys: Array<keyof Campanha> = [
      "nome",
      "status",
      "instanceNames",
      "messages",
      "delayMin",
      "delayMax",
      "delayEntreBlocos",
      "limitePorHora",
      "total",
      "enviadas",
      "falhas",
      "resultados",
      "agendadoPara",
      "iniciadaEm",
      "concluidaEm",
      "modo",
      "dripLotePorDia",
      "dripDiasSemana",
      "dripHoraInicio",
      "dripHoraFim",
      "rating",
      "ratingComment",
    ];
    for (const k of keys) {
      if (k in patch) body[k] = patch[k];
    }
    const resp = await jsonFetch<CampanhaDTO>(`/api/campanhas/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const updated = fromCampanhaDTO(resp);
    set((s) => ({
      campanhas: s.campanhas.map((c) => (c.id === id ? updated : c)),
    }));
  },
  removeCampanha: async (id) => {
    await jsonFetch(`/api/campanhas/${id}`, { method: "DELETE" });
    set((s) => ({ campanhas: s.campanhas.filter((c) => c.id !== id) }));
  },

  pauseCampanha: async (id) => {
    const resp = await jsonFetch<CampanhaDTO>(`/api/campanhas/${id}/pause`, {
      method: "POST",
    });
    const updated = fromCampanhaDTO(resp);
    set((s) => ({
      campanhas: s.campanhas.map((c) => (c.id === id ? updated : c)),
    }));
  },
  resumeCampanha: async (id) => {
    const resp = await jsonFetch<CampanhaDTO>(`/api/campanhas/${id}/resume`, {
      method: "POST",
    });
    const updated = fromCampanhaDTO(resp);
    set((s) => ({
      campanhas: s.campanhas.map((c) => (c.id === id ? updated : c)),
    }));
  },

  validateListaNumeros: async (listaId, instanceName) => {
    const stats = await jsonFetch<{
      total: number;
      validos: number;
      invalidos: number;
      erroRede: boolean;
    }>(`/api/listas/${listaId}/validate-numbers`, {
      method: "POST",
      body: JSON.stringify({ instanceName }),
    });
    // Recarrega contatos pra refletir os novos `whatsappValido`.
    // (A lista de contatos costuma ser enxuta; se crescer muito, trocar por
    //  um endpoint de "get por IDs" e fazer merge local.)
    await get().reloadContatos();
    return stats;
  },
}));
