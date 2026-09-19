import { createHash } from "node:crypto";
import { getSql } from "@/db";

// Shared by all function instances; no new service, raw IP or bearer token stored.
export const REQUEST_LIMITS = {
  register: { ip: 8, session: 3, window: 3600 },
  login: { ip: 80, session: 10, window: 600 },
  create: { ip: 12, session: 6, window: 3600 },
  join: { ip: 60, session: 20, window: 600 },
  write: { ip: 360, session: 60, window: 60 },
  upload: { ip: 120, session: 30, window: 3600 },
} as const;
type Action = keyof typeof REQUEST_LIMITS;
export class RequestLimitError extends Error {
  readonly status = 429;
  constructor(readonly retryAfter: number) { super("Muitos pedidos seguidos. Aguarde um pouco e tente novamente."); }
}
let ready: Promise<unknown> | undefined;
const blocked = new Map<string, number>();

export function limitIdentity(value: string, now: number) {
  return createHash("sha256").update(`${Math.floor(now / 86400000)}:${value}`).digest("hex");
}
export function requestLimitResponse(error: unknown) {
  if (!(error instanceof RequestLimitError)) return null;
  return Response.json({ error: error.message, code: "rate_limited", retryAfter: error.retryAfter }, {
    status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" },
  });
}
export async function limitRoomRequest(request: Request, action: Action, session?: string, database?: ReturnType<typeof getSql>) {
  const now = Date.now();
  // Vercel overwrites x-vercel-forwarded-for. Never trust arbitrary forwarded IPs.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local";
  const token = session ?? request.headers.get("authorization") ?? "anonymous";
  const policy = REQUEST_LIMITS[action];
  const keys = [limitIdentity(`${action}:ip:${ip || "unknown"}`, now), limitIdentity(`${action}:session:${token.slice(0, 200)}`, now)];
  for (const key of keys) {
    const until = blocked.get(key) ?? 0;
    if (until > now) throw new RequestLimitError(Math.ceil((until - now) / 1000));
    blocked.delete(key);
  }
  const sql = database ?? getSql();
  ready ??= sql`CREATE TABLE IF NOT EXISTS fate_request_limits (
    key TEXT PRIMARY KEY, started BIGINT NOT NULL, count INTEGER NOT NULL,
    strikes INTEGER NOT NULL DEFAULT 0, blocked_until BIGINT NOT NULL DEFAULT 0,
    expires BIGINT NOT NULL
  )`.catch(error => { ready = undefined; throw error; });
  await ready;
  // One lock serializes counter admission and keeps the table bounded even with rotating clients.
  const results = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('fate-request-limits'))`,
    sql`DELETE FROM fate_request_limits WHERE expires <= ${now}`,
    ...keys.map((key, index) => {
      const maximum = index === 0 ? policy.ip : policy.session;
      return sql`INSERT INTO fate_request_limits AS limits (key, started, count, expires)
        SELECT ${key}, ${now}, 1, ${now + 86400000}
        WHERE EXISTS (SELECT 1 FROM fate_request_limits WHERE key = ${key})
           OR (SELECT count(*) FROM fate_request_limits) < 10000
        ON CONFLICT (key) DO UPDATE SET
          started = CASE WHEN limits.started + ${policy.window * 1000} <= ${now} THEN ${now} ELSE limits.started END,
          count = CASE WHEN limits.blocked_until > ${now} THEN limits.count
            WHEN limits.started + ${policy.window * 1000} <= ${now} THEN 1 ELSE LEAST(limits.count + 1, ${maximum + 1}) END,
          strikes = CASE WHEN limits.blocked_until > ${now} OR limits.started + ${policy.window * 1000} <= ${now} OR limits.count < ${maximum}
            THEN limits.strikes ELSE LEAST(5, limits.strikes + 1) END,
          blocked_until = CASE WHEN limits.blocked_until > ${now} THEN limits.blocked_until
            WHEN limits.started + ${policy.window * 1000} <= ${now} OR limits.count < ${maximum} THEN 0
            ELSE GREATEST(limits.started + ${policy.window * 1000}, ${now} + (30000 * power(2, limits.strikes))::BIGINT) END
        RETURNING blocked_until`;
    }),
  ]);
  let retryAfter = 0;
  (results.slice(2) as { blocked_until: number | string }[][]).forEach((rows, index) => {
    const until = rows.length ? Number(rows[0].blocked_until) : now + 60000;
    if (until > now) { blocked.set(keys[index], until); retryAfter = Math.max(retryAfter, Math.ceil((until - now) / 1000)); }
  });
  while (blocked.size > 500) blocked.delete(blocked.keys().next().value!);
  if (retryAfter) throw new RequestLimitError(retryAfter);
}
