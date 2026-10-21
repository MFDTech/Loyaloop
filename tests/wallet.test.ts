// Google Wallet against a fake Google API (no network): pass creation, signed
// save link, automatic updates, notifications and retries.
import { createVerify, generateKeyPairSync } from "node:crypto"
import pg from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createSeed } from "../src/lib/seed"
import { createService, type Context } from "../src/lib/service"
import { createApp } from "../server/src/app"
import type { Config } from "../server/src/config"
import { migrate } from "../server/src/db"
import { TABLES, createPgStore, importAll } from "../server/src/pgStore"
import { hashPassword } from "../server/src/passwords"
import { createWallets } from "../server/src/wallet"
import { GoogleWallet } from "../server/src/wallet/google"
import { TEST_DATABASE_URL } from "./harness"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const account = { client_email: "loyaloop@proyecto.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }

interface Call {
  method: string
  path: string
  body: any
}

/** Minimal stand-in for Google: OAuth token + loyaltyClass / loyaltyObject resources. */
function fakeGoogle() {
  const calls: Call[] = []
  const resources = new Map<string, any>()
  let failNext = 0
  const fetch: typeof globalThis.fetch = (async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method || "GET"
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "token-de-prueba", expires_in: 3600 })
    const path = url.replace("https://walletobjects.googleapis.com/walletobjects/v1", "")
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body })
    if (new Headers(init?.headers).get("authorization") !== "Bearer token-de-prueba") return Response.json({ error: { message: "sin token" } }, { status: 401 })
    if (failNext > 0) {
      failNext--
      return Response.json({ error: { message: "Google no disponible" } }, { status: 503 })
    }
    if (method === "POST" && /^\/loyalty(Class|Object)$/.test(path)) {
      if (resources.has(body.id)) return Response.json({ error: { message: "ya existe" } }, { status: 409 })
      resources.set(body.id, body)
      return Response.json(body)
    }
    if (method === "PATCH") {
      const id = decodeURIComponent(path.split("/")[2])
      if (!resources.has(id)) return Response.json({ error: { message: "no existe" } }, { status: 404 })
      resources.set(id, { ...resources.get(id), ...body })
      return Response.json(resources.get(id))
    }
    if (method === "POST" && path.endsWith("/addMessage")) return Response.json({})
    return Response.json({ error: { message: "ruta desconocida" } }, { status: 404 })
  }) as typeof globalThis.fetch
  return { fetch, calls, resources, fail: (n: number) => (failNext = n) }
}

