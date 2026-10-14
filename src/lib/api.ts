// The app's only door to data. Today it runs against a database kept in the
// browser; the backend replaces the body of each function with an HTTP call
// and keeps the same names, inputs, outputs and permission rules.

import * as engine from "./engine"
import { DB_VERSION, createSeed, defaultProgram } from "./seed"
import type {
  AuditEntry,
  Branch,
  Business,
  CardType,
  Customer,
  DB,
  Device,
  Lead,
  Payment,
  Program,
  Provider,
  Register,
  Reward,
  Role,
  Scan,
  Session,
  Transaction,
  TransactionKind,
  User,
  WalletNotice,
} from "./types"
import {
  DAY,
  MINUTE,
  csv,
  customerToken,
  digits,
  isEmail,
  kindLabel,
  normalizePhone,
  normalizeToken,
  readableCode,
  uid,
} from "./util"

const DB_KEY = "loyaloop-db-v3"
const SESSION_KEY = "loyaloop-session"
const DEVICE_KEY = "loyaloop-device"

export class ApiError extends Error {
  code: string
  constructor(message: string, code = "error") {
    super(message)
    this.code = code
  }
}

// ---------------------------------------------------------------- storage

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

let cache: DB | null = null
function load(): DB {
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

const listeners = new Set<() => void>()
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function emit() {
  for (const listener of listeners) listener()
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === DB_KEY || event.key === SESSION_KEY || event.key === DEVICE_KEY) {
      cache = null
      emit()
    }
  })
}

/** Runs a change on a fresh copy and saves it only if nothing throws. */
function mutate<T>(change: (db: DB) => T): T {
  const draft = structuredClone(load())
  const result = change(draft)
  cache = draft
  write(DB_KEY, JSON.stringify(draft))
  emit()
  return result
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
const now = () => clock()
const delay = () => (latency ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve())

export function resetData() {
  cache = createSeed(now())
  write(DB_KEY, JSON.stringify(cache))
  write(SESSION_KEY, null)
  emit()
}

// ---------------------------------------------------------------- session

function sessionRead(): Session | null {
  try {
    return JSON.parse(read(SESSION_KEY) || "null")
  } catch {
    return null
  }
}

interface Actor {
  user: User
  /** Business the request acts on; undefined for the admin outside a business. */
  businessId?: string
  /** Effective role inside the business (the admin acts with owner rights). */
  role: Role
  impersonated: boolean
}

function actor(db: DB): Actor {
  const session = sessionRead()
  const user = session && db.users.find((u) => u.id === session.userId && u.active)
  if (!user) throw new ApiError("Tu sesión terminó. Vuelve a iniciar sesión.", "unauthenticated")
  if (user.role === "admin")
    return { user, businessId: session?.impersonating, role: session?.impersonating ? "owner" : "admin", impersonated: !!session?.impersonating }
  return { user, businessId: user.businessId, role: user.role, impersonated: false }
}

function inBusiness(db: DB, roles: Role[]): Actor & { businessId: string } {
  const a = actor(db)
  if (!a.businessId) throw new ApiError("Entra a la cuenta de un negocio para continuar.", "forbidden")
  if (!roles.includes(a.role)) throw new ApiError("Tu rol no tiene permiso para esta acción.", "forbidden")
  const business = db.businesses.find((b) => b.id === a.businessId)
  if (!business) throw new ApiError("El negocio no existe.", "not_found")
  if (business.status === "paused" && a.user.role !== "admin")
    throw new ApiError("La cuenta de este negocio está pausada. Contacta a LoyaLoop.", "paused")
  return a as Actor & { businessId: string }
}

function asAdmin(db: DB): Actor {
  const a = actor(db)
  if (a.user.role !== "admin") throw new ApiError("Solo el administrador de LoyaLoop puede hacer esto.", "forbidden")
  return a
}

function audit(db: DB, a: Actor, businessId: string | undefined, action: string, detail = "") {
  const entry: AuditEntry = {
    id: uid("a_"),
    businessId,
    actorId: a.user.id,
    actorName: a.user.name,
    action,
    detail,
    impersonated: a.impersonated,
    createdAt: new Date(now()).toISOString(),
  }
  db.audit.unshift(entry)
}

function maintain(businessId: string) {
  const db = load()
  const last = db.maintenance[businessId]
  if (last && now() - new Date(last).getTime() < 60 * MINUTE) return
  mutate((d) => {
    engine.runMaintenance(d, businessId, now())
    d.maintenance[businessId] = new Date(now()).toISOString()
  })
}

export interface Me {
  user: Omit<User, "password">
  role: Role
  business?: Business
  impersonating: boolean
}

function publicUser(user: User): Omit<User, "password"> {
  const { password: _password, ...rest } = user
  return rest
}

export async function me(): Promise<Me | null> {
  await delay()
  const db = load()
  try {
    const a = actor(db)
    return {
      user: publicUser(a.user),
      role: a.role,
      business: db.businesses.find((b) => b.id === a.businessId),
      impersonating: a.impersonated,
    }
  } catch {
    return null
  }
}

export async function login(email: string, password: string): Promise<Me> {
  await delay()
  const db = load()
  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  if (!user || user.password !== password)
    throw new ApiError("El correo o la contraseña no coinciden.", "invalid_credentials")
  if (!user.active) throw new ApiError("Esta cuenta está desactivada.", "inactive")
  if (user.inviteToken) throw new ApiError("Primero crea tu contraseña con el enlace de invitación.", "invite_pending")
  write(SESSION_KEY, JSON.stringify({ userId: user.id, createdAt: new Date(now()).toISOString() } satisfies Session))
  emit()
  return (await me())!
}

export async function logout() {
  write(SESSION_KEY, null)
  emit()
}

export async function requestPasswordReset(email: string): Promise<{ previewLink?: string }> {
  await delay()
  if (!isEmail(email)) throw new ApiError("Escribe un correo válido.")
  const db = load()
  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.active)
  // Same answer whether or not the account exists.
  if (!user) return {}
  const token = readableCode(20)
  mutate((d) => {
    d.resets = d.resets.filter((r) => r.userId !== user.id)
    d.resets.push({ token, userId: user.id, expiresAt: new Date(now() + 60 * MINUTE).toISOString() })
  })
  return { previewLink: `#/restablecer/${token}` }
}

function checkPassword(password: string) {
  if (password.length < 8) throw new ApiError("Usa al menos 8 caracteres.")
}

export async function resetPassword(token: string, password: string) {
  await delay()
  checkPassword(password)
  mutate((db) => {
    const reset = db.resets.find((r) => r.token === token)
    if (!reset || new Date(reset.expiresAt).getTime() < now())
      throw new ApiError("El enlace venció. Pide uno nuevo.", "expired")
    const user = db.users.find((u) => u.id === reset.userId)!
    user.password = password
    db.resets = db.resets.filter((r) => r.token !== token)
  })
  return true
}

export async function invitation(token: string): Promise<{ name: string; email: string; business: string; role: Role }> {
  await delay()
  const db = load()
  const user = db.users.find((u) => u.inviteToken === token)
  if (!user) throw new ApiError("Esta invitación ya se usó o no existe.", "not_found")
  return { name: user.name, email: user.email, role: user.role, business: db.businesses.find((b) => b.id === user.businessId)?.name || "" }
}

