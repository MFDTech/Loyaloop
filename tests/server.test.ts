// HTTP tests of the server against a real PostgreSQL (TEST_DATABASE_URL).
import { createHmac } from "node:crypto"
import pg from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createSeed } from "../src/lib/seed"
import { createApp } from "../server/src/app"
import type { Config } from "../server/src/config"
import { migrate } from "../server/src/db"
import { hashPassword, verifyPassword } from "../server/src/passwords"
import { TABLES, createPgStore, importAll } from "../server/src/pgStore"
import { validMercadoPagoSignature } from "../server/src/mercadopago"
import { TEST_DATABASE_URL } from "./harness"

const config: Config = {
  databaseUrl: TEST_DATABASE_URL,
  port: 0,
  publicUrl: "https://loyaloop.test/",
  preview: false,
  simulator: false,
  staticDir: "dist",
  trustProxy: true,
  secureCookies: true,
  mercadoPagoWebhookSecret: "secreto-de-prueba",
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
}

describe.skipIf(!TEST_DATABASE_URL)("server over HTTP", () => {
  let pool: pg.Pool
  let app: ReturnType<typeof createApp>
  const sent: { to: string; text: string }[] = []
  let ip = 0

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 })
    await migrate(pool, () => undefined)
  })
  afterAll(() => pool.end())
  beforeEach(async () => {
    await pool.query(`truncate ${[...Object.values(TABLES).map((t) => t.table), "maintenance", "sessions", "webhook_events"].join(", ")}`)
    const db = createSeed()
    for (const u of db.users) u.password = await hashPassword(u.password)
    await importAll(pool, db)
    sent.length = 0
    app = createApp({
      pool,
      store: createPgStore(pool),
      config,
      messenger: { channels: { sms: true, email: true }, sms: async (to, text) => void sent.push({ to, text }), email: async (m) => void sent.push({ to: m.to, text: m.action?.url || "" }) },
    })
    ip += 1
  })

  async function rpc(method: string, args: unknown[] = [], options: { cookie?: string; device?: string; headers?: Record<string, string> } = {}) {
    const response = await app.request(`/api/rpc/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-loyaloop": "1",
        "x-forwarded-for": `10.0.0.${ip}`,
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.device ? { "x-device-token": options.device } : {}),
        ...options.headers,
      },
      body: JSON.stringify({ args }),
    })
    const body = (await response.json()) as { result?: any; error?: { message: string; code: string }; device?: string }
    const setCookie = response.headers.get("set-cookie") || ""
    return { status: response.status, body, setCookie, cookie: setCookie.split(";")[0] }
  }

  async function login(email: string, password = "prueba123") {
    const r = await rpc("login", [email, password])
    expect(r.status).toBe(200)
    return r.cookie
  }

  it("stores passwords as scrypt hashes and signs in with an httpOnly, secure cookie", async () => {
    const stored = (await pool.query("select data->>'password' as p from users where pk = 'u_aff_owner'")).rows[0].p
    expect(stored).toMatch(/^scrypt\$/)
    expect(await verifyPassword("prueba123", stored)).toBe(true)
    const r = await rpc("login", ["dueno@affair.test", "prueba123"])
    expect(r.setCookie).toMatch(/HttpOnly/)
    expect(r.setCookie).toMatch(/Secure/)
    expect(r.setCookie).toMatch(/SameSite=Lax/)
    expect(JSON.stringify(r.body)).not.toContain("scrypt")
    const me = await rpc("me", [], { cookie: r.cookie })
    expect(me.body.result.user.email).toBe("dueno@affair.test")
    const sessionRow = (await pool.query("select token_hash from sessions")).rows[0].token_hash
    expect(r.cookie).not.toContain(sessionRow)
  })

  it("rejects requests without the app header (CSRF) and unknown or internal methods", async () => {
    const noHeader = await app.request("/api/rpc/me", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    expect(noHeader.status).toBe(400)
    const form = await app.request("/api/rpc/me", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-loyaloop": "1" }, body: "a=1" })
    expect(form.status).toBe(400)
    expect((await rpc("recordPayment", [{}])).status).toBe(404)
    expect((await rpc("constructor")).status).toBe(404)
  })

  it("keeps businesses isolated and enforces roles over HTTP", async () => {
    const esquina = await login("dueno@laesquina.test")
    const list = await rpc("customers", [], { cookie: esquina })
    expect(list.body.result.every((c: { businessId: string }) => c.businessId === "b_esquina")).toBe(true)
    expect((await rpc("customer", ["c_b_affair_1"], { cookie: esquina })).status).toBe(404)
    const cashier = await login("cajero@affair.test")
    expect((await rpc("customers", [], { cookie: cashier })).status).toBe(403)
    expect((await rpc("adminBusinesses", [], { cookie: esquina })).status).toBe(403)
    expect((await rpc("customers")).status).toBe(401)
  })

  it("logout ends the session and a password change signs out other devices", async () => {
    const a = await login("gerente@affair.test")
    const b = await login("gerente@affair.test")
    expect((await rpc("changePassword", ["prueba123", "nueva-clave-123"], { cookie: a })).status).toBe(200)
    expect((await rpc("me", [], { cookie: b })).body.result).toBeNull()
    expect((await rpc("me", [], { cookie: a })).body.result.user.email).toBe("gerente@affair.test")
    await rpc("logout", [], { cookie: a })
    expect((await rpc("me", [], { cookie: a })).body.result).toBeNull()
    expect((await rpc("login", ["gerente@affair.test", "prueba123"])).status).toBe(400)
  })

  it("limits password guessing", async () => {
    const statuses: number[] = []
    for (let i = 0; i < 10; i++) statuses.push((await rpc("login", ["dueno@affair.test", "mala"])).status)
    expect(statuses.slice(0, 8).every((s) => s === 400)).toBe(true)
    expect(statuses.at(-1)).toBe(429)
  })

  it("sends the SMS code instead of returning it outside preview, and pairs a kiosk by header", async () => {
    const sent1 = await rpc("sendCode", ["AFF7Q2", "5591112233", "new"])
    expect(sent1.body.result.previewCode).toBe("")
    expect(sent[0].to).toBe("5591112233")
    const code = sent[0].text.slice(0, 6)
    const done = await rpc("completeRegistration", ["AFF7Q2", { name: "Ana", phone: "5591112233", email: "", birthday: "", promotions: false, privacy: true }, code])
    expect(done.body.result.created).toBe(true)

    const owner = await login("dueno@affair.test")
    const pairing = await rpc("createPairingCode", ["rg_affair_1"], { cookie: owner })
    const paired = await rpc("pairDevice", [pairing.body.result.code, "Tablet"])
    expect(paired.body.device).toMatch(/^dev_/)
    const info = await rpc("kiosk", [], { device: paired.body.device })
    expect(info.body.result.registerName).toBeTruthy()
    const scan = await rpc("kioskScan", [done.body.result.holder.token], { device: paired.body.device })
    expect(scan.body.result.status).toBe("pending")
    expect((await rpc("kiosk", [], { device: "dev_inventado" })).status).toBe(401)
  })

  it("refuses the payment simulator when it is off", async () => {
    const admin = await login("admin@loyaloop.test", "loyaloop123")
    const r = await rpc("simulatePayment", ["b_affair", "rg_affair_1", 500, 0], { cookie: admin })
    expect(r.status).toBe(403)
  })

  it("accepts Mercado Pago notifications only with a valid signature", async () => {
    const ts = Math.floor(Date.now() / 1000)
    const sign = (id: string, requestId: string) => `ts=${ts},v1=${createHmac("sha256", config.mercadoPagoWebhookSecret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest("hex")}`
    expect(validMercadoPagoSignature(config.mercadoPagoWebhookSecret, sign("123", "r1"), "r1", "123")).toBe(true)
    const post = (signature: string) =>
      app.request("/api/webhooks/mercadopago/b_affair?data.id=123&type=payment", {
        method: "POST",
        headers: { "content-type": "application/json", "x-signature": signature, "x-request-id": "r1" },
        body: JSON.stringify({ action: "payment.created", data: { id: "123" } }),
      })
    expect((await post(sign("999", "r1"))).status).toBe(401)
    expect((await post(sign("123", "r1"))).status).toBe(200)
    const events = (await pool.query("select business_id, external_id from webhook_events")).rows
    expect(events).toEqual([{ business_id: "b_affair", external_id: "123" }])
  })

  it("serializes concurrent scans and payments on one register", async () => {
    const owner = await login("dueno@affair.test")
    const pairing = await rpc("createPairingCode", ["rg_affair_1"], { cookie: owner })
    const device = (await rpc("pairDevice", [pairing.body.result.code, "Tablet"])).body.device!
    const customers = (await rpc("customers", [], { cookie: owner })).body.result
    await rpc("kioskScan", [customers[0].token], { device })
    // Two payments arrive at the same instant: exactly one can match the single scan.
    const store = createPgStore(pool)
    const { createService } = await import("../src/lib/service")
    const service = createService(store, {
      now: Date.now,
      session: async () => null,
      setSession: async () => undefined,
      device: () => null,
      setDevice: () => undefined,
      hash: hashPassword,
      verify: verifyPassword,
      preview: false,
      simulator: false,
      baseUrl: "",
      messenger: { channels: { sms: false, email: false }, sms: async () => undefined, email: async () => undefined },
    })
    const results = await Promise.all(
      ["A", "B"].map((x) => service.recordPayment({ businessId: "b_affair", registerId: "rg_affair_1", provider: "mercadopago", externalId: `MP-${x}`, amount: 500, tip: 0 })),
    )
    expect(results.filter((r) => r.kind === "matched")).toHaveLength(1)
    const duplicate = await service.recordPayment({ businessId: "b_affair", registerId: "rg_affair_1", provider: "mercadopago", externalId: "MP-A", amount: 500, tip: 0 })
    expect(duplicate.duplicate).toBe(true)
  })
})
