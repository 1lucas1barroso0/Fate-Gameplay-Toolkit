import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const rooms = pgTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("rooms_code_unique").on(table.code),
    uniqueIndex("rooms_request_id_unique").on(table.requestId),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    role: text("role", { enum: ["gm", "player"] }).notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull(),
    requestId: text("request_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check("participants_role_check", sql`${table.role} IN ('gm', 'player')`),
    check("participants_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
    index("participants_room_idx").on(table.roomId),
    uniqueIndex("participants_request_id_unique").on(table.requestId),
  ],
);

export const entries = pgTable(
  "entries",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    type: text("type", { enum: ["roll", "note", "rule", "file"] }).notNull(),
    body: text("body").notNull(),
    dataJson: text("data_json").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    blobPathname: text("blob_pathname"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check("entries_type_check", sql`${table.type} IN ('roll', 'note', 'rule', 'file')`),
    index("entries_room_created_idx").on(table.roomId, table.createdAt),
    index("entries_room_type_idx").on(table.roomId, table.type),
    uniqueIndex("entries_request_id_unique").on(table.requestId),
  ],
);

export const uploadReservations = pgTable(
  "upload_reservations",
  {
    requestId: text("request_id").primaryKey(),
    roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    entryId: text("entry_id").notNull(),
    pathname: text("pathname").notNull(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("upload_reservations_pathname_unique").on(table.pathname),
    index("upload_reservations_room_idx").on(table.roomId),
    index("upload_reservations_created_idx").on(table.createdAt),
  ],
);

export const blobCleanupQueue = pgTable(
  "blob_cleanup_queue",
  {
    pathname: text("pathname").primaryKey(),
    roomCode: text("room_code").notNull(),
    size: bigint("size", { mode: "number" }).notNull().default(0),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
  },
  (table) => [index("blob_cleanup_created_idx").on(table.createdAt)],
);

export const deletedRooms = pgTable(
  "deleted_rooms",
  {
    code: text("code").primaryKey(),
    gmParticipantId: text("gm_participant_id").notNull(),
    gmTokenHash: text("gm_token_hash").notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }).notNull(),
  },
  (table) => [index("deleted_rooms_deleted_idx").on(table.deletedAt)],
);

export const blobMonthlyUsage = pgTable("blob_monthly_usage", {
  monthKey: text("month_key").primaryKey(),
  advancedOps: integer("advanced_ops").notNull().default(0),
  simpleOps: integer("simple_ops").notNull().default(0),
  transferBytes: bigint("transfer_bytes", { mode: "number" }).notNull().default(0),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
