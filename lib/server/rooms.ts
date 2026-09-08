import { del, get, head, list } from "@vercel/blob";
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
import {
  MAX_ROOM_FILE_BYTES,
  MAX_ROOM_FILES,
  PROJECT_BLOB_SAFE_BYTES,
  PROJECT_MAX_BLOB_FILES,
  PROJECT_DATABASE_CRITICAL_BYTES,
  PROJECT_DATABASE_WARNING_BYTES,
  ROOM_FILE_BUDGET_BYTES,
  ROOM_FILE_WARNING_BYTES,
  ROOM_HISTORY_BUDGET_BYTES,
  ROOM_HISTORY_WARNING_BYTES,
} from "@/lib/room-contracts";
import { createUuid } from "@/lib/fate";
import {
  BLOB_USAGE_LEDGER_TTL_MS,
  BLOB_USAGE_WINDOW_MS,
  DELETED_ROOM_RESCAN_LIMIT,
  DELETION_TOMBSTONE_TTL_MS,
  PENDING_PARTICIPANT_TTL_MS,
  PROJECT_BLOB_MONTHLY_ADVANCED_OPS,
  PROJECT_BLOB_MONTHLY_SIMPLE_OPS,
  PROJECT_BLOB_MONTHLY_TRANSFER_BYTES,
  REJECTED_PARTICIPANT_TTL_MS,
  UPLOAD_RESERVATION_TTL_MS,
  VERCEL_BLOB_HOBBY_ADVANCED_OPS,
  VERCEL_BLOB_HOBBY_SIMPLE_OPS,
  selectOrphanBlobPathnames,
} from "@/lib/storage-policy";

const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const MAX_ROOM_PARTICIPANTS = 64;
const GLOBAL_BLOB_STORAGE_LOCK = "fate-gameplay-toolkit:blob-storage";
const DELETED_ROOM_RESCAN_DELAYS_MS = [
  0,
  5 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
] as const;

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

