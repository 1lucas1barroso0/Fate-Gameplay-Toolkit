import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const accountUsers = pgTable("fate_user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const accountSessions = pgTable("fate_session", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => accountUsers.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(), expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [index("fate_session_user_idx").on(t.userId)]);
export const accountCredentials = pgTable("fate_credential", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => accountUsers.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(), password: text("password"),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"), scope: text("scope"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"), refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [index("fate_credential_user_idx").on(t.userId)]);
export const accountVerifications = pgTable("fate_verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(), createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const authSchema = { user: accountUsers, session: accountSessions, account: accountCredentials, verification: accountVerifications };

// Additive initialization, also used by the database integration tests.
export const ACCOUNT_DDL = [
  `CREATE TABLE IF NOT EXISTS fate_user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified BOOLEAN NOT NULL DEFAULT FALSE, image TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS fate_session (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES fate_user(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, expires_at TIMESTAMP NOT NULL, ip_address TEXT, user_agent TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS fate_session_user_idx ON fate_session(user_id)`,
  `CREATE TABLE IF NOT EXISTS fate_credential (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES fate_user(id) ON DELETE CASCADE, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, password TEXT, access_token TEXT, refresh_token TEXT, id_token TEXT, scope TEXT, access_token_expires_at TIMESTAMP, refresh_token_expires_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS fate_credential_user_idx ON fate_credential(user_id)`,
  `CREATE TABLE IF NOT EXISTS fate_verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS fate_account_workspace (user_id TEXT PRIMARY KEY REFERENCES fate_user(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL DEFAULT '{}', recovery_hash TEXT, deleting BOOLEAN NOT NULL DEFAULT FALSE)`,
  `CREATE TABLE IF NOT EXISTS fate_account_image (user_id TEXT NOT NULL REFERENCES fate_user(id) ON DELETE CASCADE, id TEXT NOT NULL, content_type TEXT NOT NULL, bytes BIGINT NOT NULL, data BYTEA NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY(user_id,id))`,
  `CREATE TABLE IF NOT EXISTS fate_account_membership (user_id TEXT NOT NULL REFERENCES fate_user(id) ON DELETE CASCADE, participant_id TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS fate_account_membership_user_idx ON fate_account_membership(user_id)`,
  `CREATE TABLE IF NOT EXISTS fate_app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];
