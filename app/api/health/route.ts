import { NextResponse } from "next/server";

export async function GET() {
  const evoUrl = process.env.EVOLUTION_API_URL || "";
  let evoStatus = "desconhecido";
  let evoVersion: string | null = null;

  try {
    const res = await fetch(evoUrl, {
      headers: { apikey: process.env.EVOLUTION_API_KEY || "" },
      cache: "no-store",
    });
    const data = await res.json();
    evoStatus = res.ok ? "ok" : "erro";
    evoVersion = data?.version ?? null;
  } catch {
    evoStatus = "inacessível";
  }

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    evolution: { url: evoUrl, status: evoStatus, version: evoVersion },
  });
}
