// Teste 4: lead não responde → follow-up é enviado quando o horário chega.

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

test("sem reply + horário chegou → followup é enviado", async () => {
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
  await ctx.prisma.campanhaStep.update({
    where: { id: stepIds[1] },
    data: { tipo: "followup" },
  });

  await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  // Dispatch step 1
  const r1 = await dispatchDue({ batch: 100 });
  assert.equal(r1.sent, 1);

  // Force agendadoPara pro passado pra simular "horário chegou"
  await ctx.prisma.messageExecution.updateMany({
    where: { campanhaId, stepOriginalId: stepIds[1], status: "pending" },
    data: { agendadoPara: new Date(Date.now() - 1000) },
  });

  // Dispatch de novo — followup deve rodar
  evo.reset();
  const r2 = await dispatchDue({ batch: 100 });
  assert.equal(r2.sent, 1, "followup deveria ter sido enviado");
  assert.equal(evo.calls.length, 1);
  assert.ok(
    evo.calls[0].text.includes("Mensagem 2"),
    `followup enviou texto do step 2. Recebeu: ${evo.calls[0].text}`
  );
});
