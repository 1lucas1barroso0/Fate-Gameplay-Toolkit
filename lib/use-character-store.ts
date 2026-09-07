"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  characterSchema,
  createCharacter,
  createId,
  normalizeCharacter,
  type FateCharacter,
  type SheetLinks,
} from "@/lib/fate";

const STORE_KEY = "fate-gameplay-toolkit.characters.v1";
const BACKUP_KEY = "fate-gameplay-toolkit.characters.backup.v1";

type StoredCharacters = {
  version: 1;
  activeId: string;
  characters: FateCharacter[];
};

function readStoredCharacters(): StoredCharacters | null {
  const raw = localStorage.getItem(STORE_KEY);
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

export function useCharacterStore() {
  const initial = React.useMemo(() => createCharacter(), []);
  const [characters, setCharacters] = React.useState<FateCharacter[]>([initial]);
  const [activeId, setActiveId] = React.useState(initial.id);
  const [hydrated, setHydrated] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const undoStack = React.useRef<FateCharacter[]>([]);
  const lastSerialized = React.useRef("");

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        const stored = readStoredCharacters();
        if (stored) {
          setCharacters(stored.characters);
          setActiveId(stored.activeId);
        }
      } catch {
        toast.error("Não foi possível abrir os dados salvos. Uma ficha nova foi mantida.");
      } finally {
        setHydrated(true);
      }
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
        const previous = localStorage.getItem(STORE_KEY);
        if (previous && previous !== serialized) localStorage.setItem(BACKUP_KEY, previous);
        localStorage.setItem(STORE_KEY, serialized);
        lastSerialized.current = serialized;
        setLastSavedAt(Date.now());
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
            undoStack.current = [...undoStack.current.slice(-29), structuredClone(character)];
          }
          return next;
        }),
      );
    },
    [activeId],
  );

  const undo = React.useCallback(() => {
    const previous = undoStack.current.pop();
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
    const copy: FateCharacter = {
      ...structuredClone(activeCharacter),
      id: createId("pc"),
      name: `${activeCharacter.name || "Ficha"} — cópia`,
      updatedAt: Date.now(),
    };
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

  const importCharacter = React.useCallback((input: unknown, links?: Partial<SheetLinks>) => {
    const normalized = normalizeCharacter(input);
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
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) throw new Error("Nenhuma cópia anterior foi encontrada.");
    const parsed = JSON.parse(raw) as StoredCharacters;
    const restored = parsed.characters.map((character) => characterSchema.parse(character));
    if (!restored.length) throw new Error("A cópia anterior está vazia.");
    setCharacters(restored);
    setActiveId(restored.some((character) => character.id === parsed.activeId) ? parsed.activeId : restored[0].id);
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
    importCharacter,
    replaceRulesProfileLink,
    replaceRoomLink,
    restoreBackup,
    undo,
    hydrated,
    lastSavedAt,
  };
}
