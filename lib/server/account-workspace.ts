import { createHash } from "node:crypto";
import { getAccountDb } from "@/lib/server/account-db";
import { AccountError } from "@/lib/server/auth";
import { assertDatabaseWritable, hashRoomToken } from "@/lib/server/rooms";
import { ACCOUNT_IMAGE_LIMIT, roomAccesses, validateWorkspace, workspaceImageIds, type WorkspaceData } from "@/lib/workspace-data";

type AccountSql = Awaited<ReturnType<typeof getAccountDb>>;

export async function accountSnapshot(userId: string, database?: AccountSql) {
  const sql = database ?? await getAccountDb();
  await sql`INSERT INTO fate_account_workspace (user_id) SELECT id FROM fate_user WHERE id = ${userId} ON CONFLICT (user_id) DO NOTHING`;
  const result = await sql`SELECT revision, data_json FROM fate_account_workspace WHERE user_id = ${userId} AND deleting = FALSE`;
  if (!result[0]) throw new AccountError("sign_in_required", 401);
  return { revision: Number(result[0].revision), data: JSON.parse(result[0].data_json) as WorkspaceData };
}
export async function claimAccountRooms(userId: string, data: WorkspaceData, database?: AccountSql) {
  const sql = database ?? await getAccountDb();
  for (const room of roomAccesses(data)) {
    const hash = await hashRoomToken(room.token);
    const result = await sql`
      INSERT INTO fate_account_membership (user_id,participant_id)
      SELECT ${userId},p.id FROM participants p JOIN rooms r ON r.id=p.room_id
      WHERE p.id=${room.participantId} AND p.token_hash=${hash} AND r.code=${room.roomCode}
      AND EXISTS (SELECT 1 FROM fate_account_workspace WHERE user_id=${userId} AND deleting=FALSE)
      ON CONFLICT(participant_id) DO UPDATE SET user_id=fate_account_membership.user_id
      RETURNING user_id`;
    // A deleted table may remain in an old device snapshot, but another account's access is never claimed.
    if (result[0] && result[0].user_id !== userId) throw new AccountError("room_already_linked", 409);
  }
}
export async function saveAccountSnapshot(userId: string, revision: number, input: unknown, database?: AccountSql) {
  const sql = database ?? await getAccountDb();
  let data: WorkspaceData;
  try { data = validateWorkspace(input); } catch { throw new AccountError("workspace_invalid", 400); }
  await assertDatabaseWritable(sql);
  await accountSnapshot(userId, database);
  await claimAccountRooms(userId, data, sql);
  const imageIds = workspaceImageIds(data);
  const images = await sql`SELECT id FROM fate_account_image WHERE user_id=${userId}`;
  if (imageIds.some(id => !images.some(row => row.id === id))) throw new AccountError("upload_images_first", 409);
  const transactions = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"account-images:"+userId}))`,
    sql`UPDATE fate_account_workspace SET revision=revision+1, data_json=${JSON.stringify(data)} WHERE user_id=${userId} AND revision=${revision} AND deleting=FALSE
      AND (SELECT COUNT(*) FROM fate_account_image WHERE user_id=${userId} AND id=ANY(${imageIds}::text[]))=${imageIds.length} RETURNING revision`,
    // Read the committed row under the same lock as uploads and saves. Another
    // device's newly referenced image cannot be collected using a stale list.
    sql`DELETE FROM fate_account_image i USING fate_account_workspace w
      WHERE i.user_id=${userId} AND w.user_id=i.user_id AND i.created_at < ${Date.now()-86400000}
        AND POSITION(i.id IN w.data_json)=0`,
  ]);
  const result = transactions[1];
  if (!result[0]) return { conflict: true, snapshot: await accountSnapshot(userId, database) };
  return { conflict: false, snapshot: { revision: Number(result[0].revision), data } };
}
export async function saveAccountImage(userId: string, id: string, contentType: string, base64: string, database?: AccountSql) {
  if (typeof id !== "string" || typeof contentType !== "string" || typeof base64 !== "string") throw new AccountError("invalid_image");
  if (!/^img_[a-f0-9]{64}$/.test(id) || !["image/png", "image/jpeg", "image/webp"].includes(contentType) || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new AccountError("invalid_image");
  const data = Buffer.from(base64, "base64");
  if (!data.length || data.length > 2_100_000 || `img_${createHash("sha256").update(data).digest("hex")}` !== id) throw new AccountError("invalid_image");
  const signature = contentType === "image/png" ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : contentType === "image/jpeg" ? data[0]===255 && data[1]===216 && data[2]===255
    : data.toString("ascii",0,4)==="RIFF" && data.toString("ascii",8,12)==="WEBP";
  if (!signature) throw new AccountError("invalid_image");
  const sql = database ?? await getAccountDb();
  await assertDatabaseWritable(sql);
  const result = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"account-images:"+userId}))`,
    sql`INSERT INTO fate_account_image (user_id,id,content_type,bytes,data,created_at)
      SELECT ${userId},${id},${contentType},${data.length},decode(${base64},'base64'),${Date.now()}
      WHERE EXISTS (SELECT 1 FROM fate_account_workspace WHERE user_id=${userId} AND deleting=FALSE)
        AND ((SELECT COALESCE(SUM(bytes),0) FROM fate_account_image WHERE user_id=${userId}) + ${data.length} <= ${ACCOUNT_IMAGE_LIMIT}
        OR EXISTS (SELECT 1 FROM fate_account_image WHERE user_id=${userId} AND id=${id}))
      ON CONFLICT(user_id,id) DO UPDATE SET created_at=EXCLUDED.created_at RETURNING id`,
  ]);
  if (!result[1].length) throw new AccountError("account_storage_full", 507);
}