type UploadReservationRow = {
  requestId: string;
  roomId: string;
  actorId: string;
  entryId: string;
  pathname: string;
  name: string;
  contentType: string;
  size: number | string;
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
      created_at BIGINT NOT NULL,
      updated_at BIGINT
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
      file_size BIGINT NOT NULL DEFAULT 0,
      blob_pathname TEXT,
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS entries_room_created_idx ON entries(room_id, created_at)`,
    sql`CREATE INDEX IF NOT EXISTS entries_room_created_id_idx ON entries(room_id, created_at, id)`,
    sql`CREATE INDEX IF NOT EXISTS entries_room_type_idx ON entries(room_id, type)`,
    sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at BIGINT`,
    sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS file_size BIGINT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS blob_pathname TEXT`,
    sql`UPDATE rooms SET updated_at = created_at WHERE updated_at IS NULL`,
    sql`UPDATE entries
        SET file_size = COALESCE(NULLIF(data_json::jsonb ->> 'size', '')::BIGINT, 0),
            blob_pathname = NULLIF(data_json::jsonb ->> 'pathname', '')
        WHERE type = 'file' AND (file_size = 0 OR blob_pathname IS NULL)`,
    sql`CREATE TABLE IF NOT EXISTS upload_reservations (
      request_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      pathname TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS upload_reservations_room_idx ON upload_reservations(room_id)`,
    sql`CREATE INDEX IF NOT EXISTS upload_reservations_created_idx ON upload_reservations(created_at)`,
    sql`CREATE TABLE IF NOT EXISTS blob_cleanup_queue (
      pathname TEXT PRIMARY KEY,
      room_code TEXT NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT ''
    )`,
    sql`CREATE INDEX IF NOT EXISTS blob_cleanup_created_idx ON blob_cleanup_queue(created_at)`,
    sql`CREATE INDEX IF NOT EXISTS blob_cleanup_attempt_idx ON blob_cleanup_queue(attempts, created_at)`,
    sql`CREATE TABLE IF NOT EXISTS deleted_rooms (
      code TEXT PRIMARY KEY,
      gm_participant_id TEXT NOT NULL,
      gm_token_hash TEXT NOT NULL,
      deleted_at BIGINT NOT NULL,
      last_scan_at BIGINT NOT NULL DEFAULT 0,
      scan_count INTEGER NOT NULL DEFAULT 0
    )`,
    sql`ALTER TABLE deleted_rooms ADD COLUMN IF NOT EXISTS last_scan_at BIGINT NOT NULL DEFAULT 0`,
    sql`ALTER TABLE deleted_rooms ADD COLUMN IF NOT EXISTS scan_count INTEGER NOT NULL DEFAULT 0`,
    sql`CREATE INDEX IF NOT EXISTS deleted_rooms_deleted_idx ON deleted_rooms(deleted_at)`,
    sql`CREATE INDEX IF NOT EXISTS deleted_rooms_scan_idx ON deleted_rooms(scan_count, last_scan_at)`,
    sql`CREATE TABLE IF NOT EXISTS blob_usage_ledger (
      id TEXT PRIMARY KEY,
      advanced_ops INTEGER NOT NULL DEFAULT 0,
      simple_ops INTEGER NOT NULL DEFAULT 0,
      transfer_bytes BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS blob_usage_ledger_created_idx ON blob_usage_ledger(created_at)`,
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
  // Serverless Functions may end as soon as their response is sent. Awaiting
  // this bounded repair avoids abandoning physical deletions mid-flight.
  try {
    await performBoundedMaintenance(sql);
  } catch (error) {
    // Maintenance is reparative: a transient failure must not break the main
    // read, and its durable queue will be retried by a later request.
    console.error("room-maintenance-failed", error);
  }
  return sql;
}

let lastMaintenanceAt = 0;

async function performBoundedMaintenance(sql: RoomSql) {
  const now = Date.now();
  if (now - lastMaintenanceAt < 60_000) return;
  lastMaintenanceAt = now;
  await sql.transaction([
    sql`DELETE FROM upload_reservations WHERE created_at < ${now - UPLOAD_RESERVATION_TTL_MS}`,
    sql`DELETE FROM participants p
        WHERE p.status = 'rejected'
          AND p.updated_at < ${now - REJECTED_PARTICIPANT_TTL_MS}
          AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.actor_id = p.id)`,
    sql`DELETE FROM participants WHERE status = 'pending' AND updated_at < ${now - PENDING_PARTICIPANT_TTL_MS}`,
    sql`DELETE FROM blob_usage_ledger WHERE created_at < ${now - BLOB_USAGE_LEDGER_TTL_MS}`,
    sql`DELETE FROM deleted_rooms WHERE deleted_at < ${now - DELETION_TOMBSTONE_TTL_MS}`,
  ]);
  await drainBlobCleanupQueue(sql, 2);
  await rescanDeletedRoomBlobs(sql, 1);
}

let databaseUsageCache = { bytes: 0, measuredAt: 0 };

async function databaseUsedBytes(sql: RoomSql, fresh = false) {
  const now = Date.now();
  if (!fresh && databaseUsageCache.measuredAt && now - databaseUsageCache.measuredAt < 60_000) {
    return databaseUsageCache.bytes;
  }
  const result = await sql`SELECT pg_database_size(current_database())::BIGINT AS bytes`;
  const bytes = Number(rows<{ bytes: number | string }>(result)[0]?.bytes ?? 0);
  databaseUsageCache = { bytes, measuredAt: now };
  return bytes;
}

async function assertDatabaseWritable(sql: RoomSql) {
  const bytes = await databaseUsedBytes(sql);
  if (bytes >= PROJECT_DATABASE_CRITICAL_BYTES) {
    throw new RoomHttpError("O armazenamento compartilhado está em nível crítico. Exporte ou limpe dados antigos antes de publicar algo novo.", 507);
  }
  return bytes;
}

type BlobUsage = {
  advancedOps?: number;
  simpleOps?: number;
  transferBytes?: number;
};

type BlobUsageReservation = {
  id: string;
  created: boolean;
};

function normalizedBlobUsage(usage: BlobUsage) {
  return {
    advancedOps: Math.max(0, Math.trunc(usage.advancedOps ?? 0)),
    simpleOps: Math.max(0, Math.trunc(usage.simpleOps ?? 0)),
    transferBytes: Math.max(0, Math.trunc(usage.transferBytes ?? 0)),
  };
}

function blobUsageEventId(prefix: string) {
  return `${prefix}:${createUuid()}`;
}

async function reserveBlobUsage(
  sql: RoomSql,
  usageInput: BlobUsage,
  options: { eventId?: string; maintenance?: boolean } = {},
): Promise<BlobUsageReservation> {
  const usage = normalizedBlobUsage(usageInput);
  const id = options.eventId ?? blobUsageEventId("blob");
  if (!usage.advancedOps && !usage.simpleOps && !usage.transferBytes) {
    return { id, created: false };
  }
  const now = Date.now();
  const cutoff = now - BLOB_USAGE_WINDOW_MS;
  const advancedLimit = options.maintenance
    ? VERCEL_BLOB_HOBBY_ADVANCED_OPS
    : PROJECT_BLOB_MONTHLY_ADVANCED_OPS;
  const simpleLimit = options.maintenance
    ? VERCEL_BLOB_HOBBY_SIMPLE_OPS
    : PROJECT_BLOB_MONTHLY_SIMPLE_OPS;
  const transferLimit = PROJECT_BLOB_MONTHLY_TRANSFER_BYTES;
  const transaction = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${GLOBAL_BLOB_STORAGE_LOCK}))`,
    sql`
      INSERT INTO blob_usage_ledger (id, advanced_ops, simple_ops, transfer_bytes, created_at)
      SELECT ${id}, ${usage.advancedOps}, ${usage.simpleOps}, ${usage.transferBytes}, ${now}
      WHERE
        (SELECT COALESCE(SUM(advanced_ops), 0) FROM blob_usage_ledger WHERE created_at >= ${cutoff})
          + ${usage.advancedOps} <= ${advancedLimit}
        AND (SELECT COALESCE(SUM(simple_ops), 0) FROM blob_usage_ledger WHERE created_at >= ${cutoff})
          + ${usage.simpleOps} <= ${simpleLimit}
        AND (SELECT COALESCE(SUM(transfer_bytes), 0) FROM blob_usage_ledger WHERE created_at >= ${cutoff})
          + ${usage.transferBytes} <= ${transferLimit}
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
  ]);
  if (rows<{ id: string }>(transaction.at(-1)).length) return { id, created: true };
  const previous = await sql`SELECT id FROM blob_usage_ledger WHERE id = ${id} LIMIT 1`;
  if (rows<{ id: string }>(previous).length) return { id, created: false };
  throw new RoomHttpError('O uso gratuito de arquivos está perto do limite seguro. Exporte ou limpe arquivos e tente novamente mais tarde.', 507);
}

async function releaseBlobUsage(sql: RoomSql, reservation: BlobUsageReservation) {
  if (!reservation.created) return;
  await sql`DELETE FROM blob_usage_ledger WHERE id = ${reservation.id}`;
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
  await assertDatabaseWritable(sql);
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
          SELECT ${roomId}, ${code}, ${input.roomName}, ${input.requestId}, ${now}
          WHERE NOT EXISTS (SELECT 1 FROM deleted_rooms WHERE code = ${code})
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
  await assertDatabaseWritable(sql);
  const tokenHash = await hashRoomToken(input.token);
  const previous = await findSessionByRequest(sql, input.requestId, tokenHash);
  if (previous) return { ...previous, token: input.token };

  const code = cleanCode(input.roomCode);
  const roomResult = await sql`SELECT id FROM rooms WHERE code = ${code} LIMIT 1`;
  const room = rows<{ id: string }>(roomResult)[0];
  if (!room) throw new RoomHttpError("Mesa não encontrada. Confira o código.", 404);

  const now = Date.now();
  const participantId = makeId("member");
  try {
    const transaction = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext(${room.id}))`,
      sql`
      INSERT INTO participants
        (id, room_id, name, token_hash, role, status, request_id, created_at, updated_at)
      SELECT ${participantId}, ${room.id}, ${input.personName}, ${tokenHash}, 'player', 'pending', ${input.requestId}, ${now}, ${now}
      WHERE (
        SELECT COUNT(*) FROM participants
        WHERE room_id = ${room.id} AND status != 'rejected'
      ) < ${MAX_ROOM_PARTICIPANTS}
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id
    `,
    ]);
    const inserted = transaction.at(-1);
    if (!rows<{ id: string }>(inserted).length) {
      const replay = await findSessionByRequest(sql, input.requestId, tokenHash);
      if (replay) return { ...replay, token: input.token };
      throw new RoomHttpError("Esta Mesa atingiu o limite de participantes.", 409);
    }
  } catch (error) {
    const replay = await findSessionByRequest(sql, input.requestId, tokenHash).catch(() => null);
    if (replay) return { ...replay, token: input.token };
    if (error instanceof RoomHttpError) throw error;
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

async function readRoomStorageStats(sql: RoomSql, roomId: string) {
  const [roomResult, databaseBytes] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(file_size) FILTER (WHERE type = 'file'), 0)::BIGINT AS "fileBytes",
        COUNT(*) FILTER (WHERE type = 'file')::INT AS "fileCount",
        COALESCE(SUM(
          OCTET_LENGTH(body) + OCTET_LENGTH(data_json) + OCTET_LENGTH(id) + OCTET_LENGTH(request_id)
        ) FILTER (WHERE type != 'file'), 0)::BIGINT AS "historyBytes"
      FROM entries
      WHERE room_id = ${roomId}
    `,
    databaseUsedBytes(sql),
  ]);
  const usage = rows<{ fileBytes: number | string; fileCount: number | string; historyBytes: number | string }>(roomResult)[0];
  return {
    files: {
      usedBytes: Number(usage?.fileBytes ?? 0),
      limitBytes: ROOM_FILE_BUDGET_BYTES,
      warningBytes: ROOM_FILE_WARNING_BYTES,
      count: Number(usage?.fileCount ?? 0),
      maxCount: MAX_ROOM_FILES,
      maxFileBytes: MAX_ROOM_FILE_BYTES,
    },
    history: {
      usedBytes: Number(usage?.historyBytes ?? 0),
      warningBytes: ROOM_HISTORY_WARNING_BYTES,
      guidanceBytes: ROOM_HISTORY_BUDGET_BYTES,
    },
    database: {
      usedBytes: databaseBytes,
      warningBytes: PROJECT_DATABASE_WARNING_BYTES,
      criticalBytes: PROJECT_DATABASE_CRITICAL_BYTES,
    },
  };
}

export async function readRoomSnapshot(
  request: Request,
  roomCode: string,
  cursorValue?: string | null,
): Promise<RoomSnapshot> {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  const ownParticipant = participantFromRow(self);
  const storage = await readRoomStorageStats(sql, self.roomId);

  if (self.status !== "approved") {
    return {
      room: { code: self.roomCode, name: self.roomName, createdAt: Number(self.roomCreatedAt) },
      self: ownParticipant,
      participants: [ownParticipant],
      entries: [],
      nextCursor: null,
      storage,
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
    storage,
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
  await assertDatabaseWritable(sql);
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

function roomCodeFromPathname(pathname: string) {
  const match = /^rooms\/([2-9A-HJ-NP-Z]{6})\//.exec(pathname);
  return match?.[1] ?? "UNKNOWN";
}

async function queueBlobCleanup(
  sql: RoomSql,
  pathname: string,
  roomCode: string,
  size = 0,
) {
  if (!pathname) return;
  await sql`
    INSERT INTO blob_cleanup_queue (pathname, room_code, size, created_at, attempts, last_error)
    VALUES (${pathname}, ${roomCode}, ${Math.max(0, size)}, ${Date.now()}, 0, '')
    ON CONFLICT (pathname) DO UPDATE
    SET size = GREATEST(blob_cleanup_queue.size, EXCLUDED.size)
  `;
}

async function drainBlobCleanupQueue(sql: RoomSql, limit = 25, roomCode?: string) {
  const result = roomCode
    ? await sql`
        SELECT pathname, attempts FROM blob_cleanup_queue
        WHERE room_code = ${roomCode}
        ORDER BY attempts ASC, created_at ASC
        LIMIT ${limit}
      `
    : await sql`
        SELECT pathname, attempts FROM blob_cleanup_queue
        ORDER BY attempts ASC, created_at ASC
        LIMIT ${limit}
      `;
  let removed = 0;
  for (const item of rows<{ pathname: string; attempts: number | string }>(result)) {
    try {
      await reserveBlobUsage(
        sql,
        { simpleOps: 1 },
        { eventId: blobUsageEventId(`delete:${item.pathname}:${Number(item.attempts) + 1}`), maintenance: true },
      );
      await del(item.pathname);
      await sql`DELETE FROM blob_cleanup_queue WHERE pathname = ${item.pathname}`;
      removed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 400) : "Falha temporária ao remover o Blob.";
      await sql`
        UPDATE blob_cleanup_queue
        SET attempts = attempts + 1, last_error = ${message}
        WHERE pathname = ${item.pathname}
      `.catch(() => undefined);
    }
  }
  const pendingResult = roomCode
    ? await sql`SELECT COUNT(*)::INT AS count FROM blob_cleanup_queue WHERE room_code = ${roomCode}`
    : await sql`SELECT COUNT(*)::INT AS count FROM blob_cleanup_queue`;
  const pending = Number(rows<{ count: number | string }>(pendingResult)[0]?.count ?? 0);
  return { removed, pending };
}

async function rescanDeletedRoomBlobs(sql: RoomSql, limit = 1) {
  const now = Date.now();
  const candidates = await sql`
    SELECT code, last_scan_at AS "lastScanAt", scan_count AS "scanCount"
    FROM deleted_rooms
    WHERE scan_count < ${DELETED_ROOM_RESCAN_LIMIT}::INTEGER
      AND (
        last_scan_at = 0 OR last_scan_at <= ${now}::BIGINT - CASE scan_count
          WHEN 0 THEN ${DELETED_ROOM_RESCAN_DELAYS_MS[0]}::BIGINT
          WHEN 1 THEN ${DELETED_ROOM_RESCAN_DELAYS_MS[1]}::BIGINT
          WHEN 2 THEN ${DELETED_ROOM_RESCAN_DELAYS_MS[2]}::BIGINT
          WHEN 3 THEN ${DELETED_ROOM_RESCAN_DELAYS_MS[3]}::BIGINT
          WHEN 4 THEN ${DELETED_ROOM_RESCAN_DELAYS_MS[4]}::BIGINT
          WHEN 5 THEN ${DELETED_ROOM_RESCAN_DELAYS_MS[5]}::BIGINT
          ELSE ${DELETED_ROOM_RESCAN_DELAYS_MS[6]}::BIGINT
        END
      )
    ORDER BY last_scan_at ASC, deleted_at ASC
    LIMIT ${limit}::INTEGER
  `;
  let scanned = 0;
  for (const candidate of rows<{ code: string; lastScanAt: number | string; scanCount: number | string }>(candidates)) {
    if (scanned >= limit) break;
    const scanCount = Number(candidate.scanCount);
    const lastScanAt = Number(candidate.lastScanAt);
    const delay = DELETED_ROOM_RESCAN_DELAYS_MS[Math.min(scanCount, DELETED_ROOM_RESCAN_DELAYS_MS.length - 1)];
    if (lastScanAt > 0 && now - lastScanAt < delay) continue;

    const claim = await sql`
      UPDATE deleted_rooms
      SET last_scan_at = ${now}, scan_count = scan_count + 1
      WHERE code = ${candidate.code}
        AND last_scan_at = ${lastScanAt}
        AND scan_count = ${scanCount}
      RETURNING code
    `;
    if (!rows<{ code: string }>(claim).length) continue;

    try {
      let cursor: string | undefined;
      let discovered = 0;
      for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
        await reserveBlobUsage(sql, { advancedOps: 1 }, { maintenance: true });
        const page = await list({ prefix: `rooms/${candidate.code}/`, limit: 1000, cursor });
        for (const blob of page.blobs) {
          await queueBlobCleanup(sql, blob.pathname, candidate.code, blob.size);
          discovered += 1;
        }
        if (!page.hasMore || !page.cursor) break;
        cursor = page.cursor;
      }
      if (discovered) await drainBlobCleanupQueue(sql, Math.min(discovered, 25), candidate.code);
      scanned += 1;
    } catch (error) {
      await sql`
        UPDATE deleted_rooms
        SET last_scan_at = ${lastScanAt}, scan_count = ${scanCount}
        WHERE code = ${candidate.code} AND last_scan_at = ${now}
      `.catch(() => undefined);
      console.error("deleted-room-blob-rescan-failed", error);
    }
  }
  return { scanned };
}

export async function authorizeRoomFileUpload(
  roomCode: string,
  pathname: string,
  input: RoomFileUploadRequest,
) {
  const sql = await getRoomDb();
  await assertDatabaseWritable(sql);
  const self = await authorizeCredentials(input.participantId, input.token, roomCode);
  if (self.status !== "approved") throw new RoomHttpError("Aguarde a aprovação do narrador.", 403);

  const expectedPathname = `rooms/${self.roomCode}/${self.id}/${input.requestId}`;
  if (pathname !== expectedPathname) throw new RoomHttpError("Caminho de arquivo inválido.", 400);

  const previous = await getEntryByRequest(sql, self.roomId, self.id, input.requestId);
  if (previous) throw new RoomHttpError("Este arquivo já foi publicado.", 409);

  const existingResult = await sql`
    SELECT request_id AS "requestId", room_id AS "roomId", actor_id AS "actorId",
           entry_id AS "entryId", pathname, name, content_type AS "contentType",
           size, created_at AS "createdAt"
    FROM upload_reservations
    WHERE request_id = ${input.requestId} AND room_id = ${self.roomId} AND actor_id = ${self.id}
    LIMIT 1
  `;
  let reservation = rows<UploadReservationRow>(existingResult)[0];
  const cleanedName = cleanFileName(input.name);
  const cleanedContentType = cleanContentType(input.contentType);
  if (reservation && (reservation.pathname !== expectedPathname || Number(reservation.size) !== input.size)) {
    throw new RoomHttpError("Este pedido de arquivo não corresponde à reserva já existente.", 409);
  }

  const usageReservation = await reserveBlobUsage(
    sql,
    { simpleOps: 1 },
    { eventId: `upload:${input.requestId}` },
  );
  if (!reservation) {
    const now = Date.now();
    const entryId = makeId("entry");
    try {
      const transaction = await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(hashtext(${GLOBAL_BLOB_STORAGE_LOCK}))`,
        sql`DELETE FROM upload_reservations WHERE created_at < ${now - UPLOAD_RESERVATION_TTL_MS}`,
        sql`
          INSERT INTO upload_reservations
            (request_id, room_id, actor_id, entry_id, pathname, name, content_type, size, created_at)
          SELECT
            ${input.requestId}, ${self.roomId}, ${self.id}, ${entryId}, ${expectedPathname},
            ${cleanedName}, ${cleanedContentType}, ${input.size}, ${now}
          WHERE
            ${input.size} > 0
            AND ${input.size} <= ${MAX_ROOM_FILE_BYTES}
            AND (
              SELECT COALESCE(SUM(file_size), 0) FROM entries
              WHERE room_id = ${self.roomId} AND type = 'file'
            ) + (
              SELECT COALESCE(SUM(size), 0) FROM upload_reservations
              WHERE room_id = ${self.roomId}
            ) + ${input.size} <= ${ROOM_FILE_BUDGET_BYTES}
            AND (
              SELECT COUNT(*) FROM entries
              WHERE room_id = ${self.roomId} AND type = 'file'
            ) + (
              SELECT COUNT(*) FROM upload_reservations
              WHERE room_id = ${self.roomId}
            ) + 1 <= ${MAX_ROOM_FILES}
            AND (
              SELECT COALESCE(SUM(file_size), 0) FROM entries WHERE type = 'file'
            ) + (
              SELECT COALESCE(SUM(size), 0) FROM upload_reservations
            ) + (
              SELECT COALESCE(SUM(size), 0) FROM blob_cleanup_queue
            ) + ${input.size} <= ${PROJECT_BLOB_SAFE_BYTES}
            AND (
              SELECT COUNT(*) FROM entries WHERE type = 'file'
            ) + (
              SELECT COUNT(*) FROM upload_reservations
            ) + (
              SELECT COUNT(*) FROM blob_cleanup_queue
            ) + 1 <= ${PROJECT_MAX_BLOB_FILES}
          ON CONFLICT (request_id) DO NOTHING
          RETURNING request_id AS "requestId", room_id AS "roomId", actor_id AS "actorId",
                    entry_id AS "entryId", pathname, name, content_type AS "contentType",
                    size, created_at AS "createdAt"
        `,
      ]);
      reservation = rows<UploadReservationRow>(transaction.at(-1))[0];
    } catch (error) {
      await releaseBlobUsage(sql, usageReservation).catch(() => undefined);
      throw error;
    }
    if (!reservation) {
      await releaseBlobUsage(sql, usageReservation).catch(() => undefined);
      const stats = await readRoomStorageStats(sql, self.roomId);
      if (stats.files.count >= MAX_ROOM_FILES) {
        throw new RoomHttpError(`Esta Mesa chegou a ${MAX_ROOM_FILES} arquivos. Exclua um arquivo antes de enviar outro.`, 409);
      }
      throw new RoomHttpError("Este arquivo ultrapassaria o espaço seguro da Mesa. Exporte ou exclua arquivos antes de continuar.", 507);
    }
  }

  return JSON.stringify({
    version: 1,
    roomId: reservation.roomId,
    actorId: reservation.actorId,
    actorName: self.name,
    requestId: reservation.requestId,
    entryId: reservation.entryId,
    name: reservation.name,
    contentType: reservation.contentType,
    size: Number(reservation.size),
    pathname: reservation.pathname,
    createdAt: Number(reservation.createdAt),
  });
}

