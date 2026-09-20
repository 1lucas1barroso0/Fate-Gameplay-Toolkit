import { mergeWorkspaces, workspaceImageIds, type WorkspaceData, type WorkspaceSnapshot } from "@/lib/workspace-data";
import { captureWorkspace, currentAccountId, flushWorkspace, receiveWorkspace, workspaceBase, workspaceEpoch } from "@/lib/workspace-storage";
import { blobToDataUrl, dataUrlToBlob, getSheetImageRecord, saveSheetImageBlob } from "@/lib/sheet-image-store";

export class AccountRequestError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryAfter = 0) { super(code); }
}
export async function accountRequest(path: string, options: RequestInit = {}, id = currentAccountId()) {
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin",
    signal: options.signal ?? AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json", ...(id ? { "x-fate-account": id } : {}), ...options.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new AccountRequestError(error.code ?? "account_unavailable", response.status, Number(response.headers.get("Retry-After")) || 0);
  }
  return response.status === 204 ? null : response.json();
}
const equal = (a: WorkspaceData, b: WorkspaceData) => JSON.stringify(a) === JSON.stringify(b);
function checkAccount(id: string, epoch: number) { if (currentAccountId() !== id || workspaceEpoch() !== epoch) throw new AccountRequestError("account_changed", 409); }

export async function downloadWorkspaceImages(id: string, data: WorkspaceData, epoch = workspaceEpoch()) {
  for (const imageId of workspaceImageIds(data)) {
    checkAccount(id, epoch);
    if (await getSheetImageRecord(imageId)) continue;
    const image = await accountRequest(`/api/account/images?id=${encodeURIComponent(imageId)}`, {}, id);
    checkAccount(id, epoch);
    const stored = await saveSheetImageBlob(dataUrlToBlob(`data:${image.contentType};base64,${image.data.replace(/\s/g, "")}`), { positionX: 50, positionY: 50, zoom: 1, alt: "" });
    if (stored.blobId !== imageId) throw Error("invalid_image");
  }
}
async function uploadWorkspaceImages(id: string, data: WorkspaceData, epoch: number) {
  const ids = workspaceImageIds(data);
  if (!ids.length) return;
  const known: { id: string }[] = await accountRequest("/api/account/images", {}, id);
  for (const imageId of ids) {
    checkAccount(id, epoch);
    if (known.some(image => image.id === imageId)) continue;
    const image = await getSheetImageRecord(imageId);
    if (!image) throw Error("image_not_found");
    const dataUrl = await blobToDataUrl(image.blob);
    checkAccount(id, epoch);
    await accountRequest("/api/account/images", { method: "PUT", body: JSON.stringify({ id: imageId, contentType: image.contentType, data: dataUrl.slice(dataUrl.indexOf(",") + 1) }) }, id);
  }
}
export class WorkspaceConflict extends Error {
  constructor(readonly remote: WorkspaceSnapshot, readonly fields: string[]) { super("workspace_conflict"); }
}

export async function synchronizeWorkspace(id: string) {
  const epoch = workspaceEpoch();
  // The caller serializes runs. Acknowledging a write preserves any edits made
  // while its images or request were in flight.
  for (let attempt = 0; attempt < 3; attempt++) {
    checkAccount(id, epoch); flushWorkspace();
    const base = workspaceBase();
    const remote: WorkspaceSnapshot | null = await accountRequest(`/api/account/workspace?revision=${base.revision}`, {}, id);
    checkAccount(id, epoch);
    if (remote) {
      await downloadWorkspaceImages(id, remote.data, epoch);
      checkAccount(id, epoch); flushWorkspace();
      const merged = mergeWorkspaces(base.data, captureWorkspace(), remote.data);
      if (merged.conflicts.length) throw new WorkspaceConflict(remote, merged.conflicts);
      receiveWorkspace(remote, merged.data);
    }
    const expected = workspaceBase(), sent = captureWorkspace();
    if (equal(expected.data, sent)) return true;
    await uploadWorkspaceImages(id, sent, epoch);
    checkAccount(id, epoch);
    const response = await fetch("/api/account/workspace", { method: "PUT", cache: "no-store", credentials: "same-origin",
      signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json", "x-fate-account": id },
      body: JSON.stringify({ revision: expected.revision, data: sent }),
    });
    const result = await response.json();
    if (response.status === 409 && Number.isSafeInteger(result.revision)) continue;
    if (!response.ok) throw new AccountRequestError(result.code ?? "account_unavailable", response.status, Number(response.headers.get("Retry-After")) || 0);
    checkAccount(id, epoch); flushWorkspace();
    receiveWorkspace(result, captureWorkspace());
    return equal(result.data, captureWorkspace());
  }
  throw Error("sync_busy");
}
