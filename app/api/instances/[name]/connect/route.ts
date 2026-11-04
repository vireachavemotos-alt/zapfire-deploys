import { NextResponse } from "next/server";
import { connectInstance } from "@/lib/evolution";

export async function GET(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    // Query `?number=XXX` habilita o retorno de pairingCode.
    // Sem number, rola fluxo normal só de QR.
    const url = new URL(req.url);
    const raw = url.searchParams.get("number");
    const number = raw ? raw.replace(/\D/g, "") : undefined;
    const data = await connectInstance(params.name, number || undefined);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
