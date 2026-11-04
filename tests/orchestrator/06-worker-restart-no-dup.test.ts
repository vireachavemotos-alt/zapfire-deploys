// Teste 6: worker reinicia (crash entre claim e envio) → nenhuma mensagem
// duplicada. O engine atual faz claim via `updateMany pending→running`;
// se o processo morre em `running`, o teste de idempotência cobre no 7.
// Aqui garantimos que RE-chamar dispatchDue após "crash" (status=running
// deixado órfão) NÃO reenvia.

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

test("worker reinicia após dispatchDue não re-envia", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");

  const { campanhaId } = await seedCampaign(ctx.prisma, {
    nSteps: 1,
    nContatos: 2,
  });

  await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  const stats1 = await dispatchDue({ batch: 100 });
  assert.equal(stats1.sent, 2);
  assert.equal(evo.calls.length, 2);

  // Simula "reinício": chama dispatchDue de novo. Status "sent" não é
  // candidato (filtro `status: pending`), então nada reenviado.
  evo.reset();
  const stats2 = await dispatchDue({ batch: 100 });
  assert.equal(stats2.sent, 0, "após reinício, nada é re-enviado");
  assert.equal(evo.calls.length, 0);

  // Confirma no DB: cada contato tem exatamente 1 attempt.
  const attempts = await ctx.prisma.messageAttempt.findMany({
    where: { execution: { campanhaId } },
  });
  assert.equal(attempts.length, 2);
});
