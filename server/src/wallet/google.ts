// Google Wallet: one loyalty class per business (design and rules) and one
// loyalty object per customer (balance and QR). Docs:
// https://developers.google.com/wallet/retail/loyalty-cards

import { createSign } from "node:crypto"
import { readFileSync } from "node:fs"
import { cardFrom } from "../../../src/lib/card"
import { backFields } from "../../../src/lib/passText"
import type { Business, Customer, Program, Reward } from "../../../src/lib/types"

const API = "https://walletobjects.googleapis.com/walletobjects/v1"
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer"

export interface ServiceAccount {
  client_email: string
  private_key: string
}

export interface GoogleWalletOptions {
  issuerId: string
  account: ServiceAccount
  /** Public https address of LoyaLoop, e.g. https://app.loyaloop.mx/ */
  publicUrl: string
  fetch?: typeof fetch
  now?: () => number
}

export interface PassData {
  business: Business
  program: Program
  rewards: Reward[]
  customer?: Customer
}

export class GoogleWalletError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url")

export function signJwt(claims: object, privateKey: string): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const body = b64url(JSON.stringify(claims))
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey)
  return `${head}.${body}.${b64url(signature)}`
}

export function loadServiceAccount(file: string): ServiceAccount {
  const json = JSON.parse(readFileSync(file, "utf8")) as ServiceAccount
  if (!json.client_email || !json.private_key) throw new Error("El archivo de la cuenta de servicio de Google no tiene client_email o private_key.")
  return json
}

/** Google only accepts ids with letters, numbers, ".", "_" and "-". */
const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "_")
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export class GoogleWallet {
  private token: { value: string; expires: number } | null = null
  private readonly http: typeof fetch
  private readonly now: () => number

  constructor(readonly options: GoogleWalletOptions) {
    this.http = options.fetch || fetch
    this.now = options.now || Date.now
  }

  classId(businessId: string) {
    return `${this.options.issuerId}.ll_${safe(businessId)}`
  }

  objectId(customerId: string) {
    return `${this.options.issuerId}.ll_${safe(customerId)}`
  }

  private image(businessId: string, kind: "logo" | "strip", description: string) {
    return {
      sourceUri: { uri: `${this.options.publicUrl}api/public/brand/${encodeURIComponent(businessId)}/${kind}` },
      contentDescription: { defaultValue: { language: "es-MX", value: cut(description, 60) } },
    }
  }

  buildClass({ business, program, rewards }: PassData) {
    const card = cardFrom(business, program, rewards)
    const name = cut(card.businessName, 20)
    return {
      id: this.classId(business.id),
      issuerName: name,
      programName: card.type === "stamps" ? "Tarjeta de sellos" : card.type === "tiers" ? "Club de niveles" : "Programa de lealtad",
      programLogo: this.image(business.id, "logo", card.businessName),
      ...(business.brand.strip ? { heroImage: this.image(business.id, "strip", card.businessName) } : {}),
      hexBackgroundColor: /^#[\da-f]{6}$/i.test(business.brand.color) ? business.brand.color : "#8A2E12",
      countryCode: "MX",
      reviewStatus: "UNDER_REVIEW",
      multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
      textModulesData: backFields(card)
        .slice(0, 10)
        .map((f, i) => ({ id: `info_${i}`, header: f.label, body: f.value })),
    }
  }

  buildObject({ business, program, rewards, customer }: PassData) {
    if (!customer) throw new Error("Falta el cliente")
    const stamps = program.type === "stamps"
    const tier = program.tiers.find((t) => t.id === customer.tierId)
    const earned = customer.earnedRewards.length
    const secondary =
      program.type === "tiers" && tier
        ? { label: "Nivel", balance: { string: cut(tier.name, 7) } }
        : earned
          ? { label: "Premios", balance: { int: earned } }
          : undefined
    const nextReward = !stamps ? rewards.filter((r) => r.active && r.cost > customer.points).sort((a, b) => a.cost - b.cost)[0] : undefined
    return {
      id: this.objectId(customer.id),
      classId: this.classId(business.id),
      state: "ACTIVE",
      accountId: customer.token,
      accountName: cut(customer.name.split(" ")[0] || customer.name, 20),
      loyaltyPoints: stamps ? { label: "Sellos", balance: { string: `${customer.stamps}/${program.stampGoal}` } } : { label: "Puntos", balance: { int: customer.points } },
      ...(secondary ? { secondaryLoyaltyPoints: secondary } : {}),
      barcode: { type: "QR_CODE", value: customer.token, alternateText: customer.token },
      textModulesData: nextReward ? [{ id: "next", header: "Tu siguiente recompensa", body: `${nextReward.name}: te faltan ${nextReward.cost - customer.points} puntos.` }] : [],
    }
  }

  /** Link that opens Google Wallet with the card. The object must already exist. */
  saveUrl(objectId: string, classId: string) {
    const origin = new URL(this.options.publicUrl).origin
    const jwt = signJwt(
      {
        iss: this.options.account.client_email,
        aud: "google",
        typ: "savetowallet",
        iat: Math.floor(this.now() / 1000),
        origins: [origin],
        payload: { loyaltyObjects: [{ id: objectId, classId }] },
      },
      this.options.account.private_key,
    )
    return `https://pay.google.com/gp/v/save/${jwt}`
  }

  private async accessToken() {
    if (this.token && this.token.expires > this.now() + 60_000) return this.token.value
    const iat = Math.floor(this.now() / 1000)
    const assertion = signJwt({ iss: this.options.account.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }, this.options.account.private_key)
    const response = await this.http("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    })
    const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string }
    if (!response.ok || !body.access_token) throw new GoogleWalletError(`Google no aceptó la cuenta de servicio: ${body.error_description || response.status}`, response.status)
    this.token = { value: body.access_token, expires: this.now() + (body.expires_in || 3600) * 1000 }
    return body.access_token
  }

  private async call(method: string, path: string, body?: unknown) {
    const response = await this.http(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new GoogleWalletError(`Google Wallet ${method} ${path}: ${detail.error?.message || response.status}`, response.status)
    }
    return response.json().catch(() => ({}))
  }

  /** Creates the resource, or updates it if it already exists. */
  private async upsert(kind: "loyaltyClass" | "loyaltyObject", resource: { id: string }) {
    try {
      await this.call("POST", `/${kind}`, resource)
    } catch (error) {
      if (!(error instanceof GoogleWalletError) || error.status !== 409) throw error
      await this.call("PATCH", `/${kind}/${encodeURIComponent(resource.id)}`, resource)
    }
  }

  upsertClass(data: PassData) {
    return this.upsert("loyaltyClass", this.buildClass(data))
  }

  upsertObject(data: PassData) {
    return this.upsert("loyaltyObject", this.buildObject(data))
  }

  /** A message on the pass. TEXT_AND_NOTIFY also shows a notification on the phone. */
  async addMessage(customerId: string, message: { id: string; header: string; body: string }) {
    try {
      await this.call("POST", `/loyaltyObject/${encodeURIComponent(this.objectId(customerId))}/addMessage`, {
        message: { id: safe(message.id), header: cut(message.header, 40), body: cut(message.body, 200), messageType: "TEXT_AND_NOTIFY" },
      })
    } catch (error) {
      // A retry of a message Google already has (the job failed on Apple's side).
      if (!(error instanceof GoogleWalletError) || error.status !== 409) throw error
    }
  }
}
