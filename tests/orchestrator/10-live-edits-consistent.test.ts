// Teste 10: múltiplas edits durante run (com milhares de jobs pendentes)
// → sistema consistente, cada execução usa a versão correta.
// Simula edit+publicar várias vezes entre dispatchDue() em sequência.

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

test("múltiplas edits + publishes consecutivos — nenhum envio duplicado, versões crescem", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");

  const { campanhaId, stepIds } = await seedCampaign(ctx.prisma, {
    nSteps: 1,
    nContatos: 10,
  });

  const v1 = await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  // Processa metade.
  const stats1 = await dispatchDue({ batch: 5 });
  assert.equal(stats1.sent, 5);

  // Edita + publica V2.
  await ctx.prisma.campanhaStep.update({
    where: { id: stepIds[0] },
    data: {
      blocks: JSON.stringify([
        { kind: "text", variations: ["V2 editado"] },
      ]),
    },
  });
  const v2 = await publicarVersao(campanhaId);
  assert.equal(v2.versaoNumero, v1.versaoNumero + 1);

  // Edita + publica V3.
  await ctx.prisma.campanhaStep.update({
    where: { id: stepIds[0] },
    data: {
      blocks: JSON.stringify([
        { kind: "text", variations: ["V3 editado"] },
      ]),
    },
  });
  const v3 = await publicarVersao(campanhaId);
  assert.equal(v3.versaoNumero, v1.versaoNumero + 2);

  // Processa o resto.
  const stats2 = await dispatchDue({ batch: 100 });
  assert.equal(stats2.sent, 5, "resto 5 contatos enviados");

  // Total 10 unique, nenhum duplicado.
  const uniqueNumbers = new Set(evo.calls.map((c) => c.number));
  assert.equal(uniqueNumbers.size, 10);
  assert.equal(evo.calls.length, 10);

  // Como versaoFixada=1 (do iniciarCampanhaOrquestrada), todos usam
  // snapshot v1 → texto original. V2/V3 só afetam contatos novos.
  const todosOriginais = evo.calls.every((c) =>
    c.text.includes("Mensagem 1")
  );
  assert.ok(todosOriginais, `jornada iniciada em v1 preserva snapshot v1 pros contatos atuais. Textos: ${JSON.stringify(evo.calls.map(c => c.text).slice(0,3))}`);

  // Versões registradas.
  const totalVersoes = await ctx.prisma.campanhaVersao.count({
    where: { campanhaId },
  });
  assert.equal(totalVersoes, 3);

  // Audit log tem as 3 publicações.
  const audits = await ctx.prisma.campanhaAudit.findMany({
    where: { campanhaId, acao: "versao_publicada" },
  });
  assert.equal(audits.length, 3);
});
