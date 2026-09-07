import { hasExtraMild, stressBoxCount, type FateCharacter } from "@/lib/fate";
import type { TableConfig } from "@/lib/table-config";

const LEGACY_ASPECTS = new Set(["highConcept", "trouble", "relationship", "other1", "other2"]);
const LEGACY_CONSEQUENCES = new Set(["mild", "moderate", "severe", "extraMild"]);

export function aspectValue(character: FateCharacter, id: string) {
  if (id in character.optional.aspectValues) return character.optional.aspectValues[id] ?? "";
  return LEGACY_ASPECTS.has(id) ? character.aspects[id as keyof FateCharacter["aspects"]] : "";
}

export function withAspectValue(character: FateCharacter, id: string, value: string): FateCharacter {
  const aspects = LEGACY_ASPECTS.has(id)
    ? { ...character.aspects, [id]: value }
    : character.aspects;
  return {
    ...character,
    aspects,
    optional: {
      ...character.optional,
      aspectValues: { ...character.optional.aspectValues, [id]: value },
    },
  };
}

export function stressMarks(character: FateCharacter, id: string) {
  if (id in character.optional.stressMarks) return character.optional.stressMarks[id] ?? [];
  if (id === "physicalStress" || id === "mentalStress") return character.session[id];
  return [];
}

export function withStressMark(character: FateCharacter, id: string, index: number, checked: boolean): FateCharacter {
  const current = stressMarks(character, id);
  const length = Math.max(current.length, index + 1);
  const marks = Array.from({ length }, (_, markIndex) => current[markIndex] ?? false);
  marks[index] = checked;
  const session = id === "physicalStress" || id === "mentalStress"
    ? { ...character.session, [id]: marks }
    : character.session;
  return {
    ...character,
    session,
    optional: {
      ...character.optional,
      stressMarks: { ...character.optional.stressMarks, [id]: marks },
    },
  };
}

export function clearStress(character: FateCharacter, trackIds: string[]): FateCharacter {
  return trackIds.reduce((current, id) => {
    const marks = stressMarks(current, id).map(() => false);
    const session = id === "physicalStress" || id === "mentalStress"
      ? { ...current.session, [id]: marks }
      : current.session;
    return {
      ...current,
      session,
      optional: {
        ...current.optional,
        stressMarks: { ...current.optional.stressMarks, [id]: marks },
      },
    };
  }, character);
}

export function stressBoxes(character: FateCharacter, track: TableConfig["sheetStructure"]["stressTracks"][number]) {
  if (track.growth === "fixed" || !track.skillId) return track.boxes;
  const growth = stressBoxCount(character.skills[track.skillId] ?? 0) - 3;
  return Math.min(30, Math.max(0, track.boxes + growth));
}

export function sheetHasExtraMild(character: FateCharacter, config: TableConfig) {
  return config.sheetStructure.stressTracks.some((track) => track.growth === "condensed" && track.skillId && hasExtraMild(character.skills[track.skillId] ?? 0));
}

export function consequenceValue(character: FateCharacter, id: string) {
  if (id in character.optional.consequenceValues) return character.optional.consequenceValues[id] ?? "";
  return LEGACY_CONSEQUENCES.has(id) ? character.session.consequences[id as keyof FateCharacter["session"]["consequences"]] : "";
}

export function withConsequenceValue(character: FateCharacter, id: string, value: string): FateCharacter {
  const consequences = LEGACY_CONSEQUENCES.has(id)
    ? { ...character.session.consequences, [id]: value }
    : character.session.consequences;
  return {
    ...character,
    session: { ...character.session, consequences },
    optional: {
      ...character.optional,
      consequenceValues: { ...character.optional.consequenceValues, [id]: value },
    },
  };
}

export function resourceValue(character: FateCharacter, id: string) {
  if (id === "refresh") return String(character.refresh);
  if (id === "fatePoints") return String(character.session.fatePoints);
  return character.optional.resourceValues[id] ?? "";
}

export function withResourceValue(character: FateCharacter, id: string, value: string): FateCharacter {
  if (id === "refresh") return {
    ...character,
    refresh: Math.max(0, Math.min(999, Number(value) || 0)),
    optional: { ...character.optional, resourceValues: { ...character.optional.resourceValues, [id]: value } },
  };
  if (id === "fatePoints") return {
    ...character,
    session: { ...character.session, fatePoints: Math.max(0, Math.min(999, Number(value) || 0)) },
    optional: { ...character.optional, resourceValues: { ...character.optional.resourceValues, [id]: value } },
  };
  return {
    ...character,
    optional: { ...character.optional, resourceValues: { ...character.optional.resourceValues, [id]: value } },
  };
}
