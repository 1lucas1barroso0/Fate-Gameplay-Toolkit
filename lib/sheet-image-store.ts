import {
  isLegacySheetImage,
  isStoredSheetImage,
  type LegacySheetImage,
  type SheetImage,
  type StoredSheetImage,
} from "@/lib/fate";
import {
  LOCAL_WRITE_MINIMUM_RESERVE_BYTES,
  LOCAL_WRITE_RESERVE_RATIO,
} from "@/lib/storage-policy";

export const SHEET_IMAGE_DB_NAME = "fate-gameplay-toolkit-local-v1";
export const SHEET_IMAGE_STORE_NAME = "sheet-images";
const SHEET_IMAGE_DB_VERSION = 1;

export type SheetImageRecord = {
  id: string;
  hash: string;
  blob: Blob;
  bytes: number;
  contentType: string;
  createdAt: number;
};

export type StorageEstimateLike = {
  usage?: number;
  quota?: number;
};

export type StorageManagerLike = {
  estimate?: () => Promise<StorageEstimateLike>;
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
};

export class LocalStorageQuotaError extends Error {
  readonly code = "LOCAL_QUOTA_INSUFFICIENT";

  constructor(message = "Não há espaço seguro para guardar esta imagem. Exporte ou libere espaço antes de tentar novamente.") {
    super(message);
    this.name = "LocalStorageQuotaError";
  }
}

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("O armazenamento local não respondeu."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("A gravação local foi cancelada."));
    transaction.onerror = () => reject(transaction.error ?? new Error("A gravação local falhou."));
  });
}

function writableImageTransaction(database: IDBDatabase) {
  try {
    return database.transaction(SHEET_IMAGE_STORE_NAME, "readwrite", { durability: "strict" });
  } catch {
    return database.transaction(SHEET_IMAGE_STORE_NAME, "readwrite");
  }
}

export function openSheetImageDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Este navegador não oferece IndexedDB."));
  }
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(SHEET_IMAGE_DB_NAME, SHEET_IMAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SHEET_IMAGE_STORE_NAME)) {
        const store = database.createObjectStore(SHEET_IMAGE_STORE_NAME, { keyPath: "id" });
        store.createIndex("hash", "hash", { unique: true });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Não foi possível abrir o armazenamento de imagens."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Feche outras abas antigas do Fate para atualizar o armazenamento de imagens."));
    };
  });
  return databasePromise;
}

export async function resetSheetImageDatabaseConnection() {
  const pending = databasePromise;
  databasePromise = null;
  const database = await pending?.catch(() => null);
  database?.close();
}

export async function hashSheetImage(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function assertLocalWriteCapacity(
  incomingBytes: number,
  manager: StorageManagerLike | undefined = typeof navigator !== "undefined" ? navigator.storage : undefined,
) {
  if (!manager?.estimate) return { known: false, usage: 0, quota: 0, available: Number.POSITIVE_INFINITY };
  const estimate = await manager.estimate();
  const usage = Number(estimate.usage);
  const quota = Number(estimate.quota);
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) {
    return { known: false, usage: 0, quota: 0, available: Number.POSITIVE_INFINITY };
  }
  const available = Math.max(0, quota - usage);
  const reserve = Math.max(LOCAL_WRITE_MINIMUM_RESERVE_BYTES, quota * LOCAL_WRITE_RESERVE_RATIO);
  if (available < incomingBytes + reserve) throw new LocalStorageQuotaError();
  return { known: true, usage, quota, available };
}

