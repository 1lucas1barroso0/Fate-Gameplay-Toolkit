import { NextResponse } from "next/server";
import { roomCodeSchema, roomFileRequestSchema } from "@/lib/room-contracts";
import { readRoomFileUploadResult, RoomHttpError } from "@/lib/server/rooms";

type RouteContext = { params: Promise<{ code: string }> };

function failure(error: unknown) {
  if (error instanceof RoomHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error && typeof error === "object" && "issues" in error) {
    return NextResponse.json({ error: "Arquivo inválido. Tente novamente." }, { status: 400 });
  }
  console.error("room-file-status-failed", error);
  return NextResponse.json({ error: "O arquivo não foi publicado. Tente novamente." }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const { requestId } = roomFileRequestSchema.parse({
      requestId: new URL(request.url).searchParams.get("requestId"),
    });
    const entry = await readRoomFileUploadResult(request, roomCodeSchema.parse(code), requestId);
    if (!entry) return NextResponse.json({ pending: true }, { status: 202 });
    return NextResponse.json({ entry }, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    return failure(error);
  }
}
