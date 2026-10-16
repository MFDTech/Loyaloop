// Apple Wallet: builds and signs .pkpass files and sends update pushes.
// Docs: Wallet Developer Guide and PassKit Web Service Reference.
//
// A .pkpass is a zip with pass.json, PNG images, manifest.json (SHA-1 of each
// file) and signature (PKCS#7 detached signature of manifest.json made with
// the Pass Type ID certificate, including Apple's WWDR intermediate).

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import http2 from "node:http2"
import forge from "node-forge"
import JSZip from "jszip"
import sharp from "sharp"
import { cardFrom } from "../../../src/lib/card"
import { backFields } from "../../../src/lib/passText"
import { inkFor } from "../../../src/lib/util"
import type { PassData } from "./google"

export interface AppleCredentials {
  passTypeId: string
  teamId: string
  /** PEM of the Pass Type ID certificate. */
  cert: string
  /** PEM of its private key. */
  key: string
  keyPassphrase?: string
  /** PEM of Apple's WWDR intermediate certificate (G4). */
  wwdr: string
}

export type PushResult = { ok: true } | { ok: false; status: number; reason: string }
export type Pusher = (pushToken: string, topic: string) => Promise<PushResult>

export interface AppleWalletOptions extends AppleCredentials {
  /** https://loyaloop.com.mx/ — the web service lives under api/apple. */
  publicUrl: string
  /** PNG used as icon when the business has no logo. */
  defaultIcon: Buffer
  pusher?: Pusher
}

export interface ApplePassInput extends PassData {
  serial: string
  authToken: string
  /** Latest notice for this customer; shown on the back and announced on the lock screen. */
  notice?: { id: string; message: string }
}

const rgb = (hex: string) => {
  const valid = /^#[\da-f]{6}$/i.test(hex) ? hex : "#8A2E12"
  const [r, g, b] = (valid.slice(1).match(/../g) || []).map((v) => parseInt(v, 16))
  return `rgb(${r}, ${g}, ${b})`
}

/** Reads a data URL logo (PNG, JPEG, WebP or SVG) into a Buffer sharp can open. */
function imageFrom(dataUrl?: string): Buffer | null {
  const match = dataUrl?.match(/^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/)
  return match ? Buffer.from(match[2], "base64") : null
}

