// Registration codes with Twilio Verify: Twilio creates the code, sends it by
// SMS (or WhatsApp) and checks it. No phone number to buy, and Fraud Guard
// blocks SMS pumping on the public registration form.
// Docs: https://www.twilio.com/docs/verify/api

import type { PhoneVerifier } from "../../src/lib/service"

export interface TwilioVerifyOptions {
  accountSid: string
  authToken: string
  /** Verify service id, starts with VA. */
  serviceSid: string
  channel: "sms" | "whatsapp"
  fetch?: typeof fetch
}

/** Mexican mobile numbers in E.164: +52 and the 10 digits. */
export const toE164 = (phone: string) => `+52${phone}`

export class TwilioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message)
  }
}

export function twilioVerifier(options: TwilioVerifyOptions): PhoneVerifier {
  const http = options.fetch || fetch
  const base = `https://verify.twilio.com/v2/Services/${encodeURIComponent(options.serviceSid)}`
  const auth = `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString("base64")}`

  async function post(path: string, form: Record<string, string>) {
    const response = await http(`${base}${path}`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    })
    const body = (await response.json().catch(() => ({}))) as { status?: string; message?: string; code?: number }
    return { response, body }
  }

  return {
    async start(phone) {
      const { response, body } = await post("/Verifications", { To: toE164(phone), Channel: options.channel, Locale: "es" })
      if (!response.ok) throw new TwilioError(`Twilio ${response.status}: ${body.message || "error"}`, response.status, body.code)
    },
    async check(phone, code) {
      const { response, body } = await post("/VerificationCheck", { To: toE164(phone), Code: code })
      // 404: no pending code for this number (expired, already used or too many tries).
      if (response.status === 404) return false
      if (!response.ok) throw new TwilioError(`Twilio ${response.status}: ${body.message || "error"}`, response.status, body.code)
      return body.status === "approved"
    },
  }
}