export async function acceptInvitation(token: string, password: string): Promise<Me> {
  await delay()
  checkPassword(password)
  const user = mutate((db) => {
    const found = db.users.find((u) => u.inviteToken === token)
    if (!found) throw new ApiError("Esta invitación ya se usó o no existe.", "not_found")
    found.password = password
    found.inviteToken = undefined
    return found
  })
  return login(user.email, password)
}

export async function changePassword(current: string, next: string) {
  await delay()
  checkPassword(next)
  mutate((db) => {
    const a = actor(db)
    const user = db.users.find((u) => u.id === a.user.id)!
    if (user.password !== current) throw new ApiError("La contraseña actual no coincide.")
    user.password = next
  })
  return true
}

export async function impersonate(businessId: string) {
  await delay()
  mutate((db) => {
    const a = asAdmin(db)
    const business = db.businesses.find((b) => b.id === businessId)
    if (!business) throw new ApiError("El negocio no existe.")
    audit(db, a, businessId, "Entró a la cuenta del negocio")
  })
  const session = sessionRead()!
  write(SESSION_KEY, JSON.stringify({ ...session, impersonating: businessId }))
  emit()
}

export async function stopImpersonating() {
  const session = sessionRead()
  if (!session) return
  write(SESSION_KEY, JSON.stringify({ ...session, impersonating: undefined }))
  emit()
}

// ---------------------------------------------------------------- business data

export interface Bundle {
  business: Business
  program: Program
  rewards: Reward[]
  branches: Branch[]
  registers: Register[]
  devices: Device[]
  integrations: { provider: Provider; status: string; connectedAt?: string; lastError?: string }[]
}

function bundleOf(db: DB, businessId: string): Bundle {
  return {
    business: db.businesses.find((b) => b.id === businessId)!,
    program: engine.programOf(db, businessId),
    rewards: db.rewards.filter((r) => r.businessId === businessId),
    branches: db.branches.filter((b) => b.businessId === businessId),
    registers: db.registers.filter((r) => r.businessId === businessId),
    devices: db.devices.filter((d) => d.businessId === businessId).map((d) => ({ ...d, token: "" })),
    integrations: db.integrations.filter((i) => i.businessId === businessId).map(({ businessId: _b, ...rest }) => rest),
  }
}

export async function bundle(): Promise<Bundle> {
  await delay()
  const a = inBusiness(load(), ["owner", "manager", "cashier"])
  maintain(a.businessId)
  return bundleOf(load(), a.businessId)
}

export interface CustomerRow extends Customer {
  tierName?: string
  visits: number
  employee: boolean
}

export async function customers(): Promise<CustomerRow[]> {
  await delay()
  const db = load()
  const a = inBusiness(db, ["owner", "manager"])
  const program = engine.programOf(db, a.businessId)
  const visitCount = new Map<string, number>()
  for (const t of db.transactions)
    if (t.businessId === a.businessId && (t.kind === "purchase" || t.kind === "visit"))
      visitCount.set(t.customerId, (visitCount.get(t.customerId) || 0) + 1)
  return db.customers
    .filter((c) => c.businessId === a.businessId)
    .map((c) => ({
      ...c,
      tierName: program.tiers.find((t) => t.id === c.tierId)?.name,
      visits: visitCount.get(c.id) || 0,
      employee: engine.employeeStatus(db, a.businessId, c.phone).employee,
    }))
}

export interface CustomerDetail {
  customer: CustomerRow
  transactions: Transaction[]
  notices: WalletNotice[]
  spending12m: number
  nextTier?: { name: string; missing: number }
}

export async function customer(id: string): Promise<CustomerDetail> {
  const rows = await customers()
  const row = rows.find((c) => c.id === id)
  if (!row) throw new ApiError("No encontramos a este cliente.", "not_found")
  const db = load()
  const program = engine.programOf(db, row.businessId)
  const spent = engine.spending12m(db, id, now())
  const next = [...program.tiers].sort((a, b) => a.threshold - b.threshold).find((t) => t.threshold > spent)
  return {
    customer: row,
    transactions: db.transactions.filter((t) => t.customerId === id),
    notices: db.notices.filter((n) => n.customerId === id),
    spending12m: spent,
    nextTier: program.type === "tiers" && next ? { name: next.name, missing: next.threshold - spent } : undefined,
  }
}

export async function adjustBalance(customerId: string, delta: { points: number; stamps: number }, reason: string) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner", "manager"])
    const c = db.customers.find((x) => x.id === customerId && x.businessId === a.businessId)
    if (!c) throw new ApiError("No encontramos a este cliente.")
    try {
      engine.adjust(db, c, delta, reason, a.user.id, now())
    } catch (error) {
      throw new ApiError((error as Error).message)
    }
    audit(db, a, a.businessId, "Ajustó un saldo", `${c.name}: ${delta.points ? `${delta.points} puntos` : ""}${delta.stamps ? ` ${delta.stamps} sellos` : ""}. Motivo: ${reason}`)
  })
}

export async function exportCustomersCsv(): Promise<string> {
  await delay()
  const db = load()
  const a = inBusiness(db, ["owner"])
  const program = engine.programOf(db, a.businessId)
  const rows: (string | number)[][] = [["Nombre", "Teléfono", "Correo", "Cumpleaños", "Puntos", "Sellos", "Nivel", "Acepta promociones", "Alta", "Última actividad"]]
  for (const c of db.customers.filter((x) => x.businessId === a.businessId))
    rows.push([
      c.name,
      c.phone,
      c.email,
      c.birthday,
      c.points,
      c.stamps,
      program.tiers.find((t) => t.id === c.tierId)?.name || "",
      c.promotionsOptIn ? "Sí" : "No",
      c.createdAt.slice(0, 10),
      c.lastActivityAt.slice(0, 10),
    ])
  mutate((d) => audit(d, a, a.businessId, "Exportó clientes", `${rows.length - 1} registros`))
  return csv(rows)
}

export interface ActivityFilters {
  kind?: TransactionKind | ""
  branchId?: string
  registerId?: string
  from?: string
  to?: string
  query?: string
}

export interface ActivityRow extends Transaction {
  customerName: string
  branchName?: string
  registerName?: string
  deviceName?: string
  actorName?: string
  refunded: boolean
}

