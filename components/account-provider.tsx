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

type User = { id: string; name: string; email: string };
export type AccountStatus = "saved" | "pending" | "syncing" | "error" | "conflict";
type AccountContextValue = {
  user: User | null; available: boolean; status: AccountStatus; error: string; open: () => void;
};
const AccountContext = React.createContext<AccountContextValue>({ user: null, available: false, status: "saved", error: "", open: () => {} });
export const useAccount = () => React.useContext(AccountContext);
const NOTICE = PREFIX + "account-notice";

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

  const leave = React.useCallback(async (id: string, removeCache: boolean) => {
    flushSync(() => setReady(false));
    await resetSheetImageDatabaseConnection();
    selectWorkspace(null);
    if (removeCache) { forgetAccountCache(id); await deleteAccountImageDatabase(id); }
    conflict.current = null; running.current = null;
    setUser(null); setReady(true); setStatus("saved"); setRecoveryKey("");
  }, []);

  const sync = React.useCallback((): Promise<boolean> => {
    if (running.current) return running.current;
    const id = currentAccountId();
    if (!id || switching.current) return Promise.resolve(false);
    if (conflict.current) return Promise.reject(conflict.current);
    setStatus("syncing");
    const promise = synchronizeWorkspace(id).then(saved => {
      setStatus(saved ? "saved" : "pending"); setError(""); return saved;
    }).catch(async (failure: unknown) => {
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
    flushSync(() => setReady(false));
    try {
      const remote: WorkspaceSnapshot = await accountRequest("/api/account/workspace", {}, next.id);
      await resetSheetImageDatabaseConnection();
      selectWorkspace(next.id, remote);
      for (const image of images) await saveSheetImageBlob(image.blob, { positionX: 50, positionY: 50, zoom: 1, alt: "" });
      await downloadWorkspaceImages(next.id, remote.data);
      const merged = mergeWorkspaces(workspaceBase().data, captureWorkspace(), remote.data);
      if (merged.conflicts.length) { conflict.current = new WorkspaceConflict(remote, merged.conflicts); setStatus("conflict"); }
      else { conflict.current = null; receiveWorkspace(remote, merged.data); setStatus(JSON.stringify(merged.data) === JSON.stringify(remote.data) ? "saved" : "pending"); }
      // Guest import adds records. For matching IDs, the account's copy wins.
      if (incoming) receiveWorkspace(workspaceBase(), mergeWorkspaces({}, incoming, captureWorkspace(), "remote").data);
      setUser(next); setReady(true); setError("");
    } catch (failure) {
      selectWorkspace(null); setUser(null); setReady(true); throw failure;
    }
  }, []);

  React.useEffect(() => {
    const generation = ++initialize.current;
    void (async () => {
      try {
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
    if (!user || !ready) return;
    let timer = window.setTimeout(() => void sync().catch(() => {}), 350);
    const dirty = () => {
      if (conflict.current) return;
      setStatus("pending"); window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync().catch(() => {}), 900);
    };
    const refresh = () => { if (document.visibilityState !== "hidden") void sync().catch(() => {}); };
    const interval = window.setInterval(refresh, 15000);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      try { flushWorkspace(); } catch { event.preventDefault(); return; }
      if (JSON.stringify(captureWorkspace()) !== JSON.stringify(workspaceBase().data)) event.preventDefault();
    };
    const notice = (event: StorageEvent) => {
      try { flushWorkspace(); reloadAccountCache(event); } catch { setError("tab_conflict"); setStatus("error"); }
      if (event.key !== NOTICE || !event.newValue) return;
      const value = JSON.parse(event.newValue);
      if (value.id === user.id) void leave(user.id, value.reason === "deleted").then(() => { setError("sign_in_required"); setOpen(true); });
    };
    window.addEventListener(WORKSPACE_WRITE, dirty);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("storage", notice);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); window.removeEventListener(WORKSPACE_WRITE, dirty); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("storage", notice); };
  }, [leave, ready, sync, user]);

  const authenticate = async (mode: "login" | "signup", input: { email: string; password: string; name: string; importDevice: boolean }) => {
    initialize.current++;
    flushWorkspace();
    const incoming = input.importDevice ? captureWorkspace() : undefined;
    const images: SheetImageRecord[] = [];
    if (incoming) for (const id of workspaceImageIds(incoming)) { const image = await getSheetImageRecord(id); if (image) images.push(image); else throw Error("image_not_found"); }
    const result = await accountRequest(`/api/auth/${mode === "signup" ? "sign-up" : "sign-in"}/email`, { method: "POST", body: JSON.stringify({ email: input.email.trim().toLowerCase(), password: input.password, name: input.name.trim() }) }, null);
    await enter(result.user, incoming, images);
    if (mode === "signup") {
      try { const recovery = await accountRequest("/api/account/recovery", { method: "POST", body: JSON.stringify({ password: input.password }) }); setRecoveryKey(recovery.key); }
      catch { setError("recovery_not_created"); }
    } else setOpen(false);
  };

  const logout = async () => {
    if (!user) return;
    if (!await sync()) throw Error("sync_before_logout");
    switching.current = true;
    try {
      await accountRequest("/api/auth/sign-out", { method: "POST", body: "{}" });
      globalThis.localStorage.setItem(NOTICE, JSON.stringify({ id: user.id, reason: "logout", at: Date.now() }));
      await leave(user.id, false); setOpen(false); setError("");
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
      globalThis.localStorage.setItem(NOTICE, JSON.stringify({ id: user.id, reason: "deleted", at: Date.now() }));
      await leave(user.id, true); setError("");
      return result;
    } finally { switching.current = false; }
  };
  const resolve = async (prefer: "local" | "remote") => {
    if (!conflict.current) return;
    flushWorkspace();
    const remote = conflict.current.remote;
    const merged = mergeWorkspaces(workspaceBase().data, captureWorkspace(), remote.data, prefer);
    receiveWorkspace(remote, merged.data); conflict.current = null;
    await sync();
  };
  return <AccountContext.Provider value={{ user, available, status, error, open: () => setOpen(true) }}>
    {ready ? <FateApp key={user?.id ?? "device"} /> : <main className="account-loading"><p>{t("Abrindo seu Fate…", "Opening your Fate…")}</p></main>}
    <AccountDialog open={open} onOpenChange={setOpen} user={user} available={available} status={status} error={error} recoveryKey={recoveryKey} setRecoveryKey={setRecoveryKey} authenticate={authenticate} logout={logout} remove={remove} sync={sync} resolve={resolve} />
  </AccountContext.Provider>;
}
