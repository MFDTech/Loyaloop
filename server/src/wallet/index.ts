// Issues passes and keeps them up to date.
// - links(): called when a customer registers or recovers the card.
// - work(): the background worker; it sends the jobs queued by pgStore.
// - apple: the PassKit web service (devices register, ask for changes, download passes).

import { randomBytes, timingSafeEqual } from "node:crypto"
import type { Wallets, WalletLinks } from "../../../src/lib/service"
import type { Business, Customer, Program, Reward } from "../../../src/lib/types"
import type { Pool } from "../db"
import type { AppleWallet } from "./apple"
import { GoogleWallet, type PassData } from "./google"

const MAX_ATTEMPTS = 8

async function loadPass(pool: Pool, businessId: string, customerId?: string): Promise<PassData | null> {
  const one = async <T>(sql: string, params: unknown[]) => (await pool.query<{ data: T }>(sql, params)).rows[0]?.data
  const business = await one<Business>("select data from businesses where pk = $1", [businessId])
  const program = await one<Program>("select data from programs where pk = $1", [businessId])
  if (!business || !program) return null
  const rewards = (await pool.query<{ data: Reward }>("select data from rewards where business_id = $1 order by at", [businessId])).rows.map((r) => r.data)
  const customer = customerId ? await one<Customer>("select data from customers where pk = $1 and business_id = $2", [customerId, businessId]) : undefined
  if (customerId && !customer) return null
  return { business, program, rewards, customer }
}

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Apple compares this tag as text; milliseconds since 1970 keep it simple and ordered. */
const tagOf = (date: Date) => String(date.getTime())

export interface ApplePassFile {
  data: Buffer
  lastModified: Date
}

export interface AppleWebService {
  passTypeId: string
  /** Pass file for the customer's own download link (token in the URL). */
  download(serial: string, authToken: string): Promise<ApplePassFile | null>
  /** Pass file requested by Wallet (token in the Authorization header). */
  pass(serial: string, authToken: string): Promise<ApplePassFile | null>
  /** "created", "exists" or null when the token is wrong. */
  register(deviceId: string, serial: string, authToken: string, pushToken: string): Promise<"created" | "exists" | null>
  unregister(deviceId: string, serial: string, authToken: string): Promise<boolean>
  updatedSerials(deviceId: string, since?: string): Promise<{ serialNumbers: string[]; lastUpdated: string } | null>
}

export interface WalletService extends Wallets {
  enabled: { google: boolean; apple: boolean }
  apple: AppleWebService | null
  /** Runs due jobs once. Returns how many it handled. */
  work(): Promise<number>
  start(intervalMs?: number): () => void
}

