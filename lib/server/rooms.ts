import { get } from "@vercel/blob";
import { z } from "zod";
import { getSql } from "@/db";
import type {
  RoomEntry,
  RoomEntryType,
  RoomFileData,
  RoomFileUploadRequest,
  RoomParticipant,
  RoomRole,
  RoomSession,
  RoomSnapshot,
  RoomStatus,
} from "@/lib/room-contracts";
import { MAX_ROOM_FILE_BYTES } from "@/lib/room-contracts";
import { createUuid } from "@/lib/fate";

const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

type RoomSql = ReturnType<typeof getSql>;

type AuthRow = {
  id: string;
  roomId: string;
  name: string;
  tokenHash: string;
  role: RoomRole;
  status: RoomStatus;
  createdAt: number | string;
  roomCode: string;
  roomName: string;
  roomCreatedAt: number | string;
};

type EntryRow = {
  id: string;
  type: RoomEntryType;
  body: string;
  dataJson: string;
  actorId: string;
  actorName: string;
  createdAt: number | string;
};

type StoredRoomFileData = RoomFileData & {
  blobUrl: string;
  pathname: string;
};

const roomUploadTokenSchema = z.object({
  version: z.literal(1),
  roomId: z.string().min(1).max(100),
  actorId: z.string().min(1).max(100),
  actorName: z.string().min(1).max(60),
  requestId: z.string().uuid(),
  entryId: z.string().regex(/^entry_[A-Za-z0-9_-]+$/).max(100),
  name: z.string().min(1).max(240),
  contentType: z.string().min(1).max(160),
  size: z.number().int().positive().max(MAX_ROOM_FILE_BYTES),
  pathname: z.string().min(1).max(420),
  createdAt: z.number().int().positive(),
});

let schemaReady: Promise<void> | null = null;

export class RoomHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function rows<T>(result: unknown) {
  return result as T[];
}

function rawRoomDb() {
  try {
    return getSql();
  } catch {
    throw new RoomHttpError("As Mesas estão temporariamente indisponíveis.", 503);
  }
}