const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/** Stamp strip drawn on the server, like the preview in the app. */
function stampsSvg(count: number, goal: number, color: string, ink: string, scale: number) {
  const width = 375 * scale
  const height = 123 * scale
  const perRow = goal > 8 ? Math.ceil(goal / 2) : goal
  const rows = Math.ceil(goal / perRow)
  const gap = 10 * scale
  const size = Math.min((width - gap * (perRow + 1)) / perRow, (height - gap * (rows + 1)) / rows)
  const r = size / 2
  const offsetX = (width - (perRow * size + (perRow - 1) * gap)) / 2
  const offsetY = (height - (rows * size + (rows - 1) * gap)) / 2
  let circles = ""
  for (let i = 0; i < goal; i++) {
    const cx = offsetX + (i % perRow) * (size + gap) + r
    const cy = offsetY + Math.floor(i / perRow) * (size + gap) + r
    const on = i < count
    circles += `<circle cx="${cx}" cy="${cy}" r="${r - 2 * scale}" fill="${on ? ink : "none"}" stroke="${ink}" stroke-width="${2.5 * scale}" opacity="${on ? 1 : 0.75}"/>`
    if (i === goal - 1 && !on)
      circles += `<text x="${cx}" y="${cy + r * 0.32}" font-family="Helvetica, Arial, sans-serif" font-size="${r * 0.9}" font-weight="700" text-anchor="middle" fill="${ink}">★</text>`
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${escapeXml(color)}"/>${circles}</svg>`)
}

export class AppleWallet {
  private readonly signer: { cert: forge.pki.Certificate; key: forge.pki.PrivateKey; wwdr: forge.pki.Certificate }

  constructor(readonly options: AppleWalletOptions) {
    const key = options.keyPassphrase ? forge.pki.decryptRsaPrivateKey(options.key, options.keyPassphrase) : forge.pki.privateKeyFromPem(options.key)
    if (!key) throw new Error("No se pudo leer la llave privada del certificado de Apple (¿contraseña correcta?).")
    this.signer = { cert: forge.pki.certificateFromPem(options.cert), key, wwdr: forge.pki.certificateFromPem(options.wwdr) }
  }

  get webServiceUrl() {
    return `${this.options.publicUrl}api/apple`
  }

  downloadUrl(serial: string, authToken: string) {
    return `${this.webServiceUrl}/download/${encodeURIComponent(serial)}?t=${encodeURIComponent(authToken)}`
  }

  passJson(input: ApplePassInput) {
    const { business, program, rewards, customer } = input
    if (!customer) throw new Error("Falta el cliente")
    const card = cardFrom(business, program, rewards)
    const { ink } = inkFor(business.brand.color)
    const label = ink === "#FFFFFF" ? "rgb(255, 255, 255)" : "rgb(25, 22, 19)"
    const stamps = program.type === "stamps"
    const tier = program.tiers.find((t) => t.id === customer.tierId)
    const earned = customer.earnedRewards.length
    const notify = program.notify
    const balance = stamps
      ? { key: "balance", label: "SELLOS", value: `${customer.stamps}/${program.stampGoal}`, ...(notify.pointsEarned ? { changeMessage: "Llevas %@ sellos" } : {}) }
      : { key: "balance", label: "PUNTOS", value: customer.points, ...(notify.pointsEarned ? { changeMessage: "Ahora tienes %@ puntos" } : {}) }
    const secondary: object[] = [{ key: "member", label: "MIEMBRO", value: customer.name.split(" ")[0] || customer.name }]
    if (program.type === "tiers") secondary.push({ key: "tier", label: "NIVEL", value: tier?.name || program.tiers[0]?.name || "—", ...(notify.tierChange ? { changeMessage: "Subiste a nivel %@" } : {}) })
    if (earned || stamps) secondary.push({ key: "earned", label: "POR CANJEAR", value: earned, ...(notify.rewardAvailable ? { changeMessage: "Tienes %@ recompensas para canjear" } : {}) })
    const back = backFields(card).map((f, i) => ({ key: `info_${i}`, label: f.label, value: f.value }))
    return {
      formatVersion: 1,
      passTypeIdentifier: this.options.passTypeId,
      teamIdentifier: this.options.teamId,
      serialNumber: input.serial,
      authenticationToken: input.authToken,
      webServiceURL: this.webServiceUrl,
      organizationName: card.businessName,
      description: `Tarjeta de lealtad de ${card.businessName}`,
      logoText: card.businessName,
      foregroundColor: ink === "#FFFFFF" ? "rgb(255, 255, 255)" : "rgb(25, 22, 19)",
      labelColor: label,
      backgroundColor: rgb(business.brand.color),
      sharingProhibited: true,
      barcodes: [{ format: "PKBarcodeFormatQR", message: customer.token, messageEncoding: "iso-8859-1", altText: customer.token }],
      storeCard: {
        headerFields: [balance],
        ...(stamps ? {} : { primaryFields: [program.type === "tiers" ? { key: "level", label: "NIVEL", value: tier?.name || program.tiers[0]?.name || "—" } : { key: "points", label: "SALDO", value: `${customer.points} pts` }] }),
        secondaryFields: secondary,
        backFields: [
          ...(input.notice ? [{ key: "notice", label: "Último aviso", value: input.notice.message, changeMessage: "%@" }] : []),
          ...back,
        ],
      },
    }
  }

  private async images(input: ApplePassInput): Promise<Record<string, Buffer>> {
    const { business, program, customer } = input
    const logo = business.discreet ? null : imageFrom(business.brand.logo)
    const files: Record<string, Buffer> = {}
    const icon = logo || this.options.defaultIcon
    for (const [name, size] of [["icon.png", 29], ["icon@2x.png", 58], ["icon@3x.png", 87]] as const)
      files[name] = await sharp(icon).resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).flatten({ background: "#ffffff" }).png().toBuffer()
    if (logo)
      for (const [name, scale] of [["logo.png", 1], ["logo@2x.png", 2], ["logo@3x.png", 3]] as const)
        files[name] = await sharp(logo).resize(160 * scale, 50 * scale, { fit: "inside" }).png().toBuffer()
    const stripImage = imageFrom(business.brand.strip)
    const { ink } = inkFor(business.brand.color)
    for (const [name, scale] of [["strip.png", 1], ["strip@2x.png", 2], ["strip@3x.png", 3]] as const) {
      const width = 375 * scale
      const height = 123 * scale
      if (program.type === "stamps" && customer) {
        const base = sharp(stampsSvg(customer.stamps, program.stampGoal, business.brand.color, ink, scale))
        if (stripImage) {
          const background = await sharp(stripImage).resize(width, height, { fit: "cover" }).modulate({ brightness: 0.55 }).png().toBuffer()
          const overlay = stampsSvg(customer.stamps, program.stampGoal, "transparent", "#FFFFFF", scale)
          files[name] = await sharp(background).composite([{ input: await sharp(overlay).png().toBuffer() }]).png().toBuffer()
        } else files[name] = await base.png().toBuffer()
      } else if (stripImage) files[name] = await sharp(stripImage).resize(width, height, { fit: "cover" }).png().toBuffer()
    }
    return files
  }

  /** PKCS#7 detached signature of manifest.json, DER encoded. */
  sign(manifest: Buffer): Buffer {
    const p7 = forge.pkcs7.createSignedData()
    p7.content = forge.util.createBuffer(manifest.toString("binary"))
    p7.addCertificate(this.signer.cert)
    p7.addCertificate(this.signer.wwdr)
    p7.addSigner({
      key: this.signer.key as forge.pki.rsa.PrivateKey,
      certificate: this.signer.cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
      ],
    })
    p7.sign({ detached: true })
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary")
  }

  async build(input: ApplePassInput): Promise<Buffer> {
    const files: Record<string, Buffer> = { "pass.json": Buffer.from(JSON.stringify(this.passJson(input))), ...(await this.images(input)) }
    const manifest: Record<string, string> = {}
    for (const [name, data] of Object.entries(files)) manifest[name] = createHash("sha1").update(data).digest("hex")
    const manifestBuffer = Buffer.from(JSON.stringify(manifest))
    const zip = new JSZip()
    for (const [name, data] of Object.entries(files)) zip.file(name, data)
    zip.file("manifest.json", manifestBuffer)
    zip.file("signature", this.sign(manifestBuffer))
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  }

  push(pushToken: string): Promise<PushResult> {
    if (!this.options.pusher) return Promise.resolve({ ok: false, status: 0, reason: "NoPusher" })
    return this.options.pusher(pushToken, this.options.passTypeId)
  }
}