export function createWallets(pool: Pool, google: GoogleWallet | null, appleWallet: AppleWallet | null = null): WalletService {
  // Classes already sent in this process, by business: skips a call per registration.
  const syncedClasses = new Map<string, string>()

  async function syncClass(data: PassData, force = false) {
    if (!google) return
    const json = JSON.stringify(google.buildClass(data))
    if (!force && syncedClasses.get(data.business.id) === json) return
    await google.upsertClass(data)
    syncedClasses.set(data.business.id, json)
  }

  async function googleLink(data: PassData, businessId: string, customerId: string) {
    if (!google) return undefined
    await syncClass(data)
    await google.upsertObject(data)
    await pool.query(
      `insert into wallet_passes (customer_id, business_id, google_object_id) values ($1, $2, $3)
       on conflict (customer_id) do update set google_object_id = excluded.google_object_id`,
      [customerId, businessId, google.objectId(customerId)],
    )
    return google.saveUrl(google.objectId(customerId), google.classId(businessId))
  }

  async function appleLink(businessId: string, customerId: string) {
    if (!appleWallet) return undefined
    // The serial is the customer id; the token stays the same so passes already installed keep working.
    const row = await pool.query<{ apple_auth_token: string }>(
      `insert into wallet_passes (customer_id, business_id, apple_serial, apple_auth_token) values ($1, $2, $1, $3)
       on conflict (customer_id) do update set apple_serial = excluded.apple_serial,
         apple_auth_token = coalesce(wallet_passes.apple_auth_token, excluded.apple_auth_token)
       returning apple_auth_token`,
      [customerId, businessId, randomBytes(24).toString("base64url")],
    )
    return appleWallet.downloadUrl(customerId, row.rows[0].apple_auth_token)
  }

  async function links(businessId: string, customerId: string): Promise<WalletLinks> {
    const result: WalletLinks = {}
    if (!google && !appleWallet) return result
    const data = await loadPass(pool, businessId, customerId)
    if (!data || data.business.status === "paused") return result
    // One wallet failing never hides the other.
    const [g, a] = await Promise.allSettled([googleLink(data, businessId, customerId), appleLink(businessId, customerId)])
    if (g.status === "fulfilled" && g.value) result.google = g.value
    else if (g.status === "rejected") console.error(`[wallet] Google ${customerId}: ${(g.reason as Error).message}`)
    if (a.status === "fulfilled" && a.value) result.apple = a.value
    else if (a.status === "rejected") console.error(`[wallet] Apple ${customerId}: ${(a.reason as Error).message}`)
    return result
  }

  // ---------- Apple web service ----------

  type AppleRow = { customer_id: string; business_id: string; apple_auth_token: string; apple_updated_at: Date }

  async function appleRow(serial: string, authToken: string): Promise<AppleRow | null> {
    if (!appleWallet || !authToken) return null
    const row = (
      await pool.query<AppleRow>("select customer_id, business_id, apple_auth_token, apple_updated_at from wallet_passes where apple_serial = $1 and apple_auth_token is not null", [serial])
    ).rows[0]
    return row && sameText(row.apple_auth_token, authToken) ? row : null
  }

  async function buildApple(row: AppleRow): Promise<ApplePassFile | null> {
    if (!appleWallet) return null
    const data = await loadPass(pool, row.business_id, row.customer_id)
    if (!data || data.business.status === "paused") return null
    const notice = (
      await pool.query<{ data: { id: string; message: string } }>("select data from notices where business_id = $1 and data->>'customerId' = $2 order by at desc limit 1", [
        row.business_id,
        row.customer_id,
      ])
    ).rows[0]?.data
    const file = await appleWallet.build({ ...data, serial: row.customer_id, authToken: row.apple_auth_token, notice: notice ? { id: notice.id, message: notice.message } : undefined })
    return { data: file, lastModified: row.apple_updated_at }
  }

  const apple: AppleWebService | null = appleWallet && {
    passTypeId: appleWallet.options.passTypeId,
    async download(serial, authToken) {
      const row = await appleRow(serial, authToken)
      return row ? buildApple(row) : null
    },
    async pass(serial, authToken) {
      const row = await appleRow(serial, authToken)
      return row ? buildApple(row) : null
    },
    async register(deviceId, serial, authToken, pushToken) {
      if (!(await appleRow(serial, authToken))) return null
      const result = await pool.query<{ inserted: boolean }>(
        `insert into apple_registrations (device_id, serial, push_token) values ($1, $2, $3)
         on conflict (device_id, serial) do update set push_token = excluded.push_token
         returning (xmax = 0) as inserted`,
        [deviceId, serial, pushToken],
      )
      return result.rows[0].inserted ? "created" : "exists"
    },
    async unregister(deviceId, serial, authToken) {
      if (!(await appleRow(serial, authToken))) return false
      await pool.query("delete from apple_registrations where device_id = $1 and serial = $2", [deviceId, serial])
      return true
    },
    async updatedSerials(deviceId, since) {
      const sinceMs = since && /^\d+$/.test(since) ? Number(since) : null
      const rows = (
        await pool.query<{ serial: string; updated: Date }>(
          `select r.serial, date_trunc('milliseconds', w.apple_updated_at) as updated from apple_registrations r join wallet_passes w on w.apple_serial = r.serial
           where r.device_id = $1 and ($2::bigint is null or date_trunc('milliseconds', w.apple_updated_at) > to_timestamp($2::bigint / 1000.0))`,
          [deviceId, sinceMs],
        )
      ).rows
      if (!rows.length) return null
      const latest = rows.reduce((max, r) => (r.updated > max ? r.updated : max), rows[0].updated)
      return { serialNumbers: rows.map((r) => r.serial), lastUpdated: tagOf(latest) }
    },
  }

  /** Marks Apple passes as changed and tells every registered device to fetch them. */
  async function pushApple(where: { customerId?: string; businessId?: string }) {
    if (!appleWallet) return
    const touched = await pool.query<{ apple_serial: string }>(
      `update wallet_passes set apple_updated_at = greatest(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', apple_updated_at) + interval '1 millisecond')
       where apple_serial is not null and ($1::text is null or customer_id = $1) and ($2::text is null or business_id = $2)
       returning apple_serial`,
      [where.customerId ?? null, where.businessId ?? null],
    )
    if (!touched.rowCount) return
    const devices = (
      await pool.query<{ device_id: string; serial: string; push_token: string }>("select device_id, serial, push_token from apple_registrations where serial = any($1)", [
        touched.rows.map((r) => r.apple_serial),
      ])
    ).rows
    // One push per device token is enough: the device asks which passes changed.
    const tokens = new Map(devices.map((d) => [d.push_token, d]))
    const failures: string[] = []
    for (const [token] of tokens) {
      const result = await appleWallet.push(token)
      if (result.ok) continue
      if (result.status === 410 || result.reason === "BadDeviceToken" || result.reason === "Unregistered") {
        await pool.query("delete from apple_registrations where push_token = $1", [token])
      } else failures.push(`${result.status} ${result.reason}`)
    }
    if (failures.length) throw new Error(`APNs: ${failures.join(", ")}`)
  }

  // ---------- Background jobs ----------

  type Job = { id: string; kind: string; business_id: string; ref: string; payload: { message?: string }; attempts: number }

  async function runGoogle(job: Job) {
    if (!google) return
    // The business was deleted; ref is the Google object id.
    if (job.kind === "expire") return google.expireObject(job.ref)
    if (job.kind === "class") {
      const data = await loadPass(pool, job.business_id)
      if (data) await syncClass(data, true)
      return
    }
    if (job.kind === "pass") {
      const pass = (await pool.query<{ google_object_id: string | null }>("select google_object_id from wallet_passes where customer_id = $1", [job.ref])).rows[0]
      if (!pass?.google_object_id) return
      const data = await loadPass(pool, job.business_id, job.ref)
      if (data) await google.upsertObject(data)
      return
    }
    if (job.kind === "message") {
      const notice = (await pool.query<{ data: { customerId: string; message: string } }>("select data from notices where pk = $1", [job.ref])).rows[0]?.data
      if (!notice) return
      const pass = (await pool.query<{ google_object_id: string | null }>("select google_object_id from wallet_passes where customer_id = $1", [notice.customerId])).rows[0]
      if (!pass?.google_object_id) return
      const data = await loadPass(pool, job.business_id, notice.customerId)
      if (!data) return
      // Make sure the balance on the pass matches the message before notifying.
      await google.upsertObject(data)
      const header = data.business.discreet ? data.business.neutralName : data.business.name
      await google.addMessage(notice.customerId, { id: job.ref, header, body: notice.message })
    }
  }

  async function runApple(job: Job) {
    if (!appleWallet) return
    if (job.kind === "class") return pushApple({ businessId: job.business_id })
    if (job.kind === "pass") return pushApple({ customerId: job.ref })
    if (job.kind === "message") {
      const notice = (await pool.query<{ data: { customerId: string } }>("select data from notices where pk = $1", [job.ref])).rows[0]?.data
      // The new notice goes on the back of the pass; its change message shows on the lock screen.
      if (notice) return pushApple({ customerId: notice.customerId })
    }
  }

  async function run(job: Job) {
    const results = await Promise.allSettled([runGoogle(job), runApple(job)])
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as Error).message)
    if (errors.length) throw new Error(errors.join(" · "))
  }

  async function work() {
    const claimed = await pool.query<Job>(
      `update wallet_jobs set status = 'running', attempts = attempts + 1
       where id in (select id from wallet_jobs where status = 'pending' and run_after <= now() order by id limit 20 for update skip locked)
       returning id, kind, business_id, ref, payload, attempts`,
    )
    for (const job of claimed.rows) {
      try {
        await run(job)
        await pool.query("update wallet_jobs set status = 'done', done_at = now(), last_error = null where id = $1", [job.id])
      } catch (error) {
        const message = (error as Error).message.slice(0, 500)
        const failed = job.attempts >= MAX_ATTEMPTS
        // Back off: 1, 2, 4, 8… minutes. A newer pending job for the same pass wins.
        await pool
          .query(
            `update wallet_jobs set status = $2, last_error = $3, run_after = now() + make_interval(mins => $4) where id = $1`,
            [job.id, failed ? "failed" : "pending", message, 2 ** (job.attempts - 1)],
          )
          .catch(() => pool.query("update wallet_jobs set status = 'failed', last_error = $2 where id = $1", [job.id, message]))
        console.error(`[wallet] ${job.kind} ${job.ref}: ${message}`)
      }
    }
    return claimed.rowCount || 0
  }

  function start(intervalMs = 3000) {
    // Jobs left running by a stopped server go back to the queue.
    pool.query("update wallet_jobs set status = 'pending' where status = 'running'").catch(() => undefined)
    let busy = false
    const timer = setInterval(async () => {
      if (busy) return
      busy = true
      try {
        await work()
      } catch (error) {
        console.error("[wallet]", (error as Error).message)
      } finally {
        busy = false
      }
    }, intervalMs)
    return () => clearInterval(timer)
  }

  return { enabled: { google: !!google, apple: !!appleWallet }, apple, links, work, start }
}
