import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const rooms = pgTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
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
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check("entries_type_check", sql`${table.type} IN ('roll', 'note', 'rule', 'file')`),
    index("entries_room_created_idx").on(table.roomId, table.createdAt),
    uniqueIndex("entries_request_id_unique").on(table.requestId),
  ],
);
