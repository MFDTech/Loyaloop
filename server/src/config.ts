// Server settings, read once from environment variables (see .env.example).

export interface Config {
  databaseUrl: string
  port: number
  /** Public address of the app, used in links sent by email. */
  publicUrl: string
  /** Show SMS codes and reset links on screen instead of sending them. Staging only. */
  preview: boolean
  /** Allow the admin's payment simulator. Staging only. */
  simulator: boolean
  staticDir: string
  /** Behind Caddy or Nginx: read the client IP from X-Forwarded-For. */
  trustProxy: boolean
  secureCookies: boolean
  mercadoPagoWebhookSecret: string
}

const flag = (value: string | undefined, fallback = false) => (value === undefined || value === "" ? fallback : ["1", "true", "yes", "on"].includes(value.toLowerCase()))

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL || ""
  if (!databaseUrl) throw new Error("Falta DATABASE_URL (por ejemplo postgresql://usuario:clave@localhost:5432/loyaloop).")
  const publicUrl = (env.PUBLIC_URL || "http://localhost:3000").replace(/\/+$/, "") + "/"
  return {
    databaseUrl,
    port: Number(env.PORT) || 3000,
    publicUrl,
    preview: flag(env.PREVIEW),
    simulator: flag(env.SIMULATOR),
    staticDir: env.STATIC_DIR || "dist",
    trustProxy: flag(env.TRUST_PROXY, true),
    secureCookies: flag(env.SECURE_COOKIES, publicUrl.startsWith("https://")),
    mercadoPagoWebhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET || "",
  }
}
