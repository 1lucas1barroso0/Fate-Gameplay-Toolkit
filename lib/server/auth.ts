import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "@/db";
import { authSchema } from "@/db/account-schema";
import { accountSecret, getAccountDb } from "@/lib/server/account-db";

export function createFateAuth(database: Parameters<typeof drizzleAdapter>[0], secret: string, baseURL: string) {
  return betterAuth({
    appName: "Fate Gameplay Toolkit", baseURL, secret,
    database: drizzleAdapter(database, { provider: "pg", schema: authSchema, transaction: false }),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, autoSignIn: true },
    account: { accountLinking: { enabled: false } },
    session: { expiresIn: 30 * 86400, updateAge: 86400, cookieCache: { enabled: false } },
    advanced: { cookiePrefix: "fate", useSecureCookies: baseURL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" } },
    // These routes use the shared SQL limiter, including attempts across instances.
    rateLimit: { enabled: false },
    user: { deleteUser: { enabled: false } },
    trustedOrigins: [baseURL],
  });
}
let auth: Promise<ReturnType<typeof createFateAuth>> | null = null;
export function getAuth() {
  auth ??= (async () => {
    await getAccountDb();
    const url = process.env.BETTER_AUTH_URL || (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}`
      : process.env.NODE_ENV === "production" ? "https://fate-gameplay-toolkit.vercel.app" : "http://localhost:3000");
    return createFateAuth(getDb(), await accountSecret(), url);
  })().catch(error => { auth = null; throw error; });
  return auth;
}
export class AccountError extends Error { constructor(readonly code: string, readonly status = 400) { super(code); } }
export async function requireAccount(request: Request) {
  const session = await (await getAuth()).api.getSession({ headers: request.headers });
  if (!session) {
    const expected = request.headers.get("x-fate-account");
    if (expected) {
      const sql = await getAccountDb();
      const rows = await sql`SELECT id FROM fate_user WHERE id=${expected}`;
      if (!rows.length) throw new AccountError("account_deleted", 401);
    }
    throw new AccountError("sign_in_required", 401);
  }
  if (request.headers.get("x-fate-account") !== session.user.id) throw new AccountError("account_changed", 409);
  const sql = await getAccountDb();
  const state = await sql`SELECT deleting FROM fate_account_workspace WHERE user_id = ${session.user.id}`;
  if (state[0]?.deleting) throw new AccountError("account_deleting", 403);
  return session;
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new AccountError("invalid_origin", 403);
}
export function accountFailure(error: unknown) {
  const code = error instanceof AccountError ? error.code : "account_unavailable";
  return Response.json({ code }, { status: error instanceof AccountError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
export async function boundedJson(request: Request, maximum = 16000) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccountError("invalid_request", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError("invalid_request");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maximum) { await reader.cancel(); throw new AccountError("request_too_large", 413); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AccountError("invalid_request"); }
}
