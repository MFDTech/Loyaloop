// Apple Wallet with test certificates (no Apple account needed): pass contents,
// signed .pkpass, the PassKit web service and update pushes.
import { execFileSync } from "node:child_process"
import { createHash, generateKeyPairSync } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import JSZip from "jszip"
import forge from "node-forge"
import pg from "pg"
import sharp from "sharp"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createSeed } from "../src/lib/seed"
import { createApp } from "../server/src/app"
import type { Config } from "../server/src/config"
import { migrate } from "../server/src/db"
import { TABLES, createPgStore, importAll } from "../server/src/pgStore"
import { hashPassword } from "../server/src/passwords"
import { createWallets } from "../server/src/wallet"
import { AppleWallet, type PushResult } from "../server/src/wallet/apple"
import { TEST_DATABASE_URL } from "./harness"

const PASS_TYPE = "pass.mx.com.loyaloop.prueba"

/** A fake "Apple WWDR" CA and a Pass Type ID certificate signed by it. */
function testCertificates() {
  const keyPair = () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const key = forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs1", format: "pem" }).toString()) as forge.pki.rsa.PrivateKey
    return { privateKey: key, publicKey: forge.pki.setRsaPublicKey(key.n, key.e) }
  }
  const make = (subject: string, keys: ReturnType<typeof keyPair>, issuer: { name: string; key: forge.pki.PrivateKey } | null, serial: string) => {
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = serial
    cert.validity.notBefore = new Date(Date.now() - 86_400_000)
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000)
    cert.setSubject([{ name: "commonName", value: subject }])
    cert.setIssuer([{ name: "commonName", value: issuer?.name || subject }])
    cert.setExtensions(issuer ? [{ name: "basicConstraints", cA: false }] : [{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, digitalSignature: true }])
    cert.sign((issuer?.key || keys.privateKey) as forge.pki.rsa.PrivateKey, forge.md.sha256.create())
    return cert
  }
  const caKeys = keyPair()
  const ca = make("WWDR de prueba", caKeys, null, "01")
  const passKeys = keyPair()
  const pass = make(`Pass Type ID: ${PASS_TYPE}`, passKeys, { name: "WWDR de prueba", key: caKeys.privateKey }, "02")
  return { cert: forge.pki.certificateToPem(pass), key: forge.pki.privateKeyToPem(passKeys.privateKey), wwdr: forge.pki.certificateToPem(ca) }
}

const certs = testCertificates()
const icon = readFileSync("public/brand/loyaloop-icon.png")

function appleWallet(pushes: { token: string; topic: string }[] = [], answer: (token: string) => PushResult = () => ({ ok: true })) {
  return new AppleWallet({
    ...certs,
    passTypeId: PASS_TYPE,
    teamId: "ABCDE12345",
    publicUrl: "https://app.loyaloop.test/",
    defaultIcon: icon,
    pusher: async (token, topic) => {
      pushes.push({ token, topic })
      return answer(token)
    },
  })
}

async function unzip(file: Buffer) {
  const zip = await JSZip.loadAsync(file)
  const files: Record<string, Buffer> = {}
  for (const name of Object.keys(zip.files)) files[name] = await zip.files[name].async("nodebuffer")
  return files
}

const hasOpenssl = (() => {
  try {
    execFileSync("openssl", ["version"])
    return true
  } catch {
    return false
  }
})()

