import type { FateCharacter } from "@/lib/fate";
import { CHARACTER_UNDO_LIMIT } from "@/lib/storage-policy";

// Character state is already updated immutably. Keeping the previous object
// therefore provides structural sharing: image references and unchanged nested
// structures are not cloned for every undo step.
export function appendCharacterUndo(
  stack: readonly FateCharacter[],
  character: FateCharacter,
) {
  return [...stack.slice(-(CHARACTER_UNDO_LIMIT - 1)), character];
}

export function popCharacterUndo(stack: readonly FateCharacter[]) {
  if (!stack.length) return { previous: null, remaining: [] as FateCharacter[] };
  return {
    previous: stack.at(-1) ?? null,
    remaining: stack.slice(0, -1),
  };
}

export function duplicateCharacterWithSharedImage(
  character: FateCharacter,
  id: string,
  updatedAt: number,
): FateCharacter {
  const { image, ...optionalWithoutImage } = character.optional;
  const cloned = structuredClone({ ...character, optional: optionalWithoutImage });
  return {
    ...cloned,
    id,
    name: `${character.name || "Ficha"} — cópia`,
    updatedAt,
    optional: { ...cloned.optional, image },
  };
}