const config: Config = {
  databaseUrl: TEST_DATABASE_URL,
  port: 0,
  publicUrl: "https://app.loyaloop.test/",
  preview: true,
  simulator: true,
  staticDir: "dist",
  trustProxy: true,
  secureCookies: false,
  mercadoPagoWebhookSecret: "",
  googleWalletIssuerId: "3388000000012345678",
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

describe("Google Wallet pass building", () => {
  const google = new GoogleWallet({ issuerId: config.googleWalletIssuerId, account, publicUrl: config.publicUrl })
  const seed = createSeed()
  const pick = (id: string) => ({
    business: seed.businesses.find((b) => b.id === id)!,
    program: seed.programs.find((p) => p.businessId === id)!,
    rewards: seed.rewards.filter((r) => r.businessId === id),
  })

  it("uses the neutral name for discreet businesses and shows the tier", () => {
    const data = { ...pick("b_affair"), customer: seed.customers.find((c) => c.businessId === "b_affair" && c.tierId)! }
    const cls = google.buildClass(data)
    expect(cls.issuerName).toBe("Club de beneficios")
    expect(JSON.stringify(cls)).not.toContain("Affair")
    expect(cls.programLogo.sourceUri.uri).toBe("https://app.loyaloop.test/api/public/brand/b_affair/logo")
    const obj = google.buildObject(data)
    expect(obj.barcode).toEqual({ type: "QR_CODE", value: data.customer.token, alternateText: data.customer.token })
    expect(obj.loyaltyPoints).toEqual({ label: "Puntos", balance: { int: data.customer.points } })
    expect(obj.secondaryLoyaltyPoints?.label).toBe("Nivel")
  })

  it("shows stamps as progress for stamp cards", () => {
    const data = { ...pick("b_esquina"), customer: seed.customers.find((c) => c.businessId === "b_esquina")! }
    expect(google.buildObject(data).loyaltyPoints).toEqual({ label: "Sellos", balance: { string: `${data.customer.stamps}/8` } })
  })

  it("signs the save link with the service account key", () => {
    const url = google.saveUrl("3388000000012345678.ll_c1", "3388000000012345678.ll_b1")
    const jwt = url.replace("https://pay.google.com/gp/v/save/", "")
    const [head, body, signature] = jwt.split(".")
    expect(createVerify("RSA-SHA256").update(`${head}.${body}`).verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true)
    const claims = JSON.parse(Buffer.from(body, "base64url").toString())
    expect(claims).toMatchObject({ iss: account.client_email, aud: "google", typ: "savetowallet", origins: ["https://app.loyaloop.test"] })
    expect(claims.payload.loyaltyObjects).toEqual([{ id: "3388000000012345678.ll_c1", classId: "3388000000012345678.ll_b1" }])
    expect(jwt.length).toBeLessThan(1800)
  })
})

describe.skipIf(!TEST_DATABASE_URL)("Google Wallet with the server", () => {
  let pool: pg.Pool
  let g: ReturnType<typeof fakeGoogle>
  let wallets: ReturnType<typeof createWallets>
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 })
    await migrate(pool, () => undefined)
  })
  afterAll(() => pool.end())
  beforeEach(async () => {
    await pool.query(`truncate ${[...Object.values(TABLES).map((t) => t.table), "maintenance", "sessions", "webhook_events", "wallet_passes", "wallet_jobs"].join(", ")}`)
    const seed = createSeed()
    for (const u of seed.users) u.password = await hashPassword(u.password)
    await importAll(pool, seed)
    g = fakeGoogle()
    const google = new GoogleWallet({ issuerId: config.googleWalletIssuerId, account, publicUrl: config.publicUrl, fetch: g.fetch })
    wallets = createWallets(pool, google)
    app = createApp({ pool, store: createPgStore(pool), config, messenger: { channels: { sms: false, email: false }, sms: async () => undefined, email: async () => undefined }, wallets })
  })

  async function rpc(method: string, args: unknown[] = [], headers: Record<string, string> = {}) {
    const response = await app.request(`/api/rpc/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-loyaloop": "1", "x-forwarded-for": `10.1.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`, ...headers },
      body: JSON.stringify({ args }),
    })
    return (await response.json()) as { result?: any; error?: any; device?: string }
  }

  async function register(phone: string) {
    // These checks need a business that registers by phone and gives the bonus at once.
    await pool.query(`update businesses set data = jsonb_set(data, '{askPhone}', 'true') where data->>'id' = 'b_affair'`)
    const sent = await rpc("sendCode", ["AFF7Q2", phone, "new"])
    const done = await rpc("completeRegistration", ["AFF7Q2", { name: "Laura Prueba", phone, email: "", birthday: "", promotions: false, privacy: true }, sent.result.previewCode])
    return done.result
  }

  function service() {
    const ctx: Context = {
      now: Date.now,
      session: async () => null,
      setSession: async () => undefined,
      device: () => null,
      setDevice: () => undefined,
      hash: async (p) => p,
      verify: async (p, s) => p === s,
      preview: true,
      simulator: true,
      baseUrl: "",
      messenger: { channels: { sms: false, email: false }, sms: async () => undefined, email: async () => undefined },
    }
    return createService(createPgStore(pool), ctx)
  }

  it("creates the class and the pass on registration and returns a save link", async () => {
    const result = await register("5577001122")
    expect(result.links.google).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//)
    expect(g.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /loyaltyClass", "POST /loyaltyObject"])
    const object = g.calls[1].body
    expect(object.accountId).toBe(result.holder.token)
    expect(object.loyaltyPoints.balance.int).toBe(100) // welcome bonus
    const row = (await pool.query("select business_id, google_object_id from wallet_passes")).rows[0]
    expect(row.business_id).toBe("b_affair")
    // Recovering the card later gives a link again, updating the same pass.
    const again = await rpc("sendCode", ["AFF7Q2", "5577001122", "recover"])
    const recovered = await rpc("recoverCard", ["AFF7Q2", "5577001122", again.result.previewCode])
    expect(recovered.result.links.google).toMatch(/^https:\/\/pay\.google\.com/)
    expect(g.calls.slice(2).map((c) => `${c.method} ${c.path.split("/")[1]}`)).toEqual(["POST loyaltyObject", "PATCH loyaltyObject"])
    expect((await pool.query("select count(*)::int as n from wallet_passes")).rows[0].n).toBe(1)
  })

  it("updates the pass and notifies when points are earned", async () => {
    const { holder } = await register("5577003344")
    g.calls.length = 0
    const owner = await app.request("/api/rpc/login", { method: "POST", headers: { "content-type": "application/json", "x-loyaloop": "1" }, body: JSON.stringify({ args: ["dueno@affair.test", "prueba123"] }) })
    const cookie = owner.headers.get("set-cookie")!.split(";")[0]
    const pairing = await rpc("createPairingCode", ["rg_affair_1"], { cookie })
    const device = (await rpc("pairDevice", [pairing.result.code, "Tablet"])).device!
    await rpc("kioskScan", [holder.token], { "x-device-token": device })
    const outcome = await service().recordPayment({ businessId: "b_affair", registerId: "rg_affair_1", provider: "mercadopago", externalId: "MP-1", amount: 1000, tip: 0 })
    expect(outcome.kind).toBe("matched")
    const jobs = (await pool.query("select kind from wallet_jobs where status = 'pending' order by id")).rows.map((r) => r.kind)
    expect(jobs).toEqual(["pass", "message"])
    expect(await wallets.work()).toBe(2)
    const objectCalls = g.calls.filter((c) => c.path.startsWith("/loyaltyObject"))
    const patched = objectCalls.find((c) => c.method === "PATCH")!
    expect(patched.body.loyaltyPoints.balance.int).toBe(200)
    const message = objectCalls.find((c) => c.path.endsWith("/addMessage"))!
    expect(message.body.message.messageType).toBe("TEXT_AND_NOTIFY")
    expect(message.body.message.header).toBe("Club de beneficios")
    expect((await pool.query("select count(*)::int as n from wallet_jobs where status = 'done'")).rows[0].n).toBe(2)
  })

  it("does not queue work for customers without a pass", async () => {
    const owner = service()
    await owner.recordPayment({ businessId: "b_affair", registerId: "rg_affair_1", provider: "mercadopago", externalId: "MP-2", amount: 500, tip: 0 })
    const admin = await app.request("/api/rpc/login", { method: "POST", headers: { "content-type": "application/json", "x-loyaloop": "1" }, body: JSON.stringify({ args: ["dueno@affair.test", "prueba123"] }) })
    const cookie = admin.headers.get("set-cookie")!.split(";")[0]
    await rpc("adjustBalance", ["c_b_affair_1", { points: 50, stamps: 0 }, "Prueba"], { cookie })
    expect((await pool.query("select count(*)::int as n from wallet_jobs")).rows[0].n).toBe(0)
  })

  it("updates the card design when the brand changes and retries when Google fails", async () => {
    await register("5577005566")
    g.calls.length = 0
    const login = await app.request("/api/rpc/login", { method: "POST", headers: { "content-type": "application/json", "x-loyaloop": "1" }, body: JSON.stringify({ args: ["admin@loyaloop.test", "loyaloop123"] }) })
    const cookie = login.headers.get("set-cookie")!.split(";")[0]
    const business = (await pool.query("select data from businesses where pk = 'b_affair'")).rows[0].data
    await rpc("adminUpdateBusiness", ["b_affair", { brand: { ...business.brand, color: "#123456" } }], { cookie })
    g.fail(1)
    await wallets.work()
    const failed = (await pool.query("select status, attempts, last_error from wallet_jobs where kind = 'class'")).rows[0]
    expect(failed).toMatchObject({ status: "pending", attempts: 1 })
    expect(failed.last_error).toMatch(/Google no disponible/)
    await pool.query("update wallet_jobs set run_after = now()")
    await wallets.work()
    expect((await pool.query("select status from wallet_jobs where kind = 'class'")).rows[0].status).toBe("done")
    const cls = [...g.resources.values()].find((r) => String(r.id).endsWith("ll_b_affair"))
    expect(cls.hexBackgroundColor).toBe("#123456")
  })

  it("serves business logos for Google and falls back to the LoyaLoop icon", async () => {
    const png = "data:image/png;base64," + Buffer.from("fake-png").toString("base64")
    await pool.query("update businesses set data = jsonb_set(data, '{brand,logo}', to_jsonb($1::text)) where pk = 'b_esquina'", [png])
    const logo = await app.request("/api/public/brand/b_esquina/logo")
    expect(logo.headers.get("content-type")).toBe("image/png")
    expect(Buffer.from(await logo.arrayBuffer()).toString()).toBe("fake-png")
    const fallback = await app.request("/api/public/brand/b_affair/logo")
    expect(fallback.status).toBe(302)
    expect(fallback.headers.get("location")).toBe("/brand/loyaloop-icon.png")
  })
})
