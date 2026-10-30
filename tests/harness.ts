// Runs the same service against the in-memory store and against PostgreSQL.
import pg from "pg"
import { createMemoryStore } from "../src/lib/memoryStore"
import { createSeed } from "../src/lib/seed"
import { createService, type Context, type Service, type Store, type SubscriptionCharge, type SubscriptionInfo, type Subscriptions } from "../src/lib/service"
import type { DB, Session } from "../src/lib/types"
import { migrate } from "../server/src/db"
import { createPgStore, importAll, TABLES } from "../server/src/pgStore"

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || ""

/** Mercado Pago subscriptions, simulated: the test decides when the card is entered and each charge. */
export interface FakeMercadoPago extends Subscriptions {
  subs: Map<string, SubscriptionInfo>
  charges: Map<string, SubscriptionCharge>
  created: { payerEmail: string; amount: number; backUrl: string }[]
  /** The owner entered a card and the month was charged. */
  pay(subscriptionId: string, at: string, status?: SubscriptionCharge["status"]): string
}

export function fakeMercadoPago(): FakeMercadoPago {
  const subs = new Map<string, SubscriptionInfo>()
  const charges = new Map<string, SubscriptionCharge>()
  const created: FakeMercadoPago["created"] = []
  let n = 0
  return {
    subs,
    charges,
    created,
    async create(input) {
      const id = `pre_${++n}`
      subs.set(id, { id, status: "pending", externalReference: input.externalReference, amount: input.amount, payerEmail: input.payerEmail })
      created.push({ payerEmail: input.payerEmail, amount: input.amount, backUrl: input.backUrl })
      return { id, url: `https://mercadopago.test/checkout/${id}` }
    },
    async get(id) {
      const info = subs.get(id)
      if (!info) throw new Error("not found")
      return { ...info }
    },
    async update(id, change) {
      const info = subs.get(id)!
      if (change.amount) info.amount = change.amount
      if (change.status) info.status = change.status
    },
    async charge(id) {
      return charges.get(id)!
    },
    pay(subscriptionId, at, status = "approved") {
      const info = subs.get(subscriptionId)!
      info.status = "authorized"
      if (status === "approved") info.lastChargeAt = at
      const id = `ap_${++n}`
      charges.set(id, { id, subscriptionId, status, amount: info.amount, at })
      return id
    },
  }
}

export interface Harness {
  api: Service
  mp: FakeMercadoPago
  useDevice(token: string | null): void
  reset(now: number): Promise<void>
  close(): Promise<void>
}

function context(clock: () => number, mp: FakeMercadoPago) {
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
    messenger: { channels: { sms: false, email: false }, sms: async () => undefined, email: async () => undefined },
    subscriptions: mp,
  }
  return { ctx, setDevice: (t: string | null) => (device = t), clear: () => ((session = null), (device = null)) }
}

export function memoryHarness(clock: () => number): Harness {
  let db: DB = createSeed(clock())
  const store = createMemoryStore({ load: () => db, save: (next) => (db = next) })
  const mp = fakeMercadoPago()
  const c = context(clock, mp)
  return {
    api: createService(store, c.ctx),
    mp,
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
  const mp = fakeMercadoPago()
  const c = context(clock, mp)
  return {
    api: createService(store, c.ctx),
    mp,
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
