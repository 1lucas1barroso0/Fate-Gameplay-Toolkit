import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import "fake-indexeddb/auto";

const root = fileURLToPath(new URL("..", import.meta.url));

function loadModule(relativePath) {
  return import(pathToFileURL(path.join(root, relativePath.replace(/^\//, ""))).href);
}

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

async function clearImageDatabase() {
  const { SHEET_IMAGE_DB_NAME, resetSheetImageDatabaseConnection } = await loadModule("/lib/sheet-image-store.ts");
  await resetSheetImageDatabaseConnection();
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(SHEET_IMAGE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB remained open during the test."));
  });
}

function legacyImage(dataUrl = "data:image/png;base64,AAECAwQ=") {
  return { dataUrl, positionX: 27, positionY: 68, zoom: 1.45, alt: "Um ponto de luz" };
}

test("migrates Base64 sheets transactionally, reloads them, and is idempotent", async () => {
  await clearImageDatabase();
  const { createCharacter } = await loadModule("/lib/fate.ts");
  const {
    CHARACTER_STORE_KEY,
    migrateLegacyCharacterStorage,
    parseStoredCharacters,
  } = await loadModule("/lib/character-storage.ts");
  const { getSheetImageRecord, resetSheetImageDatabaseConnection } = await loadModule("/lib/sheet-image-store.ts");
  const storage = new MemoryStorage();
  const sheet = createCharacter("Arquivo antigo");
  sheet.optional.image = legacyImage();
  storage.setItem(CHARACTER_STORE_KEY, JSON.stringify({ version: 1, activeId: sheet.id, characters: [sheet] }));

  const first = await migrateLegacyCharacterStorage(storage);
  assert.equal(first.migrated, 1);
  assert.equal(first.failed, 0);
  const stored = parseStoredCharacters(storage.getItem(CHARACTER_STORE_KEY));
  assert.ok(stored);
  const image = stored.characters[0].optional.image;
  assert.ok(image.blobId);
  assert.equal("dataUrl" in image, false);
  assert.deepEqual({ x: image.positionX, y: image.positionY, zoom: image.zoom, alt: image.alt }, { x: 27, y: 68, zoom: 1.45, alt: "Um ponto de luz" });

  await resetSheetImageDatabaseConnection();
  const reopened = await getSheetImageRecord(image.blobId);
  assert.equal(reopened?.blob.size, 5);
  const second = await migrateLegacyCharacterStorage(storage);
  assert.equal(second.migrated, 0);
  assert.equal(second.failed, 0);
});

test("deduplicates immutable image Blobs and replaces/removes them without premature collection", async () => {
  await clearImageDatabase();
  const { createCharacter } = await loadModule("/lib/fate.ts");
  const {
    CHARACTER_STORE_KEY,
    collectStoredCharacterImageBlobIds,
    persistStoredCharacters,
  } = await loadModule("/lib/character-storage.ts");
  const {
    garbageCollectSheetImages,
    listSheetImageRecords,
    saveSheetImageBlob,
  } = await loadModule("/lib/sheet-image-store.ts");
  const framing = { positionX: 50, positionY: 50, zoom: 1, alt: "Imagem" };
  const first = await saveSheetImageBlob(new Blob(["mesmos bytes"], { type: "image/webp" }), framing, { estimate: async () => ({ usage: 0, quota: 100_000_000 }) });
  const duplicate = await saveSheetImageBlob(new Blob(["mesmos bytes"], { type: "image/webp" }), { ...framing, zoom: 2 }, { estimate: async () => ({ usage: 0, quota: 100_000_000 }) });
  const replacement = await saveSheetImageBlob(new Blob(["outros bytes"], { type: "image/webp" }), framing, { estimate: async () => ({ usage: 0, quota: 100_000_000 }) });
  assert.equal(first.blobId, duplicate.blobId);
  assert.notEqual(first.blobId, replacement.blobId);
  assert.equal((await listSheetImageRecords()).length, 2);

  const storage = new MemoryStorage();
  const sheet = createCharacter("Duplicada");
  sheet.optional.image = first;
  persistStoredCharacters({ version: 1, activeId: sheet.id, characters: [sheet] }, storage);
  sheet.optional.image = replacement;
  persistStoredCharacters({ version: 1, activeId: sheet.id, characters: [sheet] }, storage);
  let refs = collectStoredCharacterImageBlobIds(storage);
  await garbageCollectSheetImages(refs);
  assert.equal((await listSheetImageRecords()).length, 2, "the recoverable backup still references the previous image");

  sheet.name = "Backup rotation";
  persistStoredCharacters({ version: 1, activeId: sheet.id, characters: [sheet] }, storage);
  refs = collectStoredCharacterImageBlobIds(storage);
  const collected = await garbageCollectSheetImages(refs);
  assert.equal(collected.removed, 1);
  assert.deepEqual((await listSheetImageRecords()).map((item) => item.id), [replacement.blobId]);
  assert.ok(storage.getItem(CHARACTER_STORE_KEY).includes(replacement.blobId));
});

test("duplicates sheets and keeps 30 undo snapshots without copying image bytes", async () => {
  const { createCharacter } = await loadModule("/lib/fate.ts");
  const { appendCharacterUndo, duplicateCharacterWithSharedImage, popCharacterUndo } = await loadModule("/lib/character-history.ts");
  const sheet = createCharacter("Sem cópias gigantes");
  sheet.optional.image = { blobId: `img_${"a".repeat(64)}`, hash: "a".repeat(64), bytes: 900_000, contentType: "image/webp", positionX: 50, positionY: 50, zoom: 1, alt: "" };
  const duplicate = duplicateCharacterWithSharedImage(sheet, "pc_copy", 123);
  assert.strictEqual(duplicate.optional.image, sheet.optional.image);
  assert.notStrictEqual(duplicate.optional.customValues, sheet.optional.customValues);
  assert.equal(duplicate.name, "Sem cópias gigantes — cópia");
  let history = [];
  for (let index = 0; index < 35; index += 1) history = appendCharacterUndo(history, sheet);
  assert.equal(history.length, 30);
  assert.strictEqual(history[29], sheet);
  assert.strictEqual(history[29].optional.image, sheet.optional.image);
  const popped = popCharacterUndo(history);
  assert.strictEqual(popped.previous, sheet);
  assert.equal(popped.remaining.length, 29);
});

test("refuses unsafe local and room writes before overwriting existing data", async () => {
  const { LocalStorageQuotaError, assertLocalWriteCapacity } = await loadModule("/lib/sheet-image-store.ts");
  const { canAcceptRoomFile, MAX_ROOM_FILE_BYTES, ROOM_FILE_BUDGET_BYTES } = await loadModule("/lib/storage-policy.ts");
  await assert.rejects(
    assertLocalWriteCapacity(1_000_000, { estimate: async () => ({ usage: 96_000_000, quota: 100_000_000 }) }),
    LocalStorageQuotaError,
  );
  const nearRoomLimit = canAcceptRoomFile({ roomUsedBytes: ROOM_FILE_BUDGET_BYTES - 10, roomFileCount: 2, projectUsedBytes: 0, incomingBytes: 11 });
  assert.equal(nearRoomLimit.accepted, false);
  const oversized = canAcceptRoomFile({ roomUsedBytes: 0, roomFileCount: 0, projectUsedBytes: 0, incomingBytes: MAX_ROOM_FILE_BYTES + 1 });
  assert.equal(oversized.accepted, false);
});

test("protects cross-room deletion and only collects old unreferenced Blobs", async () => {
  const { canDeleteRoomFile, selectOrphanBlobPathnames, ORPHAN_BLOB_GRACE_MS } = await loadModule("/lib/storage-policy.ts");
  assert.equal(canDeleteRoomFile({ id: "player-a", role: "player", status: "approved" }, "player-a"), true);
  assert.equal(canDeleteRoomFile({ id: "player-a", role: "player", status: "approved" }, "player-b"), false);
  assert.equal(canDeleteRoomFile({ id: "gm", role: "gm", status: "approved" }, "player-b"), true);
  assert.equal(canDeleteRoomFile({ id: "gm", role: "gm", status: "pending" }, "player-b"), false);
  const now = 10 * ORPHAN_BLOB_GRACE_MS;
  const selected = selectOrphanBlobPathnames([
    { pathname: "rooms/A/ref", uploadedAt: now - 2 * ORPHAN_BLOB_GRACE_MS },
    { pathname: "rooms/A/old", uploadedAt: now - 2 * ORPHAN_BLOB_GRACE_MS },
    { pathname: "rooms/A/new", uploadedAt: now - ORPHAN_BLOB_GRACE_MS / 2 },
  ], new Set(["rooms/A/ref"]), now);
  assert.deepEqual(selected, ["rooms/A/old"]);
});

test("imports and exports legacy images while localStorage keeps only references", async () => {
  await clearImageDatabase();
  const { createCharacter } = await loadModule("/lib/fate.ts");
  const { ensureCharacterImageStored, makeCharacterExportable, hasOnlyImageReferences } = await loadModule("/lib/character-storage.ts");
  const sheet = createCharacter("Viagem completa");
  sheet.optional.image = legacyImage("data:image/png;base64,AQIDBAU=");
  const imported = await ensureCharacterImageStored(sheet);
  assert.ok(imported.optional.image.blobId);
  assert.equal(hasOnlyImageReferences({ version: 1, activeId: imported.id, characters: [imported] }), true);
  const exported = await makeCharacterExportable(imported);
  assert.equal(exported.optional.image.dataUrl, sheet.optional.image.dataUrl);
  assert.equal(exported.optional.image.alt, sheet.optional.image.alt);
});

test("reports gracefully when StorageManager is incomplete and classifies Fate data", async () => {
  await clearImageDatabase();
  const { readLocalStorageReport } = await loadModule("/lib/local-storage-manager.ts");
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.setItem("fate-gameplay-toolkit.characters.v1", "sheets");
  local.setItem("fate-gameplay-toolkit.rules-profiles.v1", "rules");
  local.setItem("fate-gameplay-toolkit.room-sessions.v2", "rooms");
  session.setItem("fate-gameplay-toolkit.active-room.v1", "active");
  const report = await readLocalStorageReport(undefined, local, session);
  assert.equal(report.quota, null);
  assert.equal(report.percent, null);
  assert.equal(report.state, "normal");
  assert.ok(report.breakdown.sheets > 0);
  assert.ok(report.breakdown.settings > 0);
  assert.ok(report.breakdown.rooms > 0);
});

test("wires physical Blob deletion, room cascades, pagination and bounded retention", async () => {
  const [server, detailRoute, fileRoute, historyRoute, storageRoute, schema] = await Promise.all([
    readFile(path.join(root, "lib/server/rooms.ts"), "utf8"),
    readFile(path.join(root, "app/api/rooms/[code]/route.ts"), "utf8"),
    readFile(path.join(root, "app/api/rooms/[code]/files/[entryId]/route.ts"), "utf8"),
    readFile(path.join(root, "app/api/rooms/[code]/history/route.ts"), "utf8"),
    readFile(path.join(root, "app/api/rooms/[code]/storage/route.ts"), "utf8"),
    readFile(path.join(root, "db/schema.ts"), "utf8"),
  ]);
  assert.match(detailRoute, /export async function DELETE/);
  assert.match(fileRoute, /export async function DELETE/);
  assert.match(historyRoute, /ReadableStream|streamRoomHistory/);
  assert.match(storageRoute, /cleanupRoomOrphanBlobs/);
  assert.match(server, /await del\(item\.pathname\)/);
  assert.match(server, /room_id = \$\{self\.roomId\} AND type = 'file'/);
  assert.match(server, /self\.role !== "gm" && file\.actorId !== self\.id/);
  assert.match(server, /LIMIT 101/);
  assert.match(server, /upload_reservations/);
  assert.match(server, /blob_cleanup_queue/);
  assert.match(schema, /onDelete: "cascade"/);
  assert.match(schema, /entries_room_created_idx/);
});

test("serializes shared Blob capacity and repairs late uploads without unbounded ledgers", async () => {
  const [server, policy, schema] = await Promise.all([
    readFile(path.join(root, "lib/server/rooms.ts"), "utf8"),
    readFile(path.join(root, "lib/storage-policy.ts"), "utf8"),
    readFile(path.join(root, "db/schema.ts"), "utf8"),
  ]);
  assert.match(server, /GLOBAL_BLOB_STORAGE_LOCK/);
  assert.match(server, /pg_advisory_xact_lock\(hashtext\(\$\{GLOBAL_BLOB_STORAGE_LOCK\}\)\)/);
  assert.match(server, /request_id != \$\{payload\.requestId\}/);
  assert.match(server, /await drainBlobCleanupQueue/);
  assert.match(server, /rescanDeletedRoomBlobs/);
  assert.match(server, /last_scan_at <= \$\{now\}::BIGINT - CASE scan_count/);
  assert.match(server, /DELETED_ROOM_RESCAN_DELAYS_MS\[0\]\}::BIGINT/);
  assert.match(server, /LIMIT \$\{limit\}::INTEGER/);
  assert.match(server, /ORDER BY attempts ASC, created_at ASC/);
  assert.match(server, /DELETE FROM blob_usage_ledger WHERE created_at/);
  assert.match(policy, /BLOB_USAGE_WINDOW_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(policy, /DELETED_ROOM_RESCAN_LIMIT = 7/);
  assert.match(schema, /blobUsageLedger/);
  assert.match(schema, /entries_room_created_id_idx/);
});
