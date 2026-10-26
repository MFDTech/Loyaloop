// Mercado Pago Point: each business connects its own Mercado Pago account and
// LoyaLoop reads the payments of its terminals.
//
// - Connecting: the owner authorizes LoyaLoop's application (OAuth link), or
//   the admin pastes the business's Access Token. Tokens are stored encrypted.
// - Reading payments: every few seconds LoyaLoop asks Mercado Pago for the
//   account's recent payments (this also sees amounts typed on the terminal by
//   the cashier), and a notification to LoyaLoop's application reads one at once.
// - Each approved payment goes to the register of its terminal and is matched
//   with the scan, as recordPayment() does for any provider.

import type { Context as HonoContext } from "hono"
import type { IncomingPayment, PaymentAccounts, ProviderEvent } from "../../src/lib/service"
import type { Register } from "../../src/lib/types"
import type { PaymentOutcome } from "../../src/lib/engine"
import type { Config } from "./config"
import type { Pool } from "./db"
import { validMercadoPagoSignature } from "./mercadopago"
import { Secrets } from "./secrets"

const API = "https://api.mercadopago.com"
const AUTH = "https://auth.mercadopago.com.mx/authorization"
const LINK_DAYS = 7

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export interface MpPayment {
  id: number | string
  status: string
  status_detail?: string
  date_created?: string
  date_approved?: string
  transaction_amount: number
  operation_type?: string
  description?: string
  external_reference?: string | null
  point_of_interaction?: { type?: string; [key: string]: unknown }
  [key: string]: unknown
}

export interface MpTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  user_id?: number | string
}

/** The few Mercado Pago endpoints LoyaLoop uses. */
export class MercadoPagoApi {
  private readonly http: typeof fetch

  constructor(readonly options: { clientId?: string; clientSecret?: string; redirectUri?: string; fetch?: typeof fetch }) {
    this.http = options.fetch || fetch
  }

  private async call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await this.http(`${API}${path}`, {
        method,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new MercadoPagoError("No se pudo hablar con Mercado Pago. Inténtalo otra vez en un momento.", 0)
    }
    const data = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string }
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403 ? "Mercado Pago rechazó la clave. Vuelve a conectar la cuenta." : data.message || data.error || `error ${response.status}`
      throw new MercadoPagoError(`Mercado Pago: ${reason}`, response.status)
    }
    return data
  }

  authorizeUrl(state: string) {
    const q = new URLSearchParams({ client_id: this.options.clientId || "", response_type: "code", platform_id: "mp", state, redirect_uri: this.options.redirectUri || "" })
    return `${AUTH}?${q}`
  }

  exchange(code: string) {
    return this.call<MpTokens>("POST", "/oauth/token", null, {
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: this.options.redirectUri,
    })
  }

  refresh(refreshToken: string) {
    return this.call<MpTokens>("POST", "/oauth/token", null, {
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  }

  me(token: string) {
    return this.call<{ id: number | string; nickname?: string; email?: string; site_id?: string }>("GET", "/users/me", token)
  }

  async terminals(token: string) {
    const body = await this.call<{ data?: { terminals?: { id: string; operating_mode?: string }[] } }>("GET", "/terminals/v1/list?limit=50", token)
    return (body.data?.terminals || []).map((t) => ({ id: t.id, mode: t.operating_mode || "" }))
  }

  async recentPayments(token: string, since: Date) {
    const q = new URLSearchParams({ sort: "date_created", criteria: "desc", range: "date_created", begin_date: since.toISOString(), end_date: "NOW", limit: "50" })
    const body = await this.call<{ results?: MpPayment[] }>("GET", `/v1/payments/search?${q}`, token)
    return body.results || []
  }

  payment(token: string, id: string) {
    return this.call<MpPayment>("GET", `/v1/payments/${encodeURIComponent(id)}`, token)
  }
}

// ------------------------------------------------------------------ matching

/** Every string inside a payment, to find its terminal whatever the field is called. */
function strings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out
  if (typeof value === "string") out.push(value)
  else if (typeof value === "number") out.push(String(value))
  else if (Array.isArray(value)) for (const v of value) strings(v, out, depth + 1)
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out, depth + 1)
  return out
}

/** Serial number at the end of a terminal id, e.g. PAX_A910__SMARTPOS1234567890 → SMARTPOS1234567890. */
const serialOf = (terminalId: string) => terminalId.split("__").pop() || terminalId

/** Payments that are not a sale at the counter. */
const NOT_SALES = new Set(["money_transfer", "recurring_payment", "account_fund", "payment_addition", "cellphone_recharge", "investment"])

