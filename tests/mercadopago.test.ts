// Mercado Pago Point against a fake Mercado Pago (no network): connecting an
// account, terminals, reading payments and matching them with the scan.
import { createHmac } from "node:crypto"
import pg from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createSeed } from "../src/lib/seed"
import { createService, type Context } from "../src/lib/service"
import { createApp } from "../server/src/app"
import type { Config } from "../server/src/config"
import { migrate } from "../server/src/db"
import { MercadoPagoApi, createMercadoPagoAccounts, routePayment, type MpPayment } from "../server/src/mercadopagoPoint"
import { TABLES, createPgStore, importAll } from "../server/src/pgStore"
import { hashPassword } from "../server/src/passwords"
import { Secrets } from "../server/src/secrets"
import { TEST_DATABASE_URL } from "./harness"

const KEY = "a".repeat(64)
const TOKEN = "APP_USR-1234567890123456-102611-0123456789abcdef0123456789abcdef-111222333"
const TERMINAL = "PAX_A910__SMARTPOS1494126963"

describe("Mercado Pago payment routing", () => {
  const pay = (extra: Partial<MpPayment> = {}): MpPayment => ({ id: 1, status: "approved", transaction_amount: 500, ...extra })
  const registers = [
    { id: "rg_1", terminalId: TERMINAL },
    { id: "rg_2", terminalId: "PAX_A910__SMARTPOS0000000001" },
  ]

  it("finds the register by the terminal's serial wherever Mercado Pago puts it", () => {
    expect(routePayment(pay({ point_of_interaction: { type: "POINT", device: { serial_number: "SMARTPOS1494126963" } } }), registers)).toEqual({ registerId: "rg_1" })
    expect(routePayment(pay({ metadata: { terminal_id: "PAX_A910__SMARTPOS0000000001" } }), registers)).toEqual({ registerId: "rg_2" })
  })

  it("uses the only register when there is one, and skips what is not a sale at the counter", () => {
    expect(routePayment(pay(), [{ id: "rg_1" }])).toEqual({ registerId: "rg_1" })
    expect(routePayment(pay(), registers)).toMatchObject({ skip: expect.stringMatching(/asigna cada terminal/) })
    expect(routePayment(pay({ status: "pending" }), [{ id: "rg_1" }])).toMatchObject({ skip: expect.any(String) })
    expect(routePayment(pay({ operation_type: "money_transfer" }), [{ id: "rg_1" }])).toMatchObject({ skip: "No es un cobro en caja" })
  })

  it("keeps tokens encrypted and refuses tampered ones", () => {
    const secrets = new Secrets(KEY)
    const sealed = secrets.encrypt(TOKEN)
    expect(sealed).not.toContain("APP_USR")
    expect(secrets.decrypt(sealed)).toBe(TOKEN)
    const parts = sealed.split(".")
    parts[3] = Buffer.from("otra-cosa").toString("base64")
    expect(() => secrets.decrypt(parts.join("."))).toThrow()
    expect(() => new Secrets("corta")).toThrow(/64 caracteres/)
  })
})

