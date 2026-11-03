import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto"

const scrypt = (password: string, salt: Buffer, length: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, length, options, (error, key) => (error ? reject(error) : resolve(key))))

const N = 32768
const r = 8
const p = 1
const LENGTH = 64
const MAXMEM = 64 * 1024 * 1024

/** scrypt$N$r$p$salt$hash, all in base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize("NFKC"), salt, LENGTH, { N, r, p, maxmem: MAXMEM })
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const [, n, rr, pp, salt, hash] = parts
  const expected = Buffer.from(hash, "base64url")
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(rr), p: Number(pp), maxmem: MAXMEM })
  return key.length === expected.length && timingSafeEqual(key, expected)
}
