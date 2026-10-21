// Registration codes through Twilio Verify, against a fake Twilio (no network).
import { describe, expect, it } from "vitest"
import { createMemoryStore } from "../src/lib/memoryStore"
import { createSeed } from "../src/lib/seed"
import { createService, type Context, type PhoneVerifier } from "../src/lib/service"
import type { DB, Session } from "../src/lib/types"
import { twilioVerifier } from "../server/src/twilio"
import { whatsappCodeSender } from "../server/src/whatsapp"

/** Minimal Twilio Verify: one pending code per number, approved once. */
function fakeTwilio(options: { failStart?: boolean } = {}) {
  const pending = new Map<string, string>()
  const calls: { url: string; auth: string; form: Record<string, string> }[] = []
  const fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const form = Object.fromEntries(new URLSearchParams(String(init?.body)))
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") || "", form })
    if (url.endsWith("/Verifications")) {
      if (options.failStart) return Response.json({ code: 60200, message: "Invalid parameter `To`" }, { status: 400 })
      pending.set(form.To, "482913")
      return Response.json({ status: "pending", to: form.To, channel: form.Channel }, { status: 201 })
    }
    if (url.endsWith("/VerificationCheck")) {
      const code = pending.get(form.To)
      if (!code) return Response.json({ code: 20404, message: "not found" }, { status: 404 })
      if (code !== form.Code) return Response.json({ status: "pending" })
      pending.delete(form.To)
      return Response.json({ status: "approved" })
    }
    return Response.json({}, { status: 404 })
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

function setup(verifier: PhoneVerifier) {
  let db: DB = createSeed()
  let session: Session | null = null
  const ctx: Context = {
    now: Date.now,
    session: async () => session,
    setSession: async (s) => void (session = s),
    device: () => null,
    setDevice: () => undefined,
    hash: async (p) => p,
    verify: async (p, s) => p === s,
    preview: true,
    simulator: false,
    baseUrl: "https://loyaloop.com.mx/",
    messenger: { channels: { sms: true, email: false }, sms: async () => undefined, email: async () => undefined, verifier },
  }
  return createService(createMemoryStore({ load: () => db, save: (next) => (db = next) }), ctx)
}

const person = { name: "Laura Prueba", phone: "5512349876", email: "", birthday: "", promotions: false, privacy: true }

describe("Twilio Verify", () => {
  const options = { accountSid: "AC123", authToken: "secreto", serviceSid: "VA456", channel: "sms" as const }

  it("sends the code through Twilio, never shows it, and registers with the right one", async () => {
    const twilio = fakeTwilio()
    const api = setup(twilioVerifier({ ...options, fetch: twilio.fetch }))
    const sent = await api.sendCode("ESQR4M", "55 1234 9876", "new")
    expect(sent.previewCode).toBe("") // even with PREVIEW on, the code only goes to the phone
    expect(twilio.calls[0]).toMatchObject({
      url: "https://verify.twilio.com/v2/Services/VA456/Verifications",
      auth: `Basic ${Buffer.from("AC123:secreto").toString("base64")}`,
      form: { To: "+525512349876", Channel: "sms", Locale: "es" },
    })
    await expect(api.completeRegistration("ESQR4M", person, "111111")).rejects.toThrow(/no coincide. Te quedan 4/)
    const done = await api.completeRegistration("ESQR4M", person, "482913")
    expect(done.created).toBe(true)
    // Twilio already used the code: it cannot be replayed.
    await expect(api.completeRegistration("ESQR4M", person, "482913")).rejects.toThrow(/venció/)
  })

  it("does not ask Twilio after too many wrong tries", async () => {
    const twilio = fakeTwilio()
    const api = setup(twilioVerifier({ ...options, fetch: twilio.fetch }))
    await api.sendCode("ESQR4M", person.phone, "new")
    for (let i = 0; i < 5; i++) await api.completeRegistration("ESQR4M", person, "000000").catch(() => undefined)
    const checks = twilio.calls.filter((c) => c.url.endsWith("/VerificationCheck")).length
    await expect(api.completeRegistration("ESQR4M", person, "482913")).rejects.toThrow(/Demasiados intentos/)
    expect(twilio.calls.filter((c) => c.url.endsWith("/VerificationCheck")).length).toBe(checks)
  })

  it("explains a failed send without exposing Twilio's error", async () => {
    const twilio = fakeTwilio({ failStart: true })
    const api = setup(twilioVerifier({ ...options, fetch: twilio.fetch }))
    await expect(api.sendCode("ESQR4M", person.phone, "new")).rejects.toThrow(/No pudimos enviar el código/)
  })

  it("can use WhatsApp as the channel", async () => {
    const twilio = fakeTwilio()
    await twilioVerifier({ ...options, channel: "whatsapp", fetch: twilio.fetch }).start("5512349876")
    expect(twilio.calls[0].form.Channel).toBe("whatsapp")
  })
})

describe("WhatsApp (Meta Cloud API)", () => {
  function fakeMeta(status = 200) {
    const calls: { url: string; auth: string; body: any }[] = []
    const fetch = (async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") || "", body: JSON.parse(String(init?.body)) })
      return status === 200
        ? Response.json({ messaging_product: "whatsapp", messages: [{ id: "wamid.1" }] })
        : Response.json({ error: { message: "Template name does not exist in the translation", code: 132001 } }, { status })
    }) as unknown as typeof globalThis.fetch
    return { fetch, calls }
  }

  function withSender(send: (phone: string, code: string) => Promise<void>) {
    let db: DB = createSeed()
    const ctx: Context = {
      now: Date.now,
      session: async () => null,
      setSession: async () => undefined,
      device: () => null,
      setDevice: () => undefined,
      hash: async (p) => p,
      verify: async (p, s) => p === s,
      preview: true,
      simulator: false,
      baseUrl: "",
      messenger: { channels: { sms: true, email: false }, sms: async () => undefined, email: async () => undefined, code: send, codeChannel: "whatsapp" },
    }
    return createService(createMemoryStore({ load: () => db, save: (next) => (db = next) }), ctx)
  }

  it("sends LoyaLoop's own code with the authentication template and checks it locally", async () => {
    const meta = fakeMeta()
    const send = whatsappCodeSender({ token: "EAAG-prueba", phoneNumberId: "1234567890", template: "codigo_registro", language: "es_MX", fetch: meta.fetch })
    const api = withSender(send)
    const sent = await api.sendCode("ESQR4M", person.phone, "new")
    expect(sent).toMatchObject({ previewCode: "", channel: "whatsapp" })
    expect(meta.calls[0].url).toBe("https://graph.facebook.com/v22.0/1234567890/messages")
    expect(meta.calls[0].auth).toBe("Bearer EAAG-prueba")
    const body = meta.calls[0].body
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "525512349876", type: "template", template: { name: "codigo_registro", language: { code: "es_MX" } } })
    const code = body.template.components[0].parameters[0].text
    expect(code).toMatch(/^\d{6}$/)
    expect(body.template.components[1]).toMatchObject({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] })
    await expect(api.completeRegistration("ESQR4M", person, code === "000000" ? "111111" : "000000")).rejects.toThrow(/no coincide/)
    expect((await api.completeRegistration("ESQR4M", person, code)).created).toBe(true)
  })

  it("explains a failed send without exposing Meta's error", async () => {
    const meta = fakeMeta(400)
    const api = withSender(whatsappCodeSender({ token: "x", phoneNumberId: "1", template: "t", language: "es_MX", fetch: meta.fetch }))
    await expect(api.sendCode("ESQR4M", person.phone, "new")).rejects.toThrow(/No pudimos enviar el código/)
  })
})
