// Factories + mock Evolution pros testes do engine orquestrador.
// Usa DB file temporário (SQLite in-memory não funciona bem com Prisma
// migrations). Cada arquivo de teste cria seu próprio DB e limpa no fim.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

export interface TestCtx {
  prisma: PrismaClient;
  dbPath: string;
  dbDir: string;
}

/**
 * Spin up um Prisma Client novo contra um DB SQLite temporário.
 * Aplica o schema via `prisma db push` pra garantir que todas as tabelas
 * do orquestrador existem.
 */
export async function makeTestDb(): Promise<TestCtx> {
  const dbDir = mkdtempSync(join(tmpdir(), "zf-orch-test-"));
  const dbPath = join(dbDir, "test.db");
  const url = `file:${dbPath}`;

  // Aplica schema sem migration (push cria direto).
  execSync(
    `DATABASE_URL="${url}" npx prisma db push --skip-generate --accept-data-loss`,
    { cwd: process.cwd(), stdio: "pipe" }
  );

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  return { prisma, dbPath, dbDir };
}

export async function destroyTestDb(ctx: TestCtx): Promise<void> {
  await ctx.prisma.$disconnect().catch(() => {});
  if (existsSync(ctx.dbDir)) rmSync(ctx.dbDir, { recursive: true, force: true });
}

/**
 * Mock da Evolution API — intercepta `lib/evolution.sendText` via module
 * cache. Retorna o array de capturas pra teste inspecionar.
 *
 * ATENÇÃO: dispatch.ts tem `import { prisma } from "@/lib/db"` fixado.
 * Pra testes injetarem seu Prisma, usamos monkey-patch do db singleton.
 */
export interface EvolutionCall {
  instance: string;
  number: string;
  text: string;
  timestamp: number;
}

export function installEvolutionMock(opts: { failRate?: number } = {}): {
  calls: EvolutionCall[];
  reset: () => void;
  uninstall: () => void;
} {
  const calls: EvolutionCall[] = [];
  const failRate = opts.failRate ?? 0;

  // Carrega o módulo e substitui `sendText`.
  const evoPath = require.resolve("../../lib/evolution");
  const evo = require(evoPath);
  const originalSendText = evo.sendText;

  evo.sendText = async (
    instance: string,
    payload: { number: string; text: string }
  ) => {
    calls.push({
      instance,
      number: payload.number,
      text: payload.text,
      timestamp: Date.now(),
    });
    if (failRate > 0 && Math.random() < failRate) {
      throw new Error("mock: Evolution falhou");
    }
    return { key: { id: `mock-${calls.length}` } };
  };

  return {
    calls,
    reset: () => (calls.length = 0),
    uninstall: () => {
      evo.sendText = originalSendText;
    },
  };
}

/**
 * Monkey-patch do db singleton pra apontar ao nosso Prisma de teste.
 * TEM que ser chamado ANTES de qualquer `import` que use `@/lib/db`.
 */
export function patchDbSingleton(prisma: PrismaClient): () => void {
  const dbPath = require.resolve("../../lib/db");
  const dbMod = require(dbPath);
  const original = dbMod.prisma;
  dbMod.prisma = prisma;
  return () => {
    dbMod.prisma = original;
  };
}

export interface SeedOpts {
  nSteps?: number;
  nContatos?: number;
  nome?: string;
  modo?: "imediato" | "drip";
  instanceName?: string;
  delaySegundosEntreSteps?: number;
  stepTipo?: string; // "message" | "followup"
  stepScheduleMode?: string;
}

/** Cria campanha orchestrator + steps + lista + contatos. Retorna ids. */
export async function seedCampaign(
  prisma: PrismaClient,
  opts: SeedOpts = {}
): Promise<{
  campanhaId: string;
  listaId: string;
  stepIds: string[];
  contatoIds: string[];
}> {
  const {
    nSteps = 2,
    nContatos = 3,
    nome = "Camp Teste",
    instanceName = "inst1",
    delaySegundosEntreSteps = 0,
    stepTipo = "message",
    stepScheduleMode = "immediate",
  } = opts;

  const lista = await prisma.lista.create({
    data: { nome: `Lista ${nome}` },
  });

  const contatoIds: string[] = [];
  for (let i = 0; i < nContatos; i++) {
    const c = await prisma.contato.create({
      data: {
        nome: `Contato ${i}`,
        telefone: `5581900000${String(i).padStart(3, "0")}`,
      },
    });
    await prisma.contatoLista.create({
      data: { listaId: lista.id, contatoId: c.id },
    });
    contatoIds.push(c.id);
  }

  const campanha = await prisma.campanha.create({
    data: {
      nome,
      status: "agendada",
      engine: "orchestrator",
      instanceNames: JSON.stringify([instanceName]),
      listaId: lista.id,
      messages: "[]",
    },
  });

  const stepIds: string[] = [];
  for (let i = 0; i < nSteps; i++) {
    const s = await prisma.campanhaStep.create({
      data: {
        campanhaId: campanha.id,
        posicao: i,
        nome: `Step ${i + 1}`,
        tipo: stepTipo,
        blocks: JSON.stringify([
          { kind: "text", variations: [`Mensagem ${i + 1} de ${nome}`] },
        ]),
        scheduleMode: i === 0 ? "immediate" : stepScheduleMode,
        delaySegundos: i === 0 ? 0 : delaySegundosEntreSteps,
        ativo: true,
      },
    });
    stepIds.push(s.id);
  }

  return { campanhaId: campanha.id, listaId: lista.id, stepIds, contatoIds };
}
