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
  /** LoyaLoop's Mercado Pago application, for «Conectar con Mercado Pago» (OAuth). */
  mercadoPagoClientId: string
  mercadoPagoClientSecret: string
  /** 64 hex characters: encrypts the businesses' Mercado Pago tokens and signs connect links. */
  integrationsKey: string
  /** LoyaLoop's own Mercado Pago account, to charge businesses every month (subscriptions). */
  billingAccessToken: string
  billingWebhookSecret: string
  /** Google Wallet issuer id (Google Pay & Wallet Console) and service account key file. */
  googleWalletIssuerId: string
  googleWalletKeyFile: string
  /** Resend API key and sender. Without a key, emails only go to the log. */
  resendApiKey: string
  emailFrom: string
  emailReplyTo: string
  /** Apple Wallet: Pass Type ID, Team ID and PEM files of the certificate, its key and Apple's WWDR certificate. */
  applePassTypeId: string
  appleTeamId: string
  applePassCert: string
  applePassKey: string
  applePassKeyPassphrase: string
  appleWwdrCert: string
  /** Twilio Verify for registration codes: account, auth token, service (VA…) and channel. */
  twilioAccountSid: string
  twilioAuthToken: string
  twilioVerifySid: string
  twilioVerifyChannel: "sms" | "whatsapp"
  /** WhatsApp Cloud API (Meta) for registration codes: token, phone number id and approved template. */
  whatsappToken: string
  whatsappPhoneNumberId: string
  whatsappTemplate: string
  whatsappTemplateLanguage: string
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
    mercadoPagoClientId: env.MERCADOPAGO_CLIENT_ID || "",
    mercadoPagoClientSecret: env.MERCADOPAGO_CLIENT_SECRET || "",
    integrationsKey: env.INTEGRATIONS_KEY || "",
    billingAccessToken: env.BILLING_MP_ACCESS_TOKEN || "",
    billingWebhookSecret: env.BILLING_MP_WEBHOOK_SECRET || "",
    googleWalletIssuerId: env.GOOGLE_WALLET_ISSUER_ID || "",
    googleWalletKeyFile: env.GOOGLE_WALLET_KEY_FILE || "",
    resendApiKey: env.RESEND_API_KEY || "",
    emailFrom: env.EMAIL_FROM || "LoyaLoop <notificaciones@loyaloop.com.mx>",
    emailReplyTo: env.EMAIL_REPLY_TO || "",
    applePassTypeId: env.APPLE_PASS_TYPE_ID || "",
    appleTeamId: env.APPLE_TEAM_ID || "",
    applePassCert: env.APPLE_PASS_CERT || "",
    applePassKey: env.APPLE_PASS_KEY || "",
    applePassKeyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE || "",
    appleWwdrCert: env.APPLE_WWDR_CERT || "",
    twilioAccountSid: env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: env.TWILIO_AUTH_TOKEN || "",
    twilioVerifySid: env.TWILIO_VERIFY_SID || "",
    twilioVerifyChannel: env.TWILIO_VERIFY_CHANNEL === "whatsapp" ? "whatsapp" : "sms",
    whatsappToken: env.WHATSAPP_TOKEN || "",
    whatsappPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
    whatsappTemplate: env.WHATSAPP_TEMPLATE || "codigo_registro",
    whatsappTemplateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE || "es_MX",
  }
}
