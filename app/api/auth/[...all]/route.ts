import { getAuth, accountFailure, boundedJson, requireSameOrigin, requireAccount } from "@/lib/server/auth";
import { limitRoomRequest, requestLimitResponse } from "@/lib/server/request-limits";
import { getAccountDb } from "@/lib/server/account-db";
import { assertDatabaseWritable } from "@/lib/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allowed = new Set(["sign-up/email", "sign-in/email", "sign-out", "get-session", "change-password"]);
async function handle(request: Request) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
    if (!allowed.has(path)) return new Response(null, { status: 404 });
    if (request.method === "POST") {
      requireSameOrigin(request);
      const body = await boundedJson(request.clone());
      if (path === "sign-in/email" || path === "sign-up/email") {
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "invalid";
        await limitRoomRequest(request, path === "sign-up/email" ? "register" : "login", email);
        if (path === "sign-up/email") await assertDatabaseWritable(await getAccountDb());
        if (path === "sign-up/email" && (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.length > 80)) return Response.json({ code: "invalid_name" }, { status: 400 });
      } else {
        const session = await requireAccount(request);
        await limitRoomRequest(request, path === "change-password" ? "login" : "write", session.user.id);
      }
    }
    const response = await (await getAuth()).handler(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return requestLimitResponse(error) ?? accountFailure(error); }
}
export const GET = handle;
export const POST = handle;
