import { NextResponse } from "next/server";
import { getConnectionState } from "@/lib/evolution";

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const data = await getConnectionState(params.name);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
