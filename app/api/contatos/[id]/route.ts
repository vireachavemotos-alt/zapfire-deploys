import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatContato<T extends { tags: string | null }>(c: T) {
  const { tags, ...rest } = c;
  let tagsArr: string[] = [];
  if (tags) {
    try {
      const p = JSON.parse(tags);
      if (Array.isArray(p)) tagsArr = p;
    } catch {
      tagsArr = [];
    }
  }
  return { ...rest, tags: tagsArr };
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const c = await prisma.contato.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(formatContato(c));
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const patch: {
    nome?: string | null;
    empresa?: string | null;
    categoria?: string | null;
    tags?: string | null;
    whatsappValido?: boolean | null;
  } = {};

  if ("nome" in body) patch.nome = (body.nome || "").trim() || null;
  if ("empresa" in body) patch.empresa = (body.empresa || "").trim() || null;
  if ("categoria" in body)
    patch.categoria = (body.categoria || "").trim() || null;
  if ("tags" in body)
    patch.tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : null;
  if ("whatsappValido" in body) patch.whatsappValido = body.whatsappValido;

  const updated = await prisma.contato
    .update({ where: { id: params.id }, data: patch })
    .catch(() => null);
  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(formatContato(updated));
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.contato.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
