export type NumberStatus = "conectado" | "desconectado" | "conectando";

export type WhatsNumber = {
  id: string;
  nome: string;
  numero: string;
  status: NumberStatus;
  enviadasHoje: number;
  limiteDia: number;
  bateria: number;
  avatar: string;
};

export const whatsNumbers: WhatsNumber[] = [
  {
    id: "n1",
    nome: "Comercial SP",
    numero: "+55 11 98877-1122",
    status: "conectado",
    enviadasHoje: 1240,
    limiteDia: 1500,
    bateria: 92,
    avatar: "SP",
  },
  {
    id: "n2",
    nome: "Prospecção RJ",
    numero: "+55 21 99123-5566",
    status: "conectado",
    enviadasHoje: 780,
    limiteDia: 1500,
    bateria: 68,
    avatar: "RJ",
  },
  {
    id: "n3",
    nome: "Atendimento BH",
    numero: "+55 31 98444-7788",
    status: "desconectado",
    enviadasHoje: 0,
    limiteDia: 1200,
    bateria: 0,
    avatar: "BH",
  },
  {
    id: "n4",
    nome: "Aquecimento 01",
    numero: "+55 11 97001-4433",
    status: "conectando",
    enviadasHoje: 32,
    limiteDia: 400,
    bateria: 74,
    avatar: "A1",
  },
  {
    id: "n5",
    nome: "Closer Nacional",
    numero: "+55 11 96555-9090",
    status: "conectado",
    enviadasHoje: 410,
    limiteDia: 1500,
    bateria: 88,
    avatar: "CN",
  },
];

export type CampaignStatus =
  | "rascunho"
  | "agendada"
  | "em_execucao"
  | "concluida"
  | "pausada";

export type Campaign = {
  id: string;
  nome: string;
  tipo: "Prospecção" | "Aquecimento" | "Follow-up";
  status: CampaignStatus;
  total: number;
  enviadas: number;
  entregues: number;
  lidas: number;
  respondidas: number;
  falhas: number;
  criadaEm: string;
  numerosUsados: number;
};

export const campaigns: Campaign[] = [
  {
    id: "c1",
    nome: "Black Friday — Oferta 70%",
    tipo: "Prospecção",
    status: "em_execucao",
    total: 8400,
    enviadas: 3210,
    entregues: 3105,
    lidas: 2280,
    respondidas: 418,
    falhas: 105,
    criadaEm: "2026-04-15",
    numerosUsados: 4,
  },
  {
    id: "c2",
    nome: "Follow-up leads quentes",
    tipo: "Follow-up",
    status: "agendada",
    total: 1240,
    enviadas: 0,
    entregues: 0,
    lidas: 0,
    respondidas: 0,
    falhas: 0,
    criadaEm: "2026-04-17",
    numerosUsados: 2,
  },
  {
    id: "c3",
    nome: "Aquecimento chip novo",
    tipo: "Aquecimento",
    status: "em_execucao",
    total: 300,
    enviadas: 128,
    entregues: 124,
    lidas: 96,
    respondidas: 41,
    falhas: 4,
    criadaEm: "2026-04-16",
    numerosUsados: 1,
  },
  {
    id: "c4",
    nome: "Reativação base fria Q1",
    tipo: "Prospecção",
    status: "concluida",
    total: 5200,
    enviadas: 5200,
    entregues: 4980,
    lidas: 3380,
    respondidas: 612,
    falhas: 220,
    criadaEm: "2026-03-28",
    numerosUsados: 3,
  },
  {
    id: "c5",
    nome: "Rascunho — Infoproduto Lançamento",
    tipo: "Prospecção",
    status: "rascunho",
    total: 0,
    enviadas: 0,
    entregues: 0,
    lidas: 0,
    respondidas: 0,
    falhas: 0,
    criadaEm: "2026-04-18",
    numerosUsados: 0,
  },
  {
    id: "c6",
    nome: "Pós-venda curso online",
    tipo: "Follow-up",
    status: "pausada",
    total: 2100,
    enviadas: 1300,
    entregues: 1244,
    lidas: 900,
    respondidas: 180,
    falhas: 56,
    criadaEm: "2026-04-10",
    numerosUsados: 2,
  },
];

