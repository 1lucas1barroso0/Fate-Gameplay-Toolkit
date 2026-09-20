"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { FateApp } from "@/components/fate-app";
import { AccountDialog } from "@/components/account-dialog";
import { t, useAppLanguage } from "@/lib/app-language";
import { PREFIX, mergeWorkspaces, workspaceImageIds, type WorkspaceData, type WorkspaceSnapshot } from "@/lib/workspace-data";
import { cachedAccountIds, captureWorkspace, currentAccountId, flushWorkspace, forgetAccountCache, receiveWorkspace, reloadAccountCache, selectWorkspace, workspaceBase, WORKSPACE_WRITE } from "@/lib/workspace-storage";
import { AccountRequestError, accountRequest, downloadWorkspaceImages, synchronizeWorkspace, WorkspaceConflict } from "@/lib/workspace-sync";
import { deleteAccountImageDatabase, getSheetImageRecord, resetSheetImageDatabaseConnection, saveSheetImageBlob, type SheetImageRecord } from "@/lib/sheet-image-store";
import { ACCOUNT_NOTICE, finishPendingSignOut, hasPendingSignOut, rememberSignOut, withAccountSessionLock } from "@/lib/account-session";

type User = { id: string; name: string; email: string };
export type AccountStatus = "saved" | "pending" | "syncing" | "error" | "conflict";
type AccountContextValue = {
  user: User | null; available: boolean; status: AccountStatus; error: string; open: () => void;
};
const AccountContext = React.createContext<AccountContextValue>({ user: null, available: false, status: "saved", error: "", open: () => {} });
export const useAccount = () => React.useContext(AccountContext);

