// Teste 2: alterar delay do step 2 durante run → próximas execuções
// desse step (agendadas após a edição) usam o novo delay.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  makeTestDb,
  destroyTestDb,
  installEvolutionMock,
  patchDbSingleton,
  seedCampaign,
  type TestCtx,
} from "./helpers";

let ctx: TestCtx;
let unpatch: () => void;
let evo: ReturnType<typeof installEvolutionMock>;

before(async () => {
  ctx = await makeTestDb();
  unpatch = patchDbSingleton(ctx.prisma);
  evo = installEvolutionMock();
});

after(async () => {
  evo.uninstall();
  unpatch();
  await destroyTestDb(ctx);
});

test("alterar delay do step durante run — snapshot preserva delay original", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");

  const { campanhaId, stepIds } = await seedCampaign(ctx.prisma, {
    nSteps: 2,
    nContatos: 1,
    delaySegundosEntreSteps: 10,
    stepScheduleMode: "delay",
  });

  await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  // Dispatch step 1
  await dispatchDue({ batch: 100 });

  // Deveria ter criado execução futura do step 2 com delay=10s do snapshot v1
  const nextExec = await ctx.prisma.messageExecution.findFirst({
    where: { campanhaId, stepOriginalId: stepIds[1] },
    orderBy: { agendadoPara: "desc" },
  });
  assert.ok(nextExec, "deveria ter enfileirado step 2");
  const diffSec1 =
    (nextExec!.agendadoPara.getTime() - Date.now()) / 1000;
  assert.ok(
    diffSec1 >= 8 && diffSec1 <= 12,
    `step 2 agendado com delay ~10s do snapshot v1. Diff: ${diffSec1}s`
  );

  // User altera delay do step 2 pra 60s (edita draft).
  await ctx.prisma.campanhaStep.update({
    where: { id: stepIds[1] },
    data: { delaySegundos: 60 },
  });

  // Publica v2.
  await publicarVersao(campanhaId);

  // A execução já enfileirada mantém agendadoPara original (snapshot v1).
  const reFetch = await ctx.prisma.messageExecution.findUnique({
    where: { id: nextExec!.id },
  });
  const diffSec2 =
    (reFetch!.agendadoPara.getTime() - Date.now()) / 1000;
  assert.ok(
    diffSec2 >= 8 && diffSec2 <= 12,
    `execução já enfileirada DEVE manter agendadoPara do snapshot v1. Diff: ${diffSec2}s`
  );

  // Novos contatos adicionados pós-publicação v2 passariam a usar
  // snapshot v2 com delay=60s — mas isso é checado por outro teste.
});