/** Minimal Mercado Pago: OAuth, the account, its terminals and its payments. */
function fakeMercadoPago() {
  const payments: MpPayment[] = []
  const calls: string[] = []
  const fetch: typeof globalThis.fetch = (async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    const method = init?.method || "GET"
    calls.push(`${method} ${url.pathname}`)
    const auth = new Headers(init?.headers).get("authorization")
    if (url.pathname === "/oauth/token") {
      const body = JSON.parse(String(init?.body))
      if (body.code !== "codigo-bueno" && body.grant_type === "authorization_code") return Response.json({ message: "invalid_grant" }, { status: 400 })
      return Response.json({ access_token: TOKEN, refresh_token: "TG-refresh", expires_in: 15552000, user_id: 111222333 })
    }
    if (auth !== `Bearer ${TOKEN}`) return Response.json({ message: "invalid_token" }, { status: 401 })
    if (url.pathname === "/users/me") return Response.json({ id: 111222333, nickname: "AFFAIRSUITES" })
    if (url.pathname === "/terminals/v1/list") return Response.json({ data: { terminals: [{ id: TERMINAL, operating_mode: "STANDALONE" }] }, paging: { total: 1 } })
    if (url.pathname === "/v1/payments/search") {
      const since = new Date(url.searchParams.get("begin_date")!).getTime()
      return Response.json({ results: payments.filter((p) => new Date(p.date_created!).getTime() >= since).reverse() })
    }
    const one = url.pathname.match(/^\/v1\/payments\/(\w+)$/)
    if (one) {
      const p = payments.find((x) => String(x.id) === one[1])
      return p ? Response.json(p) : Response.json({ message: "not_found" }, { status: 404 })
    }
    return Response.json({ message: "ruta desconocida" }, { status: 404 })
  }) as typeof globalThis.fetch
  let next = 9000
  const add = (amount: number, extra: Partial<MpPayment> = {}) => {
    const p: MpPayment = { id: next++, status: "approved", transaction_amount: amount, date_created: new Date().toISOString(), operation_type: "regular_payment", point_of_interaction: { type: "POINT", device: { serial_number: "SMARTPOS1494126963" } }, ...extra }
    payments.push(p)
    return p
  }
  return { fetch, payments, calls, add }
}

const config: Config = {
  databaseUrl: TEST_DATABASE_URL,
  port: 0,
  publicUrl: "https://app.loyaloop.test/",
  preview: true,
  simulator: false,
  staticDir: "dist",
  trustProxy: true,
  secureCookies: false,
  mercadoPagoWebhookSecret: "secreto-mp",
  mercadoPagoClientId: "1234567890",
  mercadoPagoClientSecret: "secreto-app",
  integrationsKey: KEY,
  billingAccessToken: "",
  billingWebhookSecret: "",
  googleWalletIssuerId: "",
  googleWalletKeyFile: "",
  resendApiKey: "",
  emailFrom: "LoyaLoop <notificaciones@loyaloop.test>",
  emailReplyTo: "",
  applePassTypeId: "",
  appleTeamId: "",
  applePassCert: "",
  applePassKey: "",
  applePassKeyPassphrase: "",
  appleWwdrCert: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioVerifySid: "",
  twilioVerifyChannel: "sms",
  whatsappToken: "",
  whatsappPhoneNumberId: "",
  whatsappTemplate: "codigo_registro",
  whatsappTemplateLanguage: "es_MX",
}

