// PostgreSQL implementation of the service Store.
//
// A write loads the working set of one business (or the global set), runs the
// change on it in memory with the same pure rules the tests cover, and saves
// only the rows that changed, all inside one transaction. Writes to the same
// business are serialized with an advisory lock, so a scan and a payment for
// the same register can never be matched twice.

import { ApiError, type Scope, type Store } from "../../src/lib/service"
import type { DB } from "../../src/lib/types"
import { DB_VERSION } from "../../src/lib/seed"
import { transaction, type Client, type Pool } from "./db"

type Row = Record<string, any>
type Key = Exclude<keyof DB, "version" | "maintenance">

interface TableSpec {
  table: string
  pk(row: Row): string
  business(row: Row): string | null
  at(row: Row): string
  order: "asc" | "desc"
}

const spec = (table: string, order: "asc" | "desc" = "asc", extra: Partial<TableSpec> = {}): TableSpec => ({
  table,
  order,
  pk: (r) => r.id,
  business: (r) => r.businessId ?? null,
  at: (r) => r.createdAt ?? "",
  ...extra,
})

export const TABLES: Record<Key, TableSpec> = {
  users: spec("users"),
  businesses: spec("businesses", "asc", { business: (r) => r.id }),
  programs: spec("programs", "asc", { pk: (r) => r.businessId }),
  rewards: spec("rewards"),
  branches: spec("branches"),
  registers: spec("registers", "asc", { at: (r) => r.id }),
  devices: spec("devices", "asc", { at: (r) => r.pairedAt ?? "" }),
  pairingCodes: spec("pairing_codes", "asc", { pk: (r) => r.code, at: (r) => r.expiresAt }),
  customers: spec("customers"),
  transactions: spec("transactions", "desc"),
  scans: spec("scans", "desc"),
  payments: spec("payments", "desc"),
  integrations: spec("integrations", "asc", { pk: (r) => `${r.businessId}:${r.provider}`, at: (r) => r.provider }),
  notices: spec("notices", "desc"),
  campaigns: spec("campaigns", "desc", { at: (r) => r.sendAt ?? r.createdAt ?? "" }),
  audit: spec("audit", "desc"),
  leads: spec("leads", "desc", { business: () => null }),
  prospects: spec("prospects", "desc", { business: () => null, at: (r) => r.updatedAt ?? r.createdAt ?? "" }),
  verifications: spec("verifications", "asc", { pk: (r) => `${r.businessId}:${r.phone}`, at: (r) => r.sentAt }),
  resets: spec("resets", "asc", { pk: (r) => r.token, business: () => null, at: (r) => r.expiresAt }),
}

const KEYS = Object.keys(TABLES) as Key[]
const DAY = 86_400_000

function empty(): DB {
  const db = { version: DB_VERSION, maintenance: {} } as DB
  for (const key of KEYS) (db as any)[key] = []
  return db
}

type Snapshot = Map<Key, Map<string, string>>

async function rows(client: Client | Pool, key: Key, where: string, params: unknown[]): Promise<Row[]> {
  const t = TABLES[key]
  const result = await client.query<{ data: Row }>(`select data from ${t.table} where ${where} order by at ${t.order}, pk`, params)
  return result.rows.map((r) => r.data)
}

async function loadScope(client: Client | Pool, scope: Scope, now: number): Promise<DB> {
  const db = empty()
  const set = (key: Key, list: Row[]) => ((db as any)[key] = list)
  // A transaction client runs one query at a time; the pool can run them in parallel.
  const run = async (jobs: (() => Promise<unknown>)[]) => {
    if ("release" in client) for (const job of jobs) await job()
    else await Promise.all(jobs.map((job) => job()))
  }
  if (scope === "global") {
    const all: Key[] = ["users", "businesses", "programs", "integrations", "leads", "prospects", "resets"]
    await run(all.map((key) => async () => set(key, await rows(client, key, "true", []))))
    return db
  }
  const id = scope.business
  const since = (days: number) => new Date(now - days * DAY).toISOString()
  const byBusiness: Key[] = ["users", "programs", "rewards", "branches", "registers", "devices", "pairingCodes", "customers", "integrations", "verifications"]
  await run([
    ...byBusiness.map((key) => async () => set(key, await rows(client, key, "business_id = $1", [id]))),
    async () => set("businesses", await rows(client, "businesses", "pk = $1", [id])),
    async () => set("transactions", await rows(client, "transactions", "business_id = $1 and at >= $2", [id, since(400)])),
    async () => set("scans", await rows(client, "scans", "business_id = $1 and (at >= $2 or data->>'status' in ('pending', 'review'))", [id, since(1)])),
    async () => set("payments", await rows(client, "payments", "business_id = $1 and (at >= $2 or data->>'status' in ('unmatched', 'review'))", [id, since(1)])),
    async () => set("notices", await rows(client, "notices", "business_id = $1 and at >= $2", [id, since(60)])),
    async () => set("campaigns", await rows(client, "campaigns", "business_id = $1 and (at >= $2 or data->>'status' = 'scheduled')", [id, since(120)])),
    async () => {
      const r = await client.query<{ data: { at: string } }>("select data from maintenance where pk = $1", [id])
      if (r.rows[0]) db.maintenance[id] = r.rows[0].data.at
    },
  ])
  return db
}