export async function completeRoomFileUpload(
  blob: { url: string; pathname: string; contentType: string },
  tokenPayload: string | null | undefined,
) {
  const payload = roomUploadTokenSchema.parse(JSON.parse(tokenPayload || "{}"));
  if (blob.pathname !== payload.pathname) throw new Error("Uploaded pathname does not match its token.");

  const sql = await getRoomDb();
  await reserveBlobUsage(sql, { simpleOps: 1 }, { eventId: `head:${payload.requestId}`, maintenance: true });
  const metadata = await head(blob.pathname);
  if (metadata.pathname !== payload.pathname || metadata.size !== payload.size) {
    await queueBlobCleanup(sql, payload.pathname, roomCodeFromPathname(payload.pathname), metadata.size);
    await sql`DELETE FROM upload_reservations WHERE request_id = ${payload.requestId}`.catch(() => undefined);
    await drainBlobCleanupQueue(sql, 1, roomCodeFromPathname(payload.pathname));
    throw new Error("Uploaded Blob metadata does not match its reserved size.");
  }
  const previous = await getEntryByRequest(sql, payload.roomId, payload.actorId, payload.requestId);
  if (previous) {
    await sql`DELETE FROM upload_reservations WHERE request_id = ${payload.requestId}`;
    return previous;
  }

  const participantResult = await sql`
    SELECT id, name
    FROM participants
    WHERE id = ${payload.actorId} AND room_id = ${payload.roomId} AND status = 'approved'
    LIMIT 1
  `;
  const participant = rows<{ id: string; name: string }>(participantResult)[0];
  if (!participant) {
    await queueBlobCleanup(sql, payload.pathname, roomCodeFromPathname(payload.pathname), metadata.size);
    await sql`DELETE FROM upload_reservations WHERE request_id = ${payload.requestId}`;
    await drainBlobCleanupQueue(sql, 1, roomCodeFromPathname(payload.pathname));
    throw new Error("The participant can no longer publish to this room.");
  }

  const storedData: StoredRoomFileData = {
    name: payload.name,
    contentType: cleanContentType(metadata.contentType || blob.contentType || payload.contentType),
    size: metadata.size,
    blobUrl: blob.url,
    pathname: blob.pathname,
  };

  try {
    await assertDatabaseWritable(sql);
    const transaction = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext(${GLOBAL_BLOB_STORAGE_LOCK}))`,
      sql`DELETE FROM blob_cleanup_queue WHERE pathname = ${payload.pathname}`,
      sql`
        INSERT INTO entries
          (id, room_id, actor_id, request_id, type, body, data_json, file_size, blob_pathname, created_at)
        SELECT
          ${payload.entryId}, ${payload.roomId}, ${payload.actorId}, ${payload.requestId}, 'file',
          ${payload.name}, ${JSON.stringify(storedData)}, ${payload.size}, ${blob.pathname}, ${payload.createdAt}
        WHERE EXISTS (
          SELECT 1 FROM participants
          WHERE id = ${payload.actorId} AND room_id = ${payload.roomId} AND status = 'approved'
        )
          AND (
            SELECT COALESCE(SUM(file_size), 0) FROM entries
            WHERE room_id = ${payload.roomId} AND type = 'file'
          ) + (
            SELECT COALESCE(SUM(size), 0) FROM upload_reservations
            WHERE room_id = ${payload.roomId} AND request_id != ${payload.requestId}
          ) + ${payload.size} <= ${ROOM_FILE_BUDGET_BYTES}
          AND (
            SELECT COUNT(*) FROM entries
            WHERE room_id = ${payload.roomId} AND type = 'file'
          ) + (
            SELECT COUNT(*) FROM upload_reservations
            WHERE room_id = ${payload.roomId} AND request_id != ${payload.requestId}
          ) + 1 <= ${MAX_ROOM_FILES}
          AND (
            SELECT COALESCE(SUM(file_size), 0) FROM entries WHERE type = 'file'
          ) + (
            SELECT COALESCE(SUM(size), 0) FROM upload_reservations
            WHERE request_id != ${payload.requestId}
          ) + (
            SELECT COALESCE(SUM(size), 0) FROM blob_cleanup_queue
          ) + ${payload.size} <= ${PROJECT_BLOB_SAFE_BYTES}
          AND (
            SELECT COUNT(*) FROM entries WHERE type = 'file'
          ) + (
            SELECT COUNT(*) FROM upload_reservations
            WHERE request_id != ${payload.requestId}
          ) + (
            SELECT COUNT(*) FROM blob_cleanup_queue
          ) + 1 <= ${PROJECT_MAX_BLOB_FILES}
        ON CONFLICT (request_id) DO NOTHING
        RETURNING id
      `,
      sql`DELETE FROM upload_reservations WHERE request_id = ${payload.requestId}`,
      sql`UPDATE rooms SET updated_at = ${Date.now()} WHERE id = ${payload.roomId}`,
    ]);
    const inserted = transaction[2];
    if (!rows<{ id: string }>(inserted).length) {
      const replay = await getEntryByRequest(sql, payload.roomId, payload.actorId, payload.requestId);
      if (replay) return replay;
      throw new RoomHttpError("Este arquivo ultrapassaria o espaço seguro atual. Ele não foi publicado.", 507);
    }
  } catch (error) {
    const replay = await getEntryByRequest(sql, payload.roomId, payload.actorId, payload.requestId).catch(() => null);
    if (replay) {
      await sql`DELETE FROM upload_reservations WHERE request_id = ${payload.requestId}`.catch(() => undefined);
      return replay;
    }
    const cleanupRoomCode = roomCodeFromPathname(payload.pathname);
    await queueBlobCleanup(sql, payload.pathname, cleanupRoomCode, payload.size).catch(() => undefined);
    await sql`DELETE FROM upload_reservations WHERE request_id = ${payload.requestId}`.catch(() => undefined);
    await drainBlobCleanupQueue(sql, 1, cleanupRoomCode).catch(() => undefined);
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

  const expectedBytes = Math.max(0, Number(data.size) || 0);
  await reserveBlobUsage(sql, { simpleOps: 1, transferBytes: expectedBytes });
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

export async function deleteRoomFile(request: Request, roomCode: string, entryId: string) {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  if (self.status !== "approved") throw new RoomHttpError("Aguarde a aprovação do narrador.", 403);

  const result = await sql`
    SELECT actor_id AS "actorId", body, data_json AS "dataJson",
           file_size AS "fileSize", blob_pathname AS "blobPathname"
    FROM entries
    WHERE id = ${entryId} AND room_id = ${self.roomId} AND type = 'file'
    LIMIT 1
  `;
  const file = rows<{ actorId: string; body: string; dataJson: string; fileSize: number | string; blobPathname: string | null }>(result)[0];
  if (!file) return { deleted: false, bytesFreed: 0, cleanupPending: false };
  if (self.role !== "gm" && file.actorId !== self.id) {
    throw new RoomHttpError("Somente o narrador ou quem enviou este arquivo pode excluí-lo.", 403);
  }

  let pathname = file.blobPathname ?? "";
  if (!pathname) {
    try {
      pathname = String((JSON.parse(file.dataJson) as Partial<StoredRoomFileData>).pathname ?? "");
    } catch {
      pathname = "";
    }
  }
  const fileSize = Number(file.fileSize) || 0;
  const queries = [sql`SELECT pg_advisory_xact_lock(hashtext(${GLOBAL_BLOB_STORAGE_LOCK}))`];
  if (pathname) {
    queries.push(sql`
      INSERT INTO blob_cleanup_queue (pathname, room_code, size, created_at, attempts, last_error)
      VALUES (${pathname}, ${self.roomCode}, ${fileSize}, ${Date.now()}, 0, '')
      ON CONFLICT (pathname) DO NOTHING
    `);
  }
  queries.push(
    sql`DELETE FROM entries WHERE id = ${entryId} AND room_id = ${self.roomId} AND type = 'file'`,
    sql`UPDATE rooms SET updated_at = ${Date.now()} WHERE id = ${self.roomId}`,
  );
  await sql.transaction(queries);
  const cleanup = pathname ? await drainBlobCleanupQueue(sql, 1, self.roomCode) : { removed: 0, pending: 0 };
  return { deleted: true, bytesFreed: fileSize, cleanupPending: cleanup.pending > 0 };
}

async function deletedRoomReplay(sql: RoomSql, roomCode: string, participantId: string, token: string) {
  const tokenHash = await hashRoomToken(token);
  const result = await sql`
    SELECT code FROM deleted_rooms
    WHERE code = ${cleanCode(roomCode)}
      AND gm_participant_id = ${participantId}
      AND gm_token_hash = ${tokenHash}
    LIMIT 1
  `;
  return rows<{ code: string }>(result).length > 0;
}

export async function deleteRoom(request: Request, roomCode: string) {
  const sql = await getRoomDb();
  const credentials = readCredentials(request);
  let self: AuthRow;
  try {
    self = await authorizeCredentials(credentials.participantId, credentials.token, roomCode);
  } catch (error) {
    if (error instanceof RoomHttpError && error.status === 401 && await deletedRoomReplay(sql, roomCode, credentials.participantId, credentials.token)) {
      return { deleted: false, filesQueued: 0, cleanupPending: false };
    }
    throw error;
  }
  if (self.role !== "gm" || self.status !== "approved") {
    throw new RoomHttpError("Somente o narrador pode excluir a Mesa inteira.", 403);
  }
  const tokenHash = await hashRoomToken(credentials.token);
  const countResult = await sql`
    SELECT COUNT(*)::INT AS count
    FROM entries
    WHERE room_id = ${self.roomId} AND type = 'file' AND blob_pathname IS NOT NULL
  `;
  const fileCount = Number(rows<{ count: number | string }>(countResult)[0]?.count ?? 0);
  const now = Date.now();
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${GLOBAL_BLOB_STORAGE_LOCK}))`,
    sql`
      INSERT INTO deleted_rooms (code, gm_participant_id, gm_token_hash, deleted_at)
      VALUES (${self.roomCode}, ${self.id}, ${tokenHash}, ${now})
      ON CONFLICT (code) DO UPDATE
      SET gm_participant_id = EXCLUDED.gm_participant_id,
          gm_token_hash = EXCLUDED.gm_token_hash,
          deleted_at = EXCLUDED.deleted_at,
          last_scan_at = 0,
          scan_count = 0
    `,
    sql`
      INSERT INTO blob_cleanup_queue (pathname, room_code, size, created_at, attempts, last_error)
      SELECT blob_pathname, ${self.roomCode}, file_size, ${now}, 0, ''
      FROM entries
      WHERE room_id = ${self.roomId} AND type = 'file' AND blob_pathname IS NOT NULL
      ON CONFLICT (pathname) DO NOTHING
    `,
    sql`DELETE FROM rooms WHERE id = ${self.roomId}`,
  ]);
  const cleanup = await drainBlobCleanupQueue(sql, MAX_ROOM_FILES, self.roomCode);
  return { deleted: true, filesQueued: fileCount, cleanupPending: cleanup.pending > 0 };
}

