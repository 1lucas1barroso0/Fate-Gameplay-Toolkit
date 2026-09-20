import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { getAccountDb } from "@/lib/server/account-db";
import { AccountError } from "@/lib/server/auth";
import { accountSnapshot } from "@/lib/server/account-workspace";
import { drainBlobCleanupQueue } from "@/lib/server/rooms";
import { ACCOUNT_MIN_PASSWORD_LENGTH, ACCOUNT_MAX_PASSWORD_LENGTH } from "@/lib/account-policy";

type AccountSql = Awaited<ReturnType<typeof getAccountDb>>;

export async function checkAccountPassword(userId: string, password: unknown, database?: AccountSql) {
  if (typeof password !== "string" || password.length > 128) throw new AccountError("invalid_password", 403);
  const sql = database ?? await getAccountDb();
  const rows = await sql`SELECT password FROM fate_credential WHERE user_id=${userId} AND provider_id='credential'`;
  if (!rows[0]?.password || !await verifyPassword({ hash: rows[0].password, password })) throw new AccountError("invalid_password", 403);
  return rows[0].password as string;
}

export async function changeAccountPassword(userId: string, sessionToken: string, current: unknown, next: unknown) {
  if (typeof next !== "string" || next.length < ACCOUNT_MIN_PASSWORD_LENGTH || next.length > ACCOUNT_MAX_PASSWORD_LENGTH) throw new AccountError("invalid_new_password");
  const sql = await getAccountDb();
  const previous = await checkAccountPassword(userId, current, sql), hashed = await hashPassword(next);
  const result = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"account-security:"+userId}))`,
    sql`UPDATE fate_credential SET password=${hashed},updated_at=NOW()
      WHERE user_id=${userId} AND provider_id='credential' AND password=${previous} RETURNING user_id`,
    sql`DELETE FROM fate_session WHERE user_id=${userId} AND token<>${sessionToken}
      AND EXISTS (SELECT 1 FROM fate_credential WHERE user_id=${userId} AND password=${hashed})`,
    sql`UPDATE fate_account_workspace SET recovery_hash=NULL WHERE user_id=${userId}
      AND EXISTS (SELECT 1 FROM fate_credential WHERE user_id=${userId} AND password=${hashed})`,
  ]);
  if (!result[1].length) throw new AccountError("invalid_password", 403);
}

const recoveryHash = (value: string) => createHash("sha256").update(value.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
export async function createRecoveryKey(userId: string, database?: AccountSql) {
  await accountSnapshot(userId, database);
  const key = randomBytes(24).toString("hex").toUpperCase().match(/.{1,6}/g)!.join("-");
  const sql = database ?? await getAccountDb();
  await sql`UPDATE fate_account_workspace SET recovery_hash=${recoveryHash(key)} WHERE user_id=${userId} AND deleting=FALSE`;
  return key;
}

export async function recoverAccount(email: unknown, key: unknown, password: unknown, database?: AccountSql) {
  if (typeof email !== "string" || email.length > 254 || typeof key !== "string" || key.length > 100 || typeof password !== "string" || password.length < ACCOUNT_MIN_PASSWORD_LENGTH || password.length > ACCOUNT_MAX_PASSWORD_LENGTH) throw new AccountError("invalid_recovery");
  const sql = database ?? await getAccountDb();
  const normalized = email.trim().toLowerCase(), digest = recoveryHash(key);
  // Hash even when there is no match; account existence is not disclosed.
  const hashed = await hashPassword(password);
  const users = await sql`SELECT id FROM fate_user WHERE email=${normalized}`;
  const result = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"account-security:"+(users[0]?.id ?? normalized)}))`,
    sql`UPDATE fate_credential c SET password=${hashed}, updated_at=NOW()
      FROM fate_user u, fate_account_workspace w
      WHERE c.user_id=u.id AND w.user_id=u.id AND u.email=${normalized} AND w.recovery_hash=${digest} AND w.deleting=FALSE AND c.provider_id='credential' RETURNING c.user_id`,
    sql`DELETE FROM fate_session s USING fate_user u,fate_account_workspace w
      WHERE s.user_id=u.id AND w.user_id=u.id AND u.email=${normalized} AND w.recovery_hash=${digest}`,
    sql`UPDATE fate_account_workspace w SET recovery_hash=NULL FROM fate_user u
      WHERE w.user_id=u.id AND u.email=${normalized} AND w.recovery_hash=${digest}`,
  ]);
  if (!result[1].length) throw new AccountError("invalid_recovery", 403);
}

export async function deleteAccountData(userId: string, database?: AccountSql) {
  const sql = database ?? await getAccountDb();
  const now = Date.now();
  // Queue files before any cascading delete. The transaction either removes all
  // account records together or preserves them all for another attempt.
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${"account-security:"+userId}))`,
    sql`SELECT pg_advisory_xact_lock(hashtext('fate-gameplay-toolkit:blob-storage'))`,
    sql`UPDATE fate_account_workspace SET deleting=TRUE WHERE user_id=${userId}`,
    sql`INSERT INTO deleted_rooms (code,gm_participant_id,gm_token_hash,deleted_at)
      SELECT r.code,'deleted-account','',${now} FROM rooms r JOIN participants p ON p.room_id=r.id
      JOIN fate_account_membership m ON m.participant_id=p.id WHERE m.user_id=${userId} AND p.role='gm'
      ON CONFLICT(code) DO NOTHING`,
    sql`INSERT INTO blob_cleanup_queue (pathname,room_code,size,created_at,attempts,last_error)
      SELECT e.blob_pathname,r.code,e.file_size,${now},0,'' FROM entries e JOIN rooms r ON r.id=e.room_id
      WHERE e.blob_pathname IS NOT NULL AND (e.actor_id IN (SELECT participant_id FROM fate_account_membership WHERE user_id=${userId})
        OR e.room_id IN (SELECT p.room_id FROM participants p JOIN fate_account_membership m ON m.participant_id=p.id WHERE m.user_id=${userId} AND p.role='gm'))
      ON CONFLICT(pathname) DO NOTHING`,
    sql`INSERT INTO blob_cleanup_queue (pathname,room_code,size,created_at,attempts,last_error)
      SELECT v.pathname,r.code,v.size,${now},0,'' FROM upload_reservations v JOIN rooms r ON r.id=v.room_id
      WHERE v.actor_id IN (SELECT participant_id FROM fate_account_membership WHERE user_id=${userId})
        OR v.room_id IN (SELECT p.room_id FROM participants p JOIN fate_account_membership m ON m.participant_id=p.id WHERE m.user_id=${userId} AND p.role='gm')
      ON CONFLICT(pathname) DO NOTHING`,
    sql`DELETE FROM rooms WHERE id IN (SELECT p.room_id FROM participants p JOIN fate_account_membership m ON m.participant_id=p.id WHERE m.user_id=${userId} AND p.role='gm')`,
    sql`DELETE FROM participants WHERE id IN (SELECT participant_id FROM fate_account_membership WHERE user_id=${userId})`,
    sql`DELETE FROM fate_verification WHERE identifier IN (${userId},(SELECT email FROM fate_user WHERE id=${userId}))`,
    sql`DELETE FROM fate_user WHERE id=${userId}`,
  ]);
  // Storage outages do not undo deletion. Durable cleanup is retried by the
  // existing bounded maintenance and late-upload callback paths.
  const cleanup = await drainBlobCleanupQueue(sql, 100).catch(() => ({ pending: 1 }));
  return { deleted: true, cleanupPending: cleanup.pending > 0 };
}
