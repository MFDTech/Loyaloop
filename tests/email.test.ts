import { describe, expect, it } from "vitest"
import { createMemoryStore } from "../src/lib/memoryStore"
import { createSeed } from "../src/lib/seed"
import { createService, type Context, type EmailMessage } from "../src/lib/service"
import type { DB, Session } from "../src/lib/types"
import { renderEmail, resendEmail } from "../server/src/messenger"

function setup(options: { email: boolean; sms: boolean; preview: boolean }) {
  let db: DB = createSeed()
  let session: Session | null = null
  const emails: EmailMessage[] = []
  const sms: string[] = []
  const ctx: Context = {
    now: Date.now,
    session: async () => session,
    setSession: async (s) => void (session = s),
    device: () => null,
    setDevice: () => undefined,
    hash: async (p) => p,
    verify: async (p, s) => p === s,
    preview: options.preview,
    simulator: false,
    baseUrl: "https://loyaloop.com.mx/",
    messenger: {
      channels: { email: options.email, sms: options.sms },
      email: async (m) => void emails.push(m),
      sms: async (_phone, text) => void sms.push(text),
    },
  }
  const api = createService(createMemoryStore({ load: () => db, save: (next) => (db = next) }), ctx)
  return { api, emails, sms }
}

describe("emails", () => {
  it("sends the password reset by email and never shows the link outside preview", async () => {
    const { api, emails } = setup({ email: true, sms: false, preview: false })
    expect(await api.requestPasswordReset("dueno@affair.test")).toEqual({})
    expect(emails).toHaveLength(1)
    expect(emails[0].to).toBe("dueno@affair.test")
    expect(emails[0].action?.url).toMatch(/^https:\/\/loyaloop\.com\.mx\/#\/restablecer\/[A-Z0-9]{32}$/)
    // Unknown accounts get the same answer and no email.
    expect(await api.requestPasswordReset("nadie@ejemplo.test")).toEqual({})
    expect(emails).toHaveLength(1)
  })

  it("does not leak the reset link when there is no email provider", async () => {
    const { api, emails } = setup({ email: false, sms: false, preview: false })
    expect(await api.requestPasswordReset("dueno@affair.test")).toEqual({})
    expect(emails).toHaveLength(0)
  })

  it("emails the invitation and still gives the link to the owner", async () => {
    const { api, emails } = setup({ email: true, sms: false, preview: false })
    await api.login("dueno@affair.test", "prueba123")
    const { link } = await api.inviteMember({ name: "Nuevo Cajero", email: "nuevo@affair.test", role: "cashier", phone: "", excluded: true })
    expect(emails[0]).toMatchObject({ to: "nuevo@affair.test", subject: "Te invitaron al panel de Affair Love Suites" })
    expect(emails[0].action?.url).toBe(`https://loyaloop.com.mx/${link}`)
  })

  it("tells LoyaLoop about every call request from the site", async () => {
    const { api, emails } = setup({ email: true, sms: false, preview: false })
    await api.submitLead({ name: "Laura", company: "Café Norte", email: "laura@cafenorte.test", phone: "5511112222", branches: "2 a 5 sucursales", preferredDate: "2026-11-03", preferredTime: "Mañana · 9:00 a 12:00", notes: "Usamos Clip" })
    expect(emails).toHaveLength(1)
    expect(emails[0]).toMatchObject({ to: "admin@loyaloop.test", subject: "Nueva solicitud de llamada: Café Norte" })
    expect(emails[0].paragraphs.join(" ")).toContain("laura@cafenorte.test")
    expect(emails[0].action?.url).toBe("https://loyaloop.com.mx/#/admin/solicitudes")
  })

  it("refuses to register customers when codes cannot be sent", async () => {
    const { api } = setup({ email: true, sms: false, preview: false })
    await expect(api.sendCode("ESQR4M", "5512345678", "new")).rejects.toThrow(/no podemos enviar códigos/)
    const withSms = setup({ email: false, sms: true, preview: false })
    const sent = await withSms.api.sendCode("ESQR4M", "5512345678", "new")
    expect(sent.previewCode).toBe("")
    expect(withSms.sms[0]).toMatch(/^\d{6} es tu código de Café La Esquina/)
  })

  it("renders a safe HTML email with a plain text version", () => {
    const { html, text } = renderEmail(
      { to: "a@b.test", subject: "x", heading: "Hola <script>", paragraphs: ["Uno & dos"], action: { label: "Entrar", url: "https://loyaloop.com.mx/#/x?a=1&b=2" } },
      "https://loyaloop.com.mx/brand/loyaloop-icon.png",
    )
    expect(html).toContain("Hola &lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain('href="https://loyaloop.com.mx/#/x?a=1&amp;b=2"')
    expect(text).toContain("Entrar: https://loyaloop.com.mx/#/x?a=1&b=2")
  })

  it("calls Resend with the key, sender and both versions", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const send = resendEmail({
      apiKey: "re_prueba",
      from: "LoyaLoop <notificaciones@loyaloop.com.mx>",
      replyTo: "hola@loyaloop.com.mx",
      logoUrl: "https://loyaloop.com.mx/brand/loyaloop-icon.png",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return Response.json({ id: "123" })
      }) as unknown as typeof fetch,
    })
    await send({ to: "a@b.test", subject: "Prueba", heading: "Hola", paragraphs: ["Texto"] })
    expect(calls[0].url).toBe("https://api.resend.com/emails")
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer re_prueba")
    const body = JSON.parse(String(calls[0].init.body))
    expect(body).toMatchObject({ from: "LoyaLoop <notificaciones@loyaloop.com.mx>", to: ["a@b.test"], subject: "Prueba", reply_to: "hola@loyaloop.com.mx" })
    expect(body.html).toContain("<h1")
    expect(body.text).toContain("Texto")

    const failing = resendEmail({ apiKey: "x", from: "a@b.c", logoUrl: "", fetch: (async () => Response.json({ message: "Domain not verified" }, { status: 403 })) as unknown as typeof fetch })
    await expect(failing({ to: "a@b.test", subject: "x", heading: "x", paragraphs: [] })).rejects.toThrow(/Domain not verified/)
  })
})
