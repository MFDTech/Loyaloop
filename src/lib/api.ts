// The pages' only door to data.
//  - With VITE_API_URL set (e.g. "/api"), every call goes to the LoyaLoop server.
//  - Without it, the same service runs in the browser over localStorage, so the
//    preview works with no server at all.

import { createMemoryStore } from "./memoryStore"
import { DB_VERSION, createSeed } from "./seed"
import { ApiError, READ_METHODS, createService, type Context, type PublicMethod, type Service } from "./service"
import type { DB, Session } from "./types"

export { ApiError }
export type * from "./service"
export type { AuditEntry, Campaign } from "./types"
export type { Audience, AutomaticEvent, NoticeEvent } from "./notices"

const API_URL: string | undefined = import.meta.env.VITE_API_URL
export const SERVER_MODE = !!API_URL

const DB_KEY = "loyaloop-db-v3"
const SESSION_KEY = "loyaloop-session"
const DEVICE_KEY = "loyaloop-device"

// ---------------------------------------------------------------- browser storage

const memory = new Map<string, string>()
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    if (value === null) memory.delete(key)
    else memory.set(key, value)
  }
}

const listeners = new Set<() => void>()
/** Pages reload their data when something changes, in this tab or another one. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function emit() {
  for (const listener of listeners) listener()
}

export function deviceToken(): string | null {
  return read(DEVICE_KEY)
}

export function forgetDevice() {
  write(DEVICE_KEY, null)
  emit()
}

// ---------------------------------------------------------------- local mode

let cache: DB | null = null
function loadLocal(): DB {
  if (cache) return cache
  const raw = read(DB_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DB
      if (parsed.version === DB_VERSION) {
        cache = parsed
        return parsed
      }
    } catch {
      /* corrupted: start again from the example data */
    }
  }
  cache = createSeed()
  write(DB_KEY, JSON.stringify(cache))
  return cache
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === DB_KEY || event.key === SESSION_KEY || event.key === DEVICE_KEY) {
      cache = null
      emit()
    }
  })
}

let latency = typeof window === "undefined" ? 0 : 140
export function setLatency(ms: number) {
  latency = ms
}
let clock = () => Date.now()
/** Tests move time forward without waiting. */
export function setClock(fn: () => number) {
  clock = fn
}

const localContext: Context = {
  now: () => clock(),
  async session() {
    try {
      return JSON.parse(read(SESSION_KEY) || "null") as Session | null
    } catch {
      return null
    }
  },
  async setSession(session) {
    write(SESSION_KEY, session ? JSON.stringify(session) : null)
  },
  device: () => read(DEVICE_KEY),
  setDevice: (token) => write(DEVICE_KEY, token),
  // Preview only: passwords are compared as typed. The server stores scrypt hashes.
  hash: async (password) => password,
  verify: async (password, stored) => password === stored,
  preview: true,
  simulator: true,
  baseUrl: typeof window === "undefined" ? "" : window.location.href.split("#")[0],
  messenger: { channels: { sms: false, email: false }, sms: async () => undefined, email: async () => undefined },
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
}

const localService = createService(
  createMemoryStore({
    load: loadLocal,
    save(db) {
      cache = db
      write(DB_KEY, JSON.stringify(db))
    },
  }),
  localContext,
)

// Preview without a server: the same clock runs in the browser.
if (typeof window !== "undefined" && !import.meta.env.VITE_API_URL) setInterval(() => localService.tick().catch(() => undefined), 60_000)

export function resetData() {
  cache = createSeed(clock())
  write(DB_KEY, JSON.stringify(cache))
  write(SESSION_KEY, null)
  emit()
}

// ---------------------------------------------------------------- transport

