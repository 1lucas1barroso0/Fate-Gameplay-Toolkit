"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  characterSchema,
  createCharacter,
  createId,
  type FateCharacter,
  type SheetLinks,
} from "@/lib/fate";
import { appendCharacterUndo, duplicateCharacterWithSharedImage, popCharacterUndo } from "@/lib/character-history";
import {
  CHARACTER_BACKUP_KEY,
  CHARACTER_STORE_KEY,
  collectCharacterImageBlobIds,
  collectStoredCharacterImageBlobIds,
  ensureCharacterImageStored,
  makeCharacterExportable,
  migrateLegacyCharacterStorage,
  parseStoredCharacters,
  persistStoredCharacters,
  type StoredCharacters,
} from "@/lib/character-storage";
import { garbageCollectSheetImages } from "@/lib/sheet-image-store";
import { LOCAL_ORPHAN_IMAGE_GRACE_MS } from "@/lib/storage-policy";

export function useCharacterStore() {
  const initial = React.useMemo(() => createCharacter(), []);
  const [characters, setCharacters] = React.useState<FateCharacter[]>([initial]);
  const [activeId, setActiveId] = React.useState(initial.id);
  const [hydrated, setHydrated] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [storageRevision, setStorageRevision] = React.useState(0);
  const undoStack = React.useRef<FateCharacter[]>([]);
  const lastSerialized = React.useRef("");

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const migration = await migrateLegacyCharacterStorage();
          const stored = migration.current ?? parseStoredCharacters(localStorage.getItem(CHARACTER_STORE_KEY));
          if (stored) {
            lastSerialized.current = JSON.stringify(stored);
            setCharacters(stored.characters);
            setActiveId(stored.activeId);
          }
          if (migration.migrated) {
            toast.success(`${migration.migrated === 1 ? "Uma imagem antiga foi movida" : `${migration.migrated} imagens antigas foram movidas`} para o armazenamento durável do navegador.`);
          }
          if (migration.failed) {
            toast.warning("Uma imagem antiga continua preservada na Ficha porque o navegador recusou a migração. Exporte a Ficha antes de liberar espaço.");
          }
        } catch {
          toast.error("Não foi possível abrir os dados salvos. Uma ficha nova foi mantida.");
        } finally {
          setHydrated(true);
          setStorageRevision((current) => current + 1);
        }
      })();
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    const handle = window.setTimeout(() => {
      const payload: StoredCharacters = { version: 1, activeId, characters };
      const serialized = JSON.stringify(payload);
      if (serialized === lastSerialized.current) return;
      try {
        lastSerialized.current = persistStoredCharacters(payload);
        setLastSavedAt(Date.now());
        setStorageRevision((current) => current + 1);
      } catch {
        toast.error("O dispositivo recusou o salvamento. Exporte a ficha para não perder mudanças.");
      }
    }, 220);
    return () => window.clearTimeout(handle);
  }, [activeId, characters, hydrated]);

  const activeCharacter =
    characters.find((character) => character.id === activeId) ?? characters[0];

  const updateActive = React.useCallback(
    (updater: (character: FateCharacter) => FateCharacter, remember = true) => {
      setCharacters((current) =>
        current.map((character) => {
          if (character.id !== activeId) return character;
          const next = { ...updater(character), updatedAt: Date.now() };
          if (remember && JSON.stringify(next) !== JSON.stringify(character)) {
            undoStack.current = appendCharacterUndo(undoStack.current, character);
          }
          return next;
        }),
      );
    },
    [activeId],
  );

  const undo = React.useCallback(() => {
    const popped = popCharacterUndo(undoStack.current);
    undoStack.current = popped.remaining;
    const previous = popped.previous;
    if (!previous || previous.id !== activeId) {
      toast.info("Não há outra mudança para desfazer nesta ficha.");
      return;
    }
    setCharacters((current) =>
      current.map((character) => (character.id === activeId ? previous : character)),
    );
  }, [activeId]);

  const addCharacter = React.useCallback((name?: string, links?: Partial<SheetLinks>) => {
    const character = createCharacter(name, links);
    setCharacters((current) => [...current, character]);
    setActiveId(character.id);
    undoStack.current = [];
    return character;
  }, []);

  const duplicateCharacter = React.useCallback(() => {
    const copy = duplicateCharacterWithSharedImage(activeCharacter, createId("pc"), Date.now());
    setCharacters((current) => [...current, copy]);
    setActiveId(copy.id);
    undoStack.current = [];
  }, [activeCharacter]);

  const deleteActive = React.useCallback(() => {
    setCharacters((current) => {
      if (current.length === 1) {
        const replacement = createCharacter();
        setActiveId(replacement.id);
        return [replacement];
      }
      const remaining = current.filter((character) => character.id !== activeId);
      setActiveId(remaining[0].id);
      return remaining;
    });
    undoStack.current = [];
  }, [activeId]);

  const importCharacter = React.useCallback(async (input: unknown, links?: Partial<SheetLinks>) => {
    const normalized = await ensureCharacterImageStored(input);
    const imported = {
      ...normalized,
      id: createId("pc"),
      optional: {
        ...normalized.optional,
        links: {
          rulesProfileId: links?.rulesProfileId ?? "",
          roomParticipantId: links?.roomParticipantId ?? "",
        },
      },
    };
    setCharacters((current) => [...current, imported]);
    setActiveId(imported.id);
    undoStack.current = [];
    return imported;
  }, []);

  const deleteCharacters = React.useCallback((ids: Iterable<string>) => {
    const selected = new Set(ids);
    if (!selected.size) return;
    setCharacters((current) => {
      let remaining = current.filter((character) => !selected.has(character.id));
      if (!remaining.length) remaining = [createCharacter()];
      if (!remaining.some((character) => character.id === activeId)) setActiveId(remaining[0].id);
      return remaining;
    });
    undoStack.current = undoStack.current.filter((character) => !selected.has(character.id));
  }, [activeId]);

  const replaceRulesProfileLink = React.useCallback((profileId: string, replacementId: string) => {
    setCharacters((current) => current.map((character) => character.optional.links.rulesProfileId === profileId
      ? { ...character, optional: { ...character.optional, links: { ...character.optional.links, rulesProfileId: replacementId } }, updatedAt: Date.now() }
      : character));
  }, []);

  const replaceRoomLink = React.useCallback((participantId: string, replacementId = "") => {
    setCharacters((current) => current.map((character) => character.optional.links.roomParticipantId === participantId
      ? { ...character, optional: { ...character.optional, links: { ...character.optional.links, roomParticipantId: replacementId } }, updatedAt: Date.now() }
      : character));
  }, []);

  const restoreBackup = React.useCallback(() => {
    const raw = localStorage.getItem(CHARACTER_BACKUP_KEY);
    if (!raw) throw new Error("Nenhuma cópia anterior foi encontrada.");
    const parsed = parseStoredCharacters(raw);
    if (!parsed) throw new Error("A cópia anterior está inválida.");
    const restored = parsed.characters.map((character) => characterSchema.parse(character));
    if (!restored.length) throw new Error("A cópia anterior está vazia.");
    setCharacters(restored);
    setActiveId(restored.some((character) => character.id === parsed.activeId) ? parsed.activeId : restored[0].id);
  }, []);

  const cleanupUnusedImages = React.useCallback(async (minimumAgeMs = 0) => {
    const storedIds = collectStoredCharacterImageBlobIds();
    if (!storedIds) throw new Error("Há uma cópia local inválida. Nenhuma imagem foi removida por segurança.");
    for (const id of collectCharacterImageBlobIds(characters)) storedIds.add(id);
    for (const id of collectCharacterImageBlobIds(undoStack.current)) storedIds.add(id);
    const result = await garbageCollectSheetImages(storedIds, minimumAgeMs);
    setStorageRevision((current) => current + 1);
    return result;
  }, [characters]);

  React.useEffect(() => {
    if (!hydrated || !storageRevision) return;
    const handle = window.setTimeout(() => {
      // Give a just-created record time to become part of a confirmed sheet
      // snapshot before automatic collection. Manual cleanup remains immediate.
      void cleanupUnusedImages(LOCAL_ORPHAN_IMAGE_GRACE_MS).catch(() => undefined);
    }, 2_000);
    return () => window.clearTimeout(handle);
  }, [cleanupUnusedImages, hydrated, storageRevision]);

  const exportCharacter = React.useCallback(async (character: FateCharacter) => {
    return makeCharacterExportable(character);
  }, []);

  return {
    characters,
    activeCharacter,
    activeId,
    setActiveId,
    updateActive,
    addCharacter,
    duplicateCharacter,
    deleteActive,
    deleteCharacters,
    importCharacter,
    exportCharacter,
    replaceRulesProfileLink,
    replaceRoomLink,
    restoreBackup,
    cleanupUnusedImages,
    undo,
    hydrated,
    lastSavedAt,
    storageRevision,
  };
}

export type CharacterStore = ReturnType<typeof useCharacterStore>;
