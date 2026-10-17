import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { loadConfig } from "./config"
import { createPool, migrate } from "./db"
import { createMessenger } from "./messenger"
import { createPgStore } from "./pgStore"
import { purgeExpiredSessions } from "./sessions"
import { createWallets } from "./wallet"
import { AppleWallet, apnsPusher, loadAppleCredentials } from "./wallet/apple"
import { GoogleWallet, loadServiceAccount } from "./wallet/google"

const config = loadConfig()
const pool = createPool(config.databaseUrl)
await migrate(pool)

const messenger = createMessenger(config)
if (!messenger.channels.email) console.warn("[aviso] Correo sin configurar (RESEND_API_KEY): invitaciones y contraseñas solo quedan en el registro.")
if (messenger.verifier) console.log(`[sms] Twilio Verify activo (${config.twilioVerifyChannel})`)
else if (!config.preview) console.warn("[aviso] Sin proveedor de SMS y con PREVIEW=false: los clientes no pueden registrarse. Usa PREVIEW=true mientras tanto.")
else console.warn("[aviso] Códigos de registro en pantalla (PREVIEW=true): configura Twilio Verify antes de abrir a clientes.")
if (config.simulator) console.warn("[aviso] El simulador de cobros está encendido (SIMULATOR=true). Apágalo en producción.")

let google: GoogleWallet | null = null
if (config.googleWalletIssuerId && config.googleWalletKeyFile && !existsSync(config.googleWalletKeyFile)) {
  console.warn(`[aviso] Google Wallet apagado: no existe ${config.googleWalletKeyFile}.`)
} else if (config.googleWalletIssuerId && config.googleWalletKeyFile) {
  google = new GoogleWallet({ issuerId: config.googleWalletIssuerId, account: loadServiceAccount(config.googleWalletKeyFile), publicUrl: config.publicUrl })
  console.log(`[wallet] Google Wallet activo (emisor ${config.googleWalletIssuerId})`)
} else console.warn("[aviso] Google Wallet sin configurar: faltan GOOGLE_WALLET_ISSUER_ID y GOOGLE_WALLET_KEY_FILE.")
let apple: AppleWallet | null = null
const appleFiles = { cert: config.applePassCert, key: config.applePassKey, wwdr: config.appleWwdrCert }
if (config.applePassTypeId && config.appleTeamId && Object.values(appleFiles).every(Boolean)) {
  const missing = Object.values(appleFiles).filter((file) => !existsSync(file))
  if (missing.length) console.warn(`[aviso] Apple Wallet apagado: no existe ${missing.join(", ")}.`)
  else {
    try {
      const credentials = loadAppleCredentials(appleFiles, { passTypeId: config.applePassTypeId, teamId: config.appleTeamId, keyPassphrase: config.applePassKeyPassphrase || undefined })
      const icon = [join(config.staticDir, "brand/loyaloop-icon.png"), "public/brand/loyaloop-icon.png"].find(existsSync)
      if (!icon) throw new Error("no se encontró brand/loyaloop-icon.png")
      apple = new AppleWallet({ ...credentials, publicUrl: config.publicUrl, defaultIcon: readFileSync(icon), pusher: apnsPusher(credentials) })
      console.log(`[wallet] Apple Wallet activo (${config.applePassTypeId})`)
    } catch (error) {
      console.error(`[aviso] Apple Wallet apagado: ${(error as Error).message}`)
    }
  }
} else console.warn("[aviso] Apple Wallet sin configurar: faltan APPLE_PASS_TYPE_ID, APPLE_TEAM_ID y los certificados.")
if (apple && !config.publicUrl.startsWith("https://")) console.warn("[aviso] Apple Wallet necesita PUBLIC_URL con https para actualizar los pases.")
const wallets = createWallets(pool, google, apple)
const stopWallets = wallets.start()

const app = createApp({ pool, store: createPgStore(pool), config, messenger, wallets })
const server = serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`[loyaloop] escuchando en el puerto ${info.port} · ${config.publicUrl}`))

const timer = setInterval(() => purgeExpiredSessions(pool).catch((e) => console.error("[sessions]", e.message)), 60 * 60_000)

async function shutdown(signal: string) {
  console.log(`[loyaloop] ${signal}: cerrando`)
  clearInterval(timer)
  stopWallets()
  server.close()
  await pool.end().catch(() => undefined)
  process.exit(0)
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
