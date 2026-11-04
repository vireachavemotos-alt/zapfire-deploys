import { NextResponse } from "next/server";
import { restartInstance } from "@/lib/evolution";

export async function PUT(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    const data = await restartInstance(params.name);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
