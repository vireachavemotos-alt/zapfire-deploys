// Teste 1: editar copy durante run → mensagens já enviadas iguais,
// próximas usam nova copy.

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

test("editar copy do step 2 durante run — snapshot preserva envios feitos", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");

  const { campanhaId, stepIds } = await seedCampaign(ctx.prisma, {
    nSteps: 2,
    nContatos: 2,
  });

  // Publica v1 e inicia
  const v1 = await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  // Dispatch primeiro step (todos contatos)
  const stats1 = await dispatchDue({ batch: 100 });
  assert.equal(stats1.sent, 2, "step 1 deve ter enviado 2 msgs");
  const textosV1 = evo.calls.map((c) => c.text);
  assert.ok(
    textosV1.every((t) => t.includes("Mensagem 1")),
    "step 1 enviou textos originais"
  );

  // User edita o step 2 e publica nova versão.
  await ctx.prisma.campanhaStep.update({
    where: { id: stepIds[1] },
    data: {
      blocks: JSON.stringify([
        { kind: "text", variations: ["NOVA COPY DO STEP 2"] },
      ]),
    },
  });
  const v2 = await publicarVersao(campanhaId);
  assert.equal(v2.versaoNumero, v1.versaoNumero + 1);

  // Dispatch step 2 — deve usar o SNAPSHOT da versão com que começaram
  // (v1, pq versaoFixada foi setada no iniciar). Isso é "jobs em voo
  // seguem no snapshot anterior" — ponto 23 do request.
  const stats2 = await dispatchDue({ batch: 100 });
  assert.equal(stats2.sent, 2, "step 2 deve ter enviado 2 msgs");

  const textosV2 = evo.calls.slice(2).map((c) => c.text);
  // Como versaoFixada=1, o snapshot do step 2 lido é o da v1 (original).
  // Novas execuções (contatos novos adicionados DEPOIS) usariam v2.
  assert.ok(
    textosV2.every((t) => t.includes("Mensagem 2")),
    `step 2 pros contatos pré-existentes deveria usar snapshot v1 original. Recebeu: ${JSON.stringify(textosV2)}`
  );
});
