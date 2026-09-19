import { workspaceStorage as localStorage } from "@/lib/workspace-storage";
import { z } from "zod/v3";
import { characterSchema, type FateCharacter } from "@/lib/fate";
import { rulesProfileSchema, type RulesProfile } from "@/lib/rules-profiles";

export const BACKUP_REMINDER_KEY = "fate-gameplay-toolkit.backup-reminder.v1";
export const backupSchema = z.object({
  format: z.literal("fate-gameplay-toolkit-backup"), bundleVersion: z.literal(4),
  sheets: z.array(characterSchema).max(500), rulesProfiles: z.array(rulesProfileSchema).max(24),
  reading: z.unknown().optional(),
});
export type BackupBundle = z.infer<typeof backupSchema>;
function stable(value: unknown, path = ""): string {
  if (Array.isArray(value)) return "[" + value.map(item => stable(item, path + "[]")).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([k]) => !(path === "" && ["id", "createdAt", "updatedAt"].includes(k)) && !(path === ".optional" && k === "links")).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ":" + stable(v, path + "." + k)).join(",") + "}";
  return JSON.stringify(value);
}
export function compareBackup<T extends FateCharacter | RulesProfile>(incoming: T[], local: T[]) {
  return incoming.map(item => {
    const fingerprint = stable(item);
    const identical = local.find(value => stable(value) === fingerprint);
    const existing = local.find(value => value.id === item.id);
    return { item, status: identical ? "same" as const : existing ? "copy" as const : "new" as const,
      changed: existing ? Object.keys(item).filter(key => !["id", "createdAt", "updatedAt"].includes(key) && stable(item[key as keyof T], "." + key) !== stable(existing[key as keyof T], "." + key)) : [] };
  });
}
export type BackupReminder = { days: number; lastExportAt: number; snoozedUntil: number };
export function readBackupReminder(): BackupReminder {
  try {
    const value = JSON.parse(localStorage.getItem(BACKUP_REMINDER_KEY) ?? "{}");
    return { days: [7, 30].includes(value.days) ? value.days : 0, lastExportAt: Number.isFinite(value.lastExportAt) ? Math.max(0, value.lastExportAt) : 0, snoozedUntil: Number.isFinite(value.snoozedUntil) ? Math.max(0, value.snoozedUntil) : 0 };
  } catch { return { days: 0, lastExportAt: 0, snoozedUntil: 0 }; }
}
export function writeBackupReminder(value: BackupReminder) {
  localStorage.setItem(BACKUP_REMINDER_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event("fate:backup"));
}
export function backupDue(value: BackupReminder, now = Date.now()) {
  return value.days > 0 && now >= value.snoozedUntil && now - value.lastExportAt >= value.days * 86400000;
}
