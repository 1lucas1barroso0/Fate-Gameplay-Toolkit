import { NextResponse } from "next/server";
import { limitRoomRequest, requestLimitResponse } from "@/lib/server/request-limits";
import { createRoomSchema, joinRoomSchema } from "@/lib/room-contracts";
import { createRoom, joinRoom, RoomHttpError } from "@/lib/server/rooms";
import { AccountError, accountFailure, requireAccount, requireSameOrigin } from "@/lib/server/auth";
import { accountSnapshot, claimAccountRooms } from "@/lib/server/account-workspace";

function failure(error: unknown) {
  if (error instanceof AccountError) return accountFailure(error);
  const limited = requestLimitResponse(error);
  if (limited) return limited;
  if (error instanceof RoomHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("room-route-failed", error);
  return NextResponse.json({ error: "A Mesa não respondeu. Tente novamente." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const account = request.headers.has("x-fate-account") ? (requireSameOrigin(request), await requireAccount(request)) : null;
    if (account) await accountSnapshot(account.user.id);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 20_000) throw new RoomHttpError("Pedido grande demais.", 413);
    const body = await request.json();
    if (body?.action === "create") {
      const input = createRoomSchema.parse(body);
      await limitRoomRequest(request, "create", input.token);
      const session = await createRoom(input, account?.user.id);
      if (account) await claimAccountRooms(account.user.id, { "fate-gameplay-toolkit.room-session.v1": JSON.stringify(session) });
      return NextResponse.json({ session }, { status: 201 });
    }
    if (body?.action === "join") {
      const input = joinRoomSchema.parse(body);
      await limitRoomRequest(request, "join", input.token);
      const session = await joinRoom(input, account?.user.id);
      if (account) await claimAccountRooms(account.user.id, { "fate-gameplay-toolkit.room-session.v1": JSON.stringify(session) });
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
