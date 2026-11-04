// API da blacklist temporária de números.
//
// GET    /api/blacklist                  → lista geral (até 500), com flag `ativo`
// POST   /api/blacklist  {telefone, motivo?, diasValidade?} → adiciona/refresha (manual)
// DELETE /api/blacklist?telefone=...     → desbloqueia

import { NextResponse } from "next/server";
import {
  listarTodos,
  bloquearNumero,
  desbloquearNumero,
  AUTO_BLOCK_DAYS,
} from "@/lib/blacklist";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listarTodos();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    telefone?: string;
    motivo?: string;
    diasValidade?: number;
  };
  const tel = normalizePhone(body.telefone || "");
  if (!tel) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
  }
  await bloquearNumero({
    telefone: tel,
    motivo: (body.motivo || "bloqueado manualmente").trim(),
    origem: "manual",
    diasValidade: body.diasValidade ?? AUTO_BLOCK_DAYS,
  });
  return NextResponse.json({ ok: true, telefone: tel }, { status: 201 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const telParam = url.searchParams.get("telefone");
  if (!telParam) {
    return NextResponse.json({ error: "telefone obrigatório" }, { status: 400 });
  }
  const tel = telParam.replace(/\D/g, "");
  const ok = await desbloquearNumero(tel);
  if (!ok) {
    return NextResponse.json(
      { error: "Não estava bloqueado" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
