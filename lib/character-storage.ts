import {
  characterSchema,
  isLegacySheetImage,
  isStoredSheetImage,
  normalizeCharacter,
  type FateCharacter,
} from "@/lib/fate";
import {
  materializeSheetImage,
  migrateLegacySheetImage,
  sheetImageBlobId,
} from "@/lib/sheet-image-store";

export const CHARACTER_STORE_KEY = "fate-gameplay-toolkit.characters.v1";
export const CHARACTER_BACKUP_KEY = "fate-gameplay-toolkit.characters.backup.v1";
const MIGRATION_SUFFIX = ".indexeddb-pending";

export type StoredCharacters = {
  version: 1;
  activeId: string;
  characters: FateCharacter[];
};

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function parseStoredCharacters(raw: string | null): StoredCharacters | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<StoredCharacters>;
  if (parsed.version !== 1 || !Array.isArray(parsed.characters)) return null;
  const characters = parsed.characters.map((character) => characterSchema.parse(character));
  if (!characters.length) return null;
  const activeId = characters.some((character) => character.id === parsed.activeId)
    ? String(parsed.activeId)
    : characters[0].id;
  return { version: 1, activeId, characters };
}

async function migrateCharacter(character: FateCharacter) {
  const image = character.optional.image;
  if (!isLegacySheetImage(image)) return { character, migrated: false, failed: false };
  try {
    const stored = await migrateLegacySheetImage(image);
    return {
      character: {
        ...character,
        optional: { ...character.optional, image: stored },
      },
      migrated: true,
      failed: false,
    };
  } catch {
    // Keeping the original data URL is the safe fallback. It is only replaced
    // after IndexedDB confirms the immutable Blob record.
    return { character, migrated: false, failed: true };
  }
}

export async function migrateStoredCharacterPayload(payload: StoredCharacters) {
  const results = await Promise.all(payload.characters.map(migrateCharacter));
  return {
    payload: { ...payload, characters: results.map((result) => result.character) },
    migrated: results.filter((result) => result.migrated).length,
    failed: results.filter((result) => result.failed).length,
  };
}

function replaceStorageItemSafely(storage: KeyValueStorage, key: string, value: string) {
  const pendingKey = `${key}${MIGRATION_SUFFIX}`;
  storage.setItem(pendingKey, value);
  storage.setItem(key, value);
  if (storage.getItem(key) !== value) throw new Error("A migração local não foi confirmada.");
  storage.removeItem(pendingKey);
}

export function persistStoredCharacters(
  payload: StoredCharacters,
  storage: KeyValueStorage = localStorage,
) {
  const serialized = JSON.stringify(payload);
  const pendingKey = `${CHARACTER_STORE_KEY}${MIGRATION_SUFFIX}`;
  storage.setItem(pendingKey, serialized);
  const previous = storage.getItem(CHARACTER_STORE_KEY);
  if (previous && previous !== serialized) storage.setItem(CHARACTER_BACKUP_KEY, previous);
  storage.setItem(CHARACTER_STORE_KEY, serialized);
  if (storage.getItem(CHARACTER_STORE_KEY) !== serialized) {
    throw new Error("O salvamento local não foi confirmado.");
  }
  storage.removeItem(pendingKey);
  return serialized;
}

export async function migrateLegacyCharacterStorage(
  storage: KeyValueStorage = localStorage,
) {
  const keys = [CHARACTER_STORE_KEY, CHARACTER_BACKUP_KEY] as const;
  let migrated = 0;
  let failed = 0;
  let current: StoredCharacters | null = null;

  for (const key of keys) {
    const pending = storage.getItem(`${key}${MIGRATION_SUFFIX}`);
    if (pending) {
      try {
        const recovered = parseStoredCharacters(pending);
        if (recovered) replaceStorageItemSafely(storage, key, JSON.stringify(recovered));
      } catch {
        storage.removeItem(`${key}${MIGRATION_SUFFIX}`);
      }
    }

    const parsed = parseStoredCharacters(storage.getItem(key));
    if (!parsed) continue;
    const result = await migrateStoredCharacterPayload(parsed);
    migrated += result.migrated;
    failed += result.failed;
    if (result.migrated > 0) {
      replaceStorageItemSafely(storage, key, JSON.stringify(result.payload));
    }
    if (key === CHARACTER_STORE_KEY) current = result.payload;
  }

  // Seed a recoverable copy without duplicating image bytes: both payloads
  // point at the same immutable IndexedDB records.
  if (current && hasOnlyImageReferences(current) && !storage.getItem(CHARACTER_BACKUP_KEY)) {
    replaceStorageItemSafely(storage, CHARACTER_BACKUP_KEY, JSON.stringify(current));
  }

  return { current, migrated, failed };
}

export async function ensureCharacterImageStored(input: unknown) {
  const character = normalizeCharacter(input);
  const image = character.optional.image;
  if (!isLegacySheetImage(image)) return character;
  const stored = await migrateLegacySheetImage(image);
  return {
    ...character,
    optional: { ...character.optional, image: stored },
  } satisfies FateCharacter;
}

export async function makeCharacterExportable(character: FateCharacter) {
  const image = await materializeSheetImage(character.optional.image);
  return {
    ...character,
    optional: { ...character.optional, image },
  } satisfies FateCharacter;
}

export function collectCharacterImageBlobIds(characters: Iterable<FateCharacter>) {
  const ids = new Set<string>();
  for (const character of characters) {
    const id = sheetImageBlobId(character.optional.image);
    if (id) ids.add(id);
  }
  return ids;
}

export function collectStoredCharacterImageBlobIds(
  storage: Pick<Storage, "getItem"> = localStorage,
) {
  const ids = new Set<string>();
  for (const key of [CHARACTER_STORE_KEY, CHARACTER_BACKUP_KEY]) {
    try {
      const parsed = parseStoredCharacters(storage.getItem(key));
      if (!parsed) continue;
      for (const id of collectCharacterImageBlobIds(parsed.characters)) ids.add(id);
    } catch {
      // Invalid legacy data is preserved for recovery; it is never treated as
      // permission to delete a Blob.
      return null;
    }
  }
  return ids;
}

export function imageBytesInsideCharacterJson(character: FateCharacter) {
  const image = character.optional.image;
  return isLegacySheetImage(image) ? image.dataUrl.length : 0;
}

export function hasOnlyImageReferences(payload: StoredCharacters) {
  return payload.characters.every((character) => {
    const image = character.optional.image;
    return !image || isStoredSheetImage(image);
  });
}
