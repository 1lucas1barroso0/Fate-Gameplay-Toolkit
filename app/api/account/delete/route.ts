import { accountFailure, boundedJson, requireAccount, requireSameOrigin } from "@/lib/server/auth";
import { checkAccountPassword, deleteAccountData } from "@/lib/server/account-lifecycle";
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
    return Response.json(await deleteAccountData(session.user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestLimitResponse(error) ?? accountFailure(error); }
}
