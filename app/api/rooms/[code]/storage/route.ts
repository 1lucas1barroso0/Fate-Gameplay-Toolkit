import { NextResponse } from "next/server";
import { roomCodeSchema } from "@/lib/room-contracts";
import { cleanupRoomOrphanBlobs, RoomHttpError } from "@/lib/server/rooms";

type RouteContext = { params: Promise<{ code: string }> };

function failure(error: unknown) {
  if (error instanceof RoomHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("room-storage-cleanup-failed", error);
  return NextResponse.json({ error: "A limpeza não terminou. Nada referenciado foi apagado." }, { status: 500 });
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const result = await cleanupRoomOrphanBlobs(request, roomCodeSchema.parse(code));
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    return failure(error);
  }
}
