import { NextResponse } from "next/server";
import { roomCodeSchema } from "@/lib/room-contracts";
import { clearRoomHistoryBefore, RoomHttpError, streamRoomHistory } from "@/lib/server/rooms";

type RouteContext = { params: Promise<{ code: string }> };

function failure(error: unknown) {
  if (error instanceof RoomHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("room-history-route-failed", error);
  return NextResponse.json({ error: "O Histórico da Mesa não respondeu." }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const stream = await streamRoomHistory(request, roomCodeSchema.parse(code));
    return new Response(stream, {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-disposition": `attachment; filename="historico-${code.toLowerCase()}.jsonl"`,
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const body = await request.json() as { before?: unknown };
    const before = Number(body.before);
    const result = await clearRoomHistoryBefore(request, roomCodeSchema.parse(code), before);
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    return failure(error);
  }
}
