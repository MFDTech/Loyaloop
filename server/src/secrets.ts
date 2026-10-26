// Encrypts the businesses' payment credentials and signs connect links with
// INTEGRATIONS_KEY (64 hex characters = 32 bytes). AES-256-GCM: tampering fails.

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export class Secrets {
  private readonly key: Buffer

  constructor(hexKey: string) {
    if (!/^[0-9a-f]{64}$/i.test(hexKey)) throw new Error("INTEGRATIONS_KEY debe tener 64 caracteres hexadecimales (openssl rand -hex 32).")
    this.key = Buffer.from(hexKey, "hex")
  }

  encrypt(text: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", this.key, iv)
    const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".")
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(".")
    if (version !== "v1" || !iv || !tag || !data) throw new Error("Credencial cifrada no válida.")
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
  }

  sign(text: string): string {
    return createHmac("sha256", this.key).update(text).digest("base64url").slice(0, 32)
  }

  verify(text: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(text))
    const given = Buffer.from(signature || "")
    return given.length === expected.length && timingSafeEqual(given, expected)
  }
}
