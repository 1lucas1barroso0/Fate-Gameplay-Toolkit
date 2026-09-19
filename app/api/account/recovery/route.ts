import { accountFailure, boundedJson, requireAccount, requireSameOrigin } from "@/lib/server/auth";
import { checkAccountPassword, createRecoveryKey, recoverAccount } from "@/lib/server/account-lifecycle";
import { limitRoomRequest, requestLimitResponse } from "@/lib/server/request-limits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireAccount(request);
    await limitRoomRequest(request, "login", session.user.id);
    const body = await boundedJson(request);
    await checkAccountPassword(session.user.id, body.password);
    return Response.json({ key: await createRecoveryKey(session.user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestLimitResponse(error) ?? accountFailure(error); }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await boundedJson(request);
    await limitRoomRequest(request, "login", String(body.email ?? "").trim().toLowerCase());
    await recoverAccount(body.email, body.key, body.password);
    return Response.json({ recovered: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestLimitResponse(error) ?? accountFailure(error); }
}
