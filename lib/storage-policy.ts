export const DECIMAL_MB = 1_000_000;

// Vercel Hobby includes 1 GB-month of Blob storage. Keeping the application at
// 75% leaves room for uploads that have completed but whose callback is still
// being reconciled, orphan cleanup, and future quota changes.
export const VERCEL_BLOB_HOBBY_INCLUDED_BYTES = 1_000_000_000;
export const PROJECT_BLOB_SAFE_BYTES = 750 * DECIMAL_MB;
export const VERCEL_BLOB_HOBBY_ADVANCED_OPS = 2_000;
export const VERCEL_BLOB_HOBBY_SIMPLE_OPS = 10_000;
export const VERCEL_BLOB_HOBBY_TRANSFER_BYTES = 10_000 * DECIMAL_MB;
export const PROJECT_BLOB_MONTHLY_ADVANCED_OPS = 1_500;
export const PROJECT_BLOB_MONTHLY_SIMPLE_OPS = 7_500;
export const PROJECT_BLOB_MONTHLY_TRANSFER_BYTES = 7_500 * DECIMAL_MB;
export const ROOM_FILE_BUDGET_BYTES = 100 * DECIMAL_MB;
export const ROOM_FILE_WARNING_BYTES = 75 * DECIMAL_MB;
// Keep the pre-existing 50 MiB per-file promise; the cumulative room budget is
// the tighter shared-space guard.
export const MAX_ROOM_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_ROOM_FILES = 100;
export const MAX_ROOM_FILES_PER_UPLOAD = 10;
export const PROJECT_MAX_BLOB_FILES = 5_000;

// Neon Free currently includes 0.5 GB per project. Text remains compact and
// paginated, while these guards prevent one room or ordinary writes from
// exhausting the whole database without warning.
export const NEON_FREE_INCLUDED_BYTES = 500 * DECIMAL_MB;
export const PROJECT_DATABASE_WARNING_BYTES = 300 * DECIMAL_MB;
export const PROJECT_DATABASE_CRITICAL_BYTES = 375 * DECIMAL_MB;
export const ROOM_HISTORY_BUDGET_BYTES = 40 * DECIMAL_MB;
export const ROOM_HISTORY_WARNING_BYTES = 30 * DECIMAL_MB;

export const LOCAL_STORAGE_WARNING_RATIO = 0.7;
export const LOCAL_STORAGE_CRITICAL_RATIO = 0.9;
export const LOCAL_WRITE_MINIMUM_RESERVE_BYTES = 5 * DECIMAL_MB;
export const LOCAL_WRITE_RESERVE_RATIO = 0.05;
export const SHEET_IMAGE_TARGET_BYTES = 900_000;
export const SHEET_IMAGE_SOURCE_MAX_BYTES = 20 * DECIMAL_MB;
export const CHARACTER_UNDO_LIMIT = 30;
export const LOCAL_ORPHAN_IMAGE_GRACE_MS = 60_000;
export const ORPHAN_BLOB_GRACE_MS = 60 * 60 * 1000;
export const UPLOAD_RESERVATION_TTL_MS = 60 * 60 * 1000;
export const DELETION_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REJECTED_PARTICIPANT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PENDING_PARTICIPANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const BLOB_USAGE_LEDGER_TTL_MS = 18 * 31 * 24 * 60 * 60 * 1000;

export type StorageState = "normal" | "attention" | "critical";

export function storageState(used: number, limit: number): StorageState {
  if (!Number.isFinite(limit) || limit <= 0) return "normal";
  const ratio = Math.max(0, used) / limit;
  if (ratio >= LOCAL_STORAGE_CRITICAL_RATIO) return "critical";
  if (ratio >= LOCAL_STORAGE_WARNING_RATIO) return "attention";
  return "normal";
}

export function formatStorageBytes(bytes: number, locale = "pt-BR") {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe < 1_000) return `${Math.round(safe)} B`;
  if (safe < DECIMAL_MB) return `${(safe / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`;
  if (safe < 1_000 * DECIMAL_MB) return `${(safe / DECIMAL_MB).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  return `${(safe / (1_000 * DECIMAL_MB)).toLocaleString(locale, { maximumFractionDigits: 2 })} GB`;
}

export function canAcceptRoomFile(input: {
  roomUsedBytes: number;
  roomFileCount: number;
  projectUsedBytes: number;
  pendingBytes?: number;
  pendingCount?: number;
  incomingBytes: number;
}) {
  const pendingBytes = Math.max(0, input.pendingBytes ?? 0);
  const pendingCount = Math.max(0, input.pendingCount ?? 0);
  const roomNext = input.roomUsedBytes + pendingBytes + input.incomingBytes;
  const projectNext = input.projectUsedBytes + pendingBytes + input.incomingBytes;
  const countNext = input.roomFileCount + pendingCount + 1;
  return {
    accepted:
      input.incomingBytes > 0 &&
      input.incomingBytes <= MAX_ROOM_FILE_BYTES &&
      roomNext <= ROOM_FILE_BUDGET_BYTES &&
      projectNext <= PROJECT_BLOB_SAFE_BYTES &&
      countNext <= MAX_ROOM_FILES,
    roomNext,
    projectNext,
    countNext,
  };
}

export function selectOrphanBlobPathnames(
  blobs: Array<{ pathname: string; uploadedAt?: Date | string | number }>,
  referenced: ReadonlySet<string>,
  now = Date.now(),
) {
  return blobs
    .filter((blob) => {
      if (referenced.has(blob.pathname)) return false;
      const uploadedAt = blob.uploadedAt instanceof Date
        ? blob.uploadedAt.getTime()
        : new Date(blob.uploadedAt ?? 0).getTime();
      return Number.isFinite(uploadedAt) && now - uploadedAt >= ORPHAN_BLOB_GRACE_MS;
    })
    .map((blob) => blob.pathname);
}

export function canDeleteRoomFile(
  self: { id: string; role: "gm" | "player"; status: string },
  actorId: string,
) {
  return self.status === "approved" && (self.role === "gm" || self.id === actorId);
}
