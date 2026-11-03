import { createHash, randomBytes } from "node:crypto"
import type { Session } from "../../src/lib/types"
import type { Pool } from "./db"

export const SESSION_COOKIE = "ll_session"
export const SESSION_DAYS = 30

const digest = (token: string) => createHash("sha256").update(token).digest("hex")

export async function findSession(pool: Pool, token: string): Promise<Session | null> {
  if (!token || token.length > 100) return null
  const row = (
    await pool.query<{ user_id: string; impersonating: string | null; created_at: Date }>(
      "select user_id, impersonating, created_at from sessions where token_hash = $1 and expires_at > now()",
      [digest(token)],
    )
  ).rows[0]
  return row ? { userId: row.user_id, impersonating: row.impersonating || undefined, createdAt: row.created_at.toISOString() } : null
}

/** The cookie holds a random token; the database keeps only its hash. */
export async function createSession(pool: Pool, session: Session): Promise<string> {
  const token = randomBytes(32).toString("base64url")
  await pool.query("insert into sessions (token_hash, user_id, impersonating, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))", [
    digest(token),
    session.userId,
    session.impersonating ?? null,
    SESSION_DAYS,
  ])
  return token
}

export async function updateSession(pool: Pool, token: string, session: Session) {
  await pool.query("update sessions set impersonating = $2 where token_hash = $1", [digest(token), session.impersonating ?? null])
}

export async function deleteSession(pool: Pool, token: string) {
  await pool.query("delete from sessions where token_hash = $1", [digest(token)])
}

/** Signs a user out everywhere except, optionally, the current session. */
export async function deleteUserSessions(pool: Pool, userId: string, keepToken?: string) {
  await pool.query("delete from sessions where user_id = $1 and token_hash <> $2", [userId, keepToken ? digest(keepToken) : ""])
}

export async function purgeExpiredSessions(pool: Pool) {
  await pool.query("delete from sessions where expires_at < now()")
}
