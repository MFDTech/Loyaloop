// Registration codes by WhatsApp with Meta's Cloud API (no middleman).
// LoyaLoop creates the 6-digit code and sends it with an approved
// *authentication* template (body "{{1}} es tu código de verificación." plus a
// "Copiar código" button). Docs:
// https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates

export interface WhatsAppOptions {
  /** Permanent token of a system user with whatsapp_business_messaging. */
  token: string
  /** Id of the WhatsApp phone number (WhatsApp Manager → API setup). */
  phoneNumberId: string
  /** Name of the approved authentication template. */
  template: string
  /** Template language, e.g. es_MX. */
  language: string
  apiVersion?: string
  fetch?: typeof fetch
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message)
  }
}

/** Mexican mobile numbers for WhatsApp: country code 52 and the 10 digits. */
export const toWhatsApp = (phone: string) => `52${phone}`

export function whatsappCodeSender(options: WhatsAppOptions) {
  const http = options.fetch || fetch
  const url = `https://graph.facebook.com/${options.apiVersion || "v22.0"}/${encodeURIComponent(options.phoneNumberId)}/messages`
  return async function sendCode(phone: string, code: string) {
    const response = await http(url, {
      method: "POST",
      headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toWhatsApp(phone),
        type: "template",
        template: {
          name: options.template,
          language: { code: options.language },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            // The "Copiar código" button carries the same code.
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number } }
      throw new WhatsAppError(`WhatsApp ${response.status}: ${body.error?.message || "error"}`, response.status, body.error?.code)
    }
  }
}