async function callServer(method: string, args: unknown[]) {
  const device = deviceToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}/rpc/${method}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-loyaloop": "1", ...(device ? { "x-device-token": device } : {}) },
      body: JSON.stringify({ args }),
    })
  } catch {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false
    throw new ApiError(offline ? "Sin conexión. Revisa tu internet e inténtalo otra vez." : "No pudimos conectar con el servidor. Inténtalo otra vez.", offline ? "offline" : "network")
  }
  const body = (await response.json().catch(() => null)) as { result?: unknown; device?: string | null; error?: { message: string; code: string } } | null
  if (body && "device" in body && body.device !== undefined) write(DEVICE_KEY, body.device)
  if (!response.ok || !body || body.error) {
    if (body?.error?.code === "unpaired") write(DEVICE_KEY, null)
    throw new ApiError(body?.error?.message || "Algo salió mal en el servidor. Inténtalo otra vez.", body?.error?.code || "server")
  }
  return body.result
}

async function call(method: PublicMethod, args: unknown[]) {
  if (API_URL) {
    const result = await callServer(method, args)
    if (!READ_METHODS.has(method)) emit()
    return result
  }
  if (latency) await new Promise((resolve) => setTimeout(resolve, latency))
  const fn = localService[method] as (...a: unknown[]) => Promise<unknown>
  const result = await fn(...args)
  if (!READ_METHODS.has(method)) emit()
  return result
}

function method<K extends PublicMethod>(name: K): Service[K] {
  return ((...args: unknown[]) => call(name, args)) as Service[K]
}

// ---------------------------------------------------------------- the API

export const me = method("me")
export const login = method("login")
export const logout = method("logout")
export const requestPasswordReset = method("requestPasswordReset")
export const resetPassword = method("resetPassword")
export const invitation = method("invitation")
export const acceptInvitation = method("acceptInvitation")
export const changePassword = method("changePassword")
export const impersonate = method("impersonate")
export const stopImpersonating = method("stopImpersonating")

export const bundle = method("bundle")
export const customers = method("customers")
export const customer = method("customer")
export const adjustBalance = method("adjustBalance")
export const exportCustomersCsv = method("exportCustomersCsv")
export const activity = method("activity")
export const refundPurchase = method("refundPurchase")
export const reviewQueue = method("reviewQueue")
export const resolveReview = method("resolveReview")
export const saveReward = method("saveReward")
export const deleteReward = method("deleteReward")
export const saveBranch = method("saveBranch")
export const deleteBranch = method("deleteBranch")
export const saveRegister = method("saveRegister")
export const deleteRegister = method("deleteRegister")
export const createPairingCode = method("createPairingCode")
export const unpairDevice = method("unpairDevice")
export const team = method("team")
export const inviteMember = method("inviteMember")
export const updateMember = method("updateMember")
export const updateBusinessContact = method("updateBusinessContact")
export const notices = method("notices")
export const suspicious = method("suspicious")
export const metrics = method("metrics")

export const adminBusinesses = method("adminBusinesses")
export const adminBundle = method("adminBundle")
export const createBusiness = method("createBusiness")
export const adminSaveProgram = method("adminSaveProgram")
export const adminUpdateBusiness = method("adminUpdateBusiness")
export const adminSetIntegration = method("adminSetIntegration")
export const adminMetrics = method("adminMetrics")
export const adminAudit = method("adminAudit")
export const leads = method("leads")
export const markLead = method("markLead")
export const simulatePayment = method("simulatePayment")

export const registration = method("registration")
export const sendCode = method("sendCode")
export const completeRegistration = method("completeRegistration")
export const recoverCard = method("recoverCard")
export const submitLead = method("submitLead")

export const pairDevice = method("pairDevice")
export const saveNotices = method("saveNotices")
export const campaigns = method("campaigns")
export const campaignAudience = method("campaignAudience")
export const createCampaign = method("createCampaign")
export const cancelCampaign = method("cancelCampaign")
export const kioskUnpair = method("kioskUnpair")
export const kiosk = method("kiosk")
export const kioskScan = method("kioskScan")
export const kioskScanStatus = method("kioskScanStatus")
export const kioskRedeem = method("kioskRedeem")