/** APNs over HTTP/2 with the Pass Type ID certificate. Wallet pushes carry an empty payload. */
export function apnsPusher(credentials: Pick<AppleCredentials, "cert" | "key" | "keyPassphrase">, host = "api.push.apple.com"): Pusher {
  let session: http2.ClientHttp2Session | null = null
  const connect = () => {
    if (!session || session.closed || session.destroyed) {
      session = http2.connect(`https://${host}`, { cert: credentials.cert, key: credentials.key, passphrase: credentials.keyPassphrase })
      session.on("error", () => (session = null))
      session.on("goaway", () => (session = null))
      session.unref()
    }
    return session
  }
  return (pushToken, topic) =>
    new Promise((resolve, reject) => {
      const request = connect().request({
        ":method": "POST",
        ":path": `/3/device/${encodeURIComponent(pushToken)}`,
        "apns-topic": topic,
        "apns-push-type": "background",
        "apns-priority": "5",
        "content-type": "application/json",
      })
      let status = 0
      let body = ""
      request.setTimeout(10_000, () => request.close(http2.constants.NGHTTP2_CANCEL))
      request.on("response", (headers) => (status = Number(headers[":status"])))
      request.on("data", (chunk) => (body += chunk))
      request.on("end", () => {
        if (status === 200) return resolve({ ok: true })
        let reason = ""
        try {
          reason = JSON.parse(body).reason || ""
        } catch {
          /* empty body */
        }
        resolve({ ok: false, status, reason: reason || "Unknown" })
      })
      request.on("error", reject)
      request.end("{}")
    })
}

export function loadAppleCredentials(files: { cert: string; key: string; wwdr: string }, rest: { passTypeId: string; teamId: string; keyPassphrase?: string }): AppleCredentials {
  return { ...rest, cert: readFileSync(files.cert, "utf8"), key: readFileSync(files.key, "utf8"), wwdr: readFileSync(files.wwdr, "utf8") }
}
