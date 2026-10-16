import { existsSync } from "node:fs"
import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { loadConfig } from "./config"
import { createPool, migrate } from "./db"
import { createMessenger } from "./messenger"
import { createPgStore } from "./pgStore"
import { purgeExpiredSessions } from "./sessions"
import { createWallets } from "./wallet"
import { GoogleWallet, loadServiceAccount } from "./wallet/google"

const config = loadConfig()
const pool = createPool(config.databaseUrl)
await migrate(pool)

const messenger = createMessenger(config)
if (!messenger.channels.email) console.warn("[aviso] Correo sin configurar (RESEND_API_KEY): invitaciones y contraseñas solo quedan en el registro.")
if (!messenger.channels.sms && !config.preview) console.warn("[aviso] Sin proveedor de SMS y con PREVIEW=false: los clientes no pueden registrarse. Usa PREVIEW=true mientras tanto.")
if (config.simulator) console.warn("[aviso] El simulador de cobros está encendido (SIMULATOR=true). Apágalo en producción.")

let google: GoogleWallet | null = null
if (config.googleWalletIssuerId && config.googleWalletKeyFile && !existsSync(config.googleWalletKeyFile)) {
  console.warn(`[aviso] Google Wallet apagado: no existe ${config.googleWalletKeyFile}.`)
} else if (config.googleWalletIssuerId && config.googleWalletKeyFile) {
  google = new GoogleWallet({ issuerId: config.googleWalletIssuerId, account: loadServiceAccount(config.googleWalletKeyFile), publicUrl: config.publicUrl })
  console.log(`[wallet] Google Wallet activo (emisor ${config.googleWalletIssuerId})`)
} else console.warn("[aviso] Google Wallet sin configurar: faltan GOOGLE_WALLET_ISSUER_ID y GOOGLE_WALLET_KEY_FILE.")
const wallets = createWallets(pool, google)
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
