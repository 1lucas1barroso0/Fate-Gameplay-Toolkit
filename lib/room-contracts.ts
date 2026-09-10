import { z } from "zod";
import {
  MAX_ROOM_FILE_BYTES,
  MAX_ROOM_FILES,
  MAX_ROOM_FILES_PER_UPLOAD,
  PROJECT_BLOB_SAFE_BYTES,
  PROJECT_MAX_BLOB_FILES,
  PROJECT_DATABASE_CRITICAL_BYTES,
  PROJECT_DATABASE_WARNING_BYTES,
  ROOM_FILE_BUDGET_BYTES,
  ROOM_FILE_WARNING_BYTES,
  ROOM_HISTORY_BUDGET_BYTES,
  ROOM_HISTORY_WARNING_BYTES,
} from "@/lib/storage-policy";

export {
  MAX_ROOM_FILE_BYTES,
  MAX_ROOM_FILES,
  MAX_ROOM_FILES_PER_UPLOAD,
  PROJECT_BLOB_SAFE_BYTES,
  PROJECT_MAX_BLOB_FILES,
  PROJECT_DATABASE_CRITICAL_BYTES,
  PROJECT_DATABASE_WARNING_BYTES,
  ROOM_FILE_BUDGET_BYTES,
  ROOM_FILE_WARNING_BYTES,
  ROOM_HISTORY_BUDGET_BYTES,
  ROOM_HISTORY_WARNING_BYTES,
};

export const roomCodeSchema = z
  .string()
  .transform((value) => value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, ""))
  .pipe(z.string().length(6));

const personName = z.string().trim().min(1).max(60);
const requestId = z.string().uuid();
const clientToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const roomEntryIdSchema = z.string().regex(/^entry_[A-Za-z0-9_-]+$/).max(100);

export const createRoomSchema = z.object({
  action: z.literal("create"),
  roomName: z.string().trim().min(1).max(80),
  personName,
  requestId,
  token: clientToken,
});

export const joinRoomSchema = z.object({
  action: z.literal("join"),
  roomCode: roomCodeSchema,
  personName,
  requestId,
  token: clientToken,
});

export const roomEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("roll"),
    requestId,
    modifier: z.number().int().min(-20).max(20),
    label: z.string().trim().max(120),
  }),
  z.object({
    type: z.literal("note"),
    requestId,
    body: z.string().trim().min(1).max(1600),
  }),
  z.object({
    type: z.literal("rule"),
    requestId,
    title: z.string().trim().min(1).max(180),
    reference: z.string().regex(/^rules:[a-z0-9-]+:(pt|en)$/).max(160),
  }),
]);

export const roomFileRequestSchema = z.object({
  requestId,
});

export const roomFileUploadSchema = roomFileRequestSchema.extend({
  participantId: z.string().min(1).max(100),
  token: clientToken,
  name: z.string().trim().min(1).max(240),
  contentType: z.string().trim().max(160),
  size: z.number().int().positive().max(MAX_ROOM_FILE_BYTES),
});

export type RoomFileUploadRequest = z.infer<typeof roomFileUploadSchema>;

export const roomDecisionSchema = z.object({
  participantId: z.string().min(1).max(100),
  status: z.enum(["approved", "rejected"]),
});

export type RoomRole = "gm" | "player";
export type RoomStatus = "pending" | "approved" | "rejected";
export type RoomEntryType = "roll" | "note" | "rule" | "file";

export type RoomSession = {
  roomCode: string;
  participantId: string;
  token: string;
};

export type RoomParticipant = {
  id: string;
  name: string;
  role: RoomRole;
  status: RoomStatus;
  createdAt: number;
};

export type RoomRollData = {
  dice: number[];
  modifier: number;
  total: number;
};

export type RoomRuleData = {
  reference: string;
};

export type RoomFileData = {
  name: string;
  contentType: string;
  size: number;
};

export type RoomEntry = {
  id: string;
  type: RoomEntryType;
  body: string;
  data: RoomRollData | RoomRuleData | RoomFileData | Record<string, never>;
  actor: { id: string; name: string };
  createdAt: number;
};

export type RoomSnapshot = {
  room: { code: string; name: string; createdAt: number };
  self: RoomParticipant;
  participants: RoomParticipant[];
  entries: RoomEntry[];
  files: RoomEntry[];
  nextCursor: string | null;
  storage: RoomStorageStats;
};

export type RoomStorageStats = {
  files: {
    usedBytes: number;
    limitBytes: number;
    warningBytes: number;
    count: number;
    maxCount: number;
    maxFileBytes: number;
  };
  history: {
    usedBytes: number;
    warningBytes: number;
    guidanceBytes: number;
  };
  database: {
    usedBytes: number;
    warningBytes: number;
    criticalBytes: number;
  };
};
