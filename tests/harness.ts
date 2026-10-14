// Runs the same service against the in-memory store and against PostgreSQL.
import pg from "pg"
import { createMemoryStore } from "../src/lib/memoryStore"
import { createSeed } from "../src/lib/seed"
import { createService, type Context, type Service, type Store } from "../src/lib/service"
import type { DB, Session } from "../src/lib/types"
import { migrate } from "../server/src/db"
import { createPgStore, importAll, TABLES } from "../server/src/pgStore"

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || ""

export interface Harness {
  api: Service
  useDevice(token: string | null): void
  reset(now: number): Promise<void>
  close(): Promise<void>
}

function context(clock: () => number) {
  let session: Session | null = null
  let device: string | null = null
  const ctx: Context = {
    now: clock,
    session: async () => session,
    setSession: async (s) => {
      session = s
    },
    device: () => device,
    setDevice: (t) => {
      device = t
    },
    hash: async (p) => p,
    verify: async (p, s) => p === s,
    preview: true,
    simulator: true,
    baseUrl: "http://localhost/",
    messenger: { sms: async () => undefined, email: async () => undefined },
  }
  return { ctx, setDevice: (t: string | null) => (device = t), clear: () => ((session = null), (device = null)) }
}

export function memoryHarness(clock: () => number): Harness {
  let db: DB = createSeed(clock())
  const store = createMemoryStore({ load: () => db, save: (next) => (db = next) })
  const c = context(clock)
  return {
    api: createService(store, c.ctx),
    useDevice: c.setDevice,
    async reset(now) {
      db = createSeed(now)
      c.clear()
    },
    async close() {},
  }
}

export async function pgHarness(clock: () => number): Promise<Harness> {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 })
  await migrate(pool, () => undefined)
  const store: Store = createPgStore(pool, clock)
  const c = context(clock)
  return {
    api: createService(store, c.ctx),
    useDevice: c.setDevice,
    async reset(now) {
      const tables = [...Object.values(TABLES).map((t) => t.table), "maintenance", "sessions"]
      await pool.query(`truncate ${tables.join(", ")}`)
      await importAll(pool, createSeed(now))
      c.clear()
    },
    close: () => pool.end(),
  }
}
