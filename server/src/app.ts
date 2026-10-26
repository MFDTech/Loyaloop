import { Hono, type Context as HonoContext } from "hono"
import { bodyLimit } from "hono/body-limit"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { getConnInfo } from "@hono/node-server/conninfo"
import { serveStatic } from "@hono/node-server/serve-static"
import { ApiError, PUBLIC_METHODS, createService, type Context, type Messenger, type Store, type Subscriptions } from "../../src/lib/service"
import type { Session } from "../../src/lib/types"
import type { Config } from "./config"
import type { Pool } from "./db"
import { hashPassword, verifyPassword } from "./passwords"
import { LIMITS, RateLimiter } from "./rateLimit"
import { SESSION_COOKIE, SESSION_DAYS, createSession, deleteSession, deleteUserSessions, findSession, updateSession } from "./sessions"
import { mercadoPagoWebhook } from "./mercadopago"
import type { MercadoPagoAccounts } from "./mercadopagoPoint"
import { billingWebhook } from "./billing"
import { appleRoutes } from "./wallet/appleRoutes"
import type { WalletService } from "./wallet"
import type { Business } from "../../src/lib/types"

const STATUS: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  paused: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unpaired: 401,
}

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
}

export interface AppDeps {
  pool: Pool
  store: Store
  config: Config
  messenger: Messenger
  now?: () => number
  limiter?: RateLimiter
  wallets?: WalletService
  subscriptions?: Subscriptions
  /** Businesses' Mercado Pago accounts (Point terminals). */
  mercadoPago?: MercadoPagoAccounts
}

