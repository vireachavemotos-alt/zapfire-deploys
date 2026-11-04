// Seed do pool de frases do aquecimento (chip warming).
//
// Idempotente — usa upsert por `WarmupFrase.texto @unique`. Rodar quantas
// vezes quiser: só insere o que ainda não existe, e reativa (`ativa: true`)
// qualquer frase que o seed cobre.
//
// Rodar:   npx tsx scripts/seed-warmup-frases.ts
//
// 300+ frases variadas (saudacao / pergunta / resposta / geral) em
// português brasileiro. Mistura capitalização, emoji, gírias e "kkk" pra
// soar natural e não dar padrão de bot pra o WhatsApp detectar.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Categoria = "saudacao" | "pergunta" | "resposta" | "geral";

interface Frase {
  texto: string;
  categoria: Categoria;
}

const SAUDACOES: string[] = [
  "oi", "Oi", "Oi!", "oi oi", "Oiê", "oiê", "oieee", "oiiii", "oiii",
  "oi, tudo bem?", "Oi, tudo bem?", "oi tudo bom?", "Oi, tudo bom?",
  "oi, como vc tá?", "Oi, como você tá?", "oi, td bem?", "oi td bom?",
  "Opa", "opa", "Opa!", "opa, tudo bem?", "opa td bem?", "opa, de boa?",
  "e aí", "e aí!", "E aí", "E aí!", "e aí mano", "e aí amigo",
  "E aí, tudo certo?", "e aí tudo certo?", "e aí, tudo bom?", "e aí beleza?",
  "e aí tudo bom contigo?", "E aí tudo bom contigo?", "e aí, novidades?",
  "e aí, sumiu?", "e aí sumido", "E aí sumida",
  "fala comigo", "Fala comigo", "fala aí", "fala tu", "Fala meu amigo",
  "fala comigo, fera", "fala meu rei", "Fala meu rei", "fala, parça",
  "bom dia", "Bom dia", "Bom dia!", "bom diaaa", "Bom dia 👋", "Bom dia ☀️",
  "bom dia, dormiu bem?", "bom dia pra ti", "Bom dia pra você",
  "boa tarde", "Boa tarde", "Boa tarde!", "boa tarde pra ti",
  "boa noite", "Boa noite", "Boa noite!", "boa noite pra ti", "Boa noitee",
  "oi flor", "Oi flor", "oi querida", "Oi querida", "oi amiga", "Oi amiga",
  "oi amigo", "Oi amigo", "oi irmão", "Oi irmã",
  "cheguei", "Cheguei", "cheguei aqui", "to aqui", "tô aqui", "Tô aqui",
  "voltei", "Voltei", "voltei agora", "voltei ao mundo kkk", "tô online",
  "voltei pra terra dos vivos", "voltei do apagão kkk",
  "oi, quanto tempo!", "Oi, quanto tempo!", "oi sumiu?", "oi, sumiu, hein?",
  "oi, quanto tempo, hein", "oi tudo bem? quanto tempo",
  "e aí, cadê vc?", "e aí, de onde cê sumiu?",
];

const PERGUNTAS: string[] = [
  "como foi o dia?", "Como foi o dia?", "como foi aí?", "Como foi aí hoje?",
  "e o dia, como foi?", "o dia foi bom?", "foi bom seu dia?",
  "tudo bem contigo?", "Tudo bem contigo?", "cê tá bem?", "Você tá bem?",
  "tudo tranquilo?", "Tudo tranquilo?", "tá de boa?", "cê tá de boa?",
  "jantou?", "Jantou?", "já jantou?", "jantou já?", "cê jantou?",
  "almoçou?", "Almoçou?", "já almoçou?", "almoçou já?", "o que almoçou?",
  "tomou café?", "Tomou café?", "cê já tomou café?", "comeu alguma coisa?",
  "cê já comeu?", "Já comeu alguma coisa?", "cê comeu já?",
  "viu o jogo ontem?", "Viu o jogo ontem?", "assistiu ao jogo?",
  "viu essa chuva?", "cê viu essa chuva?", "tá chovendo aí?",
  "tá fazendo frio aí?", "aí tá quente?", "cê tá no sol?",
  "tá trabalhando ainda?", "Tá trabalhando ainda?", "trabalhando?",
  "cê saiu do trabalho?", "cê folgou hoje?", "folgou?", "trabalhou muito?",
  "tá em casa?", "Tá em casa?", "cê tá em casa agora?", "chegou em casa?",
  "tá na rua?", "Tá na rua?", "cê tá na rua ainda?",
  "tá dormindo?", "Tá dormindo?", "cê tá acordado?", "Tá acordado?",
  "tá acordada aí?", "ainda tá acordado?", "dormiu já?",
  "cê sumiu, né?", "Cê sumiu, hein?", "cê sumiu de novo", "pq sumiu?",
  "cadê vc?", "Cadê você?", "onde cê tá?", "Onde você tá?",
  "fim de semana foi bom?", "Fim de semana foi bom?", "como foi o fds?",
  "o que vai fazer o fim de semana?", "qual o plano pro fim de semana?",
  "cê vai sair hoje?", "vai sair à noite?", "tem festa esse fds?",
  "cê gosta de pizza?", "cê prefere açaí ou sorvete?", "qual é sua comida favorita?",
  "cê acompanha futebol?", "Cê acompanha futebol?", "qual time cê torce?",
  "cê é vascaíno?", "cê torce pra quem?", "cê é flamenguista?",
  "cê trabalha onde mesmo?", "cê trabalha com o quê?", "em que cê trabalha?",
  "cê é daqui mesmo?", "cê é dessa cidade?", "cê mora onde?",
  "cê viu a notícia hoje?", "viu as notícias?", "viu o que aconteceu?",
  "cê vai no mercado?", "precisa que eu passe aí?", "cê quer alguma coisa?",
  "cê tem tempo pra conversar?", "tá podendo falar?", "pode falar agora?",
  "tá ocupado?", "cê tá ocupado agora?", "pode te mandar uma coisa?",
  "cê recebeu meu áudio?", "cê escutou o áudio?", "viu o que eu te mandei?",
  "cê leu minha mensagem?", "cê viu minha mensagem antes?",
  "quando cê volta?", "cê volta que horas?", "a que horas cê chega?",
];

