import { authorize, getRoomDb, assertDatabaseWritable, RoomHttpError } from "@/lib/server/rooms";
import { limitRoomRequest, requestLimitResponse } from "@/lib/server/request-limits";
import { roomCodeSchema } from "@/lib/room-contracts";
import { sceneUpdateSchema } from "@/lib/scene";
import type { SceneSnapshot } from "@/lib/scene";

type Context = { params: Promise<{ code: string }> };
let ready: Promise<unknown> | undefined;
async function connection(request: Request, context: Context, write = false) {
  const code = roomCodeSchema.parse((await context.params).code);
  const self = await authorize(request, code);
  if (self.status !== "approved" || (write && self.role !== "gm")) throw new RoomHttpError("Apenas o narrador aprovado pode editar a cena.", 403);
  const sql = await getRoomDb();
  ready ??= sql`CREATE TABLE IF NOT EXISTS room_scenes (
    room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL, scene JSONB, updated_at BIGINT NOT NULL
  )`.catch(error => { ready = undefined; throw error; });
  await ready;
  return { sql, self };
}
function failure(error: unknown) {
  return requestLimitResponse(error) ?? Response.json({ error: error instanceof RoomHttpError ? error.message : "Não foi possível atualizar a cena. Tente novamente." }, {
    status: error instanceof RoomHttpError ? error.status : error && typeof error === "object" && "issues" in error ? 400 : 500,
  });
}
export async function GET(request: Request, context: Context) {
  try {
    const { sql, self } = await connection(request, context);
    const rows = await sql`SELECT revision, scene FROM room_scenes WHERE room_id = ${self.roomId}` as SceneSnapshot[];
    return Response.json(rows[0] ?? { revision: 0, scene: null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    if (Number(request.headers.get("content-length")) > 40000) throw new RoomHttpError("Pedido grande demais.", 413);
    const input = sceneUpdateSchema.parse(await request.json());
    const { sql, self } = await connection(request, context, true);
    await assertDatabaseWritable(sql);
    await limitRoomRequest(request, "write");
    const rows = input.revision === 0 ? await sql`INSERT INTO room_scenes AS current (room_id, revision, scene, updated_at)
      SELECT ${self.roomId}, 1, ${JSON.stringify(input.scene)}::JSONB, ${Date.now()} WHERE ${input.revision} = 0
      ON CONFLICT (room_id) DO UPDATE SET revision = current.revision + 1, scene = ${JSON.stringify(input.scene)}::JSONB, updated_at = ${Date.now()}
      WHERE current.revision = ${input.revision}
      RETURNING revision, scene` : [];
    // Existing scenes with a nonzero revision use a conditional update.
    const updated = input.revision > 0 ? await sql`UPDATE room_scenes SET revision = revision + 1,
      scene = ${JSON.stringify(input.scene)}::JSONB, updated_at = ${Date.now()}
      WHERE room_id = ${self.roomId} AND revision = ${input.revision} RETURNING revision, scene` : rows;
    const result = updated as SceneSnapshot[];
    if (!result.length) return Response.json({ error: "A cena mudou em outra aba. Recarregue antes de salvar.", code: "scene_conflict" }, { status: 409 });
    return Response.json(result[0], { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