export type Route = { registerId: string } | { skip: string }

/** Which register a payment belongs to: its terminal, or the only register of the business. */
export function routePayment(payment: MpPayment, registers: Pick<Register, "id" | "terminalId">[]): Route {
  if (payment.status !== "approved") return { skip: `Estado ${payment.status}` }
  if (payment.operation_type && NOT_SALES.has(payment.operation_type)) return { skip: "No es un cobro en caja" }
  const values = new Set(strings(payment).map((v) => v.toUpperCase()))
  const byTerminal = registers.find((r) => r.terminalId && (values.has(r.terminalId.toUpperCase()) || values.has(serialOf(r.terminalId).toUpperCase())))
  if (byTerminal) return { registerId: byTerminal.id }
  if (registers.length === 1) return { registerId: registers[0].id }
  return { skip: "No se supo de qué caja es: asigna cada terminal a su caja" }
}

/** Tip, when Mercado Pago reports one. */
function tipOf(payment: MpPayment): number {
  const found: number[] = []
  const walk = (value: unknown, depth: number) => {
    if (depth > 4 || !value || typeof value !== "object") return
    for (const [key, v] of Object.entries(value)) {
      if (/^tip(_amount)?$/i.test(key) && typeof v === "number" && v > 0) found.push(v)
      else walk(v, depth + 1)
    }
  }
  walk(payment, 0)
  return found[0] || 0
}

// ------------------------------------------------------------------ accounts

interface AccountRow {
  business_id: string
  mp_user_id: string
  nickname: string
  method: "oauth" | "token"
  access_token: string
  refresh_token: string | null
  expires_at: Date | null
  last_poll_at: Date | null
  last_error: string | null
}

export interface MercadoPagoAccounts extends PaymentAccounts {
  /** Reads recent payments of every connected account. Returns how many it recorded. */
  poll(): Promise<number>
  start(intervalMs?: number): () => void
  /** POST /api/webhooks/mercadopago: notification to LoyaLoop's application. */
  notification(c: HonoContext): Promise<Response>
  /** GET /api/integrations/mercadopago/start: the owner's link, sends them to Mercado Pago. */
  oauthStart(c: HonoContext): Response
  /** GET /api/integrations/mercadopago/callback: Mercado Pago sends the owner back with a code. */
  oauthCallback(c: HonoContext): Promise<Response>
}

export interface MercadoPagoDeps {
  pool: Pool
  config: Config
  api?: MercadoPagoApi
  now?: () => number
  /** recordPayment of the system service. */
  record(input: IncomingPayment): Promise<PaymentOutcome & { customerName?: string; duplicate?: boolean }>
  /** Marks the business's integration as connected and writes the audit. */
  connected(businessId: string, how: string): Promise<void>
}

