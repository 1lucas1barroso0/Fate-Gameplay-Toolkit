import { estimateSheetImageBytes, type StorageManagerLike } from "@/lib/sheet-image-store";
import {
  LOCAL_STORAGE_CRITICAL_RATIO,
  LOCAL_STORAGE_WARNING_RATIO,
  type StorageState,
} from "@/lib/storage-policy";

const FATE_PREFIX = "fate-gameplay-toolkit.";
export const DICE_HISTORY_KEY = `${FATE_PREFIX}rolls.v1`;

export type LocalStorageBreakdown = {
  sheets: number;
  images: number;
  settings: number;
  rooms: number;
  other: number;
};

export type LocalStorageReport = {
  usage: number;
  quota: number | null;
  percent: number | null;
  state: StorageState;
  exactBreakdown: boolean;
  persisted: boolean | null;
  breakdown: LocalStorageBreakdown;
};

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function classifyKey(key: string): Exclude<keyof LocalStorageBreakdown, "images"> {
  if (key.includes("characters")) return "sheets";
  if (key.includes("room-session") || key.includes("room-sessions") || key.includes("active-room")) return "rooms";
  if (key.includes("rules-profiles") || key.includes("table-config") || key.endsWith("workspace") || key.endsWith("sheet-mode")) return "settings";
  return "other";
}

export function measureFateKeyValueStorage(storage: Pick<Storage, "length" | "key" | "getItem">) {
  const result = { sheets: 0, settings: 0, rooms: 0, other: 0 };
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(FATE_PREFIX)) continue;
    const value = storage.getItem(key) ?? "";
    result[classifyKey(key)] += utf8Bytes(key) + utf8Bytes(value);
  }
  return result;
}

export async function readLocalStorageReport(
  manager: StorageManagerLike | undefined = typeof navigator !== "undefined" ? navigator.storage : undefined,
  local: Pick<Storage, "length" | "key" | "getItem"> = localStorage,
  session: Pick<Storage, "length" | "key" | "getItem"> = sessionStorage,
): Promise<LocalStorageReport> {
  const [localBytes, sessionBytes, imageUsage, estimate, persisted] = await Promise.all([
    Promise.resolve(measureFateKeyValueStorage(local)),
    Promise.resolve(measureFateKeyValueStorage(session)),
    estimateSheetImageBytes().catch(() => ({ bytes: 0, count: 0, records: [] })),
    manager?.estimate?.().catch(() => undefined),
    manager?.persisted?.().catch(() => null) ?? Promise.resolve(null),
  ]);
  const breakdown: LocalStorageBreakdown = {
    sheets: localBytes.sheets + sessionBytes.sheets,
    images: imageUsage.bytes,
    settings: localBytes.settings + sessionBytes.settings,
    rooms: localBytes.rooms + sessionBytes.rooms,
    other: localBytes.other + sessionBytes.other,
  };
  const knownUsage = Object.values(breakdown).reduce((total, value) => total + value, 0);
  const estimatedUsage = Number(estimate?.usage);
  const estimatedQuota = Number(estimate?.quota);
  const hasEstimate = Number.isFinite(estimatedUsage) && estimatedUsage >= 0;
  const hasQuota = Number.isFinite(estimatedQuota) && estimatedQuota > 0;
  const usage = hasEstimate ? Math.max(knownUsage, estimatedUsage) : knownUsage;
  const quota = hasQuota ? estimatedQuota : null;
  const percent = quota ? usage / quota : null;
  const state: StorageState = percent !== null && percent >= LOCAL_STORAGE_CRITICAL_RATIO
    ? "critical"
    : percent !== null && percent >= LOCAL_STORAGE_WARNING_RATIO
      ? "attention"
      : "normal";
  return {
    usage,
    quota,
    percent,
    state,
    exactBreakdown: false,
    persisted,
    breakdown,
  };
}

export async function requestPersistentStorage(
  manager: StorageManagerLike | undefined = typeof navigator !== "undefined" ? navigator.storage : undefined,
) {
  if (!manager?.persist) return { supported: false, persisted: false };
  return { supported: true, persisted: await manager.persist() };
}

export function removeFateTemporaryData(storage: Pick<Storage, "length" | "key" | "getItem" | "removeItem"> = localStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(FATE_PREFIX) && key.endsWith(".indexeddb-pending")) keys.push(key);
  }
  let removed = 0;
  let preserved = 0;
  for (const key of keys) {
    const value = storage.getItem(key);
    const confirmedKey = key.slice(0, -".indexeddb-pending".length);
    const confirmed = storage.getItem(confirmedKey);
    if (value !== null && value === confirmed) {
      storage.removeItem(key);
      removed += 1;
    } else {
      preserved += 1;
    }
  }
  return { removed, preserved };
}

export function clearLocalRollHistory(storage: Pick<Storage, "getItem" | "removeItem"> = localStorage) {
  const bytes = utf8Bytes(storage.getItem(DICE_HISTORY_KEY) ?? "");
  storage.removeItem(DICE_HISTORY_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("fate:roll-history-cleared"));
  return bytes;
}

export async function clearRegenerableCaches(cacheStorage: CacheStorage | undefined = typeof caches !== "undefined" ? caches : undefined) {
  if (!cacheStorage) return 0;
  const names = await cacheStorage.keys();
  const results = await Promise.all(names.map((name) => cacheStorage.delete(name)));
  return results.filter(Boolean).length;
}
