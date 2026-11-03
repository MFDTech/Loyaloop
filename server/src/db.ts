import pg from "pg"
import { migrations } from "./migrations"

export type Pool = pg.Pool
export type Client = pg.PoolClient

export function createPool(url: string): Pool {
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  pool.on("error", (error) => console.error("[db] idle client error", error.message))
  return pool
}

export async function transaction<T>(pool: Pool, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await fn(client)
    await client.query("commit")
    return result
  } catch (error) {
    await client.query("rollback").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function migrate(pool: Pool, log = (line: string) => console.log(line)) {
  await transaction(pool, async (client) => {
    // One migrator at a time, even with several app instances starting together.
    await client.query("select pg_advisory_xact_lock(7311)")
    await client.query("create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())")
    const done = new Set((await client.query<{ id: string }>("select id from schema_migrations")).rows.map((r) => r.id))
    for (const m of migrations) {
      if (done.has(m.id)) continue
      await client.query(m.sql)
      await client.query("insert into schema_migrations (id) values ($1)", [m.id])
      log(`[db] applied ${m.id}`)
    }
  })
}