const RESPOSTAS: string[] = [
  "tudo tranquilo", "Tudo tranquilo", "tudo bem", "Tudo bem", "tudo em paz",
  "tudo bem e você?", "Tudo bem, e você?", "tudo bem, e tu?", "tudo certo",
  "tô bem", "Tô bem", "tô bem, obrigado", "tô bem, obg", "to bem",
  "tô ótimo", "tô ótima", "tô tranquilo", "tô na paz", "tô numa boa",
  "tô de boa", "to de boa", "tô suave", "de boa", "normal",
  "nossa, que legal", "Nossa, que legal!", "nossa que massa", "massa!",
  "que massa", "show", "Show!", "showzão", "demais", "muito bom",
  "sério?", "Sério?", "sério mesmo?", "jura?", "Jura?", "jura mesmo?",
  "não acredito", "Não acredito!", "não acredito nisso", "nossa, nem acredito",
  "kk", "kkk", "kkkk", "kkkkk", "kkkkkk", "hahaha", "haha", "rsrs", "rsrsrs",
  "kkk tô morrendo", "kkk mt bom", "kkkkk pior", "kkk sério?",
  "verdade", "Verdade", "é verdade", "é vdd", "verdade mesmo",
  "eita", "Eita!", "eita nois", "eita pô", "eitaaa",
  "nossaaa", "Nossa", "Nossa!", "nossa senhora", "Nossa Senhora!",
  "poxa", "Poxa", "poxa vida", "poxa que pena", "Poxa que pena",
  "ah entendi", "Ah entendi", "ah tá", "Ah tá!", "ah sim",
  "entendi", "Entendi", "entendi sim", "beleza, entendi",
  "sim claro", "Sim, claro", "claro", "claro que sim", "com certeza",
  "pode ser sim", "Pode ser sim", "pode ser", "topo sim", "topo",
  "tenho sim", "Tenho sim", "tenho não", "não tenho", "tbm não",
  "depende", "Depende", "depende do que for", "ainda vou ver",
  "acho que sim", "Acho que sim", "acho que não", "acho que vou",
  "pode crer", "Pode crer", "cê sabe", "é isso", "é por aí",
  "massa", "Massa!", "muito massa", "massa demais",
  "beleza então", "Beleza então", "beleza", "Beleza", "tá bom",
  "fechou", "Fechou!", "fechado", "Fechado!", "combinado", "Combinado",
  "boa ideia", "Boa ideia", "boa ideia essa", "ótima ideia",
  "concordo", "Concordo", "concordo total", "concordo contigo",
  "exatamente", "Exatamente!", "é isso aí", "É isso aí", "foi isso",
  "essa é boa", "Essa é boa", "essa foi boa", "boa essa",
  "foi mal", "Foi mal!", "foi mal mano", "desculpa", "Desculpa!",
  "me desculpa", "mil perdões", "perdão", "foi sem querer",
  "sem problema", "Sem problema", "sem stress", "numa boa", "numa de boa",
  "tranquilo", "Tranquilo", "deixa pra lá", "tudo certo então",
  "deu tudo certo", "Deu tudo certo!", "deu bom", "deu super certo",
  "nossa que susto", "Nossa que susto", "quase morri kkk",
  "que saudade", "Que saudade", "to com saudade", "saudade de ti",
  "tô com fome", "Tô com fome", "tô morrendo de fome",
  "tô com sono", "Tô com sono", "tô morta de sono", "tô morrendo de sono",
  "tô cansado", "Tô cansado", "to cansada", "muito cansado",
  "vou dormir já já", "vou deitar já já", "vou pra cama já já",
  "amanhã a gente conversa", "Amanhã a gente conversa", "a gente se fala amanhã",
  "boa noite pra ti", "Boa noite pra ti", "boa noite pra vc",
  "beijo", "Beijo", "beijo grande", "beijocas", "beijinhos",
  "abraço", "Abraço", "um abraço", "um abraço grande", "abraço forte",
  "até mais", "Até mais", "até logo", "Até logo", "até depois",
  "tchau", "Tchau", "tchauzinho", "Tchauzinho",
  "flw", "Flw", "flw então", "flw mano", "falou", "Falou", "falou, flw",
];

