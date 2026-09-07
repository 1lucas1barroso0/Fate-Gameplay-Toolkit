import { NextResponse } from "next/server";
import { createRoomSchema, joinRoomSchema } from "@/lib/room-contracts";
import { createRoom, joinRoom, RoomHttpError } from "@/lib/server/rooms";

function failure(error: unknown) {
  if (error instanceof RoomHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("room-route-failed", error);
  return NextResponse.json({ error: "A Mesa não respondeu. Tente novamente." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 20_000) throw new RoomHttpError("Pedido grande demais.", 413);
    const body = await request.json();
    if (body?.action === "create") {
      const input = createRoomSchema.parse(body);
      const session = await createRoom(input);
      return NextResponse.json({ session }, { status: 201 });
    }
    if (body?.action === "join") {
      const input = joinRoomSchema.parse(body);
      const session = await joinRoom(input);
      return NextResponse.json({ session }, { status: 201 });
    }
    return NextResponse.json({ error: "Escolha criar ou entrar em uma Mesa." }, { status: 400 });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json({ error: "Revise os campos e tente novamente." }, { status: 400 });
    }
    return failure(error);
  }
}