export async function activity(filters: ActivityFilters = {}): Promise<ActivityRow[]> {
  await delay()
  const db = load()
  const a = inBusiness(db, ["owner", "manager"])
  const q = (filters.query || "").trim().toLowerCase()
  const from = filters.from ? new Date(filters.from + "T00:00:00").getTime() : -Infinity
  const to = filters.to ? new Date(filters.to + "T23:59:59").getTime() : Infinity
  const refunded = new Set(db.transactions.filter((t) => t.kind === "refund" && t.refOf).map((t) => t.refOf))
  return db.transactions
    .filter((t) => t.businessId === a.businessId)
    .map((t) => {
      const customer = db.customers.find((c) => c.id === t.customerId)
      return {
        ...t,
        customerName: customer?.name || "Cliente eliminado",
        branchName: db.branches.find((b) => b.id === t.branchId)?.name,
        registerName: db.registers.find((r) => r.id === t.registerId)?.name,
        deviceName: db.devices.find((d) => d.id === t.deviceId)?.name,
        actorName: db.users.find((u) => u.id === t.actorId)?.name,
        refunded: refunded.has(t.id),
      }
    })
    .filter((t) => !filters.kind || t.kind === filters.kind)
    .filter((t) => !filters.branchId || t.branchId === filters.branchId)
    .filter((t) => !filters.registerId || t.registerId === filters.registerId)
    .filter((t) => {
      const at = new Date(t.createdAt).getTime()
      return at >= from && at <= to
    })
    .filter((t) => !q || `${t.customerName} ${t.reason} ${kindLabel[t.kind]}`.toLowerCase().includes(q))
}

export async function refundPurchase(txId: string, reason: string) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner", "manager"])
    const tx = db.transactions.find((t) => t.id === txId && t.businessId === a.businessId)
    if (!tx) throw new ApiError("No encontramos esa compra.")
    try {
      engine.refund(db, txId, reason, a.user.id, now())
    } catch (error) {
      throw new ApiError((error as Error).message)
    }
    audit(db, a, a.businessId, "Registró una devolución", `${reason || "Sin motivo"}`)
  })
}

export interface ReviewItem {
  payment: Payment
  registerName: string
  candidates: { scan: Scan; customerName: string; phone: string }[]
}

export async function reviewQueue(): Promise<ReviewItem[]> {
  await delay()
  const db = load()
  const a = inBusiness(db, ["owner", "manager"])
  return db.payments
    .filter((p) => p.businessId === a.businessId && p.status === "review")
    .map((payment) => ({
      payment,
      registerName: db.registers.find((r) => r.id === payment.registerId)?.name || "",
      candidates: engine.reviewCandidates(db, payment).map((scan) => {
        const c = db.customers.find((x) => x.id === scan.customerId)!
        return { scan, customerName: c.name, phone: c.phone }
      }),
    }))
}

export async function resolveReview(paymentId: string, scanId: string | null) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner", "manager"])
    const payment = db.payments.find((p) => p.id === paymentId && p.businessId === a.businessId)
    if (!payment) throw new ApiError("No encontramos ese cobro.")
    try {
      engine.resolveReview(db, paymentId, scanId, now())
    } catch (error) {
      throw new ApiError((error as Error).message)
    }
    const name = scanId ? db.customers.find((c) => c.id === db.scans.find((s) => s.id === scanId)?.customerId)?.name : ""
    audit(db, a, a.businessId, scanId ? "Asignó un cobro en revisión" : "Descartó un cobro en revisión", scanId ? `Asignado a ${name}` : payment.externalId)
  })
}

export async function saveReward(input: Pick<Reward, "name" | "description" | "cost" | "active"> & { id?: string }) {
  await delay()
  return mutate((db) => {
    const a = inBusiness(db, ["owner", "manager"])
    if (!input.name.trim()) throw new ApiError("Escribe el nombre de la recompensa.")
    const program = engine.programOf(db, a.businessId)
    if (engine.usesPoints(program) && (!Number.isInteger(input.cost) || input.cost < 1))
      throw new ApiError("El costo debe ser un número entero de puntos mayor a cero.")
    const existing = input.id && db.rewards.find((r) => r.id === input.id && r.businessId === a.businessId)
    if (input.id && !existing) throw new ApiError("No encontramos esa recompensa.")
    if (existing) {
      Object.assign(existing, { name: input.name.trim(), description: input.description.trim(), cost: input.cost, active: input.active })
      audit(db, a, a.businessId, "Editó una recompensa", existing.name)
      return existing
    }
    const reward: Reward = { id: uid("rw_"), businessId: a.businessId, name: input.name.trim(), description: input.description.trim(), cost: input.cost, active: input.active, createdAt: new Date(now()).toISOString() }
    db.rewards.push(reward)
    audit(db, a, a.businessId, "Creó una recompensa", reward.name)
    return reward
  })
}

export async function deleteReward(id: string) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner", "manager"])
    const program = engine.programOf(db, a.businessId)
    if (program.stampRewardId === id) throw new ApiError("Es la recompensa de la tarjeta de sellos. Pide a LoyaLoop que la cambie primero.")
    const used = db.customers.some((c) => c.earnedRewards.some((e) => e.rewardId === id))
    if (used) throw new ApiError("Hay clientes con esta recompensa pendiente de canjear. Puedes pausarla en lugar de eliminarla.")
    const reward = db.rewards.find((r) => r.id === id && r.businessId === a.businessId)
    if (!reward) throw new ApiError("No encontramos esa recompensa.")
    db.rewards = db.rewards.filter((r) => r.id !== id)
    audit(db, a, a.businessId, "Eliminó una recompensa", reward.name)
  })
}

export async function saveBranch(input: { id?: string; name: string; address: string }) {
  await delay()
  return mutate((db) => {
    const a = inBusiness(db, ["owner"])
    if (!input.name.trim()) throw new ApiError("Escribe el nombre de la sucursal.")
    if (input.id) {
      const branch = db.branches.find((b) => b.id === input.id && b.businessId === a.businessId)
      if (!branch) throw new ApiError("No encontramos esa sucursal.")
      branch.name = input.name.trim()
      branch.address = input.address.trim()
      audit(db, a, a.businessId, "Editó una sucursal", branch.name)
      return branch
    }
    const branch: Branch = { id: uid("br_"), businessId: a.businessId, name: input.name.trim(), address: input.address.trim(), code: readableCode(6), createdAt: new Date(now()).toISOString() }
    db.branches.push(branch)
    db.registers.push({ id: uid("rg_"), businessId: a.businessId, branchId: branch.id, name: "Caja 1" })
    audit(db, a, a.businessId, "Creó una sucursal", branch.name)
    return branch
  })
}

export async function deleteBranch(id: string) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner"])
    const branches = db.branches.filter((b) => b.businessId === a.businessId)
    if (branches.length <= 1) throw new ApiError("El negocio necesita al menos una sucursal.")
    const branch = branches.find((b) => b.id === id)
    if (!branch) throw new ApiError("No encontramos esa sucursal.")
    if (db.transactions.some((t) => t.branchId === id))
      throw new ApiError("Esta sucursal ya tiene actividad registrada y no se puede eliminar.")
    const registers = db.registers.filter((r) => r.branchId === id).map((r) => r.id)
    db.devices = db.devices.filter((d) => !registers.includes(d.registerId))
    db.registers = db.registers.filter((r) => r.branchId !== id)
    db.branches = db.branches.filter((b) => b.id !== id)
    audit(db, a, a.businessId, "Eliminó una sucursal", branch.name)
  })
}

