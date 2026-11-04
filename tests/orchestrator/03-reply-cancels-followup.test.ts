// Teste 3: lead responde antes do follow-up → follow-up "não respondeu"
// NÃO é enviado (processInboundQueue cancela as execuções futuras).

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

test("reply antes do follow-up cancela MessageExecution tipo followup", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");
  const { processInboundQueue } = await import(
    "../../lib/orchestrator/reply"
  );

  // Step 1: message. Step 2: followup com delay futuro.
  const { campanhaId, stepIds, contatoIds } = await seedCampaign(ctx.prisma, {
    nSteps: 2,
    nContatos: 1,
    delaySegundosEntreSteps: 3600, // follow-up em 1h
    stepTipo: "message",
    stepScheduleMode: "delay",
  });
  // Marcar step 2 como "followup" (seedCampaign cria todos iguais)
  await ctx.prisma.campanhaStep.update({
    where: { id: stepIds[1] },
    data: { tipo: "followup" },
  });

  await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  // Dispatch step 1
  await dispatchDue({ batch: 100 });
  const execFollowupAntes = await ctx.prisma.messageExecution.findFirst({
    where: { campanhaId, stepOriginalId: stepIds[1] },
  });
  assert.ok(execFollowupAntes, "step followup enfileirado");
  assert.equal(execFollowupAntes!.status, "pending");

  // Contato responde.
  const contato = await ctx.prisma.contato.findUnique({
    where: { id: contatoIds[0] },
  });
  await ctx.prisma.inboundMessage.create({
    data: {
      instanceName: "inst1",
      telefone: contato!.telefone,
      texto: "oi, pode falar",
      evolutionMsgId: "wa-reply-1",
    },
  });

  const stats = await processInboundQueue();
  assert.equal(stats.correlacionadas, 1, "deveria correlacionar com contato");
  assert.equal(stats.canceladas, 1, "deveria cancelar 1 followup");

  // Confirma status
  const execFollowupDepois = await ctx.prisma.messageExecution.findUnique({
    where: { id: execFollowupAntes!.id },
  });
  assert.equal(
    execFollowupDepois!.status,
    "canceled",
    "followup deve estar canceled após reply"
  );

  // Dispatch de novo — não deveria enviar nada
  evo.reset();
  const stats2 = await dispatchDue({ batch: 100 });
  assert.equal(stats2.sent, 0, "nenhum envio novo após reply");
  assert.equal(evo.calls.length, 0, "mock Evolution não foi chamado");
});
