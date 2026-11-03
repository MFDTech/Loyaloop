// Mercado Pago notifications.
//
// Each business's Mercado Pago account sends payment notifications to
// /api/webhooks/mercadopago/<businessId>. We check the signature, keep the
// event, and answer right away (Mercado Pago retries anything that is slow).
//
// Still to connect with the pilot's credentials (see docs/backend.md):
// fetch the payment with the business's access token, map the Point terminal
// to a LoyaLoop register, and call service.recordPayment().

import { createHmac, timingSafeEqual } from "node:crypto"
import type { Context } from "hono"
import type { Config } from "./config"
import type { Pool } from "./db"

/** x-signature: "ts=<seconds>,v1=<hex hmac>" over "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" */
export function validMercadoPagoSignature(secret: string, signature: string | undefined, requestId: string | undefined, dataId: string, nowMs = Date.now()): boolean {
  if (!secret || !signature) return false
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=", 2) as [string, string]))
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false
  // Reject very old notifications (replays). ts is in seconds.
  if (Math.abs(nowMs - Number(ts) * 1000) > 15 * 60_000) return false
  let manifest = ""
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`
  const expected = createHmac("sha256", secret).update(manifest).digest()
  const given = Buffer.from(v1, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function mercadoPagoWebhook(c: Context, { pool, config }: { pool: Pool; config: Config }) {
  const businessId = c.req.param("businessId") || ""
  const raw = await c.req.text()
  if (raw.length > 64 * 1024) return c.json({ ok: false }, 413)
  let body: { data?: { id?: string | number }; type?: string; action?: string } = {}
  try {
    body = JSON.parse(raw || "{}")
  } catch {
    return c.json({ ok: false }, 400)
  }
  const dataId = String(c.req.query("data.id") ?? body.data?.id ?? "")
  const valid = validMercadoPagoSignature(config.mercadoPagoWebhookSecret, c.req.header("x-signature"), c.req.header("x-request-id"), dataId)
  if (!valid) return c.json({ ok: false }, 401)
  await pool.query("insert into webhook_events (provider, business_id, external_id, kind, body, status) values ('mercadopago', $1, $2, $3, $4, 'received') on conflict do nothing", [
    businessId.slice(0, 64),
    dataId.slice(0, 64),
    String(body.action || body.type || "").slice(0, 64),
    raw,
  ])
  return c.json({ ok: true })
}