export type Contact = {
  id: string;
  nome: string;
  telefone: string;
  empresa?: string;
  tags: string[];
  criadoEm: string;
};

export const contacts: Contact[] = [
  {
    id: "1",
    nome: "Ana Paula Souza",
    telefone: "+55 11 98877-1122",
    empresa: "Café Aurora",
    tags: ["Lead quente", "SP"],
    criadoEm: "2026-04-10",
  },
  {
    id: "2",
    nome: "Bruno Martins",
    telefone: "+55 21 99223-3445",
    empresa: "Studio Oblíquo",
    tags: ["Infoproduto"],
    criadoEm: "2026-04-11",
  },
  {
    id: "3",
    nome: "Camila Ribeiro",
    telefone: "+55 31 98555-7788",
    empresa: "Ribeiro Advocacia",
    tags: ["B2B"],
    criadoEm: "2026-04-12",
  },
  {
    id: "4",
    nome: "Diego Alencar",
    telefone: "+55 85 99678-2211",
    empresa: "Alencar Arquitetura",
    tags: ["Lead frio"],
    criadoEm: "2026-04-12",
  },
  {
    id: "5",
    nome: "Eduarda Prado",
    telefone: "+55 41 98122-3344",
    empresa: "Prado Cosméticos",
    tags: ["Lead quente", "E-commerce"],
    criadoEm: "2026-04-13",
  },
  {
    id: "6",
    nome: "Felipe Nogueira",
    telefone: "+55 11 99001-8899",
    empresa: "Nogueira Fit",
    tags: ["Academia"],
    criadoEm: "2026-04-14",
  },
  {
    id: "7",
    nome: "Gabriela Costa",
    telefone: "+55 19 98123-4567",
    empresa: "Costa Odontologia",
    tags: ["Saúde"],
    criadoEm: "2026-04-14",
  },
  {
    id: "8",
    nome: "Henrique Dias",
    telefone: "+55 71 98999-1212",
    empresa: "Dias & Filhos",
    tags: ["B2B", "Lead frio"],
    criadoEm: "2026-04-15",
  },
];

export type ContactList = {
  id: string;
  nome: string;
  contatos: number;
  criadaEm: string;
  cor: string;
};

export const lists: ContactList[] = [
  {
    id: "l1",
    nome: "Leads Instagram - Abril",
    contatos: 3240,
    criadaEm: "2026-04-02",
    cor: "#FF0033",
  },
  {
    id: "l2",
    nome: "Base Fria — Clientes 2023",
    contatos: 5200,
    criadaEm: "2026-03-18",
    cor: "#FF1744",
  },
  {
    id: "l3",
    nome: "Carrinho abandonado",
    contatos: 870,
    criadaEm: "2026-04-14",
    cor: "#D50000",
  },
  {
    id: "l4",
    nome: "Webinar 12/04 — Inscritos",
    contatos: 1420,
    criadaEm: "2026-04-12",
    cor: "#FF3355",
  },
];

export const dailyStats = [
  { dia: "Sáb", enviadas: 1240, entregues: 1180 },
  { dia: "Dom", enviadas: 860, entregues: 810 },
  { dia: "Seg", enviadas: 3120, entregues: 2980 },
  { dia: "Ter", enviadas: 4210, entregues: 4055 },
  { dia: "Qua", enviadas: 3890, entregues: 3742 },
  { dia: "Qui", enviadas: 5120, entregues: 4890 },
  { dia: "Sex", enviadas: 4780, entregues: 4612 },
];

export function statusLabel(s: CampaignStatus) {
  return {
    rascunho: "Rascunho",
    agendada: "Agendada",
    em_execucao: "Em execução",
    concluida: "Concluída",
    pausada: "Pausada",
  }[s];
}

export function statusColor(s: CampaignStatus) {
  return {
    rascunho: "text-zinc-400 border-zinc-500/40 bg-zinc-500/10",
    agendada: "text-amber-300 border-amber-400/40 bg-amber-400/10",
    em_execucao: "text-neon border-neon/60 bg-neon/10 shadow-neon-sm",
    concluida: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
    pausada: "text-orange-300 border-orange-400/40 bg-orange-400/10",
  }[s];
}
