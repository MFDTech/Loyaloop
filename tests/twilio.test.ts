// Registration codes through Twilio Verify, against a fake Twilio (no network).
import { describe, expect, it } from "vitest"
import { createMemoryStore } from "../src/lib/memoryStore"
import { createSeed } from "../src/lib/seed"
import { createService, type Context, type PhoneVerifier } from "../src/lib/service"
import type { DB, Session } from "../src/lib/types"
import { twilioVerifier } from "../server/src/twilio"

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
    const sent = await api.sendCode("AFF7Q2", "55 1234 9876", "new")
    expect(sent.previewCode).toBe("") // even with PREVIEW on, the code only goes to the phone
    expect(twilio.calls[0]).toMatchObject({
      url: "https://verify.twilio.com/v2/Services/VA456/Verifications",
      auth: `Basic ${Buffer.from("AC123:secreto").toString("base64")}`,
      form: { To: "+525512349876", Channel: "sms", Locale: "es" },
    })
    await expect(api.completeRegistration("AFF7Q2", person, "111111")).rejects.toThrow(/no coincide. Te quedan 4/)
    const done = await api.completeRegistration("AFF7Q2", person, "482913")
    expect(done.created).toBe(true)
    // Twilio already used the code: it cannot be replayed.
    await expect(api.completeRegistration("AFF7Q2", person, "482913")).rejects.toThrow(/venció/)
  })

  it("does not ask Twilio after too many wrong tries", async () => {
    const twilio = fakeTwilio()
    const api = setup(twilioVerifier({ ...options, fetch: twilio.fetch }))
    await api.sendCode("AFF7Q2", person.phone, "new")
    for (let i = 0; i < 5; i++) await api.completeRegistration("AFF7Q2", person, "000000").catch(() => undefined)
    const checks = twilio.calls.filter((c) => c.url.endsWith("/VerificationCheck")).length
    await expect(api.completeRegistration("AFF7Q2", person, "482913")).rejects.toThrow(/Demasiados intentos/)
    expect(twilio.calls.filter((c) => c.url.endsWith("/VerificationCheck")).length).toBe(checks)
  })

  it("explains a failed send without exposing Twilio's error", async () => {
    const twilio = fakeTwilio({ failStart: true })
    const api = setup(twilioVerifier({ ...options, fetch: twilio.fetch }))
    await expect(api.sendCode("AFF7Q2", person.phone, "new")).rejects.toThrow(/No pudimos enviar el código/)
  })

  it("can use WhatsApp as the channel", async () => {
    const twilio = fakeTwilio()
    await twilioVerifier({ ...options, channel: "whatsapp", fetch: twilio.fetch }).start("5512349876")
    expect(twilio.calls[0].form.Channel).toBe("whatsapp")
  })
})
