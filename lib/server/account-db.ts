import { randomBytes } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getSql } from "@/db";
import { ACCOUNT_DDL } from "@/db/account-schema";
import { getRoomDb } from "@/lib/server/rooms";

let ready: Promise<void> | null = null;
export async function initializeAccountSchema(sql: ReturnType<typeof getSql>) {
  await sql.transaction(ACCOUNT_DDL.map(statement => sql.query(statement)));
}
export async function getAccountDb() {
  const sql = getSql();
  ready ??= (async () => { await getRoomDb(); await initializeAccountSchema(sql); })().catch(error => { ready = null; throw error; });
  await ready;
  return sql as NeonQueryFunction<false, false>;
}
export async function accountSecret() {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const sql = await getAccountDb();
  // One persistent, cryptographically random application secret; never bundled or logged.
  await sql`INSERT INTO fate_app_config (key,value) VALUES ('auth_secret',${randomBytes(48).toString("base64url")}) ON CONFLICT (key) DO NOTHING`;
  const result = await sql`SELECT value FROM fate_app_config WHERE key = 'auth_secret'`;
  return result[0].value as string;
}