describe.skipIf(!TEST_DATABASE_URL)("Mercado Pago Point with the server", () => {
  let pool: pg.Pool
  let mp: ReturnType<typeof fakeMercadoPago>
  let accounts: ReturnType<typeof createMercadoPagoAccounts>
  let app: ReturnType<typeof createApp>
  let cookie: string

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 })
    await migrate(pool, () => undefined)
  })
  afterAll(() => pool.end())
  beforeEach(async () => {
    await pool.query(`truncate ${[...Object.values(TABLES).map((t) => t.table), "maintenance", "sessions", "webhook_events", "wallet_passes", "wallet_jobs", "mp_accounts"].join(", ")}`)
    const seed = createSeed()
    for (const u of seed.users) u.password = await hashPassword(u.password)
    await importAll(pool, seed)
    mp = fakeMercadoPago()
    const store = createPgStore(pool)
    const ctx: Context = {
      now: Date.now,
      session: async () => null,
      setSession: async () => undefined,
      device: () => null,
      setDevice: () => undefined,
      hash: async (p) => p,
      verify: async (p, s) => p === s,
      preview: true,
      simulator: false,
      baseUrl: config.publicUrl,
      messenger: { channels: { sms: false, email: false }, sms: async () => undefined, email: async () => undefined },
    }
    const system = createService(store, ctx)
    accounts = createMercadoPagoAccounts({
      pool,
      config,
      api: new MercadoPagoApi({ clientId: config.mercadoPagoClientId, clientSecret: config.mercadoPagoClientSecret, redirectUri: `${config.publicUrl}api/integrations/mercadopago/callback`, fetch: mp.fetch }),
      record: (input) => system.recordPayment(input),
      connected: (businessId, how) => system.integrationConnected(businessId, "mercadopago", how),
    })
    app = createApp({ pool, store, config, messenger: ctx.messenger, mercadoPago: accounts })
    cookie = await login("admin@loyaloop.test", "loyaloop123")
  })

  async function login(email: string, password: string) {
    const response = await app.request("/api/rpc/login", { method: "POST", headers: { "content-type": "application/json", "x-loyaloop": "1", "x-forwarded-for": "10.2.0.1" }, body: JSON.stringify({ args: [email, password] }) })
    return response.headers.get("set-cookie")!.split(";")[0]
  }

  async function rpc(method: string, args: unknown[] = [], headers: Record<string, string> = {}) {
    const response = await app.request(`/api/rpc/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-loyaloop": "1", "x-forwarded-for": `10.3.${Math.floor(Math.random() * 200)}.1`, cookie, ...headers },
      body: JSON.stringify({ args }),
    })
    return (await response.json()) as { result?: any; error?: any; device?: string }
  }

  /** A customer of Affair scans at its register; returns their points before. */
  async function scanAtAffair() {
    const owner = await login("dueno@affair.test", "prueba123")
    const pairing = await rpc("createPairingCode", ["rg_affair_1"], { cookie: owner })
    const device = (await rpc("pairDevice", [pairing.result.code, "Tablet"], { cookie: "" })).device!
    const customer = (await pool.query("select data from customers where business_id = 'b_affair' order by pk limit 1")).rows[0].data
    const scan = await rpc("kioskScan", [customer.token], { "x-device-token": device, cookie: "" })
    expect(scan.error).toBeUndefined()
    return customer as { id: string; points: number; name: string }
  }

  const points = async (id: string) => (await pool.query("select data->>'points' as p from customers where pk = $1", [id])).rows[0].p as string

  it("connects with the Access Token, stores it encrypted and lists the terminals", async () => {
    expect((await rpc("adminConnectMercadoPago", ["b_affair", "TEST-123"])).error.message).toMatch(/APP_USR/)
    const connected = await rpc("adminConnectMercadoPago", ["b_affair", TOKEN])
    expect(connected.result).toEqual({ account: "AFFAIRSUITES" })
    const stored = (await pool.query("select access_token, method from mp_accounts where business_id = 'b_affair'")).rows[0]
    expect(stored.method).toBe("token")
    expect(stored.access_token).not.toContain("APP_USR")
    const panel = (await rpc("adminMercadoPago", ["b_affair"])).result
    expect(panel).toMatchObject({ available: true, connected: true, method: "token", account: "AFFAIRSUITES", terminals: [{ id: TERMINAL, mode: "STANDALONE" }] })
    expect(JSON.stringify(panel)).not.toContain(TOKEN)
    // Only the admin sees it.
    const owner = await login("dueno@affair.test", "prueba123")
    expect((await rpc("adminMercadoPago", ["b_affair"], { cookie: owner })).error.message).toMatch(/administrador/)
  })

  it("reads a payment typed on the terminal and adds the points to the customer who scanned", async () => {
    await rpc("adminConnectMercadoPago", ["b_affair", TOKEN])
    const customer = await scanAtAffair()
    const before = Number(await points(customer.id))
    mp.add(1000)
    mp.add(300, { status: "pending" })
    mp.add(50, { operation_type: "money_transfer" })
    expect(await accounts.poll()).toBe(1)
    expect(Number(await points(customer.id))).toBeGreaterThan(before)
    // Read again: nothing twice.
    expect(await accounts.poll()).toBe(0)
    const events = (await rpc("adminMercadoPago", ["b_affair"])).result.events
    expect(events.map((e: { amount: number; status: string }) => `${e.amount} ${e.status}`)).toEqual(["50 ignored", "1000 processed"])
    expect(events[1].detail).toMatch(/^Sumó a /)
    // The pending one counts once approved.
    mp.payments[1].status = "approved"
    expect(await accounts.poll()).toBe(1)
  })

  it("sends each payment to the register of its terminal when there are several", async () => {
    await pool.query("insert into registers (pk, business_id, at, data) values ('rg_affair_2', 'b_affair', 'rg_affair_2', $1)", [
      JSON.stringify({ id: "rg_affair_2", businessId: "b_affair", branchId: "br_affair", name: "Bar" }),
    ])
    await rpc("adminConnectMercadoPago", ["b_affair", TOKEN])
    mp.add(200)
    await accounts.poll()
    expect((await rpc("adminMercadoPago", ["b_affair"])).result.events[0]).toMatchObject({ status: "ignored", detail: expect.stringMatching(/asigna cada terminal/) })
    expect((await rpc("adminAssignTerminal", ["b_affair", "rg_affair_2", TERMINAL])).error).toBeUndefined()
    const panel = (await rpc("adminMercadoPago", ["b_affair"])).result
    expect(panel.terminals[0].registerId).toBe("rg_affair_2")
    mp.add(400)
    await accounts.poll()
    const payment = (await pool.query("select data from payments where business_id = 'b_affair' order by at desc limit 1")).rows[0].data
    expect(payment).toMatchObject({ registerId: "rg_affair_2", amount: 400, provider: "mercadopago" })
  })

  it("connects through the owner's link (OAuth) and reads notifications at once", async () => {
    const panel = (await rpc("adminMercadoPago", ["b_esquina"])).result
    expect(panel.connected).toBe(false)
    const link = new URL(panel.link)
    const start = await app.request(link.pathname + link.search)
    expect(start.status).toBe(302)
    const auth = new URL(start.headers.get("location")!)
    expect(auth.origin + auth.pathname).toBe("https://auth.mercadopago.com.mx/authorization")
    expect(auth.searchParams.get("redirect_uri")).toBe("https://app.loyaloop.test/api/integrations/mercadopago/callback")
    const state = auth.searchParams.get("state")!
    // A forged link does nothing.
    expect((await app.request(`/api/integrations/mercadopago/callback?code=codigo-bueno&state=b_affair.9999999999.falsa`)).status).toBe(400)
    const back = await app.request(`/api/integrations/mercadopago/callback?code=codigo-bueno&state=${encodeURIComponent(state)}`)
    expect(back.status).toBe(200)
    expect(await back.text()).toMatch(/quedó conectada/)
    const after = (await rpc("adminMercadoPago", ["b_esquina"])).result
    expect(after).toMatchObject({ connected: true, method: "oauth" })
    const bundle = (await rpc("adminBundle", ["b_esquina"])).result
    expect(bundle.integrations.find((i: { provider: string }) => i.provider === "mercadopago").status).toBe("connected")

    // A signed notification from LoyaLoop's application reads that payment right away.
    await pool.query("update mp_accounts set last_poll_at = now() + interval '1 hour'")
    const p = mp.add(150)
    const ts = Math.floor(Date.now() / 1000)
    const signature = `ts=${ts},v1=${createHmac("sha256", config.mercadoPagoWebhookSecret).update(`id:${p.id};request-id:r1;ts:${ts};`).digest("hex")}`
    const body = JSON.stringify({ type: "payment", user_id: 111222333, data: { id: String(p.id) } })
    expect((await app.request("/api/webhooks/mercadopago", { method: "POST", body, headers: { "x-signature": "ts=1,v1=00", "x-request-id": "r1" } })).status).toBe(401)
    expect((await app.request("/api/webhooks/mercadopago", { method: "POST", body, headers: { "x-signature": signature, "x-request-id": "r1" } })).status).toBe(200)
    await new Promise((r) => setTimeout(r, 300))
    const seen = (await pool.query("select status, business_id from webhook_events where external_id = $1", [String(p.id)])).rows[0]
    expect(seen.business_id).toBe("b_esquina")
  })

  it("forgets the account when disconnected or when the business is deleted", async () => {
    await rpc("adminConnectMercadoPago", ["b_affair", TOKEN])
    await rpc("adminDisconnectMercadoPago", ["b_affair"])
    expect((await rpc("adminMercadoPago", ["b_affair"])).result.connected).toBe(false)
    await rpc("adminConnectMercadoPago", ["b_affair", TOKEN])
    await rpc("adminDeleteBusiness", ["b_affair", "Affair Love Suites"])
    expect((await pool.query("select count(*)::int as n from mp_accounts")).rows[0].n).toBe(0)
  })
})
