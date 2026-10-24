// Monthly charge to businesses with Mercado Pago subscriptions ("preapproval"),
// in LoyaLoop's own Mercado Pago account (not the businesses' accounts).
//
// 1. The owner presses «Activar pago automático»: we create a subscription in
//    status "pending" and send them to its init_point, where they enter a card.
// 2. Mercado Pago charges the first month and then every month on that day.
// 3. We learn about it three ways, so a lost notification never matters:
//    the owner comes back through /api/billing/return, Mercado Pago notifies
//    /api/webhooks/billing, and the server clock re-reads every subscription.

import type { Context as HonoContext } from "hono"
import type { Subscriptions, SubscriptionCharge, SubscriptionInfo } from "../../src/lib/service"
import type { SubscriptionStatus } from "../../src/lib/types"
import type { Config } from "./config"
import { validMercadoPagoSignature } from "./mercadopago"

const API = "https://api.mercadopago.com"
const STATUSES: SubscriptionStatus[] = ["pending", "authorized", "paused", "cancelled"]

interface Preapproval {
  id: string
  status: string
  external_reference?: string
  payer_email?: string
  init_point?: string
  next_payment_date?: string
  auto_recurring?: { transaction_amount?: number }
  summarized?: { last_charged_date?: string | null }
}

interface AuthorizedPayment {
  id: number | string
  preapproval_id: string
  status?: string
  transaction_amount?: number
  date_created?: string
  debit_date?: string
  payment?: { status?: string } | null
}

export function mercadoPagoSubscriptions(accessToken: string, fetcher: typeof fetch = fetch): Subscriptions {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetcher(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    if (!res.ok) {
      let message = text.slice(0, 300)
      try {
        message = (JSON.parse(text) as { message?: string }).message || message
      } catch {
        /* not JSON */
      }
      throw new Error(`Mercado Pago ${method} ${path.split("?")[0]}: ${res.status} ${message}`)
    }
    return JSON.parse(text || "{}") as T
  }

  const info = (p: Preapproval): SubscriptionInfo => ({
    id: String(p.id),
    status: (STATUSES as string[]).includes(p.status) ? (p.status as SubscriptionStatus) : "pending",
    externalReference: p.external_reference || "",
    amount: Number(p.auto_recurring?.transaction_amount) || 0,
    payerEmail: p.payer_email || "",
    lastChargeAt: p.summarized?.last_charged_date || undefined,
    nextChargeAt: p.next_payment_date || undefined,
  })

  return {
    async create(input) {
      const p = await call<Preapproval>("POST", "/preapproval", {
        reason: input.reason,
        external_reference: input.externalReference,
        payer_email: input.payerEmail,
        back_url: input.backUrl,
        status: "pending",
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: input.amount, currency_id: "MXN" },
      })
      if (!p.init_point) throw new Error("Mercado Pago no devolvió la página de pago")
      return { id: String(p.id), url: p.init_point }
    },
    async get(id) {
      return info(await call<Preapproval>("GET", `/preapproval/${encodeURIComponent(id)}`))
    },
    async update(id, change) {
      const body: Record<string, unknown> = {}
      if (change.amount) body.auto_recurring = { transaction_amount: change.amount, currency_id: "MXN" }
      if (change.status) body.status = change.status
      await call("PUT", `/preapproval/${encodeURIComponent(id)}`, body)
    },
    async charge(id): Promise<SubscriptionCharge> {
      const a = await call<AuthorizedPayment>("GET", `/authorized_payments/${encodeURIComponent(id)}`)
      const paid = a.payment?.status
      return {
        id: String(a.id),
        subscriptionId: String(a.preapproval_id),
        status: paid === "approved" ? "approved" : paid === "rejected" || a.status === "cancelled" ? "rejected" : "pending",
        amount: Number(a.transaction_amount) || 0,
        at: a.debit_date || a.date_created || new Date().toISOString(),
      }
    },
  }
}

/** Mercado Pago notification about subscriptions: check the signature, then let the service read the new state. */
export async function billingWebhook(c: HonoContext, config: Config, handle: (topic: string, id: string) => Promise<void>) {
  const raw = await c.req.text()
  if (raw.length > 64 * 1024) return c.json({ ok: false }, 413)
  let body: { type?: string; topic?: string; action?: string; data?: { id?: string | number } } = {}
  try {
    body = JSON.parse(raw || "{}")
  } catch {
    return c.json({ ok: false }, 400)
  }
  const id = String(c.req.query("data.id") ?? body.data?.id ?? c.req.query("id") ?? "").slice(0, 64)
  const topic = String(body.type || body.topic || c.req.query("type") || c.req.query("topic") || "")
  if (!validMercadoPagoSignature(config.billingWebhookSecret, c.req.header("x-signature"), c.req.header("x-request-id"), id)) return c.json({ ok: false }, 401)
  try {
    await handle(topic, id)
  } catch (error) {
    // 500 makes Mercado Pago retry later; the server clock catches up anyway.
    console.error("[cobro] notificación", topic, id, (error as Error).message)
    return c.json({ ok: false }, 500)
  }
  return c.json({ ok: true })
}
