import { getAccountDb } from "@/lib/server/account-db";
import { requireAccount, requireSameOrigin, boundedJson, accountFailure } from "@/lib/server/auth";
import { accountSnapshot, saveAccountImage } from "@/lib/server/account-workspace";
import { limitRoomRequest, requestLimitResponse } from "@/lib/server/request-limits";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { user } = await requireAccount(request), sql = await getAccountDb();
    const id = new URL(request.url).searchParams.get("id");
    const headers = { "Cache-Control": "no-store" };
    if (!id) return Response.json(await sql`SELECT id,bytes FROM fate_account_image WHERE user_id=${user.id}`, { headers });
    const rows = await sql`SELECT id,content_type AS "contentType",encode(data,'base64') AS data FROM fate_account_image WHERE user_id=${user.id} AND id=${id}`;
    return Response.json(rows[0] ?? { code: "image_not_found" }, { status: rows[0] ? 200 : 404, headers });
  } catch (error) { return accountFailure(error); }
}
export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const { user } = await requireAccount(request);
    await limitRoomRequest(request, "upload", user.id);
    const body = await boundedJson(request, 2_850_000);
    await accountSnapshot(user.id);
    await saveAccountImage(user.id, body.id, body.contentType, body.data);
    return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestLimitResponse(error) ?? accountFailure(error); }
}
