import { NextResponse } from "next/server";
import { roomCodeSchema, roomDecisionSchema, roomEntrySchema } from "@/lib/room-contracts";
import {
  addRoomEntry,
  deleteRoom,
  decideRoomParticipant,
  readRoomSnapshot,
  RoomHttpError,
} from "@/lib/server/rooms";

type RouteContext = { params: Promise<{ code: string }> };

function failure(error: unknown) {
  if (error instanceof RoomHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error && typeof error === "object" && "issues" in error) {
    return NextResponse.json({ error: "Pedido inválido. Revise os dados." }, { status: 400 });
  }
  console.error("room-detail-route-failed", error);
  return NextResponse.json({ error: "A Mesa não respondeu. Tente novamente." }, { status: 500 });
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const result = await deleteRoom(request, await roomCode(context));
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    return failure(error);
  }
}

async function roomCode(context: RouteContext) {
  const { code } = await context.params;
  return roomCodeSchema.parse(code);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const cursor = new URL(request.url).searchParams.get("before");
    const snapshot = await readRoomSnapshot(request, await roomCode(context), cursor);
    return NextResponse.json(snapshot, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 20_000) throw new RoomHttpError("Pedido grande demais.", 413);
    const input = roomEntrySchema.parse(await request.json());
    const entry = await addRoomEntry(request, await roomCode(context), input);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const input = roomDecisionSchema.parse(await request.json());
    const result = await decideRoomParticipant(
      request,
      await roomCode(context),
      input.participantId,
      input.status,
    );
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