export function createApp({ pool, store, config, messenger, now = Date.now, limiter = new RateLimiter(), wallets, subscriptions, mercadoPago }: AppDeps) {
  const app = new Hono()

  app.use("*", async (c, next) => {
    await next()
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.header(name, value)
    if (config.secureCookies) c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  })

  const clientIp = (c: HonoContext) => {
    if (config.trustProxy) {
      const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      if (forwarded) return forwarded
    }
    try {
      return getConnInfo(c).remote.address || "unknown"
    } catch {
      return "unknown"
    }
  }

  app.get("/api/health", async (c) => {
    try {
      await pool.query("select 1")
      return c.json({ ok: true })
    } catch {
      return c.json({ ok: false }, 503)
    }
  })

  app.post("/api/rpc/:method", bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: { message: "La información enviada es demasiado grande.", code: "too_large" } }, 413) }), async (c) => {
    // Custom header + JSON body: a page on another site cannot send this request (CSRF).
    if (c.req.header("x-loyaloop") !== "1" || !c.req.header("content-type")?.includes("application/json"))
      return c.json({ error: { message: "Solicitud no válida.", code: "bad_request" } }, 400)
    const name = c.req.param("method")
    if (!(PUBLIC_METHODS as readonly string[]).includes(name)) return c.json({ error: { message: "Esa acción no existe.", code: "not_found" } }, 404)
    const body = (await c.req.json().catch(() => null)) as { args?: unknown } | null
    const args = Array.isArray(body?.args) ? body!.args : []
    if (args.length > 6) return c.json({ error: { message: "Solicitud no válida.", code: "bad_request" } }, 400)

    const limit = LIMITS[name]
    if (limit) {
      const ip = clientIp(c)
      const argKey = limit.argIndex !== undefined ? String(args[limit.argIndex] ?? "").toLowerCase().replace(/\s+/g, "") : ""
      const blocked = !limiter.allow(`${name}:ip:${ip}`, ...limit.ip) || (limit.arg && argKey && !limiter.allow(`${name}:arg:${argKey}`, ...limit.arg))
      if (blocked) return c.json({ error: { message: "Demasiados intentos. Espera unos minutos e inténtalo otra vez.", code: "rate_limited" } }, 429)
    }

    // Per-request context: session from the cookie, device from its header.
    let token = getCookie(c, SESSION_COOKIE) || ""
    let session: Session | null | undefined
    let device: string | null | undefined
    const ctx: Context = {
      now,
      async session() {
        if (session === undefined) session = token ? await findSession(pool, token) : null
        return session
      },
      async setSession(next) {
        const current = await ctx.session()
        if (!next) {
          if (token) await deleteSession(pool, token)
          deleteCookie(c, SESSION_COOKIE, { path: "/" })
          token = ""
        } else if (current && token && current.userId === next.userId) {
          await updateSession(pool, token, next)
        } else {
          if (token) await deleteSession(pool, token)
          token = await createSession(pool, next)
          setCookie(c, SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "Lax", secure: config.secureCookies, maxAge: SESSION_DAYS * 86400 })
        }
        session = next
      },
      device: () => (device !== undefined ? device : c.req.header("x-device-token") || null),
      setDevice(next) {
        device = next
      },
      hash: hashPassword,
      verify: verifyPassword,
      preview: config.preview,
      simulator: config.simulator,
      baseUrl: config.publicUrl,
      messenger,
      wallets,
      subscriptions,
      paymentAccounts: mercadoPago,
    }

    const service = createService(store, ctx)
    try {
      const fn = service[name as keyof typeof service] as (...a: unknown[]) => Promise<unknown>
      const result = await fn(...args)
      if (name === "changePassword") {
        const s = await ctx.session()
        if (s) await deleteUserSessions(pool, s.userId, token)
      }
      return c.json({ result: result ?? null, ...(device !== undefined ? { device } : {}) })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "unauthenticated" && token) deleteCookie(c, SESSION_COOKIE, { path: "/" })
        return c.json({ error: { message: error.message, code: error.code } }, (STATUS[error.code] || 400) as 400)
      }
      console.error(`[rpc] ${name} failed`, error)
      return c.json({ error: { message: "Algo salió mal en el servidor. Inténtalo otra vez.", code: "server" } }, 500)
    }
  })

  // Logo and strip of a business for Google Wallet, which downloads images from a public URL.
  app.get("/api/public/brand/:businessId/:kind", async (c) => {
    const kind = c.req.param("kind")
    if (kind !== "logo" && kind !== "strip") return c.notFound()
    const business = (await pool.query<{ data: Business }>("select data from businesses where pk = $1", [c.req.param("businessId")])).rows[0]?.data
    const dataUrl = kind === "logo" ? business?.brand.logo : business?.brand.strip
    const match = dataUrl?.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/)
    if (!match) return kind === "logo" ? c.redirect("/brand/loyaloop-icon.png", 302) : c.notFound()
    return c.body(Buffer.from(match[2], "base64"), 200, { "content-type": match[1], "cache-control": "public, max-age=3600" })
  })

  // Mercado Pago Point: notifications to LoyaLoop's application and the owner's «Conectar» link.
  app.post("/api/webhooks/mercadopago", (c) => (mercadoPago ? mercadoPago.notification(c) : c.json({ ok: true })))
  app.get("/api/integrations/mercadopago/start", (c) => (mercadoPago ? mercadoPago.oauthStart(c) : c.notFound()))
  app.get("/api/integrations/mercadopago/callback", (c) => (mercadoPago ? mercadoPago.oauthCallback(c) : c.notFound()))
  app.post("/api/webhooks/mercadopago/:businessId", (c) => mercadoPagoWebhook(c, { pool, config }))

  // Monthly charge: Mercado Pago notifications and the owner's way back from its checkout.
  const system = createService(store, {
    now,
    session: async () => null,
    setSession: async () => undefined,
    device: () => null,
    setDevice: () => undefined,
    hash: hashPassword,
    verify: verifyPassword,
    preview: config.preview,
    simulator: config.simulator,
    baseUrl: config.publicUrl,
    messenger,
    wallets,
    subscriptions,
  })
  app.post("/api/webhooks/billing", (c) => billingWebhook(c, config, (topic, id) => system.billingNotification(topic, id)))
  app.get("/api/billing/return", (c) => c.redirect("/#/panel/plan?pago=1", 302))

  appleRoutes(app, wallets?.apple ?? null)

  app.all("/api/*", (c) => c.json({ error: { message: "No encontrado.", code: "not_found" } }, 404))

  // The web app (built with `pnpm build`). Hash routing: every page is index.html.
  app.use("/assets/*", async (c, next) => {
    await next()
    if (c.res.status === 200) c.header("Cache-Control", "public, max-age=31536000, immutable")
  })
  app.use("/*", serveStatic({ root: config.staticDir }))
  app.get("*", serveStatic({ root: config.staticDir, path: "index.html" }))

  return app
}
