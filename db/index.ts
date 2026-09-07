import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let sqlClient: ReturnType<typeof neon> | null = null;
let database: ReturnType<typeof createDb> | null = null;

export function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  sqlClient ??= neon(connectionString);
  return sqlClient;
}

function createDb() {
  return drizzle(getSql(), { schema });
}

export function getDb() {
  database ??= createDb();
  return database;
}
