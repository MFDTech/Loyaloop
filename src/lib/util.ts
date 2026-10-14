import type { CardType, Role, TransactionKind } from "./types"

export const MINUTE = 60_000
export const DAY = 86_400_000
/** Window to pair a QR scan with a payment on the same register. */
export const MATCH_WINDOW_MS = 5 * MINUTE

export function uid(prefix = ""): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix + random.slice(0, 16)
}

/** Unambiguous characters for codes people read or type. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export function readableCode(length: number): string {
  let out = ""
  const bytes = new Uint8Array(length)
  if (typeof crypto !== "undefined") crypto.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
  return out
}

export function digits(length: number): string {
  let out = ""
  const bytes = new Uint8Array(length)
  if (typeof crypto !== "undefined") crypto.getRandomValues(bytes)
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  for (const byte of bytes) out += String(byte % 10)
  return out
}

/** Customer token shown under the QR, e.g. LL-7KQ2-M9XA. */
export function customerToken(): string {
  const code = readableCode(8)
  return `LL-${code.slice(0, 4)}-${code.slice(4)}`
}

export function normalizeToken(value: string): string {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const body = clean.startsWith("LL") ? clean.slice(2) : clean
  return body.length === 8 ? `LL-${body.slice(0, 4)}-${body.slice(4)}` : value.trim().toUpperCase()
}

/** Mexican mobile numbers: keep the 10 national digits. */
export function normalizePhone(value: string): string {
  const only = value.replace(/\D/g, "")
  if (only.length === 12 && only.startsWith("52")) return only.slice(2)
  if (only.length === 13 && only.startsWith("521")) return only.slice(3)
  return only
}

export function formatPhone(value: string): string {
  const p = normalizePhone(value)
  if (p.length !== 10) return value
  return `${p.slice(0, 2)} ${p.slice(2, 6)} ${p.slice(6)}`
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

const moneyFormat = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
})
export const money = (value: number) => moneyFormat.format(value)
const intFormat = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 })
export const int = (value: number) => intFormat.format(Math.round(value))
const decimalFormat = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 })
export const decimal = (value: number) => decimalFormat.format(value)

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
export function date(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
export function relative(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  if (diff < MINUTE) return "hace un momento"
  if (diff < 60 * MINUTE) return `hace ${Math.floor(diff / MINUTE)} min`
  if (diff < DAY) return `hace ${Math.floor(diff / (60 * MINUTE))} h`
  const days = Math.floor(diff / DAY)
  if (days === 1) return "ayer"
  if (days < 30) return `hace ${days} días`
  return date(iso)
}

export function birthdayLabel(mmdd: string): string {
  if (!/^\d{2}-\d{2}$/.test(mmdd)) return ""
  const [m, d] = mmdd.split("-").map(Number)
  return new Date(2000, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "long" })
}

export const roleLabel: Record<Role, string> = {
  admin: "Administrador LoyaLoop",
  owner: "Dueño",
  manager: "Gerente",
  cashier: "Cajero",
}

export const cardTypeLabel: Record<CardType, string> = {
  points: "Puntos",
  stamps: "Sellos",
  rewards: "Recompensas",
  tiers: "Niveles",
}

export const cardTypeHelp: Record<CardType, string> = {
  points: "El cliente acumula puntos según lo que gasta.",
  stamps: "Cada compra elegible suma un sello; al completar la tarjeta gana su recompensa.",
  rewards: "Acumula puntos y los cambia por recompensas de un catálogo.",
  tiers: "Acumula puntos y sube de nivel según su gasto de los últimos 12 meses; cada nivel multiplica sus puntos.",
}

export const kindLabel: Record<TransactionKind, string> = {
  purchase: "Compra",
  visit: "Visita",
  redeem: "Canje",
  adjust: "Ajuste",
  refund: "Devolución",
  bonus: "Bono",
  expire: "Caducidad",
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** Text color (black or white) with the best contrast on a background. */
export function inkFor(hex: string): { ink: string; contrast: number } {
  const valid = /^#[\da-f]{6}$/i.test(hex) ? hex : "#8A2E12"
  const lum = (h: string) => {
    const [r, g, b] = (h.slice(1).match(/../g) || []).map((v) => {
      const c = parseInt(v, 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const bg = lum(valid)
  const white = 1.05 / (bg + 0.05)
  const black = (bg + 0.05) / (lum("#191613") + 0.05)
  return white >= black ? { ink: "#FFFFFF", contrast: white } : { ink: "#191613", contrast: black }
}

export function csv(rows: (string | number)[][]): string {
  const escape = (value: string | number) =>
    `"${String(value)
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replace(/"/g, '""')}"`
  return "﻿" + rows.map((row) => row.map(escape).join(",")).join("\r\n")
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function plural(count: number, one: string, many: string): string {
  return `${int(count)} ${count === 1 ? one : many}`
}