export async function saveRegister(input: { id?: string; name: string; branchId: string }) {
  await delay()
  return mutate((db) => {
    const a = inBusiness(db, ["owner", "manager"])
    if (!input.name.trim()) throw new ApiError("Escribe el nombre de la caja.")
    if (!db.branches.some((b) => b.id === input.branchId && b.businessId === a.businessId)) throw new ApiError("Elige una sucursal.")
    if (input.id) {
      const register = db.registers.find((r) => r.id === input.id && r.businessId === a.businessId)
      if (!register) throw new ApiError("No encontramos esa caja.")
      register.name = input.name.trim()
      return register
    }
    const register: Register = { id: uid("rg_"), businessId: a.businessId, branchId: input.branchId, name: input.name.trim() }
    db.registers.push(register)
    audit(db, a, a.businessId, "Creó una caja", register.name)
    return register
  })
}

export async function deleteRegister(id: string) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner", "manager"])
    const register = db.registers.find((r) => r.id === id && r.businessId === a.businessId)
    if (!register) throw new ApiError("No encontramos esa caja.")
    if (db.registers.filter((r) => r.branchId === register.branchId).length <= 1)
      throw new ApiError("Cada sucursal necesita al menos una caja.")
    if (db.transactions.some((t) => t.registerId === id)) throw new ApiError("Esta caja ya tiene actividad registrada y no se puede eliminar.")
    db.devices = db.devices.filter((d) => d.registerId !== id)
    db.registers = db.registers.filter((r) => r.id !== id)
    audit(db, a, a.businessId, "Eliminó una caja", register.name)
  })
}

export async function createPairingCode(registerId: string): Promise<{ code: string; expiresAt: string }> {
  await delay()
  return mutate((db) => {
    const a = inBusiness(db, ["owner", "manager", "cashier"])
    const register = db.registers.find((r) => r.id === registerId && r.businessId === a.businessId)
    if (!register) throw new ApiError("No encontramos esa caja.")
    db.pairingCodes = db.pairingCodes.filter((p) => new Date(p.expiresAt).getTime() > now() && p.registerId !== registerId)
    const code = digits(6)
    const expiresAt = new Date(now() + 15 * MINUTE).toISOString()
    db.pairingCodes.push({ code, businessId: a.businessId, registerId, expiresAt })
    return { code, expiresAt }
  })
}

export async function unpairDevice(id: string) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner", "manager"])
    const device = db.devices.find((d) => d.id === id && d.businessId === a.businessId)
    if (!device) throw new ApiError("No encontramos ese dispositivo.")
    db.devices = db.devices.filter((d) => d.id !== id)
    audit(db, a, a.businessId, "Desvinculó un escáner", device.name)
  })
}

export type TeamMember = Omit<User, "password">

export async function team(): Promise<TeamMember[]> {
  await delay()
  const db = load()
  const a = inBusiness(db, ["owner", "manager"])
  return db.users.filter((u) => u.businessId === a.businessId).map(publicUser)
}

export async function inviteMember(input: { name: string; email: string; role: Role; phone: string; excluded: boolean; branchId?: string }): Promise<{ link: string }> {
  await delay()
  return mutate((db) => {
    const a = inBusiness(db, ["owner"])
    if (!input.name.trim()) throw new ApiError("Escribe el nombre.")
    if (!isEmail(input.email)) throw new ApiError("Escribe un correo válido.")
    if (!["owner", "manager", "cashier"].includes(input.role)) throw new ApiError("Elige un rol.")
    if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase()))
      throw new ApiError("Ya existe una cuenta con este correo.")
    const phone = input.phone ? normalizePhone(input.phone) : ""
    if (phone && phone.length !== 10) throw new ApiError("El teléfono debe tener 10 dígitos.")
    const token = readableCode(24)
    db.users.push({ id: uid("u_"), name: input.name.trim(), email: input.email.trim().toLowerCase(), password: "", role: input.role, businessId: a.businessId, branchId: input.branchId || undefined, phone, excludedFromEarning: input.excluded, active: true, inviteToken: token, createdAt: new Date(now()).toISOString() })
    audit(db, a, a.businessId, "Invitó a una persona", `${input.name} (${input.email})`)
    return { link: `#/invitacion/${token}` }
  })
}

export async function updateMember(id: string, input: { role: Role; phone: string; excluded: boolean; active: boolean; branchId?: string }) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner"])
    const member = db.users.find((u) => u.id === id && u.businessId === a.businessId)
    if (!member) throw new ApiError("No encontramos a esa persona.")
    if (member.id === a.user.id && (input.role !== member.role || !input.active))
      throw new ApiError("No puedes cambiar tu propio rol ni desactivar tu cuenta.")
    const owners = db.users.filter((u) => u.businessId === a.businessId && u.role === "owner" && u.active)
    if (member.role === "owner" && owners.length === 1 && (input.role !== "owner" || !input.active))
      throw new ApiError("El negocio necesita al menos un dueño activo.")
    const phone = input.phone ? normalizePhone(input.phone) : ""
    if (phone && phone.length !== 10) throw new ApiError("El teléfono debe tener 10 dígitos.")
    Object.assign(member, { role: input.role, phone, excludedFromEarning: input.excluded, active: input.active, branchId: input.branchId || undefined })
    audit(db, a, a.businessId, "Actualizó a una persona del equipo", member.name)
  })
}

export async function updateBusinessContact(input: { contactName: string; email: string; phone: string }) {
  await delay()
  mutate((db) => {
    const a = inBusiness(db, ["owner"])
    if (!isEmail(input.email)) throw new ApiError("Escribe un correo válido.")
    const business = db.businesses.find((b) => b.id === a.businessId)!
    Object.assign(business, { contactName: input.contactName.trim(), email: input.email.trim(), phone: normalizePhone(input.phone) })
    audit(db, a, a.businessId, "Actualizó los datos de contacto")
  })
}

export async function notices(): Promise<(WalletNotice & { customerName: string })[]> {
  await delay()
  const db = load()
  const a = inBusiness(db, ["owner", "manager"])
  return db.notices
    .filter((n) => n.businessId === a.businessId)
    .slice(0, 100)
    .map((n) => ({ ...n, customerName: db.customers.find((c) => c.id === n.customerId)?.name || "" }))
}

export async function suspicious() {
  await delay()
  const db = load()
  const a = inBusiness(db, ["owner", "manager"])
  return engine.suspiciousCustomers(db, a.businessId, now()).map((row) => ({ name: row.customer.name, id: row.customer.id, count: row.count, average: row.average }))
}

export interface Metrics {
  newCustomers: number
  activeCustomers: number
  visits: number
  avgTicket: number
  pointsIssued: number
  pointsRedeemed: number
  rewardsRedeemed: number
  returnRate: number
  previous: { newCustomers: number; activeCustomers: number; visits: number; avgTicket: number }
  series: { day: string; visits: number }[]
  totalCustomers: number
  reviewCount: number
  usesPoints: boolean
}

