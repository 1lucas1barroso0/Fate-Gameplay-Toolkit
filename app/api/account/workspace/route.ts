import { ACCOUNT_DATA_LIMIT } from "@/lib/workspace-data";
import { accountSnapshot, saveAccountSnapshot } from "@/lib/server/account-workspace";
import { requireAccount, requireSameOrigin, boundedJson, accountFailure, AccountError } from "@/lib/server/auth";
import { limitRoomRequest, requestLimitResponse } from "@/lib/server/request-limits";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { user, workspaceRevision } = await requireAccount(request);
    const headers = { "Cache-Control": "no-store" };
    if (workspaceRevision >= 0 && new URL(request.url).searchParams.get("revision") === String(workspaceRevision)) return new Response(null, { status: 204, headers });
    const snapshot = await accountSnapshot(user.id);
    return Response.json(snapshot, { headers });
  } catch (error) { return accountFailure(error); }
}
export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const { user } = await requireAccount(request);
    await limitRoomRequest(request, "write", user.id);
    const body = await boundedJson(request, ACCOUNT_DATA_LIMIT + 10000);
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new AccountError("invalid_request");
    const result = await saveAccountSnapshot(user.id, body.revision, body.data);
    return Response.json(result.snapshot, { status: result.conflict ? 409 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestLimitResponse(error) ?? accountFailure(error); }
}