export async function cleanupRoomOrphanBlobs(request: Request, roomCode: string) {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  if (self.role !== "gm" || self.status !== "approved") {
    throw new RoomHttpError("Somente o narrador pode procurar arquivos órfãos desta Mesa.", 403);
  }
  const referencesResult = await sql`
    SELECT blob_pathname AS pathname FROM entries
    WHERE room_id = ${self.roomId} AND type = 'file' AND blob_pathname IS NOT NULL
    UNION
    SELECT pathname FROM upload_reservations WHERE room_id = ${self.roomId}
  `;
  const referenced = new Set(rows<{ pathname: string }>(referencesResult).map((item) => item.pathname));
  const blobs: Array<{ pathname: string; uploadedAt: Date; size?: number }> = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    await reserveBlobUsage(sql, { advancedOps: 1 }, { maintenance: true });
    const page = await list({ prefix: `rooms/${self.roomCode}/`, limit: 1000, cursor });
    blobs.push(...page.blobs.map((blob) => ({ pathname: blob.pathname, uploadedAt: blob.uploadedAt, size: blob.size })));
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }
  const orphanPathnames = selectOrphanBlobPathnames(blobs, referenced);
  for (const pathname of orphanPathnames) {
    const blob = blobs.find((item) => item.pathname === pathname);
    await queueBlobCleanup(sql, pathname, self.roomCode, blob?.size ?? 0);
  }
  const cleanup = await drainBlobCleanupQueue(sql, orphanPathnames.length, self.roomCode);
  return { found: orphanPathnames.length, removed: cleanup.removed, pending: cleanup.pending };
}

