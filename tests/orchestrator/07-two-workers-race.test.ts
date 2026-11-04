// Teste 7: 2 workers chamando dispatchDue em paralelo → só UM envia por
// execução. O claim atômico (`updateMany where status=pending`) deve
// garantir isso.

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

test("2 dispatchDue em paralelo não duplicam envios", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");

  const { campanhaId } = await seedCampaign(ctx.prisma, {
    nSteps: 1,
    nContatos: 5,
  });

  await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  // Dois workers racing.
  const [r1, r2] = await Promise.all([
    dispatchDue({ batch: 100 }),
    dispatchDue({ batch: 100 }),
  ]);

  const totalSent = r1.sent + r2.sent;
  const totalSkipped = r1.skipped + r2.skipped;

  assert.equal(totalSent, 5, `total enviado deveria ser 5 (sem duplicação). Worker1=${r1.sent}, Worker2=${r2.sent}`);

  // Attempts: 5 únicos (um por execution).
  const attempts = await ctx.prisma.messageAttempt.findMany({
    where: { execution: { campanhaId } },
  });
  assert.equal(attempts.length, 5, "exatamente 5 attempts (um por contato)");

  // Mock: 5 chamadas únicas por number.
  const uniqueNumbers = new Set(evo.calls.map((c) => c.number));
  assert.equal(uniqueNumbers.size, 5, "5 numeros únicos chamados");
  assert.equal(evo.calls.length, 5, "exatamente 5 chamadas Evolution");

  // Algum deve ter sido skipped (ou somados = total)
  assert.ok(
    totalSent + totalSkipped >= 5,
    `claims + skips >= 5. sent=${totalSent} skip=${totalSkipped}`
  );
});