export async function metrics(options: { days: number; branchId?: string }): Promise<Metrics> {
  await delay()
  const db = load()
  const a = inBusiness(db, ["owner", "manager"])
  const end = now()
  const span = options.days * DAY
  const scoped = db.transactions.filter((t) => t.businessId === a.businessId && (!options.branchId || t.branchId === options.branchId))
  const customersAll = db.customers.filter((c) => c.businessId === a.businessId && (!options.branchId || c.branchId === options.branchId))
  const compute = (from: number, to: number) => {
    const inRange = scoped.filter((t) => {
      const at = new Date(t.createdAt).getTime()
      return at > from && at <= to
    })
    const visitsTx = inRange.filter((t) => t.kind === "purchase" || t.kind === "visit")
    const purchases = inRange.filter((t) => t.kind === "purchase")
    const perCustomer = new Map<string, number>()
    for (const t of visitsTx) perCustomer.set(t.customerId, (perCustomer.get(t.customerId) || 0) + 1)
    return {
      newCustomers: customersAll.filter((c) => {
        const at = new Date(c.createdAt).getTime()
        return at > from && at <= to
      }).length,
      activeCustomers: new Set(inRange.filter((t) => t.kind !== "expire" && t.kind !== "adjust").map((t) => t.customerId)).size,
      visits: visitsTx.length,
      avgTicket: purchases.length ? purchases.reduce((s, t) => s + t.amount, 0) / purchases.length : 0,
      pointsIssued: inRange.filter((t) => t.points > 0).reduce((s, t) => s + t.points, 0),
      pointsRedeemed: -inRange.filter((t) => t.kind === "redeem").reduce((s, t) => s + t.points, 0),
      rewardsRedeemed: inRange.filter((t) => t.kind === "redeem").length,
      returnRate: perCustomer.size ? [...perCustomer.values()].filter((v) => v >= 2).length / perCustomer.size : 0,
      visitsTx,
    }
  }
  const current = compute(end - span, end)
  const previous = compute(end - 2 * span, end - span)
  const series: { day: string; visits: number }[] = []
  for (let i = options.days - 1; i >= 0; i--) {
    const d = new Date(end - i * DAY)
    d.setHours(0, 0, 0, 0)
    const start = d.getTime()
    series.push({
      day: d.toISOString().slice(0, 10),
      visits: current.visitsTx.filter((t) => {
        const at = new Date(t.createdAt).getTime()
        return at >= start && at < start + DAY
      }).length,
    })
  }
  return {
    ...current,
    previous: { newCustomers: previous.newCustomers, activeCustomers: previous.activeCustomers, visits: previous.visits, avgTicket: previous.avgTicket },
    series,
    totalCustomers: customersAll.length,
    reviewCount: db.payments.filter((p) => p.businessId === a.businessId && p.status === "review").length,
    usesPoints: engine.usesPoints(engine.programOf(db, a.businessId)),
  }
}

// ---------------------------------------------------------------- admin

export interface BusinessRow extends Business {
  customers: number
  branches: number
  transactions30d: number
  integration: string
  owner?: string
  cardType: CardType
}

export async function adminBusinesses(): Promise<BusinessRow[]> {
  await delay()
  const db = load()
  asAdmin(db)
  const since = now() - 30 * DAY
  return db.businesses.map((b) => {
    const integration = db.integrations.find((i) => i.businessId === b.id && i.status === "connected")
    return {
      ...b,
      customers: db.customers.filter((c) => c.businessId === b.id).length,
      branches: db.branches.filter((x) => x.businessId === b.id).length,
      transactions30d: db.transactions.filter((t) => t.businessId === b.id && new Date(t.createdAt).getTime() > since).length,
      integration: integration ? (integration.provider === "mercadopago" ? "Mercado Pago" : "Clip") : "Sin conectar",
      owner: db.users.find((u) => u.businessId === b.id && u.role === "owner")?.email,
      cardType: engine.programOf(db, b.id).type,
    }
  })
}

export async function adminBundle(businessId: string): Promise<Bundle & { team: TeamMember[]; audit: AuditEntry[] }> {
  await delay()
  const db = load()
  asAdmin(db)
  if (!db.businesses.some((b) => b.id === businessId)) throw new ApiError("El negocio no existe.", "not_found")
  return {
    ...bundleOf(db, businessId),
    team: db.users.filter((u) => u.businessId === businessId).map(publicUser),
    audit: db.audit.filter((e) => e.businessId === businessId),
  }
}

export interface NewBusiness {
  name: string
  sector: string
  contactName: string
  email: string
  phone: string
  status: "active" | "trial"
  branches: { name: string; address: string }[]
  program: Omit<Program, "businessId">
  rewards: { name: string; cost: number; description: string }[]
  stampRewardIndex?: number
  brand: { color: string; logo?: string; strip?: string }
  discreet: boolean
  neutralName: string
  locationAlerts: boolean
  provider?: Provider
  ownerName: string
  ownerEmail: string
}

export async function createBusiness(input: NewBusiness): Promise<{ id: string; inviteLink: string }> {
  await delay()
  return mutate((db) => {
    const a = asAdmin(db)
    if (!input.name.trim()) throw new ApiError("Escribe el nombre del negocio.")
    if (!isEmail(input.email)) throw new ApiError("El correo de contacto no es válido.")
    if (!input.branches.length || input.branches.some((b) => !b.name.trim())) throw new ApiError("Agrega al menos una sucursal con nombre.")
    if (!isEmail(input.ownerEmail)) throw new ApiError("El correo del dueño no es válido.")
    if (db.users.some((u) => u.email.toLowerCase() === input.ownerEmail.trim().toLowerCase()))
      throw new ApiError("Ya existe una cuenta con el correo del dueño.")
    validateProgram(input.program)
    const id = uid("b_")
    const created = new Date(now()).toISOString()
    db.businesses.push({ id, name: input.name.trim(), sector: input.sector, contactName: input.contactName.trim(), email: input.email.trim(), phone: normalizePhone(input.phone), status: input.status, brand: input.brand, discreet: input.discreet, neutralName: input.neutralName.trim() || "Mi tarjeta de beneficios", locationAlerts: input.discreet ? false : input.locationAlerts, createdAt: created })
    for (const b of input.branches) {
      const branchId = uid("br_")
      db.branches.push({ id: branchId, businessId: id, name: b.name.trim(), address: b.address.trim(), code: readableCode(6), createdAt: created })
      db.registers.push({ id: uid("rg_"), businessId: id, branchId, name: "Caja 1" })
    }
    const rewardIds: string[] = []
    for (const r of input.rewards.filter((x) => x.name.trim())) {
      const rid = uid("rw_")
      rewardIds.push(rid)
      db.rewards.push({ id: rid, businessId: id, name: r.name.trim(), description: r.description.trim(), cost: r.cost, active: true, createdAt: created })
    }
    db.programs.push({ ...input.program, businessId: id, stampRewardId: input.stampRewardIndex !== undefined ? rewardIds[input.stampRewardIndex] : undefined })
    for (const provider of ["mercadopago", "clip"] as Provider[])
      db.integrations.push({ businessId: id, provider, status: input.provider === provider ? "connected" : "not_connected", connectedAt: input.provider === provider ? created : undefined })
    const token = readableCode(24)
    db.users.push({ id: uid("u_"), name: input.ownerName.trim() || input.contactName.trim(), email: input.ownerEmail.trim().toLowerCase(), password: "", role: "owner", businessId: id, excludedFromEarning: false, active: true, inviteToken: token, createdAt: created })
    audit(db, a, id, "Dio de alta el negocio", `${input.branches.length} sucursal(es), tarjeta de ${input.program.type}`)
    return { id, inviteLink: `#/invitacion/${token}` }
  })
}

