// PassKit web service (Apple's "Wallet Passes Web Service Reference") plus the
// customer's download link. Everything lives under /api/apple.

import type { Context, Hono } from "hono"
import type { AppleWebService, ApplePassFile } from "./index"

const authToken = (c: Context) => c.req.header("authorization")?.match(/^ApplePass (\S+)$/)?.[1] || ""

function passResponse(c: Context, file: ApplePassFile, download: boolean) {
  return c.body(new Uint8Array(file.data), 200, {
    "content-type": "application/vnd.apple.pkpass",
    "last-modified": file.lastModified.toUTCString(),
    "cache-control": "no-store",
    ...(download ? { "content-disposition": 'attachment; filename="tarjeta.pkpass"' } : {}),
  })
}

export function appleRoutes(app: Hono, apple: AppleWebService | null) {
  const off = (c: Context) => c.json({ error: { message: "Apple Wallet todavía no está disponible.", code: "not_found" } }, 404)

  // The "Agregar a Apple Wallet" button: Safari opens the file and shows the pass.
  app.get("/api/apple/download/:serial", async (c) => {
    if (!apple) return off(c)
    const file = await apple.download(c.req.param("serial"), c.req.query("t") || "")
    if (!file) return c.text("Esta tarjeta no existe o el enlace ya no es válido.", 404)
    return passResponse(c, file, true)
  })

  const v1 = "/api/apple/v1"

  app.post(`${v1}/devices/:device/registrations/:passType/:serial`, async (c) => {
    if (!apple || c.req.param("passType") !== apple.passTypeId) return c.body(null, 404)
    const body = (await c.req.json().catch(() => ({}))) as { pushToken?: unknown }
    if (typeof body.pushToken !== "string" || !body.pushToken) return c.body(null, 400)
    const result = await apple.register(c.req.param("device"), c.req.param("serial"), authToken(c), body.pushToken)
    if (!result) return c.body(null, 401)
    return c.body(null, result === "created" ? 201 : 200)
  })

  app.delete(`${v1}/devices/:device/registrations/:passType/:serial`, async (c) => {
    if (!apple || c.req.param("passType") !== apple.passTypeId) return c.body(null, 404)
    return c.body(null, (await apple.unregister(c.req.param("device"), c.req.param("serial"), authToken(c))) ? 200 : 401)
  })

  app.get(`${v1}/devices/:device/registrations/:passType`, async (c) => {
    if (!apple || c.req.param("passType") !== apple.passTypeId) return c.body(null, 404)
    const result = await apple.updatedSerials(c.req.param("device"), c.req.query("passesUpdatedSince"))
    return result ? c.json(result) : c.body(null, 204)
  })

  app.get(`${v1}/passes/:passType/:serial`, async (c) => {
    if (!apple || c.req.param("passType") !== apple.passTypeId) return c.body(null, 404)
    const file = await apple.pass(c.req.param("serial"), authToken(c))
    if (!file) return c.body(null, 401)
    // No 304 on purpose: HTTP dates have one-second precision and two changes in
    // the same second would leave the old pass on the phone. Wallet only asks for
    // passes that changed, so the full answer costs little.
    return passResponse(c, file, false)
  })

  // Wallet reports problems with our service here; they go to the server log.
  app.post(`${v1}/log`, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { logs?: unknown }
    if (Array.isArray(body.logs)) for (const line of body.logs.slice(0, 20)) console.warn("[apple]", String(line).slice(0, 500))
    return c.body(null, 200)
  })
}
