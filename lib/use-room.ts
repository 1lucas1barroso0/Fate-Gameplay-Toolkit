"use client";

import * as React from "react";
import { createUuid, type LocalRoll } from "@/lib/fate";
import type {
  RoomEntry,
  RoomFileData,
  RoomRollData,
  RoomSession,
  RoomSnapshot,
} from "@/lib/room-contracts";
import {
  MAX_ROOM_FILE_BYTES,
  MAX_ROOM_FILES,
  ROOM_FILE_BUDGET_BYTES,
  ROOM_FILE_WARNING_BYTES,
} from "@/lib/room-contracts";

const SESSION_KEY = "fate-gameplay-toolkit.room-session.v1";
const SESSIONS_KEY = "fate-gameplay-toolkit.room-sessions.v2";
const ACTIVE_SESSION_KEY = "fate-gameplay-toolkit.active-room.v1";

export type SavedRoom = {
  session: RoomSession;
  roomName: string;
  selfName: string;
  role: "gm" | "player" | "";
  lastOpenedAt: number;
  rulesProfileId: string;
};

type ApiError = { error?: string };

function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function validSession(input: unknown): RoomSession | null {
  if (!input || typeof input !== "object") return null;
  const parsed = input as Partial<RoomSession>;
  if (
    typeof parsed.roomCode !== "string" ||
    !/^[2-9A-HJ-NP-Z]{6}$/.test(parsed.roomCode) ||
    typeof parsed.participantId !== "string" ||
    !parsed.participantId ||
    typeof parsed.token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(parsed.token)
  ) return null;
  return parsed as RoomSession;
}

function readRooms(): { active: RoomSession | null; saved: SavedRoom[] } {
  const collectionRaw = localStorage.getItem(SESSIONS_KEY);
  if (collectionRaw) {
    const parsed = JSON.parse(collectionRaw) as { rooms?: Array<Partial<SavedRoom>> };
    const saved = (Array.isArray(parsed.rooms) ? parsed.rooms : []).flatMap((room) => {
      const session = validSession(room.session);
      return session ? [{ session, roomName: String(room.roomName || ""), selfName: String(room.selfName || ""), role: room.role === "gm" || room.role === "player" ? room.role : "" as const, lastOpenedAt: Number(room.lastOpenedAt) || 0, rulesProfileId: String(room.rulesProfileId || "") }] : [];
    });
    const activeParticipantId = sessionStorage.getItem(ACTIVE_SESSION_KEY) || "";
    const active = saved.find((room) => room.session.participantId === activeParticipantId)?.session ?? null;
    return { active, saved };
  }

  const legacyRaw = localStorage.getItem(SESSION_KEY);
  if (!legacyRaw) return { active: null, saved: [] };
  const session = validSession(JSON.parse(legacyRaw));
  return session ? { active: null, saved: [{ session, roomName: "", selfName: "", role: "", lastOpenedAt: Date.now(), rulesProfileId: "" }] } : { active: null, saved: [] };
}

async function decodeResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(body.error || "A Mesa não respondeu.");
  return body;
}

function sessionHeaders(session: RoomSession) {
  return {
    authorization: `Bearer ${session.token}`,
    "x-participant-id": session.participantId,
  };
}

async function fetchSnapshot(session: RoomSession, signal?: AbortSignal, before?: string | null) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  const response = await fetch(`/api/rooms/${session.roomCode}${query}`, {
    method: "GET",
    headers: sessionHeaders(session),
    cache: "no-store",
    signal,
  });
  return decodeResponse<RoomSnapshot>(response);
}