function validateProgram(p: Omit<Program, "businessId">) {
  const numbers = [p.pointsPerPeso, p.minPurchase, p.stampMinPurchase, p.stampGoal, p.expirationMonths, p.welcomeBonus, p.birthdayBonus, p.dailyLimit, p.suspiciousFactor]
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) throw new ApiError("Revisa los números de las reglas: no pueden ser negativos.")
  if (p.type !== "stamps" && p.pointsPerPeso <= 0) throw new ApiError("Define cuántos puntos da cada peso.")
  if (p.type === "stamps" && (!Number.isInteger(p.stampGoal) || p.stampGoal < 2)) throw new ApiError("La tarjeta de sellos necesita al menos 2 sellos.")
  if (p.type === "tiers") {
    if (!p.tiers.length) throw new ApiError("Agrega al menos un nivel.")
    if (p.tiers.some((t) => !t.name.trim() || t.multiplier < 1 || t.threshold < 0))
      throw new ApiError("Cada nivel necesita nombre, un gasto mínimo y un multiplicador de 1 o más.")
    if (new Set(p.tiers.map((t) => t.threshold)).size !== p.tiers.length) throw new ApiError("Dos niveles no pueden pedir el mismo gasto.")
    if (!p.tiers.some((t) => t.threshold === 0)) throw new ApiError("El primer nivel debe empezar en $0.")
  }
}

export async function adminSaveProgram(businessId: string, program: Omit<Program, "businessId">) {
  await delay()
  mutate((db) => {
    const a = asAdmin(db)
    validateProgram(program)
    if (program.type === "stamps" && program.stampRewardId && !db.rewards.some((r) => r.id === program.stampRewardId && r.businessId === businessId))
      throw new ApiError("La recompensa de los sellos no pertenece a este negocio.")
    const index = db.programs.findIndex((p) => p.businessId === businessId)
    db.programs[index] = { ...program, businessId, tiers: [...program.tiers].sort((x, y) => x.threshold - y.threshold) }
    if (program.type !== "tiers") for (const c of db.customers) if (c.businessId === businessId) c.tierId = undefined
    for (const c of db.customers.filter((x) => x.businessId === businessId)) engine.recomputeTier(db, c, now())
    audit(db, a, businessId, "Actualizó la tarjeta y sus reglas", `Tipo ${program.type}`)
  })
}

export async function adminUpdateBusiness(businessId: string, input: Partial<Pick<Business, "name" | "sector" | "contactName" | "email" | "phone" | "status" | "brand" | "discreet" | "neutralName" | "locationAlerts">>) {
  await delay()
  mutate((db) => {
    const a = asAdmin(db)
    const business = db.businesses.find((b) => b.id === businessId)
    if (!business) throw new ApiError("El negocio no existe.")
    if (input.email !== undefined && !isEmail(input.email)) throw new ApiError("El correo de contacto no es válido.")
    if (input.name !== undefined && !input.name.trim()) throw new ApiError("El nombre no puede quedar vacío.")
    Object.assign(business, input)
    if (business.discreet) business.locationAlerts = false
    audit(db, a, businessId, input.status ? `Cambió el estado a ${input.status}` : "Editó los datos del negocio")
  })
}

export async function adminSetIntegration(businessId: string, provider: Provider, status: "connected" | "not_connected") {
  await delay()
  mutate((db) => {
    const a = asAdmin(db)
    const row = db.integrations.find((i) => i.businessId === businessId && i.provider === provider)
    if (!row) throw new ApiError("Integración desconocida.")
    if (status === "connected") {
      for (const other of db.integrations) if (other.businessId === businessId && other.provider !== provider && other.status === "connected") other.status = "not_connected"
      row.connectedAt = new Date(now()).toISOString()
    }
    row.status = status
    row.lastError = undefined
    audit(db, a, businessId, status === "connected" ? `Conectó ${provider === "mercadopago" ? "Mercado Pago" : "Clip"}` : `Desconectó ${provider === "mercadopago" ? "Mercado Pago" : "Clip"}`)
  })
}

export interface GlobalMetrics {
  businesses: number
  active: number
  trial: number
  paused: number
  customers: number
  branches: number
  transactions30d: number
  inReview: number
  integrationErrors: { business: string; provider: string; message: string }[]
  newLeads: number
}

export async function adminMetrics(): Promise<GlobalMetrics> {
  await delay()
  const db = load()
  asAdmin(db)
  const since = now() - 30 * DAY
  return {
    businesses: db.businesses.length,
    active: db.businesses.filter((b) => b.status === "active").length,
    trial: db.businesses.filter((b) => b.status === "trial").length,
    paused: db.businesses.filter((b) => b.status === "paused").length,
    customers: db.customers.length,
    branches: db.branches.length,
    transactions30d: db.transactions.filter((t) => new Date(t.createdAt).getTime() > since).length,
    inReview: db.payments.filter((p) => p.status === "review").length,
    integrationErrors: db.integrations
      .filter((i) => i.status === "error")
      .map((i) => ({ business: db.businesses.find((b) => b.id === i.businessId)?.name || "", provider: i.provider, message: i.lastError || "" })),
    newLeads: db.leads.filter((l) => l.status === "new").length,
  }
}

export async function adminAudit(): Promise<(AuditEntry & { business?: string })[]> {
  await delay()
  const db = load()
  asAdmin(db)
  return db.audit.slice(0, 200).map((e) => ({ ...e, business: db.businesses.find((b) => b.id === e.businessId)?.name }))
}

export async function leads(): Promise<Lead[]> {
  await delay()
  const db = load()
  asAdmin(db)
  return db.leads
}

export async function markLead(id: string, status: Lead["status"]) {
  await delay()
  mutate((db) => {
    asAdmin(db)
    const lead = db.leads.find((l) => l.id === id)
    if (lead) lead.status = status
  })
}

/** Preview only: what Mercado Pago's webhook will send when a register charges. */
export async function simulatePayment(businessId: string, registerId: string, amount: number, tip: number): Promise<engine.PaymentOutcome & { customerName?: string }> {
  await delay()
  return mutate((db) => {
    const a = asAdmin(db)
    const register = db.registers.find((r) => r.id === registerId && r.businessId === businessId)
    if (!register) throw new ApiError("Elige una caja.")
    if (!(amount > 0) || tip < 0 || tip >= amount) throw new ApiError("El monto debe ser mayor que la propina.")
    const integration = db.integrations.find((i) => i.businessId === businessId && i.status === "connected")
    if (!integration) throw new ApiError("Este negocio no tiene un sistema de cobro conectado.")
    const payment: Payment = {
      id: uid("p_"),
      businessId,
      registerId,
      provider: integration.provider,
      externalId: `${integration.provider === "mercadopago" ? "MP" : "CL"}-${digits(8)}`,
      amount,
      tip,
      status: "unmatched",
      createdAt: new Date(now()).toISOString(),
    }
    const outcome = engine.registerPayment(db, payment, now())
    audit(db, a, businessId, "Simuló un cobro de prueba", `${payment.externalId} por $${amount}`)
    const customerName = outcome.kind === "matched" ? db.customers.find((c) => c.id === outcome.tx.customerId)?.name : undefined
    return { ...outcome, customerName }
  })
}

