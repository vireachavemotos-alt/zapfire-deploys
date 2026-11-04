import { NextResponse } from "next/server";
import { sendText, sendMedia, sendAudio } from "@/lib/evolution";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      instanceName,
      number,
      type,
      text,
      mediaUrl,
      mediaType,
      caption,
      mimetype,
      fileName,
    } = body;

    if (!instanceName || !number) {
      return NextResponse.json(
        { error: "instanceName e number são obrigatórios" },
        { status: 400 }
      );
    }

    let result;
    switch (type) {
      case "text":
        result = await sendText(instanceName, { number, text });
        break;
      case "image":
      case "video":
      case "document":
        result = await sendMedia(instanceName, {
          number,
          mediatype: mediaType || type,
          mimetype: mimetype || "image/jpeg",
          media: mediaUrl,
          caption,
          fileName,
        });
        break;
      case "audio":
        result = await sendAudio(instanceName, number, mediaUrl);
        break;
      default:
        return NextResponse.json(
          { error: `Tipo "${type}" não suportado` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
