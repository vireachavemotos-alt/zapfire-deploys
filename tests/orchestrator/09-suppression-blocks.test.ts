// Teste 9: contato na suppression list → nenhuma mensagem enviada.
// `isSuppressed(telefone)` chamado dentro de dispatch.ts antes do send.

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

test("contato na suppression list não recebe envio", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");
  const { invalidateSuppressionCache } = await import("../../lib/suppression");

  const { campanhaId, contatoIds } = await seedCampaign(ctx.prisma, {
    nSteps: 1,
    nContatos: 3,
  });

  // Bloqueia o primeiro telefone globalmente.
  const bloq = await ctx.prisma.contato.findUnique({
    where: { id: contatoIds[0] },
  });
  await ctx.prisma.contatoBloqueado.create({
    data: {
      telefone: bloq!.telefone,
      motivo: "teste de suppression",
      origem: "manual",
      validoAte: null, // permanente
    },
  });
  invalidateSuppressionCache();

  await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  const stats = await dispatchDue({ batch: 100 });

  // 2 enviados, 1 bloqueado
  assert.equal(stats.sent, 2, `2 contatos enviados (não suppressed)`);
  assert.equal(stats.blocked, 1, `1 bloqueado por suppression`);
  assert.equal(evo.calls.length, 2, "mock chamado 2x apenas");

  // O número bloqueado NÃO está nas calls.
  const chamados = new Set(evo.calls.map((c) => c.number));
  assert.ok(!chamados.has(bloq!.telefone), `${bloq!.telefone} não foi chamado`);

  // CampanhaContato do bloqueado deve estar "bloqueado"
  const cc = await ctx.prisma.campanhaContato.findFirst({
    where: { campanhaId, contatoId: contatoIds[0] },
  });
  assert.equal(cc!.status, "bloqueado");
});
