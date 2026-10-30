import type { EmailMessage, Messenger } from "../../src/lib/service"
import type { Config } from "./config"
import { twilioVerifier } from "./twilio"
import { whatsappCodeSender } from "./whatsapp"

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** Branded HTML email: works in Gmail, Outlook and Apple Mail (tables and inline styles). */
export function renderEmail(m: EmailMessage, logoUrl: string) {
  const paragraphs = m.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#3d3631">${escape(p)}</p>`).join("")
  const button = m.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 8px"><tr><td style="border-radius:10px;background:#FF6A00"><a href="${escape(m.action.url)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:700;color:#191613;text-decoration:none;font-family:Arial,sans-serif">${escape(m.action.label)}</a></td></tr></table>
       <p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#6f655c">¿El botón no funciona? Copia este enlace en tu navegador:<br><span style="word-break:break-all;color:#8A2E12">${escape(m.action.url)}</span></p>`
    : ""
  const footnote = m.footnote ? `<p style="margin:22px 0 0;font-size:14px;line-height:1.5;color:#6f655c">${escape(m.footnote)}</p>` : ""
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#F6EEDC">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6EEDC;padding:28px 12px;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px"><img src="${escape(logoUrl)}" width="44" height="44" alt="LoyaLoop" style="display:block;border-radius:10px"></td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:30px 28px">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#191613">${escape(m.heading)}</h1>
${paragraphs}${button}${footnote}
</td></tr>
<tr><td style="padding:18px 4px 0;font-size:13px;line-height:1.5;color:#6f655c">LoyaLoop · Tarjetas de lealtad en Apple Wallet y Google Wallet</td></tr>
</table></td></tr></table></body></html>`
  const text = [m.heading, "", ...m.paragraphs, ...(m.action ? ["", `${m.action.label}: ${m.action.url}`] : []), ...(m.footnote ? ["", m.footnote] : [])].join("\n")
  return { html, text }
}

/** Resend (resend.com): transactional email over HTTPS. */
export function resendEmail(options: { apiKey: string; from: string; replyTo?: string; logoUrl: string; fetch?: typeof fetch }) {
  const http = options.fetch || fetch
  return async (m: EmailMessage) => {
    const { html, text } = renderEmail(m, options.logoUrl)
    const response = await http("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: options.from, to: [m.to], subject: m.subject, html, text, ...(options.replyTo ? { reply_to: options.replyTo } : {}) }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      throw new Error(`Resend ${response.status}: ${body.message || "error"}`)
    }
  }
}

const maskPhone = (phone: string) => `${phone.slice(0, 2)}****${phone.slice(-2)}`

/** Email through Resend and registration codes through Twilio Verify, when configured. */
export function createMessenger(config: Config, http: typeof fetch = fetch): Messenger {
  const email = config.resendApiKey
    ? resendEmail({ apiKey: config.resendApiKey, from: config.emailFrom, replyTo: config.emailReplyTo || undefined, logoUrl: `${config.publicUrl}brand/loyaloop-icon.png`, fetch: http })
    : null
  const verifier =
    config.twilioAccountSid && config.twilioAuthToken && config.twilioVerifySid
      ? twilioVerifier({ accountSid: config.twilioAccountSid, authToken: config.twilioAuthToken, serviceSid: config.twilioVerifySid, channel: config.twilioVerifyChannel, fetch: http })
      : undefined
  // WhatsApp directly with Meta wins over Twilio when both are configured: it is cheaper.
  const whatsapp =
    config.whatsappToken && config.whatsappPhoneNumberId
      ? whatsappCodeSender({ token: config.whatsappToken, phoneNumberId: config.whatsappPhoneNumberId, template: config.whatsappTemplate, language: config.whatsappTemplateLanguage, fetch: http })
      : undefined
  return {
    channels: { sms: !!(verifier || whatsapp), email: !!email },
    verifier: whatsapp ? undefined : verifier,
    code: whatsapp,
    codeChannel: whatsapp ? "whatsapp" : config.twilioVerifyChannel,
    async sms(phone, text) {
      console.log(`[sms] ${maskPhone(phone)}: ${text.replace(/\d{6}/, "******")}`)
    },
    async email(message) {
      if (!email) return console.log(`[email] ${message.to}: ${message.subject}`)
      await email(message)
    },
  }
}
