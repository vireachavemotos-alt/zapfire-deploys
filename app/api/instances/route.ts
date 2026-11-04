import { NextResponse } from "next/server";
import { fetchInstances, createInstance } from "@/lib/evolution";

export async function GET() {
  try {
    const data = await fetchInstances();
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const instanceName: string | undefined = body.instanceName;
    // `number` opcional (só dígitos). Quando presente, habilita pairing code.
    const numberRaw: string | undefined = body.number;
    if (!instanceName) {
      return NextResponse.json(
        { error: "instanceName obrigatório" },
        { status: 400 }
      );
    }
    const number = numberRaw?.replace(/\D/g, "") || undefined;
    if (numberRaw && (!number || number.length < 10)) {
      return NextResponse.json(
        { error: "Número inválido — use DDI+DDD+número (ex: 5511987654321)" },
        { status: 400 }
      );
    }
    const data = await createInstance(instanceName, number);
    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
