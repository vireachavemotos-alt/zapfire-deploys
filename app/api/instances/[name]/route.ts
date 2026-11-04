import { NextResponse } from "next/server";
import { logoutInstance, deleteInstance } from "@/lib/evolution";

export async function DELETE(
  _req: Request,
  { params }: { params: { name: string } }
) {
  try {
    await logoutInstance(params.name).catch(() => null);
    const data = await deleteInstance(params.name);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