function snapshot(db: DB): Snapshot {
  const snap: Snapshot = new Map()
  for (const key of KEYS) snap.set(key, new Map((db[key] as Row[]).map((r) => [TABLES[key].pk(r), JSON.stringify(r)])))
  return snap
}

async function persist(client: Client, before: Snapshot, after: DB, scope: Scope, beforeMaintenance: Record<string, string>) {
  for (const key of KEYS) {
    const t = TABLES[key]
    const old = before.get(key)!
    const changed: { pk: string; business_id: string | null; at: string; data: Row }[] = []
    const seen = new Set<string>()
    for (const row of after[key] as Row[]) {
      const pk = t.pk(row)
      if (seen.has(pk)) throw new Error(`Duplicate ${key} key ${pk}`)
      seen.add(pk)
      const json = JSON.stringify(row)
      if (old.get(pk) !== json) changed.push({ pk, business_id: t.business(row), at: t.at(row), data: row })
    }
    const removed = [...old.keys()].filter((pk) => !seen.has(pk))
    if (removed.length) await client.query(`delete from ${t.table} where pk = any($1)`, [removed])
    if (changed.length)
      await client.query(
        `insert into ${t.table} (pk, business_id, at, data)
         select x.pk, x.business_id, x.at, x.data from jsonb_to_recordset($1::jsonb) as x(pk text, business_id text, at text, data jsonb)
         on conflict (pk) do update set business_id = excluded.business_id, at = excluded.at, data = excluded.data`,
        [JSON.stringify(changed)],
      )
  }
  await enqueueWalletJobs(client, before, after, scope)
  if (scope !== "global") {
    const id = scope.business
    const at = after.maintenance[id]
    if (at && at !== beforeMaintenance[id])
      await client.query("insert into maintenance (pk, business_id, at, data) values ($1, $1, $2, $3) on conflict (pk) do update set at = excluded.at, data = excluded.data", [id, at, JSON.stringify({ at })])
  }
}

/**
 * Queues wallet work in the same transaction as the change, so a pass is never
 * left out of date: balance changes update the customer's pass, new notices
 * become push messages, and card or brand changes update the business's design.
 * Only customers who already added their card to a wallet get jobs.
 */
async function enqueueWalletJobs(client: Client, before: Snapshot, after: DB, scope: Scope) {
  const changedIds = (key: Key) => {
    const old = before.get(key)!
    return (after[key] as Row[]).filter((r) => old.get(TABLES[key].pk(r)) !== JSON.stringify(r)).map((r) => TABLES[key].pk(r))
  }
  const customers = changedIds("customers")
  if (customers.length)
    await client.query(
      `insert into wallet_jobs (kind, business_id, ref) select 'pass', business_id, customer_id from wallet_passes where customer_id = any($1)
       on conflict (kind, ref) where status = 'pending' do nothing`,
      [customers],
    )
  const oldNotices = before.get("notices")!
  const fresh = after.notices.filter((n) => !oldNotices.has(n.id)).map((n) => ({ id: n.id, customer_id: n.customerId, payload: { message: n.message, event: n.event } }))
  if (fresh.length)
    await client.query(
      `insert into wallet_jobs (kind, business_id, ref, payload)
       select 'message', w.business_id, x.id, x.payload from jsonb_to_recordset($1::jsonb) as x(id text, customer_id text, payload jsonb)
       join wallet_passes w on w.customer_id = x.customer_id
       on conflict (kind, ref) where status = 'pending' do nothing`,
      [JSON.stringify(fresh)],
    )
  if (scope !== "global" && (changedIds("businesses").length || changedIds("programs").length || changedIds("rewards").length))
    await client.query(
      `insert into wallet_jobs (kind, business_id, ref) select 'class', $1, $1 where exists (select 1 from wallet_passes where business_id = $1)
       on conflict (kind, ref) where status = 'pending' do nothing`,
      [scope.business],
    )
}

