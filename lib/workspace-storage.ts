import { PREFIX, mergeWorkspaces, syncableKey, type WorkspaceData, type WorkspaceSnapshot } from "@/lib/workspace-data";

export const WORKSPACE_EVENT = "fate:workspace-remote";
export const WORKSPACE_WRITE = "fate:workspace-write";
export const WORKSPACE_FLUSH = "fate:workspace-flush";
export function flushWorkspace() {
  if (!window.dispatchEvent(new Event(WORKSPACE_FLUSH, { cancelable: true }))) throw Error("local_save_failed");
}
const CACHE = PREFIX + "account-cache.";
let accountId: string | null = null;
let envelope: { base: WorkspaceSnapshot; data: WorkspaceData } | null = null;
let lastPersisted: string | null = null;
export const currentAccountId = () => accountId;
export const imageDatabaseName = (base: string) => accountId ? `${base}-account-${accountId}` : base;
export const workspaceIsAccount = () => accountId !== null;
function emit(name: string) { if (typeof window !== "undefined") window.dispatchEvent(new Event(name)); }
function persist() {
  if (!accountId || !envelope) return;
  const raw = globalThis.localStorage.getItem(CACHE + accountId);
  let candidate = envelope;
  if (raw && raw !== lastPersisted) {
    const latest = JSON.parse(raw) as NonNullable<typeof envelope>;
    const before = lastPersisted ? JSON.parse(lastPersisted).data : {};
    const merged = mergeWorkspaces(before, envelope.data, latest.data);
    if (merged.conflicts.length) throw Error("tab_conflict");
    candidate = { base: latest.base.revision > envelope.base.revision ? latest.base : envelope.base, data: merged.data };
  }
  const serialized = JSON.stringify(candidate);
  globalThis.localStorage.setItem(CACHE + accountId, serialized);
  const changed = JSON.stringify(candidate.data) !== JSON.stringify(envelope.data);
  envelope = candidate; lastPersisted = serialized;
  if (changed) emit(WORKSPACE_EVENT);
}
export function reloadAccountCache(event: StorageEvent) {
  if (!accountId || event.key !== CACHE + accountId || !event.newValue || event.newValue === lastPersisted) return;
  persist();
}
export function selectWorkspace(id: string | null, snapshot?: WorkspaceSnapshot) {
  const previousId = accountId;
  const previousEnvelope = envelope;
  const previousPersisted = lastPersisted;
  try {
  accountId = id;
  envelope = null;
  lastPersisted = null;
  if (id) {
    const raw = globalThis.localStorage.getItem(CACHE + id);
    lastPersisted = raw;
    if (raw) envelope = JSON.parse(raw);
    else if (snapshot) envelope = { base: snapshot, data: snapshot.data };
    else throw Error("workspace_missing");
    persist();
  }
  } catch (error) { accountId = previousId; envelope = previousEnvelope; lastPersisted = previousPersisted; throw error; }
  emit(WORKSPACE_EVENT);
}
export function workspaceBase(): WorkspaceSnapshot { return envelope?.base ?? { revision: 0, data: {} }; }
export function captureWorkspace(): WorkspaceData {
  if (envelope) return { ...envelope.data };
  const data: WorkspaceData = {};
  for (let i = 0; i < globalThis.localStorage.length; i++) {
    const key = globalThis.localStorage.key(i);
    if (key && syncableKey(key)) data[key] = globalThis.localStorage.getItem(key)!;
  }
  return data;
}
export function receiveWorkspace(base: WorkspaceSnapshot, data = base.data) {
  if (!accountId) throw Error("workspace_missing");
  const previous = envelope;
  envelope = { base, data };
  try { persist(); } catch (error) { envelope = previous; throw error; }
  if (JSON.stringify(previous?.data) !== JSON.stringify(data)) emit(WORKSPACE_EVENT);
}
export function forgetAccountCache(id: string) {
  globalThis.localStorage.removeItem(CACHE + id);
  for (let i = globalThis.sessionStorage.length - 1; i >= 0; i--) {
    const key = globalThis.sessionStorage.key(i);
    if (key?.startsWith(CACHE + id + ".")) globalThis.sessionStorage.removeItem(key);
  }
}
export function cachedAccountIds() {
  const ids: string[] = [];
  for (let i = 0; i < globalThis.localStorage.length; i++) {
    const key = globalThis.localStorage.key(i);
    if (key?.startsWith(CACHE)) ids.push(key.slice(CACHE.length));
  }
  return ids;
}
// Guest keys retain their original names. Account data never enters the guest store.
export const workspaceStorage: Storage = {
  get length() { return accountId ? Object.keys(envelope?.data ?? {}).length : globalThis.localStorage.length; },
  key(index) { return accountId ? Object.keys(envelope?.data ?? {})[index] ?? null : globalThis.localStorage.key(index); },
  getItem(key) {
    if (!accountId) return globalThis.localStorage.getItem(key);
    return envelope?.data[key] ?? globalThis.sessionStorage.getItem(CACHE + accountId + "." + key);
  },
  setItem(key, value) {
    if (!accountId) { globalThis.localStorage.setItem(key, value); return; }
    if (!envelope) throw Error("workspace_missing");
    if (!syncableKey(key)) { globalThis.sessionStorage.setItem(CACHE + accountId + "." + key, value); return; }
    if (envelope.data[key] === value) return;
    const previous = envelope.data;
    envelope.data = { ...previous, [key]: value };
    try { persist(); } catch (error) { envelope.data = previous; throw error; }
    emit(WORKSPACE_WRITE);
  },
  removeItem(key) {
    if (!accountId) { globalThis.localStorage.removeItem(key); return; }
    globalThis.sessionStorage.removeItem(CACHE + accountId + "." + key);
    if (!envelope || !(key in envelope.data)) return;
    const previous = envelope.data;
    envelope.data = { ...previous }; delete envelope.data[key];
    try { persist(); } catch (error) { envelope.data = previous; throw error; }
    emit(WORKSPACE_WRITE);
  },
  clear() { for (const key of Object.keys(captureWorkspace())) this.removeItem(key); },
};
export const workspaceSessionStorage: Storage = {
  get length() { return globalThis.sessionStorage.length; },
  key(index) { return globalThis.sessionStorage.key(index); },
  getItem(key) { return globalThis.sessionStorage.getItem(accountId ? CACHE + accountId + "." + key : key); },
  setItem(key, value) { globalThis.sessionStorage.setItem(accountId ? CACHE + accountId + "." + key : key, value); },
  removeItem(key) { globalThis.sessionStorage.removeItem(accountId ? CACHE + accountId + "." + key : key); },
  clear() { throw Error("Use removeItem for workspace session data."); },
};
export const workspaceSceneStorage: Storage = {
  get length() { return (accountId ? workspaceStorage : globalThis.sessionStorage).length; },
  key(index) { return (accountId ? workspaceStorage : globalThis.sessionStorage).key(index); },
  getItem(key) { return (accountId ? workspaceStorage : globalThis.sessionStorage).getItem(key); },
  setItem(key, value) { (accountId ? workspaceStorage : globalThis.sessionStorage).setItem(key, value); },
  removeItem(key) { (accountId ? workspaceStorage : globalThis.sessionStorage).removeItem(key); },
  clear() { throw Error("Use removeItem for scene drafts."); },
};