describe("Apple Wallet pass building", () => {
  const apple = appleWallet()
  const seed = createSeed()
  const pick = (id: string) => ({
    business: seed.businesses.find((b) => b.id === id)!,
    program: seed.programs.find((p) => p.businessId === id)!,
    rewards: seed.rewards.filter((r) => r.businessId === id),
  })

  it("fills pass.json with the neutral name, QR, web service and balance", () => {
    const customer = seed.customers.find((c) => c.businessId === "b_affair" && c.tierId)!
    const json = apple.passJson({ ...pick("b_affair"), customer, serial: customer.id, authToken: "token-secreto-de-prueba-123" })
    expect(json).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: PASS_TYPE,
      teamIdentifier: "ABCDE12345",
      serialNumber: customer.id,
      authenticationToken: "token-secreto-de-prueba-123",
      webServiceURL: "https://app.loyaloop.test/api/apple",
      organizationName: "Club de beneficios",
      sharingProhibited: true,
    })
    expect(JSON.stringify(json)).not.toContain("Affair")
    expect(json.barcodes[0]).toMatchObject({ format: "PKBarcodeFormatQR", message: customer.token })
    expect(json.storeCard.headerFields[0]).toEqual({ key: "balance", label: "PUNTOS", value: customer.points })
    expect(json.storeCard.secondaryFields.some((f) => (f as { key: string }).key === "tier")).toBe(true)
  })

  it("shows stamps as x/goal and puts the latest notice on the back", () => {
    const customer = seed.customers.find((c) => c.businessId === "b_esquina")!
    const json = apple.passJson({ ...pick("b_esquina"), customer, serial: customer.id, authToken: "x".repeat(20), notice: { id: "n1", message: "Ganaste un sello" } })
    expect(json.storeCard.headerFields[0].value).toBe(`${customer.stamps}/8`)
    expect(json.storeCard.backFields[0]).toEqual({ key: "notice", label: "Último aviso", value: "Ganaste un sello", changeMessage: "%@" })
  })

  it("builds a zip whose manifest matches every file, with stamp strips at each scale", async () => {
    const customer = seed.customers.find((c) => c.businessId === "b_esquina")!
    const files = await unzip(await apple.build({ ...pick("b_esquina"), customer, serial: customer.id, authToken: "x".repeat(20) }))
    expect(Object.keys(files).sort()).toEqual(
      ["icon.png", "icon@2x.png", "icon@3x.png", "manifest.json", "pass.json", "signature", "strip.png", "strip@2x.png", "strip@3x.png"].sort(),
    )
    const manifest = JSON.parse(files["manifest.json"].toString())
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(files).filter((f) => f !== "manifest.json" && f !== "signature").sort())
    for (const [name, hash] of Object.entries(manifest)) expect(createHash("sha1").update(files[name]).digest("hex")).toBe(hash)
    expect(await sharp(files["strip@2x.png"]).metadata()).toMatchObject({ width: 750, height: 288 })
    expect(await sharp(files["icon@3x.png"]).metadata()).toMatchObject({ width: 87, height: 87 })
  })

  it.skipIf(!hasOpenssl)("signs the manifest with the pass certificate and includes the WWDR certificate", async () => {
    const customer = seed.customers.find((c) => c.businessId === "b_affair")!
    const files = await unzip(await apple.build({ ...pick("b_affair"), customer, serial: customer.id, authToken: "x".repeat(20) }))
    const dir = mkdtempSync(join(tmpdir(), "pkpass-"))
    writeFileSync(join(dir, "manifest.json"), files["manifest.json"])
    writeFileSync(join(dir, "signature"), files["signature"])
    writeFileSync(join(dir, "ca.pem"), certs.wwdr)
    const verify = (content: string) =>
      execFileSync("openssl", ["cms", "-verify", "-binary", "-inform", "DER", "-in", join(dir, "signature"), "-content", content, "-CAfile", join(dir, "ca.pem"), "-purpose", "any", "-out", join(dir, "out")], {
        stdio: "pipe",
      })
    expect(() => verify(join(dir, "manifest.json"))).not.toThrow()
    writeFileSync(join(dir, "tampered.json"), files["manifest.json"].toString().replace(/[0-9a-f]/, "0") + " ")
    expect(() => verify(join(dir, "tampered.json"))).toThrow()
    const certsInside = execFileSync("openssl", ["pkcs7", "-inform", "DER", "-in", join(dir, "signature"), "-print_certs"]).toString()
    expect(certsInside).toContain("WWDR de prueba")
    expect(certsInside).toContain(PASS_TYPE)
  })
})

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
  mercadoPagoClientId: "",
  mercadoPagoClientSecret: "",
  integrationsKey: "",
  alertEmail: "",
  billingAccessToken: "",
  billingWebhookSecret: "",
  googleWalletIssuerId: "",
  googleWalletKeyFile: "",
  resendApiKey: "",
  emailFrom: "LoyaLoop <notificaciones@loyaloop.test>",
  emailReplyTo: "",
  applePassTypeId: PASS_TYPE,
  appleTeamId: "ABCDE12345",
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

