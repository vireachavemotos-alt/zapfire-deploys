// Teste 5: override por contato (CampanhaContatoOverride) → só aquele
// contato recebe tratamento diferente. Verifica se tabela existe e grava.
//
// NOTA: a dispatch.ts atual ainda NÃO aplica overrides no snapshot (lê
// `snapshot.blocks` direto). Esse teste documenta a INTENÇÃO + confirma
// que a camada de dados aceita o override. Flag como `test.skip` só se
// o override não puder nem ser gravado.

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

test("override por contato: schema aceita + não afeta outros contatos", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");

  const { campanhaId, stepIds, contatoIds } = await seedCampaign(ctx.prisma, {
    nSteps: 1,
    nContatos: 3,
  });

  await publicarVersao(campanhaId);
  await iniciarCampanhaOrquestrada(campanhaId);

  // Pega CampanhaContato do primeiro contato e cria override.
  const cc = await ctx.prisma.campanhaContato.findFirst({
    where: { campanhaId, contatoId: contatoIds[0] },
  });
  assert.ok(cc, "deveria ter CampanhaContato");

  const override = await ctx.prisma.campanhaContatoOverride.create({
    data: {
      campanhaContatoId: cc!.id,
      stepOriginalId: stepIds[0],
      delaySegundos: 999,
      blocksSubstituto: JSON.stringify([
        { kind: "text", variations: ["COPY CUSTOM DO JOÃO"] },
      ]),
    },
  });
  assert.ok(override.id, "override gravado");

  // Dispatch — todos ainda vão rodar (dispatch não lê override ainda).
  // O teste principal aqui é que o override NÃO afetou outros contatos
  // e que o schema não quebrou a execução dos demais.
  const stats = await dispatchDue({ batch: 100 });
  assert.equal(stats.sent, 3, "3 contatos devem ter sido enviados");

  // Verifica que outros contatos receberam a cópia original.
  const outrosTextos = evo.calls
    .filter((c) => !c.number.endsWith("000"))
    .map((c) => c.text);
  assert.ok(
    outrosTextos.every((t) => t.includes("Mensagem 1")),
    "contatos sem override recebem copy original"
  );

  // Dedupe garantido: cada contato só tem 1 envio.
  const uniqueNumbers = new Set(evo.calls.map((c) => c.number));
  assert.equal(uniqueNumbers.size, 3);
});
