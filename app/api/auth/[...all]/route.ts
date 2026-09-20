import { getAuth, AccountError, accountFailure, boundedJson, requireSameOrigin, requireAccount } from "@/lib/server/auth";
import { limitRoomRequest, requestLimitResponse } from "@/lib/server/request-limits";
import { getAccountDb } from "@/lib/server/account-db";
import { assertDatabaseWritable } from "@/lib/server/rooms";
import { changeAccountPassword } from "@/lib/server/account-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allowed = new Set(["sign-up/email", "sign-in/email", "sign-out", "change-password"]);
async function handle(request: Request) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, "");
    if (!allowed.has(path)) return new Response(null, { status: 404 });
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    {
      requireSameOrigin(request);
      const body = await boundedJson(request);
      if (path === "sign-in/email" || path === "sign-up/email") {
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!email || email.length > 254 || typeof body.password !== "string" || body.password.length > 128) throw new AccountError("invalid_credentials");
        await limitRoomRequest(request, path === "sign-up/email" ? "register" : "login", email);
        if (path === "sign-up/email") await assertDatabaseWritable(await getAccountDb());
        if (path === "sign-up/email" && (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.length > 80)) throw new AccountError("invalid_name");
        // Forward only fields used by this UI; no callback or identity fields.
        const headers = new Headers(request.headers); headers.delete("content-length");
        request = new Request(request.url, { method: "POST", headers, body: JSON.stringify({ email, password: body.password, ...(path === "sign-up/email" ? { name: body.name.trim() } : {}) }) });
      } else if (path === "change-password") {
        const session = await requireAccount(request);
        await limitRoomRequest(request, "login", session.user.id);
        await changeAccountPassword(session.user.id, session.session.token, body.currentPassword, body.newPassword);
        return Response.json({ changed: true }, { headers: { "Cache-Control": "no-store" } });
      } else {
        // Idempotent sign-out also clears an expired session. An expected account
        // prevents an old tab's queued sign-out from ending a newer account.
        const session = await (await getAuth()).api.getSession({ headers: request.headers });
        if (session && request.headers.get("x-fate-account") !== session.user.id) throw new AccountError("account_changed", 409);
        const headers = new Headers(request.headers); headers.delete("content-length");
        request = new Request(request.url, { method: "POST", headers, body: "{}" });
      }
    }
    const response = await (await getAuth()).handler(request);
    response.headers.set("Cache-Control", "no-store");
    if (response.ok && (path === "sign-in/email" || path === "sign-up/email")) {
      const { user } = await response.json();
      return Response.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: response.status, headers: response.headers });
    }
    return response;
  } catch (error) { return requestLimitResponse(error) ?? accountFailure(error); }
}
export const GET = handle;
export const POST = handle;