export function AccountProvider() {
  useAppLanguage();
  const [user, setUser] = React.useState<User | null>(null);
  const [ready, setReady] = React.useState(true);
  const [available, setAvailable] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<AccountStatus>("saved");
  const [error, setError] = React.useState("");
  const [recoveryKey, setRecoveryKey] = React.useState("");
  const conflict = React.useRef<WorkspaceConflict | null>(null);
  const running = React.useRef<Promise<boolean> | null>(null);
  const switching = React.useRef(false);
  const initialize = React.useRef(0);
  const transition = React.useRef(0);
  const retries = React.useRef({ failures: 0, after: 0 });

  const leave = React.useCallback(async (id: string, removeCache: boolean) => {
    if (currentAccountId() !== id) return;
    flushWorkspace();
    const generation = ++transition.current;
    flushSync(() => setReady(false));
    selectWorkspace(null);
    setUser(null);
    await resetSheetImageDatabaseConnection();
    if (removeCache) { forgetAccountCache(id); await deleteAccountImageDatabase(id); }
    if (generation !== transition.current) return;
    conflict.current = null; running.current = null;
    retries.current = { failures: 0, after: 0 };
    setUser(null); setReady(true); setStatus("saved"); setRecoveryKey("");
  }, []);

  const sync = React.useCallback((): Promise<boolean> => {
    if (running.current) return running.current;
    const id = currentAccountId();
    const generation = transition.current;
    if (!id || switching.current) return Promise.resolve(false);
    if (conflict.current) return Promise.reject(conflict.current);
    setStatus("syncing");
    const promise = synchronizeWorkspace(id).then(saved => {
      if (generation !== transition.current) return false;
      retries.current = { failures: 0, after: 0 };
      setStatus(saved ? "saved" : "pending"); setError(""); return saved;
    }).catch(async (failure: unknown) => {
      if (generation !== transition.current) return false;
      const failures = Math.min(retries.current.failures + 1, 5);
      retries.current = { failures, after: Date.now() + Math.max(Math.min(300000, 15000 * 2 ** failures), failure instanceof AccountRequestError ? failure.retryAfter * 1000 : 0) };
      if (failure instanceof WorkspaceConflict) { conflict.current = failure; setStatus("conflict"); }
      else {
        setStatus("error"); setError(failure instanceof Error ? failure.message : "account_unavailable");
        if (failure instanceof AccountRequestError && (failure.status === 401 || failure.code === "account_changed")) {
          // Keep an unsent cache for the same account to recover after signing in.
          await leave(id, failure.code === "account_deleted"); setError(failure.code === "account_deleted" ? "account_deleted" : "sign_in_required"); setOpen(true);
        }
      }
      throw failure;
    }).finally(() => { if (running.current === promise) running.current = null; });
    running.current = promise;
    return promise;
  }, [leave]);

  const enter = React.useCallback(async (next: User, incoming?: WorkspaceData, images: SheetImageRecord[] = []) => {
    const generation = ++transition.current;
    const checkTransition = () => { if (generation !== transition.current) throw Error("account_changed"); };
    flushWorkspace();
    switching.current = true;
    flushSync(() => setReady(false));
    try {
      const remote: WorkspaceSnapshot = await accountRequest("/api/account/workspace", {}, next.id);
      checkTransition();
      await resetSheetImageDatabaseConnection();
      checkTransition();
      selectWorkspace(next.id, remote);
      for (const image of images) { checkTransition(); await saveSheetImageBlob(image.blob, { positionX: 50, positionY: 50, zoom: 1, alt: "" }); }
      await downloadWorkspaceImages(next.id, remote.data);
      checkTransition();
      const merged = mergeWorkspaces(workspaceBase().data, captureWorkspace(), remote.data);
      if (merged.conflicts.length) { conflict.current = new WorkspaceConflict(remote, merged.conflicts); setStatus("conflict"); }
      else { conflict.current = null; receiveWorkspace(remote, merged.data); setStatus(JSON.stringify(merged.data) === JSON.stringify(remote.data) ? "saved" : "pending"); }
      // Guest import adds records. For matching IDs, the account's copy wins.
      if (incoming) receiveWorkspace(workspaceBase(), mergeWorkspaces({}, incoming, captureWorkspace(), "remote").data);
      retries.current = { failures: 0, after: 0 };
      setUser(next); setReady(true); setError("");
    } catch (failure) {
      if (generation !== transition.current) return;
      await resetSheetImageDatabaseConnection();
      selectWorkspace(null); setUser(null); setReady(true); throw failure;
    } finally { if (generation === transition.current) switching.current = false; }
  }, []);

  React.useEffect(() => {
    const generation = ++initialize.current;
    void (async () => {
      try {
        if (hasPendingSignOut()) {
          await withAccountSessionLock(finishPendingSignOut).catch(() => {});
          return;
        }
        const config = await accountRequest("/api/account", {}, null);
        if (generation !== initialize.current) return;
        setAvailable(config.available);
        if (config.available) {
          const result = await accountRequest("/api/account", { method: "POST" }, null);
          if (generation !== initialize.current) return;
          if (result.user) { await enter(result.user); return; }
          // A closed device discovers deletion the next time it reconnects.
          // Expired sessions retain unsent data for the same account to recover.
          for (const id of cachedAccountIds()) {
            if (generation !== initialize.current) return;
            try { await accountRequest("/api/account/workspace", {}, id); }
            catch (failure) {
              if (failure instanceof AccountRequestError && failure.code === "account_deleted") {
                forgetAccountCache(id); await deleteAccountImageDatabase(id);
              }
            }
          }
        }
        if (generation === initialize.current) setReady(true);
      } catch { if (generation === initialize.current) { setReady(true); setError("account_unavailable"); } }
    })();
    return () => { initialize.current = generation + 1; };
  }, [enter]);

  React.useEffect(() => {
    const finish = () => { if (hasPendingSignOut()) void withAccountSessionLock(finishPendingSignOut).catch(() => {}); };
    window.addEventListener("online", finish);
    return () => window.removeEventListener("online", finish);
  }, []);

  React.useEffect(() => {
    if (!user || !ready) return;
    let timer = window.setTimeout(() => void sync().catch(() => {}), 350);
    const dirty = () => {
      if (conflict.current) return;
      setStatus("pending"); window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync().catch(() => {}), 900);
    };
    const refresh = () => { if (document.visibilityState !== "hidden" && navigator.onLine && Date.now() >= retries.current.after) void sync().catch(() => {}); };
    const reconnect = () => { retries.current.after = 0; refresh(); };
    const interval = window.setInterval(refresh, 30000);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      try { flushWorkspace(); } catch { event.preventDefault(); return; }
      if (JSON.stringify(captureWorkspace()) !== JSON.stringify(workspaceBase().data)) event.preventDefault();
    };
    const notice = (event: StorageEvent) => {
      if (event.key !== ACCOUNT_NOTICE && event.key !== PREFIX + "account-cache." + user.id) return;
      try { flushWorkspace(); flushSync(() => reloadAccountCache(event)); } catch { setError("tab_conflict"); setStatus("error"); }
      if (event.key !== ACCOUNT_NOTICE || !event.newValue) return;
      try {
        const value = JSON.parse(event.newValue);
        if (value.id === user.id || (value.reason === "login" && value.account !== user.id)) void leave(user.id, value.reason === "deleted").then(() => { setError(value.reason === "deleted" ? "account_deleted" : "sign_in_required"); setOpen(true); }).catch(() => setError("local_save_failed"));
      } catch { /* Ignore malformed notices; they never authorize access. */ }
    };
    window.addEventListener(WORKSPACE_WRITE, dirty);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("storage", notice);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener(WORKSPACE_WRITE, dirty); window.removeEventListener("online", reconnect); document.removeEventListener("visibilitychange", reconnect); window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("storage", notice); };
  }, [leave, ready, sync, user]);

  const authenticate = async (mode: "login" | "signup", input: { email: string; password: string; name: string; importDevice: boolean }) => {
    if (switching.current) throw Error("account_busy");
    initialize.current++;
    flushWorkspace();
    const incoming = input.importDevice ? captureWorkspace() : undefined;
    const images: SheetImageRecord[] = [];
    if (incoming) for (const id of workspaceImageIds(incoming)) { const image = await getSheetImageRecord(id); if (image) images.push(image); else throw Error("image_not_found"); }
    await withAccountSessionLock(async () => {
      await finishPendingSignOut();
      const result = await accountRequest(`/api/auth/${mode === "signup" ? "sign-up" : "sign-in"}/email`, { method: "POST", body: JSON.stringify({ email: input.email.trim().toLowerCase(), password: input.password, name: input.name.trim() }) }, null);
      await enter(result.user, incoming, images);
      globalThis.localStorage.setItem(ACCOUNT_NOTICE, JSON.stringify({ reason: "login", account: result.user.id, at: Date.now() }));
    });
    if (mode === "signup") {
      try { const recovery = await accountRequest("/api/account/recovery", { method: "POST", body: JSON.stringify({ password: input.password }) }); setRecoveryKey(recovery.key); }
      catch { setError("recovery_not_created"); }
    } else setOpen(false);
  };

  const logout = async () => {
    if (!user) return;
    const id = user.id;
    flushWorkspace();
    if (navigator.onLine && !conflict.current) await sync().catch(() => {});
    if (currentAccountId() !== id) { setOpen(false); return; }
    // A failed cloud write must not trap someone in a session. Local persistence
    // still has to succeed before leaving, so pending edits can be recovered.
    flushWorkspace();
    switching.current = true;
    try {
      await withAccountSessionLock(async () => {
        rememberSignOut(id);
        await leave(id, false); setOpen(false); setError("");
        if (navigator.onLine) await finishPendingSignOut().catch(() => {});
      });
    } finally { switching.current = false; }
  };
  const remove = async (password: string) => {
    if (!user) return;
    // Capture any just-created table membership before deleting the account.
    flushWorkspace();
    await running.current?.catch(() => {});
    switching.current = true;
    try {
      const result = await accountRequest("/api/account/delete", { method: "POST", body: JSON.stringify({ password }) });
      globalThis.localStorage.setItem(ACCOUNT_NOTICE, JSON.stringify({ id: user.id, reason: "deleted", at: Date.now() }));
      await leave(user.id, true); setError("");
      return result;
    } finally { switching.current = false; }
  };
  const resolve = async (prefer: "local" | "remote") => {
    if (!conflict.current) return;
    flushWorkspace();
    const remote = conflict.current.remote;
    const merged = mergeWorkspaces(workspaceBase().data, captureWorkspace(), remote.data, prefer);
    flushSync(() => receiveWorkspace(remote, merged.data)); conflict.current = null;
    await sync();
  };
  return <AccountContext.Provider value={{ user, available, status, error, open: () => setOpen(true) }}>
    {ready ? <FateApp key={user?.id ?? "device"} /> : <main className="account-loading"><p>{t("Abrindo seu Fate…", "Opening your Fate…")}</p></main>}
    <AccountDialog open={open} onOpenChange={setOpen} user={user} available={available} status={status} error={error} recoveryKey={recoveryKey} setRecoveryKey={setRecoveryKey} authenticate={authenticate} logout={logout} remove={remove} sync={sync} resolve={resolve} />
  </AccountContext.Provider>;
}