describe.skipIf(!TEST_DATABASE_URL)("Apple Wallet web service", () => {
  let pool: pg.Pool
  let wallets: ReturnType<typeof createWallets>
  let app: ReturnType<typeof createApp>
  let pushes: { token: string; topic: string }[]
  let dead: Set<string>

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 4 })
    await migrate(pool, () => undefined)
  })
  afterAll(() => pool.end())
  beforeEach(async () => {
    await pool.query(`truncate ${[...Object.values(TABLES).map((t) => t.table), "maintenance", "sessions", "webhook_events", "wallet_passes", "wallet_jobs", "apple_registrations"].join(", ")}`)
    const seed = createSeed()
    for (const u of seed.users) u.password = await hashPassword(u.password)
    await importAll(pool, seed)
    pushes = []
    dead = new Set()
    wallets = createWallets(pool, null, appleWallet(pushes, (token) => (dead.has(token) ? { ok: false, status: 410, reason: "Unregistered" } : { ok: true })))
    app = createApp({ pool, store: createPgStore(pool), config, messenger: { channels: { sms: false, email: false }, sms: async () => undefined, email: async () => undefined }, wallets })
  })

  async function rpc(method: string, args: unknown[] = []) {
    const response = await app.request(`/api/rpc/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-loyaloop": "1", "x-forwarded-for": `10.2.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}` },
      body: JSON.stringify({ args }),
    })
    return (await response.json()) as { result?: any; error?: any }
  }

  async function register(phone: string) {
    // These checks need a business that registers by phone and gives the bonus at once.
    await pool.query(`update businesses set data = jsonb_set(data, '{askPhone}', 'true') where data->>'id' = 'b_affair'`)
    const sent = await rpc("sendCode", ["AFF7Q2", phone, "new"])
    const done = await rpc("completeRegistration", ["AFF7Q2", { name: "Laura Prueba", phone, email: "", birthday: "", promotions: false, privacy: true }, sent.result.previewCode])
    const url = new URL(done.result.links.apple)
    return { ...done.result, url, serial: decodeURIComponent(url.pathname.split("/").pop()!), token: url.searchParams.get("t")! }
  }

  const v1 = "/api/apple/v1"
  const auth = (token: string) => ({ authorization: `ApplePass ${token}` })

  it("gives an Apple link on registration and serves the signed pass", async () => {
    const r = await register("5588001122")
    expect(r.url.origin + r.url.pathname).toMatch(/^https:\/\/app\.loyaloop\.test\/api\/apple\/download\/c_/)
    expect(r.token.length).toBeGreaterThanOrEqual(16)
    const response = await app.request(r.url.pathname + r.url.search)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/vnd.apple.pkpass")
    const files = await unzip(Buffer.from(await response.arrayBuffer()))
    const pass = JSON.parse(files["pass.json"].toString())
    expect(pass).toMatchObject({ serialNumber: r.serial, authenticationToken: r.token, organizationName: "Club de beneficios" })
    expect(pass.barcodes[0].message).toBe(r.holder.token)
    expect(pass.storeCard.headerFields[0].value).toBe(100) // welcome bonus
    // A wrong token gets nothing.
    expect((await app.request(`/api/apple/download/${r.serial}?t=otro-token-cualquiera`)).status).toBe(404)
    // Recovering the card keeps the same token, so the installed pass keeps working.
    const again = await rpc("sendCode", ["AFF7Q2", "5588001122", "recover"])
    const recovered = await rpc("recoverCard", ["AFF7Q2", "5588001122", again.result.previewCode])
    expect(new URL(recovered.result.links.apple).searchParams.get("t")).toBe(r.token)
  })

  it("registers devices, pushes updates and serves only what changed", async () => {
    const r = await register("5588003344")
    const path = `${v1}/devices/iphone-1/registrations/${PASS_TYPE}/${r.serial}`
    const post = (headers: Record<string, string>, body: unknown = { pushToken: "push-1" }) =>
      app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) })
    expect((await post(auth("token-equivocado"))).status).toBe(401)
    expect((await post(auth(r.token))).status).toBe(201)
    expect((await post(auth(r.token))).status).toBe(200)
    expect((await app.request(`${v1}/devices/iphone-1/registrations/pass.otro.tipo/${r.serial}`, { method: "POST", headers: auth(r.token), body: "{}" })).status).toBe(404)

    const list = await app.request(`${v1}/devices/iphone-1/registrations/${PASS_TYPE}`)
    const first = (await list.json()) as { serialNumbers: string[]; lastUpdated: string }
    expect(first.serialNumbers).toEqual([r.serial])
    expect((await app.request(`${v1}/devices/iphone-1/registrations/${PASS_TYPE}?passesUpdatedSince=${first.lastUpdated}`)).status).toBe(204)

    const passPath = `${v1}/passes/${PASS_TYPE}/${r.serial}`
    const passResponse = await app.request(passPath, { headers: auth(r.token) })
    expect(passResponse.status).toBe(200)
    expect(passResponse.headers.get("last-modified")).toMatch(/GMT$/)
    expect((await app.request(passPath, { headers: auth("token-equivocado") })).status).toBe(401)

    // A change to the pass pushes to the device, which then sees it in the list.
    await pool.query("insert into wallet_jobs (kind, business_id, ref) values ('pass', 'b_affair', $1)", [r.serial])
    await wallets.work()
    expect(pushes).toEqual([{ token: "push-1", topic: PASS_TYPE }])
    const changed = (await (await app.request(`${v1}/devices/iphone-1/registrations/${PASS_TYPE}?passesUpdatedSince=${first.lastUpdated}`)).json()) as { serialNumbers: string[] }
    expect(changed.serialNumbers).toEqual([r.serial])

    // Removing the pass from Wallet unregisters the device.
    expect((await app.request(path, { method: "DELETE", headers: auth(r.token) })).status).toBe(200)
    expect((await app.request(`${v1}/devices/iphone-1/registrations/${PASS_TYPE}`)).status).toBe(204)
  })

  it("updates the balance after a payment and forgets devices Apple says are gone", async () => {
    const r = await register("5588005566")
    for (const [device, token] of [["iphone-a", "push-a"], ["watch-a", "push-b"]])
      await app.request(`${v1}/devices/${device}/registrations/${PASS_TYPE}/${r.serial}`, { method: "POST", headers: { "content-type": "application/json", ...auth(r.token) }, body: JSON.stringify({ pushToken: token }) })
    dead.add("push-b")
    await pool.query("update customers set data = jsonb_set(data, '{points}', '250') where pk = $1", [r.serial])
    const login = await app.request("/api/rpc/login", { method: "POST", headers: { "content-type": "application/json", "x-loyaloop": "1" }, body: JSON.stringify({ args: ["dueno@affair.test", "prueba123"] }) })
    const cookie = login.headers.get("set-cookie")!.split(";")[0]
    await app.request("/api/rpc/adjustBalance", {
      method: "POST",
      headers: { "content-type": "application/json", "x-loyaloop": "1", cookie },
      body: JSON.stringify({ args: [r.serial, { points: 50, stamps: 0 }, "Prueba"] }),
    })
    expect((await pool.query("select kind from wallet_jobs where status = 'pending'")).rows.map((x) => x.kind)).toContain("pass")
    await wallets.work()
    expect(pushes.map((p) => p.token).sort()).toEqual(["push-a", "push-b"])
    expect((await pool.query("select push_token from apple_registrations")).rows).toEqual([{ push_token: "push-a" }])
    const response = await app.request(`${v1}/passes/${PASS_TYPE}/${r.serial}`, { headers: auth(r.token) })
    const pass = JSON.parse((await unzip(Buffer.from(await response.arrayBuffer())))["pass.json"].toString())
    expect(pass.storeCard.headerFields[0].value).toBe(300)
  })

  it("is off without certificates", async () => {
    const off = createApp({ pool, store: createPgStore(pool), config, messenger: { channels: { sms: false, email: false }, sms: async () => undefined, email: async () => undefined }, wallets: createWallets(pool, null) })
    expect((await off.request("/api/apple/download/c1?t=x")).status).toBe(404)
    expect((await off.request(`${v1}/devices/d/registrations/${PASS_TYPE}`)).status).toBe(404)
  })
})

describe("stamp strip drawing", () => {
  it("keeps every stamp inside the strip with a margin, in one or two rows", async () => {
    const { stampLayout } = await import("../src/lib/stampIcons")
    for (const goal of [1, 4, 5, 6, 8, 10, 12, 20]) {
      const { size, cells } = stampLayout(goal, 375, 144)
      expect(cells).toHaveLength(goal)
      for (const { cx, cy } of cells) {
        expect(cx - size / 2).toBeGreaterThanOrEqual(375 * 0.05)
        expect(cx + size / 2).toBeLessThanOrEqual(375 * 0.95)
        expect(cy - size / 2).toBeGreaterThan(0)
        expect(cy + size / 2).toBeLessThan(144)
      }
      expect(new Set(cells.map((c) => Math.round(c.cy))).size).toBe(goal <= 5 ? 1 : 2)
    }
  })

  it("uses the logo only when there is one and the business is not discreet", async () => {
    const { stampGlyph } = await import("../src/lib/stampIcons")
    expect(stampGlyph("logo", true)).toBe("logo")
    expect(stampGlyph("logo", false)).toBe("check")
    expect(stampGlyph(undefined, true)).toBe("check")
    expect(stampGlyph("heart", false)).toBe("heart")
  })
})
