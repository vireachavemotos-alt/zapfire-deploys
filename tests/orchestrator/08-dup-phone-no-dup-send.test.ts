// Teste 8: lista com telefone duplicado → contato não recebe disparo
// duplicado. `Contato.telefone @unique` já impede o dup; o teste
// verifica que seedar com 2 inputs com o mesmo telefone resulta em UM
// único CampanhaContato e UM único envio.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  makeTestDb,
  destroyTestDb,
  installEvolutionMock,
  patchDbSingleton,
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

test("telefone duplicado na lista = 1 contato, 1 envio", async () => {
  const { publicarVersao } = await import("../../lib/orchestrator/plan");
  const { iniciarCampanhaOrquestrada } = await import(
    "../../lib/orchestrator/enqueue"
  );
  const { dispatchDue } = await import("../../lib/orchestrator/dispatch");

  const lista = await ctx.prisma.lista.create({ data: { nome: "L" } });

  // Mesmo telefone — segundo insert vai dar @unique conflict.
  const c1 = await ctx.prisma.contato.create({
    data: { telefone: "5581911111111", nome: "A" },
  });
  await ctx.prisma.contatoLista.create({
    data: { listaId: lista.id, contatoId: c1.id },
  });

  // Tentativa de "duplicar" no DB falharia pelo @unique; validamos.
  await assert.rejects(
    ctx.prisma.contato.create({
      data: { telefone: "5581911111111", nome: "B" },
    }),
    /unique|Unique/i,
    "schema deve rejeitar telefone duplicado"
  );

  // Vincular o mesmo contato 2x na mesma lista também falha pelo @@id
  // composto (contatoId+listaId) — mas o seed já cria só 1.

  const camp = await ctx.prisma.campanha.create({
    data: {
      nome: "C",
      status: "agendada",
      engine: "orchestrator",
      instanceNames: JSON.stringify(["inst1"]),
      listaId: lista.id,
      messages: "[]",
    },
  });
  await ctx.prisma.campanhaStep.create({
    data: {
      campanhaId: camp.id,
      posicao: 0,
      nome: "Step 1",
      tipo: "message",
      blocks: JSON.stringify([{ kind: "text", variations: ["oi"] }]),
      scheduleMode: "immediate",
      delaySegundos: 0,
      ativo: true,
    },
  });

  await publicarVersao(camp.id);

  // Chamar iniciar DUAS vezes também não duplica (UNIQUE em CampanhaContato +
  // MessageExecution).
  await iniciarCampanhaOrquestrada(camp.id);
  await iniciarCampanhaOrquestrada(camp.id);

  const ccs = await ctx.prisma.campanhaContato.findMany({
    where: { campanhaId: camp.id },
  });
  assert.equal(ccs.length, 1, "só 1 CampanhaContato");

  const execs = await ctx.prisma.messageExecution.findMany({
    where: { campanhaId: camp.id },
  });
  assert.equal(execs.length, 1, "só 1 MessageExecution");

  await dispatchDue({ batch: 100 });
  assert.equal(evo.calls.length, 1, "só 1 envio Evolution");
});
