// Opt-in, on-device only. Closed enums prevent private content entering reports.
export type DiagnosticArea = "sync" | "upload" | "reader" | "backup" | "app";
export type DiagnosticEvent = { area: DiagnosticArea; result: "ok" | "error"; at: number; durationMs?: number; status?: number };
const key = "fate-gameplay-toolkit.diagnostics.v1";
const consent = "fate-gameplay-toolkit.diagnostics.enabled";
const areas = new Set(["sync", "upload", "reader", "backup", "app"]);
export function diagnosticsEnabled() { try { return localStorage.getItem(consent) === "true"; } catch { return false; } }
export function setDiagnosticsEnabled(enabled: boolean) {
  localStorage.setItem(consent, String(enabled));
  if (!enabled) localStorage.removeItem(key);
}
export function readDiagnostics(): DiagnosticEvent[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(items)) return [];
    return items.filter(item => item && areas.has(item.area) && ["ok", "error"].includes(item.result) && Number.isFinite(item.at) && item.at >= Date.now() - 7 * 86400000).slice(-100).map(item => ({
      area: item.area, result: item.result, at: item.at,
      ...(Number.isFinite(item.durationMs) ? { durationMs: Math.max(0, Math.min(300000, Math.round(item.durationMs))) } : {}),
      ...(Number.isInteger(item.status) && item.status >= 100 && item.status <= 599 ? { status: item.status } : {}),
    }));
  } catch { return []; }
}
export function recordDiagnostic(area: DiagnosticArea, result: "ok" | "error", durationMs?: number, status?: number) {
  if (!diagnosticsEnabled() || !areas.has(area)) return;
  try {
    const entry: DiagnosticEvent = { area, result, at: Date.now() };
    if (Number.isFinite(durationMs)) entry.durationMs = Math.max(0, Math.min(300000, Math.round(durationMs!)));
    if (Number.isInteger(status) && status! >= 100 && status! <= 599) entry.status = status;
    localStorage.setItem(key, JSON.stringify([...readDiagnostics(), entry].slice(-100)));
  } catch { /* Diagnostics never block play. */ }
}
