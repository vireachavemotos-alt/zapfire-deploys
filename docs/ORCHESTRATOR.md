# Orquestrador de Campanhas — Modelo de Dados

Documento vivo do runner novo (`engine = "orchestrator"`). O runner
legacy (`engine = "legacy"`, default) permanece intocado — qualquer
campanha criada hoje continua rodando com `Campanha.messages` JSON e
`lib/campaign-runner.ts`.

## Visão de alto nível

```
Campanha ─┬─ CampanhaStep[]        (DRAFT editável — timeline da UI)
          ├─ CampanhaVersao[]      ─┬─ CampanhaStepSnapshot[]  (snapshot imutável)
          │                         └─ MessageExecution[]      (fila de envios)
          ├─ CampanhaContato[]     ─┬─ CampanhaContatoOverride[]  (customização individual)
          │                         └─ MessageExecution[]
          └─ CampanhaAudit[]       (trilha de edições)

InboundMessage              (buffer de respostas recebidas via webhook Evolution)
MessageAttempt              (tentativas reais no Evolution — N por execution)
ContatoBloqueado (já existia)   (suppression list global, reusada)
```

## Tabelas, uma a uma

| Tabela | O que guarda |
|--------|--------------|
| `Campanha` (coluna nova: `engine`, `versaoAtual`) | metadados da campanha, flag de qual runner usar |
| `CampanhaStep` | step editável (draft) — o que o usuário mexe na UI |
| `CampanhaVersao` | marco imutável; cada publicação cria uma |
| `CampanhaStepSnapshot` | cópia congelada do step dentro de uma versão |
| `CampanhaContato` | cursor por contato (step atual, respondeu?, próximo envio) |
| `CampanhaContatoOverride` | sobrescrita por contato de um step específico |
| `MessageExecution` | 1 linha = "contato X executa step Y na versão N"; UNIQUE evita duplicata |
| `MessageAttempt` | tentativa real de envio (retry = nova attempt na mesma execution) |
| `InboundMessage` | mensagem recebida de contato — dispara avaliação de follow-up |
| `CampanhaAudit` | log de edições (quem, o quê, antes/depois, versão) |

## Draft vs Snapshot — a regra de ouro

O usuário edita `CampanhaStep` (draft). Quando ele clica "publicar" (ou
quando o sistema promove automaticamente após mudanças), a aplicação:

1. incrementa `Campanha.versaoAtual`
2. cria uma `CampanhaVersao` com o novo número
3. copia o estado atual dos `CampanhaStep` pra `CampanhaStepSnapshot`
   (um por step, apontando pra nova versão)
4. logra o diff em `CampanhaAudit`

**Jobs em voo (MessageExecution já existentes) não mudam** — eles
apontam pra `snapshotId` e `versaoNumero` fixados no momento em que
foram criados. Jobs futuros nascem já na versão nova.

## Como um envio nasce

1. Usuário publica campanha com N contatos.
2. Pra cada contato, cria `CampanhaContato` (status `pendente`).
3. Scheduler avalia primeiros steps e cria `MessageExecution` por
   `(campanhaContato × step 0 × versaoAtual)` com `agendadoPara = agora`.
4. Worker pega execution `pending` cujo `agendadoPara <= now`, muda
   status pra `running` dentro de uma transação (SKIP LOCKED via
   `BEGIN IMMEDIATE` no SQLite).
5. Lê o `CampanhaStepSnapshot` (congelado) + aplica
   `CampanhaContatoOverride` (se existir) pra montar o payload final.
6. Chama Evolution → cria `MessageAttempt` com `evolutionMsgId`.
7. Atualiza `MessageExecution.status` pra `sent`.
8. Avalia próximo step: se existe e condições batem, cria próxima
   `MessageExecution` com `agendadoPara = now + delaySegundos`.

## Como uma edição ao vivo flui

- Usuário muda texto do step 3 enquanto 5000 contatos tão em execução.
- UI faz PATCH no `CampanhaStep`.
- Backend grava, loga audit, decide se publica versão nova:
  - mudanças cosméticas (nome): sem versão nova
  - mudanças de conteúdo/schedule/condição: nova `CampanhaVersao`,
    novos snapshots.
- MessageExecutions já criadas pra step 3 em versões antigas
  continuam **inalteradas** (pointer imutável pro snapshot antigo).
- Novas MessageExecutions (criadas após o publish) usam o snapshot
  novo. Para contatos ainda não processados no step 3, isso significa:
  o próximo envio recebe o texto atualizado.

## Follow-up condicional

Steps podem ter `tipo = "branch_reply"` / `branch_no_reply` com
`dependeDoStepId` apontando pro step pai. Quando `InboundMessage`
chega:

1. Correlaciona por telefone + janela temporal (via `campanhaContatoId`).
2. Marca `CampanhaContato.respondeuEm = now`.
3. Cancela `MessageExecution` futuras do branch `no_reply` que ainda
   não rodaram (status `canceled`).
4. Agenda execuções do branch `reply`.

## Suppression

`ContatoBloqueado` continua sendo a única fonte de verdade. Antes de
cada envio, worker consulta `ContatoBloqueado.telefone` e, se existir
com `validoAte > now` ou `validoAte IS NULL`, marca execution como
`blocked` e segue.

## Idempotência

`MessageExecution` tem `@@unique([campanhaId, campanhaContatoId,
stepOriginalId, versaoNumero])`. Dois workers tentando criar a mesma
execution → um ganha, outro bate em constraint. Pré-send checa também
se o status ainda é `pending`/`scheduled` antes de disparar — se outro
worker já flipou pra `running`/`sent`, aborta sem efeito colateral.

Para o caso raro de "Evolution aceitou mas DB caiu antes de gravar":
reconciliação por `evolutionMsgId` em `MessageAttempt` recupera o
estado (ver `arch_runtime.md` — gerenciado fora deste doc).

## Overrides por contato

`CampanhaContatoOverride` tem (`campanhaContatoId`, `stepOriginalId`) UNIQUE.
Qualquer campo não-nulo sobrescreve o snapshot do step. Permite:

- `delaySegundos` diferente só pra UM contato
- texto diferente (`blocksSubstituto`)
- desligar aquele step pra aquele contato (`ativo = false`)

Sem clonar a campanha, sem versionar.

## Backfill

Campanhas legadas migram via `scripts/backfill-steps.ts` (opt-in,
nunca automático). Converte `messages` JSON em N `CampanhaStep` + cria
Versão 1 com snapshots + flipa `engine` pra `orchestrator`. Campanhas
em execução **não** devem ser migradas sem pausar.
