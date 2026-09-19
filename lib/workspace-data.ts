import { z } from "zod/v3";
import { characterSchema, isStoredSheetImage } from "@/lib/fate";
import { rulesProfileCollectionSchema } from "@/lib/rules-profiles";

export const PREFIX = "fate-gameplay-toolkit.";
export const ACCOUNT_DATA_LIMIT = 3_500_000;
export const ACCOUNT_IMAGE_LIMIT = 25_000_000;
export type WorkspaceData = Record<string, string>;
export type WorkspaceSnapshot = { revision: number; data: WorkspaceData };
const names = new Set([
  "characters.v1", "characters.backup.v1", "rules-profiles.v1", "rules-profiles.backup.v1",
  "table-config.v1", "table-config.backup.v1", "room-sessions.v2", "room-session.v1",
  "reading.v1", "rolls.v1", "language.v1", "workspace", "sheet-mode", "backup-reminder.v1",
]);
export const syncableKey = (key: string) => key.startsWith(PREFIX) && (
  names.has(key.slice(PREFIX.length)) || /^room-draft\.v1\.[\w-]{1,100}$/.test(key.slice(PREFIX.length)) ||
  /^scene-draft\.[\w.-]{1,220}$/.test(key.slice(PREFIX.length))
);
export const roomAccessSchema = z.object({
  roomCode: z.string().regex(/^[2-9A-HJ-NP-Z]{6}$/), participantId: z.string().min(1).max(100),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export function roomAccesses(data: WorkspaceData) {
  const current = data[PREFIX + "room-sessions.v2"];
  const legacy = data[PREFIX + "room-session.v1"];
  return current ? z.object({ rooms: z.array(z.object({ session: roomAccessSchema })).max(48) }).parse(JSON.parse(current)).rooms.map(r => r.session)
    : legacy ? [roomAccessSchema.parse(JSON.parse(legacy))] : [];
}
export function validateWorkspace(input: unknown): WorkspaceData {
  const data = z.record(z.string().max(280), z.string().max(ACCOUNT_DATA_LIMIT)).parse(input);
  if (Object.keys(data).length > 256 || new TextEncoder().encode(JSON.stringify(data)).length > ACCOUNT_DATA_LIMIT) throw Error("workspace_too_large");
  for (const [key, value] of Object.entries(data)) {
    if (!syncableKey(key)) throw Error("workspace_invalid");
    if (/characters\.(?:backup\.)?v1$/.test(key)) {
      const parsed = z.object({ version: z.literal(1), activeId: z.string(), characters: z.array(characterSchema).min(1).max(500) }).parse(JSON.parse(value));
      if (parsed.characters.some(c => c.optional.image && !isStoredSheetImage(c.optional.image))) throw Error("upload_images_first");
    } else if (/rules-profiles\.(?:backup\.)?v1$/.test(key)) rulesProfileCollectionSchema.parse(JSON.parse(value));
    else if (key.includes("room-draft.v1.")) z.object({ version: z.literal(1), text: z.string().max(1600) }).parse(JSON.parse(value));
    else if (key.endsWith("language.v1") && !["pt", "en"].includes(value)) throw Error("workspace_invalid");
  }
  roomAccesses(data);
  return data;
}
export function workspaceImageIds(data: WorkspaceData): string[] {
  const ids = new Set<string>();
  for (const key of ["characters.v1", "characters.backup.v1"]) {
    const raw = data[PREFIX + key];
    if (!raw) continue;
    const payload = JSON.parse(raw);
    for (const character of payload.characters ?? []) {
      const image = character.optional?.image;
      if (isStoredSheetImage(image)) ids.add(image.blobId);
    }
  }
  return [...ids];
}

// Three-way merge: independent edits combine; conflicting edits require a choice.
// Missing entries are deletions, so a stale device cannot resurrect them silently.
type Value = unknown;
const same = (a: Value, b: Value) => JSON.stringify(a) === JSON.stringify(b);
function identity(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { id?: string; session?: { participantId?: string }; sourceId?: string; chapterId?: string; language?: string };
  return v.id ?? v.session?.participantId ?? (v.sourceId && v.chapterId && v.language ? `${v.sourceId}:${v.chapterId}:${v.language}` : null);
}
export function mergeWorkspaces(base: WorkspaceData, local: WorkspaceData, remote: WorkspaceData, prefer?: "local" | "remote") {
  const conflicts: string[] = [];
  function merge(b: Value, l: Value, r: Value, path: string): Value {
    if (same(l, r) || same(b, r)) return l;
    if (same(b, l)) return r;
    if (path.endsWith(".updatedAt") && typeof l === "number" && typeof r === "number") return Math.max(l, r);
    if (Array.isArray(l) && Array.isArray(r) && (b === undefined || Array.isArray(b)) && [...(b ?? []), ...l, ...r].every(x => identity(x) !== null)) {
      const bm = new Map((b as unknown[] ?? []).map(x => [identity(x), x])), lm = new Map(l.map(x => [identity(x), x])), rm = new Map(r.map(x => [identity(x), x]));
      return [...new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])].map(id => merge(bm.get(id), lm.get(id), rm.get(id), `${path}.${id}`)).filter(v => v !== undefined);
    }
    if (l && r && typeof l === "object" && typeof r === "object" && !Array.isArray(l) && !Array.isArray(r) && (b === undefined || (b && typeof b === "object" && !Array.isArray(b)))) {
      const bo = (b ?? {}) as Record<string, Value>, lo = l as Record<string, Value>, ro = r as Record<string, Value>;
      return Object.fromEntries([...new Set([...Object.keys(bo), ...Object.keys(lo), ...Object.keys(ro)])].map(k => [k, merge(bo[k], lo[k], ro[k], `${path}.${k}`)]).filter(([,v]) => v !== undefined));
    }
    conflicts.push(path);
    return prefer === "remote" ? r : l;
  }
  const parse = (v: string | undefined) => { if (v === undefined) return undefined; try { return JSON.parse(v); } catch { return v; } };
  const data: WorkspaceData = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const value = merge(parse(base[key]), parse(local[key]), parse(remote[key]), key);
    if (value !== undefined) data[key] = typeof value === "string" && !key.includes("room-draft") ? value : JSON.stringify(value);
  }
  return { data, conflicts };
}
