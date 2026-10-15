// Issues passes and keeps them up to date.
// - links(): called when a customer registers or recovers the card.
// - work(): the background worker; it sends the jobs queued by pgStore.

import type { Wallets, WalletLinks } from "../../../src/lib/service"
import type { Business, Customer, Program, Reward } from "../../../src/lib/types"
import type { Pool } from "../db"
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

export interface WalletService extends Wallets {
  enabled: { google: boolean; apple: boolean }
  /** Runs due jobs once. Returns how many it handled. */
  work(): Promise<number>
  start(intervalMs?: number): () => void
}

export function createWallets(pool: Pool, google: GoogleWallet | null): WalletService {
  // Classes already sent in this process, by business: skips a call per registration.
  const syncedClasses = new Map<string, string>()

  async function syncClass(data: PassData, force = false) {
    if (!google) return
    const json = JSON.stringify(google.buildClass(data))
    if (!force && syncedClasses.get(data.business.id) === json) return
    await google.upsertClass(data)
    syncedClasses.set(data.business.id, json)
  }

  async function links(businessId: string, customerId: string): Promise<WalletLinks> {
    const result: WalletLinks = {}
    if (!google) return result
    const data = await loadPass(pool, businessId, customerId)
    if (!data || data.business.status === "paused") return result
    await syncClass(data)
    await google.upsertObject(data)
    await pool.query(
      `insert into wallet_passes (customer_id, business_id, google_object_id) values ($1, $2, $3)
       on conflict (customer_id) do update set google_object_id = excluded.google_object_id`,
      [customerId, businessId, google.objectId(customerId)],
    )
    result.google = google.saveUrl(google.objectId(customerId), google.classId(businessId))
    return result
  }

  type Job = { id: string; kind: string; business_id: string; ref: string; payload: { message?: string }; attempts: number }

  async function run(job: Job) {
    if (!google) return
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
      const data = await loadPass(pool, job.business_id, notice.customerId)
      if (!data) return
      // Make sure the balance on the pass matches the message before notifying.
      await google.upsertObject(data)
      const header = data.business.discreet ? data.business.neutralName : data.business.name
      await google.addMessage(notice.customerId, { id: job.ref, header, body: notice.message })
    }
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

  return { enabled: { google: !!google, apple: false }, links, work, start }
}
