import { NextResponse } from "next/server";
import { roomCodeSchema, roomEntryIdSchema } from "@/lib/room-contracts";
import { readRoomFile, RoomHttpError } from "@/lib/server/rooms";

type RouteContext = { params: Promise<{ code: string; entryId: string }> };

function failure(error: unknown) {
  if (error instanceof RoomHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error && typeof error === "object" && "issues" in error) {
    return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  }
  console.error("room-file-download-failed", error);
  return NextResponse.json({ error: "O arquivo não pôde ser aberto." }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { code, entryId } = await context.params;
    const file = await readRoomFile(
      request,
      roomCodeSchema.parse(code),
      roomEntryIdSchema.parse(entryId),
    );
    const headers = new Headers({
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": `attachment; filename="arquivo"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "content-type": file.contentType,
      "x-content-type-options": "nosniff",
    });
    if (file.size !== undefined) headers.set("content-length", String(file.size));
    return new Response(file.body, {
      headers,
    });
  } catch (error) {
    return failure(error);
  }
}
