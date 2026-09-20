import { PREFIX } from "@/lib/workspace-data";
import { accountRequest, AccountRequestError } from "@/lib/workspace-sync";

export const ACCOUNT_NOTICE = PREFIX + "account-notice";
const SIGNED_OUT = PREFIX + "account-signed-out.v1";
export const hasPendingSignOut = () => Boolean(globalThis.localStorage.getItem(SIGNED_OUT));

export function rememberSignOut(id: string) {
  const notice = JSON.stringify({ id, reason: "logout", at: Date.now() });
  // Persist this before hiding the account: an offline reload must stay signed out.
  globalThis.localStorage.setItem(SIGNED_OUT, notice);
  globalThis.localStorage.setItem(ACCOUNT_NOTICE, notice);
}

export async function withAccountSessionLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("fate-account-session", action);
  return action();
}

export async function finishPendingSignOut() {
  const raw = globalThis.localStorage.getItem(SIGNED_OUT);
  if (!raw) return;
  const { id } = JSON.parse(raw);
  try {
    await accountRequest("/api/auth/sign-out", { method: "POST", body: "{}", signal: AbortSignal.timeout(8000) }, id);
  } catch (error) {
    // An old tab cannot sign out a different account that has since signed in.
    if (!(error instanceof AccountRequestError && error.code === "account_changed")) throw error;
  }
  if (globalThis.localStorage.getItem(SIGNED_OUT) === raw) globalThis.localStorage.removeItem(SIGNED_OUT);
}