export async function clearRoomHistoryBefore(request: Request, roomCode: string, before: number) {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  if (self.role !== "gm" || self.status !== "approved") {
    throw new RoomHttpError("Somente o narrador pode limpar partes antigas do Histórico.", 403);
  }
  if (!Number.isSafeInteger(before) || before <= 0 || before >= Date.now()) {
    throw new RoomHttpError("Escolha uma data válida dentro da história desta Mesa.", 400);
  }
  const measured = await sql`
    SELECT COUNT(*)::INT AS count,
           COALESCE(SUM(OCTET_LENGTH(body) + OCTET_LENGTH(data_json)), 0)::BIGINT AS bytes
    FROM entries
    WHERE room_id = ${self.roomId} AND type != 'file' AND created_at < ${before}
  `;
  const amount = rows<{ count: number | string; bytes: number | string }>(measured)[0];
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${self.roomId}))`,
    sql`DELETE FROM entries WHERE room_id = ${self.roomId} AND type != 'file' AND created_at < ${before}`,
    sql`UPDATE rooms SET updated_at = ${Date.now()} WHERE id = ${self.roomId}`,
  ]);
  return { removed: Number(amount?.count ?? 0), bytesFreed: Number(amount?.bytes ?? 0) };
}

export async function streamRoomHistory(request: Request, roomCode: string) {
  const sql = await getRoomDb();
  const self = await authorize(request, roomCode);
  if (self.status !== "approved") throw new RoomHttpError("Aguarde a aprovação do narrador.", 403);
  const encoder = new TextEncoder();
  let cursor: { createdAt: number; id: string } | null = null;
  let finished = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return controller.close();
      const result = cursor
        ? await sql`
            SELECT e.id, e.type, e.body, e.data_json AS "dataJson",
                   e.actor_id AS "actorId", p.name AS "actorName", e.created_at AS "createdAt"
            FROM entries e JOIN participants p ON p.id = e.actor_id
            WHERE e.room_id = ${self.roomId}
              AND (e.created_at > ${cursor.createdAt} OR (e.created_at = ${cursor.createdAt} AND e.id > ${cursor.id}))
            ORDER BY e.created_at ASC, e.id ASC LIMIT 200
          `
        : await sql`
            SELECT e.id, e.type, e.body, e.data_json AS "dataJson",
                   e.actor_id AS "actorId", p.name AS "actorName", e.created_at AS "createdAt"
            FROM entries e JOIN participants p ON p.id = e.actor_id
            WHERE e.room_id = ${self.roomId}
            ORDER BY e.created_at ASC, e.id ASC LIMIT 200
          `;
      const page = rows<EntryRow>(result);
      if (!page.length) {
        finished = true;
        controller.close();
        return;
      }
      const last = page.at(-1)!;
      cursor = { createdAt: Number(last.createdAt), id: last.id };
      controller.enqueue(encoder.encode(page.map((row) => JSON.stringify(entryFromRow(row))).join("\n") + "\n"));
      if (page.length < 200) finished = true;
    },
  });
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