export function dataUrlToBlob(dataUrl: string) {
  const match = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) throw new Error("A imagem antiga está em um formato inválido.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

export async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type || "image/webp"};base64,${btoa(binary)}`;
}

export async function getSheetImageRecord(blobId: string) {
  const database = await openSheetImageDatabase();
  const transaction = database.transaction(SHEET_IMAGE_STORE_NAME, "readonly");
  return requestResult(transaction.objectStore(SHEET_IMAGE_STORE_NAME).get(blobId)) as Promise<SheetImageRecord | undefined>;
}

export async function listSheetImageRecords() {
  const database = await openSheetImageDatabase();
  const transaction = database.transaction(SHEET_IMAGE_STORE_NAME, "readonly");
  return requestResult(transaction.objectStore(SHEET_IMAGE_STORE_NAME).getAll()) as Promise<SheetImageRecord[]>;
}

export async function saveSheetImageBlob(
  blob: Blob,
  framing: Pick<StoredSheetImage, "positionX" | "positionY" | "zoom" | "alt">,
  manager?: StorageManagerLike,
): Promise<StoredSheetImage> {
  const hash = await hashSheetImage(blob);
  const blobId = `img_${hash}`;
  const existing = await getSheetImageRecord(blobId);
  if (!existing) {
    await assertLocalWriteCapacity(blob.size, manager);
    const database = await openSheetImageDatabase();
    const transaction = writableImageTransaction(database);
    const record: SheetImageRecord = {
      id: blobId,
      hash,
      blob,
      bytes: blob.size,
      contentType: blob.type || "image/webp",
      createdAt: Date.now(),
    };
    transaction.objectStore(SHEET_IMAGE_STORE_NAME).put(record);
    try {
      await transactionDone(transaction);
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") throw new LocalStorageQuotaError();
      throw error;
    }
    const confirmed = await getSheetImageRecord(blobId);
    if (!confirmed || confirmed.bytes !== blob.size) {
      throw new Error("A imagem não foi confirmada no armazenamento local. A Ficha anterior foi preservada.");
    }
  }
  return {
    blobId,
    hash,
    bytes: existing?.bytes ?? blob.size,
    contentType: existing?.contentType ?? (blob.type || "image/webp"),
    ...framing,
  };
}

export async function migrateLegacySheetImage(image: LegacySheetImage): Promise<StoredSheetImage> {
  const blob = dataUrlToBlob(image.dataUrl);
  return saveSheetImageBlob(blob, {
    positionX: image.positionX,
    positionY: image.positionY,
    zoom: image.zoom,
    alt: image.alt,
  });
}

export async function materializeSheetImage(image: SheetImage | null): Promise<LegacySheetImage | null> {
  if (!image) return null;
  if (isLegacySheetImage(image)) return image;
  const record = await getSheetImageRecord(image.blobId);
  if (!record) throw new Error("A imagem desta Ficha não foi encontrada neste dispositivo.");
  return {
    dataUrl: await blobToDataUrl(record.blob),
    positionX: image.positionX,
    positionY: image.positionY,
    zoom: image.zoom,
    alt: image.alt,
  };
}

export function sheetImageBlobId(image: SheetImage | null | undefined) {
  return isStoredSheetImage(image) ? image.blobId : null;
}

export async function deleteSheetImageRecords(blobIds: Iterable<string>) {
  const ids = [...new Set(blobIds)];
  if (!ids.length) return { removed: 0, bytes: 0 };
  const records = await Promise.all(ids.map((id) => getSheetImageRecord(id)));
  const database = await openSheetImageDatabase();
  const transaction = writableImageTransaction(database);
  for (const id of ids) transaction.objectStore(SHEET_IMAGE_STORE_NAME).delete(id);
  await transactionDone(transaction);
  return {
    removed: records.filter(Boolean).length,
    bytes: records.reduce((total, record) => total + (record?.bytes ?? 0), 0),
  };
}

export async function garbageCollectSheetImages(
  referencedBlobIds: ReadonlySet<string>,
  minimumAgeMs = 0,
) {
  const records = await listSheetImageRecords();
  const cutoff = Date.now() - Math.max(0, minimumAgeMs);
  const unused = records.filter((record) => !referencedBlobIds.has(record.id) && record.createdAt <= cutoff);
  return deleteSheetImageRecords(unused.map((record) => record.id));
}

export async function estimateSheetImageBytes() {
  const records = await listSheetImageRecords();
  return {
    bytes: records.reduce((total, record) => total + record.bytes, 0),
    count: records.length,
    records,
  };
}