function waitForUploadCallback(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function useRoom() {
  const [session, setSession] = React.useState<RoomSession | null>(null);
  const [savedRooms, setSavedRooms] = React.useState<SavedRoom[]>([]);
  const [snapshot, setSnapshot] = React.useState<RoomSnapshot | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [lastSyncedAt, setLastSyncedAt] = React.useState<number | null>(null);
  const [historyCursor, setHistoryCursor] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        const rooms = readRooms();
        setSession(rooms.active);
        setSavedRooms(rooms.saved);
      } catch {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSIONS_KEY);
        sessionStorage.removeItem(ACTIVE_SESSION_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    let failureTimer = 0;
    try {
      const serialized = JSON.stringify({ version: 3, rooms: savedRooms });
      localStorage.setItem(SESSIONS_KEY, serialized);
      if (localStorage.getItem(SESSIONS_KEY) !== serialized) throw new Error("A gravação não foi confirmada.");
      if (session?.participantId) sessionStorage.setItem(ACTIVE_SESSION_KEY, session.participantId);
      else sessionStorage.removeItem(ACTIVE_SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch {
      failureTimer = window.setTimeout(() => setError("O navegador não conseguiu lembrar mudanças nas Mesas. As credenciais anteriores foram preservadas."), 0);
    }
    return () => window.clearTimeout(failureTimer);
  }, [hydrated, savedRooms, session?.participantId]);

  const rememberRoom = React.useCallback((roomSession: RoomSession, roomSnapshot?: RoomSnapshot | null, markOpened = false, rulesProfileId?: string) => {
    setSavedRooms((current) => {
      const previous = current.find((item) => item.session.participantId === roomSession.participantId);
      const remembered: SavedRoom = {
        session: roomSession,
        roomName: roomSnapshot?.room.name ?? previous?.roomName ?? "",
        selfName: roomSnapshot?.self.name ?? previous?.selfName ?? "",
        role: roomSnapshot?.self.role ?? previous?.role ?? "",
        lastOpenedAt: markOpened ? Date.now() : previous?.lastOpenedAt ?? Date.now(),
        rulesProfileId: rulesProfileId ?? previous?.rulesProfileId ?? "",
      };
      if (previous && JSON.stringify(previous) === JSON.stringify(remembered)) return current;
      return [remembered, ...current.filter((item) => item.session.participantId !== roomSession.participantId)].slice(0, 48);
    });
  }, []);

  React.useEffect(() => {
    if (!hydrated || !session) return;

    let stopped = false;
    let timer = 0;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      try {
        const next = await fetchSnapshot(session, controller.signal, historyCursor);
        if (stopped) return;
        setSnapshot(next);
        rememberRoom(session, next);
        setError("");
        setLastSyncedAt(Date.now());
      } catch (pollError) {
        if (stopped || (pollError instanceof DOMException && pollError.name === "AbortError")) return;
        setError(pollError instanceof Error ? pollError.message : "A Mesa não respondeu.");
      } finally {
        if (!stopped && !historyCursor) timer = window.setTimeout(poll, 4000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      controller?.abort();
      window.clearTimeout(timer);
    };
  }, [historyCursor, hydrated, rememberRoom, session]);

  const activate = React.useCallback(async (nextSession: RoomSession, rulesProfileId?: string) => {
    rememberRoom(nextSession, null, true, rulesProfileId);
    setSession(nextSession);
    setSnapshot(null);
    setHistoryCursor(null);
    setError("");
    try {
      const next = await fetchSnapshot(nextSession);
      setSnapshot(next);
      rememberRoom(nextSession, next, true, rulesProfileId);
      setLastSyncedAt(Date.now());
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "A Mesa não respondeu.");
    }
  }, [rememberRoom]);

  const create = React.useCallback(async (roomName: string, personName: string, rulesProfileId?: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const token = newToken();
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          roomName,
          personName,
          requestId: createUuid(),
          token,
        }),
      });
      const result = await decodeResponse<{ session: RoomSession }>(response);
      await activate(result.session, rulesProfileId);
    } finally {
      setBusy(false);
    }
  }, [activate, busy]);

  const join = React.useCallback(async (roomCode: string, personName: string, rulesProfileId?: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const token = newToken();
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "join",
          roomCode,
          personName,
          requestId: createUuid(),
          token,
        }),
      });
      const result = await decodeResponse<{ session: RoomSession }>(response);
      await activate(result.session, rulesProfileId);
    } finally {
      setBusy(false);
    }
  }, [activate, busy]);

  const refresh = React.useCallback(async () => {
    if (!session || refreshing) return;
    setRefreshing(true);
    try {
      const next = await fetchSnapshot(session, undefined, historyCursor);
      setSnapshot(next);
      setError("");
      setLastSyncedAt(Date.now());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "A Mesa não respondeu.");
      throw refreshError;
    } finally {
      setRefreshing(false);
    }
  }, [historyCursor, refreshing, session]);

  const rememberEntry = React.useCallback((entry: RoomEntry) => {
    if (historyCursor) {
      setHistoryCursor(null);
    } else {
      setSnapshot((current) => current
        ? {
            ...current,
            entries: [...current.entries.filter((item) => item.id !== entry.id), entry].slice(-100),
            storage: entry.type === "file" && !current.entries.some((item) => item.id === entry.id)
              ? {
                  ...current.storage,
                  files: {
                    ...current.storage.files,
                    usedBytes: current.storage.files.usedBytes + Number((entry.data as RoomFileData).size || 0),
                    count: current.storage.files.count + 1,
                  },
                }
              : current.storage,
          }
        : current);
    }
  }, [historyCursor]);

  const postEntry = React.useCallback(async (body: Record<string, unknown>) => {
    if (!session) throw new Error("Entre em uma Mesa primeiro.");
    const response = await fetch(`/api/rooms/${session.roomCode}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...sessionHeaders(session) },
      body: JSON.stringify({ ...body, requestId: createUuid() }),
    });
    const result = await decodeResponse<{ entry: RoomEntry }>(response);
    rememberEntry(result.entry);
    return result.entry;
  }, [rememberEntry, session]);

  const postNote = React.useCallback(
    (body: string) => postEntry({ type: "note", body }),
    [postEntry],
  );

  const postRule = React.useCallback(
    (title: string, reference: string) => postEntry({ type: "rule", title, reference }),
    [postEntry],
  );

  const postFile = React.useCallback(async (file: File) => {
    if (!session) throw new Error("Entre em uma Mesa primeiro.");
    if (!file.size) throw new Error("Este arquivo está vazio.");
    if (file.size > MAX_ROOM_FILE_BYTES) throw new Error("Escolha um arquivo de até 50 MB.");
    const currentFiles = snapshot?.storage.files;
    if (currentFiles && currentFiles.count + 1 > MAX_ROOM_FILES) {
      throw new Error(`Esta Mesa chegou a ${MAX_ROOM_FILES} arquivos. Exclua um antes de continuar.`);
    }
    if (currentFiles && currentFiles.usedBytes + file.size > ROOM_FILE_BUDGET_BYTES) {
      throw new Error("Este arquivo ultrapassaria o espaço disponível nesta Mesa. Exporte ou exclua arquivos primeiro.");
    }

    const requestId = createUuid();
    const pathname = `rooms/${session.roomCode}/${session.participantId}/${requestId}`;
    const contentType = file.type || "application/octet-stream";
    const { upload } = await import("@vercel/blob/client");

    await upload(pathname, file, {
      access: "private",
      handleUploadUrl: `/api/rooms/${session.roomCode}/files/upload`,
      clientPayload: JSON.stringify({
        participantId: session.participantId,
        token: session.token,
        requestId,
        name: file.name,
        contentType,
        size: file.size,
      }),
      // Files are capped below Vercel's 100 MB multipart recommendation, so a
      // single operation is both faster and predictable within Hobby quotas.
      multipart: false,
    });

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await fetch(
        `/api/rooms/${session.roomCode}/files?requestId=${encodeURIComponent(requestId)}`,
        { method: "GET", headers: sessionHeaders(session), cache: "no-store" },
      );
      if (response.status === 202) {
        await waitForUploadCallback(Math.min(250 + attempt * 25, 750));
        continue;
      }
      const result = await decodeResponse<{ entry: RoomEntry }>(response);
      rememberEntry(result.entry);
      return result.entry;
    }

    throw new Error("O arquivo chegou, mas ainda não apareceu na Mesa. Atualize o histórico em alguns instantes.");
  }, [rememberEntry, session, snapshot?.storage.files]);

  const downloadFile = React.useCallback(async (entry: RoomEntry) => {
    if (!session || entry.type !== "file") throw new Error("Este arquivo não está disponível.");
    const data = entry.data as RoomFileData;
    const response = await fetch(`/api/rooms/${session.roomCode}/files/${encodeURIComponent(entry.id)}`, {
      method: "GET",
      headers: sessionHeaders(session),
      cache: "no-store",
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as ApiError;
      throw new Error(error.error || "O arquivo não pôde ser aberto.");
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = data.name || entry.body || "arquivo";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, [session]);

  const deleteFile = React.useCallback(async (entry: RoomEntry) => {
    if (!session || entry.type !== "file") throw new Error("Este arquivo não está disponível.");
    const response = await fetch(`/api/rooms/${session.roomCode}/files/${encodeURIComponent(entry.id)}`, {
      method: "DELETE",
      headers: sessionHeaders(session),
    });
    const result = await decodeResponse<{ deleted: boolean; bytesFreed: number; cleanupPending: boolean }>(response);
    setSnapshot((current) => current ? {
      ...current,
      entries: current.entries.filter((item) => item.id !== entry.id),
      storage: {
        ...current.storage,
        files: {
          ...current.storage.files,
          usedBytes: Math.max(0, current.storage.files.usedBytes - result.bytesFreed),
          count: Math.max(0, current.storage.files.count - (result.deleted ? 1 : 0)),
        },
      },
    } : current);
    return result;
  }, [session]);

  const exportHistory = React.useCallback(async () => {
    if (!session) throw new Error("Entre em uma Mesa primeiro.");
    const response = await fetch(`/api/rooms/${session.roomCode}/history`, {
      method: "GET",
      headers: sessionHeaders(session),
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as ApiError;
      throw new Error(body.error || "O Histórico não pôde ser exportado.");
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `historico-${session.roomCode.toLowerCase()}.jsonl`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, [session]);

  const clearOldHistory = React.useCallback(async (before: number) => {
    if (!session) throw new Error("Entre em uma Mesa primeiro.");
    const response = await fetch(`/api/rooms/${session.roomCode}/history`, {
      method: "DELETE",
      headers: { "content-type": "application/json", ...sessionHeaders(session) },
      body: JSON.stringify({ before }),
    });
    const result = await decodeResponse<{ removed: number; bytesFreed: number }>(response);
    setHistoryCursor(null);
    const next = await fetchSnapshot(session);
    setSnapshot(next);
    return result;
  }, [session]);

  const cleanupOrphanFiles = React.useCallback(async () => {
    if (!session) throw new Error("Entre em uma Mesa primeiro.");
    const response = await fetch(`/api/rooms/${session.roomCode}/storage`, {
      method: "DELETE",
      headers: sessionHeaders(session),
    });
    return decodeResponse<{ found: number; removed: number; pending: number }>(response);
  }, [session]);

  const deleteCurrentRoom = React.useCallback(async () => {
    if (!session) throw new Error("Entre em uma Mesa primeiro.");
    const deletingParticipantId = session.participantId;
    const response = await fetch(`/api/rooms/${session.roomCode}`, {
      method: "DELETE",
      headers: sessionHeaders(session),
    });
    const result = await decodeResponse<{ deleted: boolean; filesQueued: number; cleanupPending: boolean }>(response);
    setSavedRooms((current) => current.filter((item) => item.session.participantId !== deletingParticipantId));
    setSession(null);
    setSnapshot(null);
    setError("");
    setHistoryCursor(null);
    return result;
  }, [session]);

  const roll = React.useCallback(async (modifier: number, label: string): Promise<LocalRoll> => {
    const entry = await postEntry({ type: "roll", modifier, label });
    const data = entry.data as RoomRollData;
    if (
      !Array.isArray(data.dice) ||
      data.dice.length !== 4 ||
      data.dice.some((die) => ![-1, 0, 1].includes(die)) ||
      !Number.isInteger(data.modifier) ||
      !Number.isInteger(data.total)
    ) throw new Error("A Mesa devolveu uma rolagem inválida.");
    return {
      id: entry.id,
      dice: data.dice,
      modifier: data.modifier,
      total: data.total,
      label: entry.body,
      createdAt: entry.createdAt,
      source: "room",
    };
  }, [postEntry]);

  const decide = React.useCallback(async (participantId: string, status: "approved" | "rejected") => {
    if (!session) throw new Error("Entre em uma Mesa primeiro.");
    const response = await fetch(`/api/rooms/${session.roomCode}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...sessionHeaders(session) },
      body: JSON.stringify({ participantId, status }),
    });
    await decodeResponse<{ ok: true }>(response);
    setSnapshot((current) => current
      ? {
          ...current,
          participants: status === "rejected"
            ? current.participants.filter((participant) => participant.id !== participantId)
            : current.participants.map((participant) => participant.id === participantId ? { ...participant, status } : participant),
        }
      : current);
  }, [session]);

  const leave = React.useCallback(() => {
    setSavedRooms((current) => current.filter((item) => item.session.participantId !== session?.participantId));
    setSession(null);
    setSnapshot(null);
    setError("");
    setLastSyncedAt(null);
    setHistoryCursor(null);
  }, [session?.participantId]);

  const closeRoom = React.useCallback(() => {
    setSession(null);
    setSnapshot(null);
    setError("");
    setLastSyncedAt(null);
    setHistoryCursor(null);
  }, []);

  const switchRoom = React.useCallback(async (participantId: string) => {
    const remembered = savedRooms.find((item) => item.session.participantId === participantId);
    if (!remembered) throw new Error("Esta Mesa não está mais guardada neste dispositivo.");
    await activate(remembered.session);
  }, [activate, savedRooms]);

  const forgetRoom = React.useCallback((participantId: string) => {
    setSavedRooms((current) => current.filter((item) => item.session.participantId !== participantId));
    if (session?.participantId === participantId) closeRoom();
  }, [closeRoom, session?.participantId]);

  const linkRulesProfile = React.useCallback((participantId: string, rulesProfileId: string) => {
    setSavedRooms((current) => current.map((room) => room.session.participantId === participantId
      ? { ...room, rulesProfileId }
      : room));
  }, []);

  const replaceRulesProfileLink = React.useCallback((profileId: string, replacementId: string) => {
    setSavedRooms((current) => current.map((room) => room.rulesProfileId === profileId
      ? { ...room, rulesProfileId: replacementId }
      : room));
  }, []);

  const loadOlder = React.useCallback(() => {
    if (snapshot?.nextCursor) setHistoryCursor(snapshot.nextCursor);
  }, [snapshot]);

  const returnLatest = React.useCallback(() => setHistoryCursor(null), []);

  return {
    session,
    savedRooms,
    snapshot,
    hydrated,
    busy,
    refreshing,
    error,
    lastSyncedAt,
    viewingHistory: Boolean(historyCursor),
    roomReady: snapshot?.self.status === "approved",
    create,
    join,
    refresh,
    postNote,
    postRule,
    postFile,
    downloadFile,
    deleteFile,
    exportHistory,
    clearOldHistory,
    cleanupOrphanFiles,
    deleteCurrentRoom,
    roll,
    decide,
    loadOlder,
    returnLatest,
    closeRoom,
    switchRoom,
    forgetRoom,
    linkRulesProfile,
    replaceRulesProfileLink,
    leave,
    roomFileApproachingLimit: Boolean(snapshot && snapshot.storage.files.usedBytes >= ROOM_FILE_WARNING_BYTES),
  };
}

export type RoomStore = ReturnType<typeof useRoom>;