const page = (title: string, text: string) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#f6ead3;color:#1c1917;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center}h1{font-size:24px;margin:0 0 12px}p{font-size:16px;line-height:1.5;color:#57534e;margin:0}</style>
</head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`

export function createMercadoPagoAccounts(deps: MercadoPagoDeps): MercadoPagoAccounts {
  const { pool, config } = deps
  const now = deps.now || Date.now
  const redirectUri = `${config.publicUrl}api/integrations/mercadopago/callback`
  const api = deps.api || new MercadoPagoApi({ clientId: config.mercadoPagoClientId, clientSecret: config.mercadoPagoClientSecret, redirectUri })
  let secrets: Secrets | null = null
  let problem: string | undefined
  try {
    secrets = config.integrationsKey ? new Secrets(config.integrationsKey) : null
    if (!secrets) problem = "Falta INTEGRATIONS_KEY en el servidor para guardar las claves de Mercado Pago."
  } catch (error) {
    problem = (error as Error).message
  }
  const oauth = !!(config.mercadoPagoClientId && config.mercadoPagoClientSecret)
  const sealed = () => {
    if (!secrets) throw new MercadoPagoError(problem || "Falta INTEGRATIONS_KEY.", 500)
    return secrets
  }

  async function row(businessId: string) {
    return (await pool.query<AccountRow>("select * from mp_accounts where business_id = $1", [businessId])).rows[0]
  }

  async function save(businessId: string, method: "oauth" | "token", tokens: MpTokens, account: { id: number | string; nickname?: string; email?: string }) {
    const s = sealed()
    const expires = tokens.expires_in ? new Date(now() + tokens.expires_in * 1000) : null
    await pool.query(
      `insert into mp_accounts (business_id, mp_user_id, nickname, method, access_token, refresh_token, expires_at, last_poll_at, last_error)
       values ($1, $2, $3, $4, $5, $6, $7, now(), null)
       on conflict (business_id) do update set mp_user_id = excluded.mp_user_id, nickname = excluded.nickname, method = excluded.method,
         access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, last_poll_at = now(), last_error = null`,
      [businessId, String(account.id), account.nickname || account.email || "", method, s.encrypt(tokens.access_token), tokens.refresh_token ? s.encrypt(tokens.refresh_token) : null, expires],
    )
    return account.nickname || account.email || String(account.id)
  }

  /** A valid access token, renewing an OAuth one a week before it expires. */
  async function tokenOf(account: AccountRow): Promise<string> {
    const s = sealed()
    if (account.method === "oauth" && account.refresh_token && account.expires_at && account.expires_at.getTime() - now() < 7 * 86_400_000) {
      const fresh = await api.refresh(s.decrypt(account.refresh_token))
      await pool.query("update mp_accounts set access_token = $2, refresh_token = $3, expires_at = $4 where business_id = $1", [
        account.business_id,
        s.encrypt(fresh.access_token),
        fresh.refresh_token ? s.encrypt(fresh.refresh_token) : account.refresh_token,
        fresh.expires_in ? new Date(now() + fresh.expires_in * 1000) : account.expires_at,
      ])
      return fresh.access_token
    }
    return s.decrypt(account.access_token)
  }

  const outcomeText = (o: PaymentOutcome & { customerName?: string; duplicate?: boolean }) =>
    o.duplicate ? "Ya estaba registrado" : o.kind === "matched" ? `Sumó a ${o.customerName || "un cliente"}` : o.kind === "review" ? "En revisión: más de un escaneo o cobro en la caja" : "Esperando que un cliente escanee (5 minutos)"

  /** Records one payment once; the event log keeps what happened with it. */
  async function process(account: AccountRow, payment: MpPayment): Promise<boolean> {
    // Pending or rejected payments are read again on the next pass, once approved.
    if (payment.status !== "approved") return false
    const externalId = String(payment.id)
    const claimed = await pool.query(
      `insert into webhook_events (provider, business_id, external_id, kind, body, status) values ('mercadopago', $1, $2, 'payment', $3, 'received')
       on conflict (provider, external_id, kind) do nothing returning id`,
      [account.business_id, externalId, JSON.stringify(payment)],
    )
    if (!claimed.rowCount) return false
    const id = claimed.rows[0].id
    const finish = (status: ProviderEvent["status"], detail: string) =>
      pool.query("update webhook_events set status = $2, error = $3, processed_at = now() where id = $1", [id, status, detail.slice(0, 300)])
    try {
      const registers = (await pool.query<{ data: Register }>("select data from registers where business_id = $1", [account.business_id])).rows.map((r) => r.data)
      const route = routePayment(payment, registers)
      if ("skip" in route) {
        await finish("ignored", route.skip)
        return false
      }
      const amount = Number(payment.transaction_amount)
      const tip = tipOf(payment)
      const outcome = await deps.record({ businessId: account.business_id, registerId: route.registerId, provider: "mercadopago", externalId, amount, tip: tip < amount ? tip : 0 })
      await finish("processed", outcomeText(outcome))
      return !outcome.duplicate
    } catch (error) {
      await finish("error", (error as Error).message)
      return false
    }
  }

  async function poll(): Promise<number> {
    const rows = (await pool.query<AccountRow>("select * from mp_accounts")).rows
    let recorded = 0
    for (const account of rows) {
      try {
        const token = await tokenOf(account)
        // Overlap a little with the last read; the event log skips repeats.
        const last = account.last_poll_at ? account.last_poll_at.getTime() - 2 * 60_000 : 0
        const since = new Date(Math.max(last, now() - 15 * 60_000))
        const payments = await api.recentPayments(token, since)
        for (const payment of payments.reverse()) if (await process(account, payment)) recorded++
        await pool.query("update mp_accounts set last_poll_at = $2, last_error = null where business_id = $1", [account.business_id, new Date(now())])
      } catch (error) {
        await pool.query("update mp_accounts set last_error = $2 where business_id = $1", [account.business_id, (error as Error).message.slice(0, 300)])
      }
    }
    return recorded
  }

  function start(intervalMs = 10_000) {
    let busy = false
    const timer = setInterval(async () => {
      if (busy) return
      busy = true
      try {
        await poll()
      } catch (error) {
        console.error("[mercadopago]", (error as Error).message)
      } finally {
        busy = false
      }
    }, intervalMs)
    return () => clearInterval(timer)
  }

  /** Signed link (business and expiry) so only links made in the admin connect an account. */
  function connectLink(businessId: string) {
    const exp = Math.floor(now() / 1000) + LINK_DAYS * 86_400
    const payload = `${businessId}.${exp}`
    return `${config.publicUrl}api/integrations/mercadopago/start?s=${encodeURIComponent(`${payload}.${sealed().sign(payload)}`)}`
  }

  function readState(state: string): string | null {
    const [businessId, exp, signature] = String(state || "").split(".")
    if (!businessId || !exp || !signature || !secrets?.verify(`${businessId}.${exp}`, signature)) return null
    if (Number(exp) * 1000 < now()) return null
    return businessId
  }

  return {
    oauth,
    problem,

    async status(businessId) {
      const account = await row(businessId)
      if (!account) return { connected: false }
      return {
        connected: true,
        method: account.method,
        account: account.nickname || account.mp_user_id,
        lastSyncAt: account.last_poll_at?.toISOString(),
        lastError: account.last_error || undefined,
      }
    },

    async connectWithToken(businessId, token) {
      sealed()
      const me = await api.me(token)
      return { account: await save(businessId, "token", { access_token: token }, me) }
    },

    connectLink,

    async disconnect(businessId) {
      await pool.query("delete from mp_accounts where business_id = $1", [businessId])
    },

    async terminals(businessId) {
      const account = await row(businessId)
      if (!account) return []
      return api.terminals(await tokenOf(account))
    },

    async events(businessId) {
      const rows = await pool.query<{ received_at: Date; external_id: string; body: MpPayment; status: ProviderEvent["status"]; error: string | null }>(
        "select received_at, external_id, body, status, error from webhook_events where provider = 'mercadopago' and kind = 'payment' and business_id = $1 order by id desc limit 20",
        [businessId],
      )
      return rows.rows.map((r) => ({ at: r.received_at.toISOString(), externalId: r.external_id, amount: Number(r.body?.transaction_amount) || 0, status: r.status, detail: r.error || "" }))
    },

    poll,
    start,

    async notification(c) {
      const raw = await c.req.text()
      if (raw.length > 64 * 1024) return c.json({ ok: false }, 413)
      let body: { data?: { id?: string | number }; type?: string; topic?: string; user_id?: string | number } = {}
      try {
        body = JSON.parse(raw || "{}")
      } catch {
        return c.json({ ok: false }, 400)
      }
      const dataId = String(c.req.query("data.id") ?? body.data?.id ?? "")
      if (!validMercadoPagoSignature(config.mercadoPagoWebhookSecret, c.req.header("x-signature"), c.req.header("x-request-id"), dataId)) return c.json({ ok: false }, 401)
      const type = String(body.type || body.topic || c.req.query("type") || "")
      if (type === "payment" && dataId && body.user_id !== undefined) {
        // Answer at once; read the payment in the background.
        void (async () => {
          const account = (await pool.query<AccountRow>("select * from mp_accounts where mp_user_id = $1", [String(body.user_id)])).rows[0]
          if (!account) return
          await process(account, await api.payment(await tokenOf(account), dataId))
        })().catch((error) => console.error("[mercadopago] notificación:", (error as Error).message))
      }
      return c.json({ ok: true })
    },

    oauthStart(c) {
      const businessId = readState(c.req.query("s") || "")
      if (!oauth || !businessId) return c.html(page("Enlace no válido", "Este enlace venció o no es correcto. Pide uno nuevo a LoyaLoop."), 400)
      return c.redirect(api.authorizeUrl(c.req.query("s")!), 302)
    },

    async oauthCallback(c) {
      const businessId = readState(c.req.query("state") || "")
      const code = c.req.query("code")
      if (!businessId || !code) return c.html(page("No se pudo conectar", "El enlace venció o se canceló la autorización. Pide uno nuevo a LoyaLoop."), 400)
      try {
        const tokens = await api.exchange(code)
        const account = await save(businessId, "oauth", tokens, await api.me(tokens.access_token))
        await deps.connected(businessId, `desde Mercado Pago (${account})`)
        return c.html(page("¡Listo!", `Tu cuenta de Mercado Pago (${account}) quedó conectada con LoyaLoop. Ya puedes cerrar esta ventana.`))
      } catch (error) {
        console.error("[mercadopago] conectar:", (error as Error).message)
        return c.html(page("No se pudo conectar", "Mercado Pago no aceptó la autorización. Inténtalo otra vez o escríbenos a hola@loyaloop.com.mx."), 502)
      }
    },
  }
}