const GERAIS: string[] = [
  "👍", "👌", "✨", "😊", "🙂", "😂", "🤣", "😅", "🤔", "🙏", "❤️", "🔥",
  "💪", "🫡", "🤝", "😎", "🥹", "🥰", "😴", "☕", "🤗", "🙌", "✅",
  "hmmmm", "hmmm", "humm", "aham", "ahammm", "nhé", "ué", "ual",
  "nossa", "nossa, cara", "caraca", "caraca mano", "mano do céu",
  "pqp", "pqp mano", "pqp véi", "véi", "cara", "mano", "mano véi",
  "ô loco", "ô looooco", "ixiii", "ixi", "deus do céu", "Deus do céu",
  "nossa senhora", "Nossa Senhora", "virgem Maria", "Virgem santa",
  "tô indo no mercado", "to indo no mercado", "to no mercado",
  "comprei um livro novo", "comprei uma coisa aqui", "fui no shopping",
  "tô vendo tv", "tô assistindo um filme", "to vendo série", "to vendo youtube",
  "to tomando um café", "tô tomando café agora", "tô pensando aqui",
  "to no ônibus", "to no uber", "to no trânsito", "to indo pra casa",
  "to na academia", "to voltando da acad", "to no serviço", "to no trampo",
  "cara, que doido", "que coisa doida", "que história doida", "que loucura",
  "mano, que absurdo", "que absurdo cara", "cê acredita?",
  "qualquer coisa me avisa", "Qualquer coisa me avisa", "qualquer coisa chama",
  "qualquer coisa me liga", "qualquer coisa me chama no zap",
  "to te mandando o endereço", "manda o endereço pra mim",
  "to resolvendo umas coisas aqui", "to arrumando a casa",
  "to resolvendo um negócio", "to arrumando um pepino aqui",
  "amanhã a gente conversa", "boa noite então", "até mais ver",
  "tmj", "Tmj", "tmj mano", "tmj irmão",
  "qlqr coisa chama", "qualquer coisa dá um toque", "qualquer coisa fala",
  "manda ver", "Manda ver", "manda bala", "manda brasa",
  "massa demais essa", "massa cara", "muito massa",
  "👊", "👏", "🤙", "🫶", "🫠", "😇", "🤠", "🫣", "🙃",
  "fica tranquilo", "fica tranquila", "deixa comigo", "deixa que eu resolvo",
  "to indo ali rapidinho", "já volto", "volto já já", "já tô voltando",
];

const FRASES: Frase[] = [
  ...SAUDACOES.map((texto) => ({ texto, categoria: "saudacao" as const })),
  ...PERGUNTAS.map((texto) => ({ texto, categoria: "pergunta" as const })),
  ...RESPOSTAS.map((texto) => ({ texto, categoria: "resposta" as const })),
  ...GERAIS.map((texto) => ({ texto, categoria: "geral" as const })),
];

async function main() {
  // Dedup local (caso tenha duplicado nos arrays). Primeiro ganha.
  const seen = new Set<string>();
  const unicas = FRASES.filter((f) => {
    if (seen.has(f.texto)) return false;
    seen.add(f.texto);
    return true;
  });

  let novas = 0;
  let atualizadas = 0;
  for (const f of unicas) {
    const result = await prisma.warmupFrase.upsert({
      where: { texto: f.texto },
      update: { categoria: f.categoria, ativa: true },
      create: { texto: f.texto, categoria: f.categoria, ativa: true },
      select: { id: true, usos: true },
    });
    // `usos` só muda via o dispatcher; aqui só contamos nova vs reativada.
    if (result.usos === 0) novas++;
    else atualizadas++;
  }

  const porCategoria = unicas.reduce<Record<string, number>>((acc, f) => {
    acc[f.categoria] = (acc[f.categoria] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `[seed warmup] ${unicas.length} frases únicas processadas (${novas} criadas/vazias, ${atualizadas} reativadas).`
  );
  console.log(`[seed warmup] por categoria:`, porCategoria);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