async function initializeSchema(sql: RoomSql) {
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      request_id TEXT NOT NULL UNIQUE,
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('gm', 'player')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      request_id TEXT NOT NULL UNIQUE,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS participants_room_idx ON participants(room_id)`,
    sql`CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('roll', 'note', 'rule', 'file')),
      body TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS entries_room_created_idx ON entries(room_id, created_at)`,
  ]);
}

async function getRoomDb() {
  const sql = rawRoomDb();
  schemaReady ??= initializeSchema(sql).catch((error) => {
    schemaReady = null;
    throw error;
  });
  try {
    await schemaReady;
  } catch (error) {
    console.error("room-schema-failed", error);
    throw new RoomHttpError("As Mesas estão temporariamente indisponíveis.", 503);
  }
  return sql;
}

function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "");
}

function secureUniform(outcomes: number) {
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / outcomes) * outcomes;
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample); while (sample[0] >= limit);
  return sample[0] % outcomes;
}

function makeRoomCode() {
  return Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[secureUniform(ROOM_CODE_ALPHABET.length)]).join("");
}

function makeId(prefix: string) {
  return `${prefix}_${createUuid()}`;
}

export async function hashRoomToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findSessionByRequest(sql: RoomSql, requestId: string, tokenHash: string): Promise<RoomSession | null> {
  const result = await sql`
    SELECT p.id AS "participantId", r.code AS "roomCode"
    FROM participants p
    JOIN rooms r ON r.id = p.room_id
    WHERE p.request_id = ${requestId} AND p.token_hash = ${tokenHash}
    LIMIT 1
  `;
  const row = rows<{ participantId: string; roomCode: string }>(result)[0];
  return row ? { roomCode: row.roomCode, participantId: row.participantId, token: "" } : null;
}

export async function createRoom(input: {
  roomName: string;
  personName: string;
  requestId: string;
  token: string;
}) {
  const sql = await getRoomDb();
  const tokenHash = await hashRoomToken(input.token);
  const previous = await findSessionByRequest(sql, input.requestId, tokenHash);
  if (previous) return { ...previous, token: input.token };

  const now = Date.now();
  const roomId = makeId("room");
  const participantId = makeId("member");

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = makeRoomCode();
    try {
      const inserted = await sql`
        WITH inserted_room AS (
          INSERT INTO rooms (id, code, name, request_id, created_at)
          VALUES (${roomId}, ${code}, ${input.roomName}, ${input.requestId}, ${now})
          ON CONFLICT (code) DO NOTHING
          RETURNING id
        )
        INSERT INTO participants
          (id, room_id, name, token_hash, role, status, request_id, created_at, updated_at)
        SELECT ${participantId}, id, ${input.personName}, ${tokenHash}, 'gm', 'approved', ${input.requestId}, ${now}, ${now}
        FROM inserted_room
        RETURNING id
      `;
      if (rows<{ id: string }>(inserted).length) {
        return { roomCode: code, participantId, token: input.token } satisfies RoomSession;
      }
    } catch (error) {
      const replay = await findSessionByRequest(sql, input.requestId, tokenHash).catch(() => null);
      if (replay) return { ...replay, token: input.token };
      console.error("room-create-failed", error);
      throw new RoomHttpError("A Mesa não foi criada. Nada foi salvo; tente novamente.", 503);
    }
  }

  throw new RoomHttpError("Não foi possível criar um código agora. Tente novamente.", 503);
}

export async function joinRoom(input: {
  roomCode: string;
  personName: string;
  requestId: string;
  token: string;
}) {
  const sql = await getRoomDb();
  const tokenHash = await hashRoomToken(input.token);
  const previous = await findSessionByRequest(sql, input.requestId, tokenHash);
  if (previous) return { ...previous, token: input.token };

  const code = cleanCode(input.roomCode);
  const roomResult = await sql`SELECT id FROM rooms WHERE code = ${code} LIMIT 1`;
  const room = rows<{ id: string }>(roomResult)[0];
  if (!room) throw new RoomHttpError("Mesa não encontrada. Confira o código.", 404);

  const countResult = await sql`
    SELECT COUNT(*)::int AS total
    FROM participants
    WHERE room_id = ${room.id} AND status != 'rejected'
  `;
  if (Number(rows<{ total: number }>(countResult)[0]?.total ?? 0) >= 64) {
    throw new RoomHttpError("Esta Mesa atingiu o limite de participantes.", 409);
  }

  const now = Date.now();
  const participantId = makeId("member");
  try {
    const inserted = await sql`
      INSERT INTO participants
        (id, room_id, name, token_hash, role, status, request_id, created_at, updated_at)
      VALUES (${participantId}, ${room.id}, ${input.personName}, ${tokenHash}, 'player', 'pending', ${input.requestId}, ${now}, ${now})
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id
    `;
    if (!rows<{ id: string }>(inserted).length) {
      const replay = await findSessionByRequest(sql, input.requestId, tokenHash);
      if (replay) return { ...replay, token: input.token };
      throw new Error("Join request conflicted.");
    }
  } catch (error) {
    const replay = await findSessionByRequest(sql, input.requestId, tokenHash).catch(() => null);
    if (replay) return { ...replay, token: input.token };
    console.error("room-join-failed", error);
    throw new RoomHttpError("O pedido de entrada não foi salvo. Tente novamente.", 503);
  }

  return { roomCode: code, participantId, token: input.token } satisfies RoomSession;
}

function readCredentials(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const participantId = request.headers.get("x-participant-id")?.trim() ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!participantId || !token) throw new RoomHttpError("Entre novamente nesta Mesa.", 401);
  return { participantId, token };
}

async function authorizeCredentials(participantId: string, token: string, roomCode: string): Promise<AuthRow> {
  const sql = await getRoomDb();
  const tokenHash = await hashRoomToken(token);
  const result = await sql`
    SELECT
      p.id,
      p.room_id AS "roomId",
      p.name,
      p.token_hash AS "tokenHash",
      p.role,
      p.status,
      p.created_at AS "createdAt",
      r.code AS "roomCode",
      r.name AS "roomName",
      r.created_at AS "roomCreatedAt"
    FROM participants p
    JOIN rooms r ON r.id = p.room_id
    WHERE p.id = ${participantId} AND p.token_hash = ${tokenHash} AND r.code = ${cleanCode(roomCode)}
    LIMIT 1
  `;
  const row = rows<AuthRow>(result)[0];
  if (!row) throw new RoomHttpError("Esta entrada não é válida neste dispositivo.", 401);
  return row;
}

async function authorize(request: Request, roomCode: string) {
  const { participantId, token } = readCredentials(request);
  return authorizeCredentials(participantId, token, roomCode);
}

function participantFromRow(row: {
  id: string;
  name: string;
  role: RoomRole;
  status: RoomStatus;
  createdAt: number | string;
}): RoomParticipant {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: Number(row.createdAt),
  };
}

function entryFromRow(row: EntryRow): RoomEntry {
  let data: RoomEntry["data"] = {};
  try {
    const parsed = JSON.parse(row.dataJson) as unknown;
    if (parsed && typeof parsed === "object") data = parsed as RoomEntry["data"];
  } catch {
    data = {};
  }
  if (row.type === "file") {
    const file = data as Partial<StoredRoomFileData>;
    data = {
      name: typeof file.name === "string" && file.name ? file.name : row.body,
      contentType: typeof file.contentType === "string" && file.contentType ? file.contentType : "application/octet-stream",
      size: Number.isFinite(file.size) && Number(file.size) >= 0 ? Number(file.size) : 0,
    } satisfies RoomFileData;
  }
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    data,
    actor: { id: row.actorId, name: row.actorName },
    createdAt: Number(row.createdAt),
  };
}

async function getEntryByRequest(sql: RoomSql, roomId: string, actorId: string, requestId: string) {
  const result = await sql`
    SELECT e.id, e.type, e.body, e.data_json AS "dataJson",
           e.actor_id AS "actorId", p.name AS "actorName", e.created_at AS "createdAt"
    FROM entries e
    JOIN participants p ON p.id = e.actor_id
    WHERE e.room_id = ${roomId} AND e.actor_id = ${actorId} AND e.request_id = ${requestId}
    LIMIT 1
  `;
  const row = rows<EntryRow>(result)[0];
  return row ? entryFromRow(row) : null;
}

function readCursor(value?: string | null) {
  if (!value) return null;
  const match = /^(\d+)\.(entry_[A-Za-z0-9_-]+)$/.exec(value);
  if (!match) throw new RoomHttpError("Página de histórico inválida.", 400);
  return { createdAt: Number(match[1]), id: match[2] };
}

export async function readRoomSnapshot(
  request: Request,
  roomCode: string,
  cursorValue?: string | null,
): Promise<RoomSnapshot> {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  const ownParticipant = participantFromRow(self);

  if (self.status !== "approved") {
    return {
      room: { code: self.roomCode, name: self.roomName, createdAt: Number(self.roomCreatedAt) },
      self: ownParticipant,
      participants: [ownParticipant],
      entries: [],
      nextCursor: null,
    };
  }

  const cursor = readCursor(cursorValue);
  const participantPromise = self.role === "gm"
    ? sql`
        SELECT id, name, role, status, created_at AS "createdAt"
        FROM participants
        WHERE room_id = ${self.roomId} AND status != 'rejected'
        ORDER BY role ASC, created_at ASC
      `
    : sql`
        SELECT id, name, role, status, created_at AS "createdAt"
        FROM participants
        WHERE room_id = ${self.roomId} AND status = 'approved'
        ORDER BY role ASC, created_at ASC
      `;
  const entryPromise = cursor
    ? sql`
        SELECT e.id, e.type, e.body, e.data_json AS "dataJson",
               e.actor_id AS "actorId", p.name AS "actorName", e.created_at AS "createdAt"
        FROM entries e
        JOIN participants p ON p.id = e.actor_id
        WHERE e.room_id = ${self.roomId}
          AND (e.created_at < ${cursor.createdAt} OR (e.created_at = ${cursor.createdAt} AND e.id < ${cursor.id}))
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 101
      `
    : sql`
        SELECT e.id, e.type, e.body, e.data_json AS "dataJson",
               e.actor_id AS "actorId", p.name AS "actorName", e.created_at AS "createdAt"
        FROM entries e
        JOIN participants p ON p.id = e.actor_id
        WHERE e.room_id = ${self.roomId}
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 101
      `;

  const [participantResult, entryResult] = await Promise.all([participantPromise, entryPromise]);
  const descendingEntries = rows<EntryRow>(entryResult).slice(0, 100);
  const oldest = descendingEntries.at(-1);

  return {
    room: { code: self.roomCode, name: self.roomName, createdAt: Number(self.roomCreatedAt) },
    self: ownParticipant,
    participants: rows<{
      id: string;
      name: string;
      role: RoomRole;
      status: RoomStatus;
      createdAt: number | string;
    }>(participantResult).map(participantFromRow),
    entries: descendingEntries.reverse().map(entryFromRow),
    nextCursor: rows<EntryRow>(entryResult).length > 100 && oldest
      ? `${oldest.createdAt}.${oldest.id}`
      : null,
  };
}

export async function addRoomEntry(
  request: Request,
  roomCode: string,
  input:
    | { type: "roll"; requestId: string; modifier: number; label: string }
    | { type: "note"; requestId: string; body: string }
    | { type: "rule"; requestId: string; title: string; reference: string },
) {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  if (self.status !== "approved") throw new RoomHttpError("Aguarde a aprovação do narrador.", 403);

  const previous = await getEntryByRequest(sql, self.roomId, self.id, input.requestId);
  if (previous) return previous;

  let body: string;
  let data: RoomEntry["data"];
  if (input.type === "roll") {
    const dice = Array.from({ length: 4 }, () => secureUniform(3) - 1);
    const total = dice.reduce((sum, die) => sum + die, 0) + input.modifier;
    body = input.label || "Rolagem de Fate";
    data = { dice, modifier: input.modifier, total };
  } else if (input.type === "rule") {
    body = input.title;
    data = { reference: input.reference };
  } else {
    body = input.body;
    data = {};
  }

  const entry: RoomEntry = {
    id: makeId("entry"),
    type: input.type,
    body,
    data,
    actor: { id: self.id, name: self.name },
    createdAt: Date.now(),
  };

  try {
    const inserted = await sql`
      INSERT INTO entries
        (id, room_id, actor_id, request_id, type, body, data_json, created_at)
      VALUES (
        ${entry.id}, ${self.roomId}, ${self.id}, ${input.requestId}, ${entry.type},
        ${entry.body}, ${JSON.stringify(entry.data)}, ${entry.createdAt}
      )
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id
    `;
    if (!rows<{ id: string }>(inserted).length) {
      const replay = await getEntryByRequest(sql, self.roomId, self.id, input.requestId);
      if (replay) return replay;
      throw new Error("Entry request conflicted.");
    }
  } catch (error) {
    const replay = await getEntryByRequest(sql, self.roomId, self.id, input.requestId).catch(() => null);
    if (replay) return replay;
    console.error("room-entry-failed", error);
    throw new RoomHttpError("Nada foi publicado. Tente novamente.", 503);
  }

  return entry;
}

function cleanFileName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 240) || "arquivo";
}

function cleanContentType(value: string) {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)
    ? value.toLowerCase()
    : "application/octet-stream";
}

export async function authorizeRoomFileUpload(
  roomCode: string,
  pathname: string,
  input: RoomFileUploadRequest,
) {
  const sql = await getRoomDb();
  const self = await authorizeCredentials(input.participantId, input.token, roomCode);
  if (self.status !== "approved") throw new RoomHttpError("Aguarde a aprovação do narrador.", 403);

  const expectedPathname = `rooms/${self.roomCode}/${self.id}/${input.requestId}`;
  if (pathname !== expectedPathname) throw new RoomHttpError("Caminho de arquivo inválido.", 400);

  const previous = await getEntryByRequest(sql, self.roomId, self.id, input.requestId);
  if (previous) throw new RoomHttpError("Este arquivo já foi publicado.", 409);

  const countResult = await sql`
    SELECT COUNT(*)::int AS total
    FROM entries
    WHERE room_id = ${self.roomId} AND type = 'file'
  `;
  if (Number(rows<{ total: number }>(countResult)[0]?.total ?? 0) >= 1000) {
    throw new RoomHttpError("Esta Mesa já guardou muitos arquivos.", 409);
  }

  return JSON.stringify({
    version: 1,
    roomId: self.roomId,
    actorId: self.id,
    actorName: self.name,
    requestId: input.requestId,
    entryId: makeId("entry"),
    name: cleanFileName(input.name),
    contentType: cleanContentType(input.contentType),
    size: input.size,
    pathname: expectedPathname,
    createdAt: Date.now(),
  });
}

export async function completeRoomFileUpload(
  blob: { url: string; pathname: string; contentType: string },
  tokenPayload: string | null | undefined,
) {
  const payload = roomUploadTokenSchema.parse(JSON.parse(tokenPayload || "{}"));
  if (blob.pathname !== payload.pathname) throw new Error("Uploaded pathname does not match its token.");

  const sql = await getRoomDb();
  const previous = await getEntryByRequest(sql, payload.roomId, payload.actorId, payload.requestId);
  if (previous) return previous;

  const participantResult = await sql`
    SELECT id, name
    FROM participants
    WHERE id = ${payload.actorId} AND room_id = ${payload.roomId} AND status = 'approved'
    LIMIT 1
  `;
  const participant = rows<{ id: string; name: string }>(participantResult)[0];
  if (!participant) throw new Error("The participant can no longer publish to this room.");

  const storedData: StoredRoomFileData = {
    name: payload.name,
    contentType: cleanContentType(blob.contentType || payload.contentType),
    size: payload.size,
    blobUrl: blob.url,
    pathname: blob.pathname,
  };

  try {
    const inserted = await sql`
      INSERT INTO entries
        (id, room_id, actor_id, request_id, type, body, data_json, created_at)
      VALUES (
        ${payload.entryId}, ${payload.roomId}, ${payload.actorId}, ${payload.requestId}, 'file',
        ${payload.name}, ${JSON.stringify(storedData)}, ${payload.createdAt}
      )
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id
    `;
    if (!rows<{ id: string }>(inserted).length) {
      const replay = await getEntryByRequest(sql, payload.roomId, payload.actorId, payload.requestId);
      if (replay) return replay;
      throw new Error("File request conflicted.");
    }
  } catch (error) {
    const replay = await getEntryByRequest(sql, payload.roomId, payload.actorId, payload.requestId).catch(() => null);
    if (replay) return replay;
    console.error("room-file-failed", error);
    throw error;
  }

  return {
    id: payload.entryId,
    type: "file",
    body: payload.name,
    data: { name: payload.name, contentType: storedData.contentType, size: payload.size },
    actor: { id: payload.actorId, name: participant.name },
    createdAt: payload.createdAt,
  } satisfies RoomEntry;
}

export async function readRoomFileUploadResult(request: Request, roomCode: string, requestId: string) {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  if (self.status !== "approved") throw new RoomHttpError("Aguarde a aprovação do narrador.", 403);
  return getEntryByRequest(sql, self.roomId, self.id, requestId);
}

export async function readRoomFile(request: Request, roomCode: string, entryId: string) {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  if (self.status !== "approved") throw new RoomHttpError("Aguarde a aprovação do narrador.", 403);

  const result = await sql`
    SELECT body, data_json AS "dataJson"
    FROM entries
    WHERE id = ${entryId} AND room_id = ${self.roomId} AND type = 'file'
    LIMIT 1
  `;
  const row = rows<{ body: string; dataJson: string }>(result)[0];
  if (!row) throw new RoomHttpError("Arquivo não encontrado nesta Mesa.", 404);

  let data: Partial<StoredRoomFileData> = {};
  try {
    data = JSON.parse(row.dataJson) as Partial<StoredRoomFileData>;
  } catch {
    throw new RoomHttpError("Este arquivo não pode ser aberto.", 500);
  }
  const location = data.blobUrl || data.pathname;
  if (!location) throw new RoomHttpError("Este arquivo não pode ser aberto.", 500);

  const object = await get(location, { access: "private" });
  if (!object || object.statusCode !== 200) {
    throw new RoomHttpError("Arquivo não encontrado nesta Mesa.", 404);
  }
  return {
    body: object.stream,
    name: cleanFileName(data.name || row.body),
    contentType: cleanContentType(data.contentType || object.blob.contentType || ""),
    size: Number(data.size) || undefined,
  };
}

export async function decideRoomParticipant(
  request: Request,
  roomCode: string,
  participantId: string,
  status: "approved" | "rejected",
) {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  if (self.role !== "gm" || self.status !== "approved") {
    throw new RoomHttpError("Somente o narrador pode aprovar entradas.", 403);
  }

  const targetResult = await sql`
    SELECT id, role
    FROM participants
    WHERE id = ${participantId} AND room_id = ${self.roomId}
    LIMIT 1
  `;
  const target = rows<{ id: string; role: RoomRole }>(targetResult)[0];
  if (!target) throw new RoomHttpError("Participante não encontrado.", 404);
  if (target.role === "gm") throw new RoomHttpError("O narrador não pode ser removido por esta ação.", 400);

  await sql`
    UPDATE participants
    SET status = ${status}, updated_at = ${Date.now()}
    WHERE id = ${participantId} AND room_id = ${self.roomId}
  `;
  return { ok: true };
}