// ---------------------------------------------------------------- public: registration

export interface PublicCard {
  businessName: string
  discreet: boolean
  brand: Business["brand"]
  type: CardType
  program: Pick<Program, "pointsPerPeso" | "minPurchase" | "stampGoal" | "stampMinPurchase" | "expirationMonths" | "tiers" | "welcomeBonus" | "birthdayBonus">
  rewards: Pick<Reward, "id" | "name" | "cost" | "description">[]
  contact: { email: string; phone: string }
}

function publicCard(db: DB, businessId: string): PublicCard {
  const business = db.businesses.find((b) => b.id === businessId)!
  const program = engine.programOf(db, businessId)
  return {
    businessName: business.discreet ? business.neutralName : business.name,
    discreet: business.discreet,
    brand: business.brand,
    type: program.type,
    program: { pointsPerPeso: program.pointsPerPeso, minPurchase: program.minPurchase, stampGoal: program.stampGoal, stampMinPurchase: program.stampMinPurchase, expirationMonths: program.expirationMonths, tiers: program.tiers, welcomeBonus: program.welcomeBonus, birthdayBonus: program.birthdayBonus },
    rewards: db.rewards.filter((r) => r.businessId === businessId && r.active).map(({ id, name, cost, description }) => ({ id, name, cost, description })),
    contact: { email: business.email, phone: business.phone },
  }
}

export interface CardHolder {
  name: string
  token: string
  points: number
  stamps: number
  tierName?: string
  earnedRewards: { id: string; name: string }[]
  memberSince: string
}

function holder(db: DB, c: Customer): CardHolder {
  const program = engine.programOf(db, c.businessId)
  return {
    name: c.name,
    token: c.token,
    points: c.points,
    stamps: c.stamps,
    tierName: program.tiers.find((t) => t.id === c.tierId)?.name,
    earnedRewards: c.earnedRewards.map((e) => ({ id: e.id, name: db.rewards.find((r) => r.id === e.rewardId)?.name || "Recompensa" })),
    memberSince: c.createdAt,
  }
}

function branchByCode(db: DB, code: string) {
  const branch = db.branches.find((b) => b.code.toUpperCase() === code.toUpperCase())
  if (!branch) throw new ApiError("Este enlace no corresponde a ninguna sucursal.", "not_found")
  const business = db.businesses.find((b) => b.id === branch.businessId)!
  if (business.status === "paused") throw new ApiError("Este programa no está disponible por ahora.", "paused")
  return { branch, business }
}

export async function registration(code: string): Promise<{ card: PublicCard; branchName: string }> {
  await delay()
  const db = load()
  const { branch, business } = branchByCode(db, code)
  return { card: publicCard(db, business.id), branchName: business.discreet ? "" : branch.name }
}

export async function sendCode(code: string, phoneInput: string, mode: "new" | "recover"): Promise<{ previewCode: string; existing: boolean }> {
  await delay()
  return mutate((db) => {
    const { business } = branchByCode(db, code)
    const phone = normalizePhone(phoneInput)
    if (phone.length !== 10) throw new ApiError("Escribe un celular de 10 dígitos.")
    const existing = db.customers.some((c) => c.businessId === business.id && c.phone === phone)
    if (mode === "recover" && !existing) throw new ApiError("No encontramos una tarjeta con este celular. Puedes crear una.", "not_found")
    const previous = db.verifications.find((v) => v.phone === phone && v.businessId === business.id)
    if (previous && now() - new Date(previous.sentAt).getTime() < 30_000)
      throw new ApiError("Espera unos segundos antes de pedir otro código.", "rate_limited")
    db.verifications = db.verifications.filter((v) => !(v.phone === phone && v.businessId === business.id))
    const sms = digits(6)
    db.verifications.push({ phone, businessId: business.id, code: sms, attempts: 0, sentAt: new Date(now()).toISOString(), expiresAt: new Date(now() + 10 * MINUTE).toISOString() })
    return { previewCode: sms, existing }
  })
}

function verify(db: DB, businessId: string, phone: string, codeInput: string) {
  const v = db.verifications.find((x) => x.phone === phone && x.businessId === businessId)
  if (!v || new Date(v.expiresAt).getTime() < now()) throw new ApiError("El código venció. Pide uno nuevo.", "expired")
  if (v.attempts >= 5) throw new ApiError("Demasiados intentos. Pide un código nuevo.", "too_many")
  if (v.code !== codeInput.trim()) {
    v.attempts += 1
    // Save the attempt even though the request fails.
    write(DB_KEY, JSON.stringify(db))
    cache = db
    throw new ApiError(`El código no coincide. Te quedan ${5 - v.attempts} intentos.`, "wrong_code")
  }
  db.verifications = db.verifications.filter((x) => x !== v)
}

export interface RegistrationInput {
  name: string
  phone: string
  email: string
  birthday: string
  promotions: boolean
  privacy: boolean
}

export async function completeRegistration(code: string, input: RegistrationInput, sms: string): Promise<{ card: PublicCard; holder: CardHolder; created: boolean }> {
  await delay()
  return mutate((db) => {
    const { branch, business } = branchByCode(db, code)
    const phone = normalizePhone(input.phone)
    verify(db, business.id, phone, sms)
    let customer = db.customers.find((c) => c.businessId === business.id && c.phone === phone)
    let created = false
    if (!customer) {
      if (!input.privacy) throw new ApiError("Necesitas aceptar el aviso de privacidad.")
      if (!input.name.trim()) throw new ApiError("Escribe tu nombre.")
      if (input.email && !isEmail(input.email)) throw new ApiError("El correo no es válido.")
      const at = new Date(now()).toISOString()
      customer = {
        id: uid("c_"),
        businessId: business.id,
        name: input.name.trim(),
        phone,
        email: input.email.trim(),
        birthday: /^\d{2}-\d{2}$/.test(input.birthday) ? input.birthday : "",
        token: customerToken(),
        points: 0,
        stamps: 0,
        earnedRewards: [],
        branchId: branch.id,
        promotionsOptIn: input.promotions,
        privacyAcceptedAt: at,
        createdAt: at,
        lastActivityAt: at,
      }
      db.customers.push(customer)
      engine.welcome(db, customer, now())
      engine.recomputeTier(db, customer, now())
      created = true
    }
    return { card: publicCard(db, business.id), holder: holder(db, customer), created }
  })
}

export async function recoverCard(code: string, phoneInput: string, sms: string) {
  return completeRegistration(code, { name: "", phone: phoneInput, email: "", birthday: "", promotions: false, privacy: false }, sms)
}