function lockKey(scope: Scope) {
  return scope === "global" ? "global" : `business:${scope.business}`
}

export function createPgStore(pool: Pool, now: () => number = Date.now): Store {
  return {
    async read(scope) {
      return loadScope(pool, scope, now())
    },
    async write(scope, change) {
      try {
        return await transaction(pool, async (client) => {
          await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey(scope)])
          const db = await loadScope(client, scope, now())
          const before = snapshot(db)
          const beforeMaintenance = { ...db.maintenance }
          const result = change(db)
          await persist(client, before, db, scope, beforeMaintenance)
          return result
        })
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new ApiError("Ese dato ya está registrado. Revisa e inténtalo otra vez.", "conflict")
        throw error
      }
    },
    async user(id) {
      return (await pool.query("select data from users where pk = $1", [id])).rows[0]?.data
    },
    async business(id) {
      return (await pool.query("select data from businesses where pk = $1", [id])).rows[0]?.data
    },
    async deviceByToken(token) {
      return (await pool.query("select data from devices where data->>'token' = $1", [token])).rows[0]?.data
    },
    async branchByCode(code) {
      return (await pool.query("select data from branches where upper(data->>'code') = upper($1)", [code])).rows[0]?.data
    },
    async pairingCode(code) {
      const row = (await pool.query("select business_id from pairing_codes where pk = $1", [code])).rows[0]
      return row && { businessId: row.business_id }
    },
    async emailTaken(email) {
      return (await pool.query("select 1 from users where lower(data->>'email') = lower($1)", [email])).rowCount! > 0
    },
    async transactions(businessId, q) {
      const where = ["business_id = $1"]
      const params: unknown[] = [businessId]
      const add = (sql: string, value: unknown) => {
        params.push(value)
        where.push(sql.replace("?", `$${params.length}`))
      }
      if (q.customerId) add("data->>'customerId' = ?", q.customerId)
      if (q.kind) add("data->>'kind' = ?", q.kind)
      if (q.branchId) add("data->>'branchId' = ?", q.branchId)
      if (q.registerId) add("data->>'registerId' = ?", q.registerId)
      if (q.from) add("at >= ?", q.from)
      if (q.to) add("at <= ?", q.to)
      params.push(Math.min(q.limit || 1000, 5000))
      const result = await pool.query(`select data from transactions where ${where.join(" and ")} order by at desc, pk limit $${params.length}`, params)
      return result.rows.map((r) => r.data)
    },
    async countTransactions(businessId, q) {
      const result = await pool.query(
        "select count(*)::int as n from transactions where business_id = $1 and ($2::text is null or data->>'branchId' = $2) and ($3::text is null or data->>'registerId' = $3)",
        [businessId, q.branchId ?? null, q.registerId ?? null],
      )
      return result.rows[0].n
    },
    async visitCounts(businessId) {
      const result = await pool.query<{ id: string; n: number }>(
        "select data->>'customerId' as id, count(*)::int as n from transactions where business_id = $1 and data->>'kind' in ('purchase', 'visit') group by 1",
        [businessId],
      )
      return new Map(result.rows.map((r) => [r.id, r.n]))
    },
    async notices(businessId, limit) {
      return (await pool.query("select data from notices where business_id = $1 order by at desc limit $2", [businessId, limit])).rows.map((r) => r.data)
    },
    async audit(q) {
      const result = q.businessId
        ? await pool.query("select data from audit where business_id = $1 order by at desc limit $2", [q.businessId, q.limit])
        : await pool.query("select data from audit order by at desc limit $1", [q.limit])
      return result.rows.map((r) => r.data)
    },
    async businessStats(since) {
      const result = await pool.query(
        `select b.pk as "businessId",
           (select count(*)::int from customers c where c.business_id = b.pk) as customers,
           (select count(*)::int from branches x where x.business_id = b.pk) as branches,
           (select count(*)::int from transactions t where t.business_id = b.pk and t.at > $1) as transactions,
           (select count(*)::int from payments p where p.business_id = b.pk and p.data->>'status' = 'review') as "inReview"
         from businesses b`,
        [since],
      )
      return result.rows
    },
  }
}

/** Writes a whole DB object (example data or an import) into empty tables. */
export async function importAll(pool: Pool, db: DB) {
  await transaction(pool, async (client) => {
    const before: Snapshot = new Map(KEYS.map((k) => [k, new Map()]))
    await persist(client, before, db, "global", {})
    for (const [id, at] of Object.entries(db.maintenance))
      await client.query("insert into maintenance (pk, business_id, at, data) values ($1, $1, $2, $3) on conflict (pk) do nothing", [id, at, JSON.stringify({ at })])
  })
}
