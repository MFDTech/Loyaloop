import { serve } from "@hono/node-server"
import { createApp } from "./app"
import { loadConfig } from "./config"
import { createPool, migrate } from "./db"
import { consoleMessenger } from "./messenger"
import { createPgStore } from "./pgStore"
import { purgeExpiredSessions } from "./sessions"

const config = loadConfig()
const pool = createPool(config.databaseUrl)
await migrate(pool)

if (!config.preview) console.warn("[aviso] No hay proveedor de SMS ni de correo: los códigos y enlaces solo quedan en el registro del servidor. Usa PREVIEW=true mientras tanto.")
if (config.simulator) console.warn("[aviso] El simulador de cobros está encendido (SIMULATOR=true). Apágalo en producción.")

const app = createApp({ pool, store: createPgStore(pool), config, messenger: consoleMessenger })
const server = serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`[loyaloop] escuchando en el puerto ${info.port} · ${config.publicUrl}`))

const timer = setInterval(() => purgeExpiredSessions(pool).catch((e) => console.error("[sessions]", e.message)), 60 * 60_000)

async function shutdown(signal: string) {
  console.log(`[loyaloop] ${signal}: cerrando`)
  clearInterval(timer)
  server.close()
  await pool.end().catch(() => undefined)
  process.exit(0)
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