export async function submitLead(input: Omit<Lead, "id" | "status" | "createdAt">) {
  await delay()
  if (!input.name.trim() || !input.company.trim()) throw new ApiError("Escribe tu nombre y el de tu negocio.")
  if (!isEmail(input.email)) throw new ApiError("Escribe un correo válido.")
  if (!input.preferredDate || !input.preferredTime) throw new ApiError("Elige fecha y horario.")
  mutate((db) => {
    db.leads.unshift({ ...input, id: uid("l_"), status: "new", createdAt: new Date(now()).toISOString() })
  })
}

// ---------------------------------------------------------------- kiosk

export function deviceToken(): string | null {
  return read(DEVICE_KEY)
}

export async function pairDevice(code: string, name: string): Promise<void> {
  await delay()
  const token = mutate((db) => {
    db.pairingCodes = db.pairingCodes.filter((p) => new Date(p.expiresAt).getTime() > now())
    const pairing = db.pairingCodes.find((p) => p.code === code.replace(/\D/g, ""))
    if (!pairing) throw new ApiError("El código no es válido o ya venció. Genera uno nuevo desde el panel.", "invalid_code")
    const register = db.registers.find((r) => r.id === pairing.registerId)!
    const device: Device = {
      id: uid("dv_"),
      businessId: pairing.businessId,
      registerId: pairing.registerId,
      name: name.trim() || `Escáner de ${register.name}`,
      token: `dev_${readableCode(32)}`,
      pairedAt: new Date(now()).toISOString(),
      lastSeenAt: new Date(now()).toISOString(),
    }
    db.devices.push(device)
    db.pairingCodes = db.pairingCodes.filter((p) => p !== pairing)
    return device.token
  })
  write(DEVICE_KEY, token)
  emit()
}

export function forgetDevice() {
  write(DEVICE_KEY, null)
  emit()
}

function kioskDevice(db: DB): Device {
  const token = deviceToken()
  const device = token && db.devices.find((d) => d.token === token)
  if (!device) throw new ApiError("Este escáner ya no está vinculado.", "unpaired")
  const business = db.businesses.find((b) => b.id === device.businessId)!
  if (business.status === "paused") throw new ApiError("La cuenta del negocio está pausada.", "paused")
  return device
}

export interface KioskInfo {
  businessName: string
  brand: Business["brand"]
  registerName: string
  branchName: string
  deviceName: string
  type: CardType
  integrated: boolean
}

export async function kiosk(): Promise<KioskInfo> {
  await delay()
  const db = load()
  const device = kioskDevice(db)
  const business = db.businesses.find((b) => b.id === device.businessId)!
  const register = db.registers.find((r) => r.id === device.registerId)!
  // Throttled heartbeat so the panel shows the device as online.
  if (now() - new Date(device.lastSeenAt).getTime() > MINUTE)
    mutate((d) => {
      const dev = d.devices.find((x) => x.id === device.id)
      if (dev) dev.lastSeenAt = new Date(now()).toISOString()
    })
  return {
    businessName: business.discreet ? business.neutralName : business.name,
    brand: business.brand,
    registerName: register.name,
    branchName: db.branches.find((b) => b.id === register.branchId)?.name || "",
    deviceName: device.name,
    type: engine.programOf(db, business.id).type,
    integrated: engine.hasIntegration(db, business.id),
  }
}

export interface KioskScan {
  scanId: string
  status: Scan["status"]
  firstName: string
  points: number
  stamps: number
  stampGoal: number
  tierName?: string
  earned?: { points: number; stamps: number }
  rewards: { id: string; name: string; cost: number; kind: "points" | "earned"; affordable: boolean }[]
  expiresAt: string
}

function kioskView(db: DB, scan: Scan): KioskScan {
  const c = db.customers.find((x) => x.id === scan.customerId)!
  const program = engine.programOf(db, c.businessId)
  const tx = scan.status === "visit"
    ? db.transactions.find((t) => t.customerId === c.id && t.kind === "visit" && t.deviceId === scan.deviceId)
    : db.transactions.find((t) => t.paymentId && t.paymentId === scan.paymentId)
  const rewards: KioskScan["rewards"] = [
    ...c.earnedRewards.map((e) => ({ id: e.id, name: db.rewards.find((r) => r.id === e.rewardId)?.name || "Recompensa", cost: 0, kind: "earned" as const, affordable: true })),
    ...(engine.usesPoints(program)
      ? db.rewards.filter((r) => r.businessId === c.businessId && r.active).map((r) => ({ id: r.id, name: r.name, cost: r.cost, kind: "points" as const, affordable: c.points >= r.cost }))
      : []),
  ]
  return {
    scanId: scan.id,
    status: scan.status,
    firstName: c.name.split(" ")[0],
    points: c.points,
    stamps: c.stamps,
    stampGoal: program.stampGoal,
    tierName: program.tiers.find((t) => t.id === c.tierId)?.name,
    earned: tx && (scan.status === "matched" || scan.status === "visit") ? { points: tx.points, stamps: tx.stamps } : undefined,
    rewards,
    expiresAt: new Date(new Date(scan.createdAt).getTime() + 5 * MINUTE).toISOString(),
  }
}

export async function kioskScan(raw: string): Promise<KioskScan> {
  await delay()
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new ApiError("Sin conexión. El escaneo no se registró.", "offline")
  return mutate((db) => {
    const device = kioskDevice(db)
    const outcome = engine.registerScan(db, device, normalizeToken(raw), now())
    if (outcome.kind === "error") throw new ApiError(outcome.message, "scan_rejected")
    device.lastSeenAt = new Date(now()).toISOString()
    return kioskView(db, outcome.scan)
  })
}

export async function kioskScanStatus(scanId: string): Promise<KioskScan> {
  const db = load()
  const device = kioskDevice(db)
  const expired = db.scans.some((s) => s.id === scanId && s.status === "pending" && now() - new Date(s.createdAt).getTime() > 5 * MINUTE)
  if (expired) mutate((d) => engine.expireScans(d, now()))
  const fresh = load()
  const scan = fresh.scans.find((s) => s.id === scanId && s.deviceId === device.id)
  if (!scan) throw new ApiError("El escaneo ya no existe.", "not_found")
  return kioskView(fresh, scan)
}

export async function kioskRedeem(scanId: string, rewardId: string, kind: "points" | "earned"): Promise<KioskScan & { redeemed: string }> {
  await delay()
  return mutate((db) => {
    const device = kioskDevice(db)
    const scan = db.scans.find((s) => s.id === scanId && s.deviceId === device.id)
    if (!scan) throw new ApiError("Vuelve a escanear la tarjeta.", "not_found")
    if (now() - new Date(scan.createdAt).getTime() > 5 * MINUTE) throw new ApiError("Pasaron más de 5 minutos. Vuelve a escanear la tarjeta.", "expired")
    const customer = db.customers.find((c) => c.id === scan.customerId)!
    let tx: Transaction
    try {
      tx = engine.redeem(db, customer, kind === "earned" ? { earnedId: rewardId } : { rewardId }, { device }, now())
    } catch (error) {
      throw new ApiError((error as Error).message)
    }
    return { ...kioskView(db, scan), redeemed: tx.reason }
  })
}
