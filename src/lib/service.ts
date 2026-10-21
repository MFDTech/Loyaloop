// LoyaLoop's business logic: every rule and permission check lives here.
// The same code runs in two places:
//  - on the server, with a PostgreSQL store (server/src/pgStore.ts)
//  - in the browser preview, with a store kept in localStorage (memoryStore.ts)
// The pages never call this directly; they go through src/lib/api.ts.

import * as engine from "./engine"
import { DEFAULT_MISS_YOU_DAYS, MAX_NOTICE, MAX_PROMOTIONS_PER_DAY, NOTICE_EVENTS, PROMOTION_VARS, unknownVars, type Audience } from "./notices"
import { defaultProgram } from "./seed"
import type {
  Campaign,
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
import { DAY, MINUTE, csv, customerToken, digits, isEmail, kindLabel, normalizePhone, normalizeToken, readableCode, uid } from "./util"

export class ApiError extends Error {
  code: string
  constructor(message: string, code = "error") {
    super(message)
    this.code = code
  }
}

// ---------------------------------------------------------------- ports

/**
 * "global" holds users, businesses, programs, integrations, leads and password resets.
 * A business id holds that business's working set: its users, card, rewards, branches,
 * registers, devices, customers, the last ~400 days of transactions, recent scans and
 * payments (plus everything still pending or in review), recent notices and SMS codes.
 */
export type Scope = "global" | { business: string }

export interface TransactionQuery {
  customerId?: string
  kind?: TransactionKind
  branchId?: string
  registerId?: string
  from?: string
  to?: string
  limit?: number
}

export interface Store {
  read(scope: Scope): Promise<DB>
  /** Runs `change` on a copy inside one transaction; nothing is saved if it throws. */
  write<T>(scope: Scope, change: (db: DB) => T): Promise<T>
  user(id: string): Promise<User | undefined>
  business(id: string): Promise<Business | undefined>
  deviceByToken(token: string): Promise<Device | undefined>
  branchByCode(code: string): Promise<Branch | undefined>
  pairingCode(code: string): Promise<{ businessId: string } | undefined>
  emailTaken(email: string): Promise<boolean>
  transactions(businessId: string, query: TransactionQuery): Promise<Transaction[]>
  countTransactions(businessId: string, query: { branchId?: string; registerId?: string }): Promise<number>
  visitCounts(businessId: string): Promise<Map<string, number>>
  notices(businessId: string, limit: number): Promise<WalletNotice[]>
  audit(query: { businessId?: string; limit: number }): Promise<AuditEntry[]>
  businessStats(since: string): Promise<{ businessId: string; customers: number; branches: number; transactions: number; inReview: number }[]>
}

export interface EmailMessage {
  to: string
  subject: string
  heading: string
  paragraphs: string[]
  action?: { label: string; url: string }
  footnote?: string
}

/** A provider that creates and checks the codes itself (Twilio Verify). */
export interface PhoneVerifier {
  /** Sends a new code to a 10-digit Mexican number. */
  start(phone: string): Promise<void>
  /** True when the code is right. */
  check(phone: string, code: string): Promise<boolean>
}

export interface Messenger {
  /** Which channels really reach people. Without them, codes and links only work in preview. */
  channels: { sms: boolean; email: boolean }
  sms(phone: string, text: string): Promise<void>
  email(message: EmailMessage): Promise<void>
  /** When set, registration codes go through it instead of sms(). */
  verifier?: PhoneVerifier
  /** Sends a code created by LoyaLoop (WhatsApp authentication template). */
  code?(phone: string, code: string): Promise<void>
  /** How the code reaches the customer, shown on the registration page. */
  codeChannel?: CodeChannel
}

export type CodeChannel = "sms" | "whatsapp"

/** Links to save a customer's card in each wallet. Empty when the wallet is not configured. */
export interface WalletLinks {
  google?: string
  apple?: string
}

export interface Wallets {
  links(businessId: string, customerId: string): Promise<WalletLinks>
}

export interface Context {
  now(): number
  session(): Promise<Session | null>
  setSession(session: Session | null): Promise<void>
  device(): string | null
  setDevice(token: string | null): void
  hash(password: string): Promise<string>
  verify(password: string, stored: string): Promise<boolean>
  /** Shows SMS codes and reset links on screen (no SMS or email provider yet). */
  preview: boolean
  /** Lets the admin simulate terminal payments. */
  simulator: boolean
  /** Absolute base URL for links sent by email, e.g. https://loyaloop.mx/ */
  baseUrl: string
  messenger: Messenger
  /** Issues real passes (server only). */
  wallets?: Wallets
  online?(): boolean
}

// ---------------------------------------------------------------- shared types

export interface Me {
  user: Omit<User, "password">
  role: Role
  business?: Business
  impersonating: boolean
}

export interface Bundle {
  business: Business
  program: Program
  rewards: Reward[]
  branches: Branch[]
  registers: Register[]
  devices: Device[]
  integrations: { provider: Provider; status: string; connectedAt?: string; lastError?: string }[]
}

export interface CustomerRow extends Customer {
  tierName?: string
  visits: number
  employee: boolean
}

export interface CustomerDetail {
  customer: CustomerRow
  transactions: Transaction[]
  notices: WalletNotice[]
  spending12m: number
  nextTier?: { name: string; missing: number }
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

export interface ReviewItem {
  payment: Payment
  registerName: string
  candidates: { scan: Scan; customerName: string; phone: string }[]
}

export type TeamMember = Omit<User, "password">

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

export interface BusinessRow extends Business {
  customers: number
  branches: number
  transactions30d: number
  integration: string
  owner?: string
  cardType: CardType
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
  askPhone?: boolean
  provider?: Provider
  ownerName: string
  ownerEmail: string
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

export interface PublicCard {
  businessName: string
  discreet: boolean
  brand: Business["brand"]
  type: CardType
  program: Pick<Program, "pointsPerPeso" | "minPurchase" | "stampGoal" | "stampMinPurchase" | "expirationMonths" | "tiers" | "welcomeBonus" | "birthdayBonus">
  rewards: Pick<Reward, "id" | "name" | "cost" | "description">[]
  contact: { email: string; phone: string }
  /** Registration asks for the mobile number and a code; otherwise only a name. */
  askPhone: boolean
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

export interface RegistrationInput {
  name: string
  /** Empty when the business does not ask for it. */
  phone: string
  email: string
  birthday: string
  promotions: boolean
  privacy: boolean
}

export interface KioskInfo {
  businessId: string
  registerId: string
  businessName: string
  brand: Business["brand"]
  registerName: string
  branchName: string
  deviceName: string
  type: CardType
  integrated: boolean
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

/** A payment as the provider reports it (webhook). */
export interface IncomingPayment {
  businessId: string
  registerId: string
  provider: Provider
  externalId: string
  amount: number
  tip: number
}

// ---------------------------------------------------------------- helpers

interface Actor {
  user: User
  /** Business the request acts on; undefined for the admin outside a business. */
  businessId?: string
  /** Effective role inside the business (the admin acts with owner rights). */
  role: Role
  impersonated: boolean
}

function publicUser(user: User): Omit<User, "password"> {
  const { password: _password, ...rest } = user
  return rest
}

function audit(db: DB, a: Actor, businessId: string | undefined, action: string, detail: string, at: number) {
  db.audit.unshift({
    id: uid("a_"),
    businessId,
    actorId: a.user.id,
    actorName: a.user.name,
    action,
    detail,
    impersonated: a.impersonated,
    createdAt: new Date(at).toISOString(),
  })
}

/** Turns an engine rule failure (plain Error) into a message for the person. */
function rule<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError((error as Error).message)
  }
}

export function validateProgram(p: Omit<Program, "businessId">) {
  const numbers = [p.pointsPerPeso, p.minPurchase, p.stampMinPurchase, p.stampGoal, p.expirationMonths, p.welcomeBonus, p.birthdayBonus, p.dailyLimit, p.suspiciousFactor]
  if (numbers.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0)) throw new ApiError("Revisa los números de las reglas: no pueden ser negativos.")
  if (!["points", "stamps", "rewards", "tiers"].includes(p.type)) throw new ApiError("Elige un tipo de tarjeta.")
  if (p.type !== "stamps" && p.pointsPerPeso <= 0) throw new ApiError("Define cuántos puntos da cada peso.")
  if (p.type === "stamps" && (!Number.isInteger(p.stampGoal) || p.stampGoal < 2)) throw new ApiError("La tarjeta de sellos necesita al menos 2 sellos.")
  if (!Array.isArray(p.tiers)) throw new ApiError("Los niveles no son válidos.")
  if (p.type === "tiers") {
    if (!p.tiers.length) throw new ApiError("Agrega al menos un nivel.")
    if (p.tiers.some((t) => !t.name?.trim() || !(t.multiplier >= 1) || !(t.threshold >= 0)))
      throw new ApiError("Cada nivel necesita nombre, un gasto mínimo y un multiplicador de 1 o más.")
    if (new Set(p.tiers.map((t) => t.threshold)).size !== p.tiers.length) throw new ApiError("Dos niveles no pueden pedir el mismo gasto.")
    if (!p.tiers.some((t) => t.threshold === 0)) throw new ApiError("El primer nivel debe empezar en $0.")
  }
}

const text = (value: unknown, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "")

// ---------------------------------------------------------------- service

export function createService(store: Store, ctx: Context) {
  const now = () => ctx.now()
  const iso = (t = now()) => new Date(t).toISOString()
  const B = (businessId: string): Scope => ({ business: businessId })

  async function actor(): Promise<Actor> {
    const session = await ctx.session()
    const user = session && (await store.user(session.userId))
    if (!user || !user.active || user.inviteToken) throw new ApiError("Tu sesión terminó. Vuelve a iniciar sesión.", "unauthenticated")
    if (user.role === "admin")
      return { user, businessId: session.impersonating, role: session.impersonating ? "owner" : "admin", impersonated: !!session.impersonating }
    return { user, businessId: user.businessId, role: user.role, impersonated: false }
  }

  async function inBusiness(roles: Role[]): Promise<Actor & { businessId: string }> {
    const a = await actor()
    if (!a.businessId) throw new ApiError("Entra a la cuenta de un negocio para continuar.", "forbidden")
    if (!roles.includes(a.role)) throw new ApiError("Tu rol no tiene permiso para esta acción.", "forbidden")
    const business = await store.business(a.businessId)
    if (!business) throw new ApiError("El negocio no existe.", "not_found")
    if (business.status === "paused" && a.user.role !== "admin")
      throw new ApiError("La cuenta de este negocio está pausada. Contacta a LoyaLoop.", "paused")
    return a as Actor & { businessId: string }
  }

  async function asAdmin(): Promise<Actor> {
    const a = await actor()
    if (a.user.role !== "admin") throw new ApiError("Solo el administrador de LoyaLoop puede hacer esto.", "forbidden")
    return a
  }

  async function maintain(businessId: string) {
    const db = await store.read(B(businessId))
    const last = db.maintenance[businessId]
    if (last && now() - new Date(last).getTime() < 60 * MINUTE) return
    await store.write(B(businessId), (d) => {
      engine.runMaintenance(d, businessId, now())
      d.maintenance[businessId] = iso()
    })
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

  function link(hashPath: string) {
    return `${ctx.baseUrl}${hashPath}`
  }

  /** Sends an email if a provider is configured. A failed email never undoes the action. */
  async function sendEmail(message: EmailMessage) {
    if (!ctx.messenger.channels.email) return false
    try {
      await ctx.messenger.email(message)
      return true
    } catch (error) {
      console.error("[email] no se pudo enviar", (error as Error).message)
      return false
    }
  }

  // ------------------------------------------------------------ session

  async function me(): Promise<Me | null> {
    try {
      const a = await actor()
      return {
        user: publicUser(a.user),
        role: a.role,
        business: a.businessId ? await store.business(a.businessId) : undefined,
        impersonating: a.impersonated,
      }
    } catch {
      return null
    }
  }

  async function login(email: string, password: string): Promise<Me> {
    const db = await store.read("global")
    const user = db.users.find((u) => u.email.toLowerCase() === text(email, 200).toLowerCase())
    const valid = !!user && !!user.password && (await ctx.verify(String(password), user.password))
    if (!user || !valid) throw new ApiError("El correo o la contraseña no coinciden.", "invalid_credentials")
    if (!user.active) throw new ApiError("Esta cuenta está desactivada.", "inactive")
    if (user.inviteToken) throw new ApiError("Primero crea tu contraseña con el enlace de invitación.", "invite_pending")
    await ctx.setSession({ userId: user.id, createdAt: iso() })
    return (await me())!
  }

  async function logout() {
    await ctx.setSession(null)
  }

  async function requestPasswordReset(email: string): Promise<{ previewLink?: string }> {
    if (!isEmail(email)) throw new ApiError("Escribe un correo válido.")
    const db = await store.read("global")
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.active && !u.inviteToken)
    // Same answer whether or not the account exists.
    if (!user) return {}
    const token = readableCode(32)
    await store.write("global", (d) => {
      d.resets = d.resets.filter((r) => r.userId !== user.id && new Date(r.expiresAt).getTime() > now())
      d.resets.push({ token, userId: user.id, expiresAt: iso(now() + 60 * MINUTE) })
    })
    const path = `#/restablecer/${token}`
    await sendEmail({
      to: user.email,
      subject: "Restablece tu contraseña de LoyaLoop",
      heading: "Crea una contraseña nueva",
      paragraphs: [`Hola, ${user.name}.`, "Recibimos una solicitud para cambiar la contraseña de tu cuenta de LoyaLoop. El enlace vence en una hora."],
      action: { label: "Crear contraseña nueva", url: link(path) },
      footnote: "Si no lo pediste, ignora este correo: tu contraseña no cambia.",
    })
    // The link is shown on screen only in preview: anywhere else it would let anyone take over the account.
    return ctx.preview ? { previewLink: path } : {}
  }

  function checkPassword(password: unknown) {
    if (typeof password !== "string" || password.length < 8) throw new ApiError("Usa al menos 8 caracteres.")
    if (password.length > 200) throw new ApiError("La contraseña es demasiado larga.")
  }

  async function resetPassword(token: string, password: string) {
    checkPassword(password)
    const hashed = await ctx.hash(password)
    await store.write("global", (db) => {
      const reset = db.resets.find((r) => r.token === token)
      if (!reset || new Date(reset.expiresAt).getTime() < now()) throw new ApiError("El enlace venció. Pide uno nuevo.", "expired")
      const user = db.users.find((u) => u.id === reset.userId)!
      user.password = hashed
      db.resets = db.resets.filter((r) => r.userId !== reset.userId)
    })
    return true
  }

  async function invitation(token: string): Promise<{ name: string; email: string; business: string; role: Role }> {
    const db = await store.read("global")
    const user = token ? db.users.find((u) => u.inviteToken === token) : undefined
    if (!user) throw new ApiError("Esta invitación ya se usó o no existe.", "not_found")
    return { name: user.name, email: user.email, role: user.role, business: db.businesses.find((b) => b.id === user.businessId)?.name || "" }
  }

  async function acceptInvitation(token: string, password: string): Promise<Me> {
    checkPassword(password)
    const hashed = await ctx.hash(password)
    const userId = await store.write("global", (db) => {
      const found = token ? db.users.find((u) => u.inviteToken === token) : undefined
      if (!found) throw new ApiError("Esta invitación ya se usó o no existe.", "not_found")
      found.password = hashed
      found.inviteToken = undefined
      return found.id
    })
    await ctx.setSession({ userId, createdAt: iso() })
    return (await me())!
  }

  async function changePassword(current: string, next: string) {
    checkPassword(next)
    const a = await actor()
    if (!(await ctx.verify(String(current), a.user.password))) throw new ApiError("La contraseña actual no coincide.")
    const hashed = await ctx.hash(next)
    await store.write("global", (db) => {
      const user = db.users.find((u) => u.id === a.user.id)!
      user.password = hashed
    })
    return true
  }

  async function impersonate(businessId: string) {
    const a = await asAdmin()
    if (!(await store.business(businessId))) throw new ApiError("El negocio no existe.")
    await store.write(B(businessId), (db) => audit(db, a, businessId, "Entró a la cuenta del negocio", "", now()))
    const session = (await ctx.session())!
    await ctx.setSession({ ...session, impersonating: businessId })
  }

  async function stopImpersonating() {
    const session = await ctx.session()
    if (!session) return
    await ctx.setSession({ ...session, impersonating: undefined })
  }

  // ------------------------------------------------------------ business data

  async function bundle(): Promise<Bundle> {
    const a = await inBusiness(["owner", "manager", "cashier"])
    await maintain(a.businessId)
    return bundleOf(await store.read(B(a.businessId)), a.businessId)
  }

  async function customerRows(a: Actor & { businessId: string }, db: DB): Promise<CustomerRow[]> {
    const program = engine.programOf(db, a.businessId)
    const visits = await store.visitCounts(a.businessId)
    return db.customers
      .filter((c) => c.businessId === a.businessId)
      .map((c) => ({
        ...c,
        tierName: program.tiers.find((t) => t.id === c.tierId)?.name,
        visits: visits.get(c.id) || 0,
        employee: engine.employeeStatus(db, a.businessId, c).employee,
      }))
  }

  async function customers(): Promise<CustomerRow[]> {
    const a = await inBusiness(["owner", "manager"])
    return customerRows(a, await store.read(B(a.businessId)))
  }

  async function customer(id: string): Promise<CustomerDetail> {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
    const row = (await customerRows(a, db)).find((c) => c.id === id)
    if (!row) throw new ApiError("No encontramos a este cliente.", "not_found")
    const program = engine.programOf(db, a.businessId)
    const spent = engine.spending12m(db, id, now())
    const next = [...program.tiers].sort((x, y) => x.threshold - y.threshold).find((t) => t.threshold > spent)
    return {
      customer: row,
      transactions: await store.transactions(a.businessId, { customerId: id, limit: 500 }),
      notices: db.notices.filter((n) => n.customerId === id),
      spending12m: spent,
      nextTier: program.type === "tiers" && next ? { name: next.name, missing: next.threshold - spent } : undefined,
    }
  }

  async function adjustBalance(customerId: string, delta: { points: number; stamps: number }, reason: string) {
    const a = await inBusiness(["owner", "manager"])
    const points = Number(delta?.points) || 0
    const stamps = Number(delta?.stamps) || 0
    if (!Number.isInteger(points) || !Number.isInteger(stamps)) throw new ApiError("Usa números enteros.")
    await store.write(B(a.businessId), (db) => {
      const c = db.customers.find((x) => x.id === customerId && x.businessId === a.businessId)
      if (!c) throw new ApiError("No encontramos a este cliente.")
      rule(() => engine.adjust(db, c, { points, stamps }, text(reason, 200), a.user.id, now()))
      audit(db, a, a.businessId, "Ajustó un saldo", `${c.name}: ${points ? `${points} puntos` : ""}${stamps ? ` ${stamps} sellos` : ""}. Motivo: ${text(reason, 200)}`, now())
    })
  }

  async function exportCustomersCsv(): Promise<string> {
    const a = await inBusiness(["owner"])
    const db = await store.read(B(a.businessId))
    const program = engine.programOf(db, a.businessId)
    const rows: (string | number)[][] = [["Nombre", "Teléfono", "Correo", "Cumpleaños", "Puntos", "Sellos", "Nivel", "Acepta promociones", "Alta", "Última actividad"]]
    for (const c of db.customers.filter((x) => x.businessId === a.businessId))
      rows.push([c.name, c.phone, c.email, c.birthday, c.points, c.stamps, program.tiers.find((t) => t.id === c.tierId)?.name || "", c.promotionsOptIn ? "Sí" : "No", c.createdAt.slice(0, 10), c.lastActivityAt.slice(0, 10)])
    await store.write(B(a.businessId), (d) => audit(d, a, a.businessId, "Exportó clientes", `${rows.length - 1} registros`, now()))
    return csv(rows)
  }

  async function activity(filters: ActivityFilters = {}): Promise<ActivityRow[]> {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
    const q = text(filters.query, 100).toLowerCase()
    const rows = await store.transactions(a.businessId, {
      kind: filters.kind || undefined,
      branchId: filters.branchId || undefined,
      registerId: filters.registerId || undefined,
      from: filters.from ? new Date(filters.from + "T00:00:00").toISOString() : undefined,
      to: filters.to ? new Date(filters.to + "T23:59:59.999").toISOString() : undefined,
      limit: 2000,
    })
    const refunded = new Set(db.transactions.filter((t) => t.kind === "refund" && t.refOf).map((t) => t.refOf))
    const users = new Map(db.users.map((u) => [u.id, u.name]))
    for (const id of new Set(rows.map((t) => t.actorId).filter((x): x is string => !!x && !users.has(x)))) {
      const user = await store.user(id)
      users.set(id, user?.role === "admin" ? `${user.name} (LoyaLoop)` : user?.name || "")
    }
    return rows
      .map((t) => ({
        ...t,
        customerName: db.customers.find((c) => c.id === t.customerId)?.name || "Cliente eliminado",
        branchName: db.branches.find((b) => b.id === t.branchId)?.name,
        registerName: db.registers.find((r) => r.id === t.registerId)?.name,
        deviceName: db.devices.find((d) => d.id === t.deviceId)?.name,
        actorName: t.actorId ? users.get(t.actorId) || undefined : undefined,
        refunded: refunded.has(t.id),
      }))
      .filter((t) => !q || `${t.customerName} ${t.reason} ${kindLabel[t.kind]}`.toLowerCase().includes(q))
  }

  async function refundPurchase(txId: string, reason: string) {
    const a = await inBusiness(["owner", "manager"])
    await store.write(B(a.businessId), (db) => {
      const tx = db.transactions.find((t) => t.id === txId && t.businessId === a.businessId)
      if (!tx) throw new ApiError("No encontramos esa compra.")
      rule(() => engine.refund(db, txId, text(reason, 200), a.user.id, now()))
      audit(db, a, a.businessId, "Registró una devolución", text(reason, 200) || "Sin motivo", now())
    })
  }

  async function reviewQueue(): Promise<ReviewItem[]> {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
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

  async function resolveReview(paymentId: string, scanId: string | null) {
    const a = await inBusiness(["owner", "manager"])
    await store.write(B(a.businessId), (db) => {
      const payment = db.payments.find((p) => p.id === paymentId && p.businessId === a.businessId)
      if (!payment) throw new ApiError("No encontramos ese cobro.")
      rule(() => engine.resolveReview(db, paymentId, scanId, now()))
      const name = scanId ? db.customers.find((c) => c.id === db.scans.find((s) => s.id === scanId)?.customerId)?.name : ""
      audit(db, a, a.businessId, scanId ? "Asignó un cobro en revisión" : "Descartó un cobro en revisión", scanId ? `Asignado a ${name}` : payment.externalId, now())
    })
  }

  async function saveReward(input: Pick<Reward, "name" | "description" | "cost" | "active"> & { id?: string }) {
    const a = await inBusiness(["owner", "manager"])
    return store.write(B(a.businessId), (db) => {
      const name = text(input.name, 80)
      const description = text(input.description, 300)
      if (!name) throw new ApiError("Escribe el nombre de la recompensa.")
      const program = engine.programOf(db, a.businessId)
      const cost = Number(input.cost)
      if (engine.usesPoints(program) && (!Number.isInteger(cost) || cost < 1)) throw new ApiError("El costo debe ser un número entero de puntos mayor a cero.")
      const existing = input.id ? db.rewards.find((r) => r.id === input.id && r.businessId === a.businessId) : undefined
      if (input.id && !existing) throw new ApiError("No encontramos esa recompensa.")
      if (existing) {
        Object.assign(existing, { name, description, cost: cost || 0, active: !!input.active })
        audit(db, a, a.businessId, "Editó una recompensa", existing.name, now())
        return existing
      }
      const reward: Reward = { id: uid("rw_"), businessId: a.businessId, name, description, cost: cost || 0, active: !!input.active, createdAt: iso() }
      db.rewards.push(reward)
      audit(db, a, a.businessId, "Creó una recompensa", reward.name, now())
      return reward
    })
  }

  async function deleteReward(id: string) {
    const a = await inBusiness(["owner", "manager"])
    await store.write(B(a.businessId), (db) => {
      const program = engine.programOf(db, a.businessId)
      if (program.stampRewardId === id) throw new ApiError("Es la recompensa de la tarjeta de sellos. Pide a LoyaLoop que la cambie primero.")
      if (db.customers.some((c) => c.earnedRewards.some((e) => e.rewardId === id)))
        throw new ApiError("Hay clientes con esta recompensa pendiente de canjear. Puedes pausarla en lugar de eliminarla.")
      const reward = db.rewards.find((r) => r.id === id && r.businessId === a.businessId)
      if (!reward) throw new ApiError("No encontramos esa recompensa.")
      db.rewards = db.rewards.filter((r) => r.id !== id)
      audit(db, a, a.businessId, "Eliminó una recompensa", reward.name, now())
    })
  }

  async function saveBranch(input: { id?: string; name: string; address: string }) {
    const a = await inBusiness(["owner"])
    return store.write(B(a.businessId), (db) => {
      const name = text(input.name, 80)
      if (!name) throw new ApiError("Escribe el nombre de la sucursal.")
      if (input.id) {
        const branch = db.branches.find((b) => b.id === input.id && b.businessId === a.businessId)
        if (!branch) throw new ApiError("No encontramos esa sucursal.")
        branch.name = name
        branch.address = text(input.address, 200)
        audit(db, a, a.businessId, "Editó una sucursal", branch.name, now())
        return branch
      }
      const branch: Branch = { id: uid("br_"), businessId: a.businessId, name, address: text(input.address, 200), code: readableCode(6), createdAt: iso() }
      db.branches.push(branch)
      db.registers.push({ id: uid("rg_"), businessId: a.businessId, branchId: branch.id, name: "Caja 1" })
      audit(db, a, a.businessId, "Creó una sucursal", branch.name, now())
      return branch
    })
  }

  async function deleteBranch(id: string) {
    const a = await inBusiness(["owner"])
    if (await store.countTransactions(a.businessId, { branchId: id })) throw new ApiError("Esta sucursal ya tiene actividad registrada y no se puede eliminar.")
    await store.write(B(a.businessId), (db) => {
      const branches = db.branches.filter((b) => b.businessId === a.businessId)
      if (branches.length <= 1) throw new ApiError("El negocio necesita al menos una sucursal.")
      const branch = branches.find((b) => b.id === id)
      if (!branch) throw new ApiError("No encontramos esa sucursal.")
      const registers = db.registers.filter((r) => r.branchId === id).map((r) => r.id)
      db.devices = db.devices.filter((d) => !registers.includes(d.registerId))
      db.registers = db.registers.filter((r) => r.branchId !== id)
      db.branches = db.branches.filter((b) => b.id !== id)
      audit(db, a, a.businessId, "Eliminó una sucursal", branch.name, now())
    })
  }

  async function saveRegister(input: { id?: string; name: string; branchId: string }) {
    const a = await inBusiness(["owner", "manager"])
    return store.write(B(a.businessId), (db) => {
      const name = text(input.name, 60)
      if (!name) throw new ApiError("Escribe el nombre de la caja.")
      if (!db.branches.some((b) => b.id === input.branchId && b.businessId === a.businessId)) throw new ApiError("Elige una sucursal.")
      if (input.id) {
        const register = db.registers.find((r) => r.id === input.id && r.businessId === a.businessId)
        if (!register) throw new ApiError("No encontramos esa caja.")
        register.name = name
        return register
      }
      const register: Register = { id: uid("rg_"), businessId: a.businessId, branchId: input.branchId, name }
      db.registers.push(register)
      audit(db, a, a.businessId, "Creó una caja", register.name, now())
      return register
    })
  }

  async function deleteRegister(id: string) {
    const a = await inBusiness(["owner", "manager"])
    if (await store.countTransactions(a.businessId, { registerId: id })) throw new ApiError("Esta caja ya tiene actividad registrada y no se puede eliminar.")
    await store.write(B(a.businessId), (db) => {
      const register = db.registers.find((r) => r.id === id && r.businessId === a.businessId)
      if (!register) throw new ApiError("No encontramos esa caja.")
      if (db.registers.filter((r) => r.branchId === register.branchId).length <= 1) throw new ApiError("Cada sucursal necesita al menos una caja.")
      db.devices = db.devices.filter((d) => d.registerId !== id)
      db.registers = db.registers.filter((r) => r.id !== id)
      audit(db, a, a.businessId, "Eliminó una caja", register.name, now())
    })
  }

  async function createPairingCode(registerId: string): Promise<{ code: string; expiresAt: string }> {
    const a = await inBusiness(["owner", "manager", "cashier"])
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = digits(6)
      if (await store.pairingCode(code)) continue
      return store.write(B(a.businessId), (db) => {
        const register = db.registers.find((r) => r.id === registerId && r.businessId === a.businessId)
        if (!register) throw new ApiError("No encontramos esa caja.")
        if (a.role === "cashier" && a.user.branchId && register.branchId !== a.user.branchId) throw new ApiError("Esa caja es de otra sucursal.", "forbidden")
        db.pairingCodes = db.pairingCodes.filter((p) => new Date(p.expiresAt).getTime() > now() && p.registerId !== registerId)
        const expiresAt = iso(now() + 15 * MINUTE)
        db.pairingCodes.push({ code, businessId: a.businessId, registerId, expiresAt })
        return { code, expiresAt }
      })
    }
    throw new ApiError("No se pudo generar el código. Inténtalo otra vez.")
  }

  async function unpairDevice(id: string) {
    const a = await inBusiness(["owner", "manager"])
    await store.write(B(a.businessId), (db) => {
      const device = db.devices.find((d) => d.id === id && d.businessId === a.businessId)
      if (!device) throw new ApiError("No encontramos ese dispositivo.")
      db.devices = db.devices.filter((d) => d.id !== id)
      audit(db, a, a.businessId, "Desvinculó un escáner", device.name, now())
    })
  }

  async function team(): Promise<TeamMember[]> {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
    return db.users.filter((u) => u.businessId === a.businessId).map((u) => (a.role === "owner" ? publicUser(u) : { ...publicUser(u), inviteToken: undefined }))
  }

  async function inviteMember(input: { name: string; email: string; role: Role; phone: string; excluded: boolean; branchId?: string }): Promise<{ link: string }> {
    const a = await inBusiness(["owner"])
    const name = text(input.name, 80)
    const email = text(input.email, 200).toLowerCase()
    if (!name) throw new ApiError("Escribe el nombre.")
    if (!isEmail(email)) throw new ApiError("Escribe un correo válido.")
    if (!["owner", "manager", "cashier"].includes(input.role)) throw new ApiError("Elige un rol.")
    if (await store.emailTaken(email)) throw new ApiError("Ya existe una cuenta con este correo.")
    const phone = input.phone ? normalizePhone(input.phone) : ""
    if (phone && phone.length !== 10) throw new ApiError("El teléfono debe tener 10 dígitos.")
    const token = readableCode(32)
    const businessName = await store.write(B(a.businessId), (db) => {
      if (input.branchId && !db.branches.some((b) => b.id === input.branchId)) throw new ApiError("Elige una sucursal.")
      db.users.push({ id: uid("u_"), name, email, password: "", role: input.role, businessId: a.businessId, branchId: input.branchId || undefined, phone, excludedFromEarning: !!input.excluded, active: true, inviteToken: token, createdAt: iso() })
      audit(db, a, a.businessId, "Invitó a una persona", `${name} (${email})`, now())
      return db.businesses.find((b) => b.id === a.businessId)!.name
    })
    const path = `#/invitacion/${token}`
    await sendEmail({
      to: email,
      subject: `Te invitaron al panel de ${businessName}`,
      heading: `Bienvenido al equipo de ${businessName}`,
      paragraphs: [`Hola, ${name}.`, `Te dieron acceso al panel de LoyaLoop de ${businessName}. Crea tu contraseña para entrar.`],
      action: { label: "Crear mi contraseña", url: link(path) },
      footnote: "Si no esperabas esta invitación, ignora este correo.",
    })
    return { link: path }
  }

  async function updateMember(id: string, input: { role: Role; phone: string; excluded: boolean; active: boolean; branchId?: string }) {
    const a = await inBusiness(["owner"])
    if (!["owner", "manager", "cashier"].includes(input.role)) throw new ApiError("Elige un rol.")
    await store.write(B(a.businessId), (db) => {
      const member = db.users.find((u) => u.id === id && u.businessId === a.businessId)
      if (!member) throw new ApiError("No encontramos a esa persona.")
      if (member.id === a.user.id && (input.role !== member.role || !input.active)) throw new ApiError("No puedes cambiar tu propio rol ni desactivar tu cuenta.")
      const owners = db.users.filter((u) => u.businessId === a.businessId && u.role === "owner" && u.active)
      if (member.role === "owner" && owners.length === 1 && (input.role !== "owner" || !input.active)) throw new ApiError("El negocio necesita al menos un dueño activo.")
      const phone = input.phone ? normalizePhone(input.phone) : ""
      if (phone && phone.length !== 10) throw new ApiError("El teléfono debe tener 10 dígitos.")
      Object.assign(member, { role: input.role, phone, excludedFromEarning: !!input.excluded, active: !!input.active, branchId: input.branchId || undefined })
      audit(db, a, a.businessId, "Actualizó a una persona del equipo", member.name, now())
    })
  }

  async function updateBusinessContact(input: { contactName: string; email: string; phone: string }) {
    const a = await inBusiness(["owner"])
    if (!isEmail(input.email)) throw new ApiError("Escribe un correo válido.")
    await store.write(B(a.businessId), (db) => {
      const business = db.businesses.find((b) => b.id === a.businessId)!
      Object.assign(business, { contactName: text(input.contactName, 80), email: text(input.email, 200), phone: normalizePhone(input.phone || "") })
      audit(db, a, a.businessId, "Actualizó los datos de contacto", "", now())
    })
  }

  async function notices(): Promise<(WalletNotice & { customerName: string })[]> {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
    const list = await store.notices(a.businessId, 100)
    return list.map((n) => ({ ...n, customerName: db.customers.find((c) => c.id === n.customerId)?.name || "" }))
  }

  // ---------------------------------------------------------------- notices and promotions

  async function saveNotices(input: { notify: Program["notify"]; messages: Program["messages"]; missYouDays?: number }) {
    const a = await inBusiness(["owner", "manager"])
    const notify: Program["notify"] = {}
    const messages: NonNullable<Program["messages"]> = {}
    for (const e of NOTICE_EVENTS) {
      const on = input.notify?.[e.key]
      if (typeof on === "boolean") notify[e.key] = on
      const raw = text(input.messages?.[e.key], 400)
      if (!raw) continue
      if (raw.length > MAX_NOTICE) throw new ApiError(`El aviso «${e.title}» es muy largo: máximo ${MAX_NOTICE} caracteres.`)
      const unknown = unknownVars(raw, e.vars)
      if (unknown.length) throw new ApiError(`El aviso «${e.title}» usa {${unknown[0]}}, que no está disponible en ese aviso.`)
      if (raw !== e.defaultText({ type: "points", birthdayBonus: 0 }) && raw !== e.defaultText({ type: "points", birthdayBonus: 1 })) messages[e.key] = raw
    }
    const days = Number(input.missYouDays ?? DEFAULT_MISS_YOU_DAYS)
    if (!Number.isInteger(days) || days < 7 || days > 365) throw new ApiError("«Te extrañamos» se puede enviar entre 7 y 365 días sin venir.")
    await store.write(B(a.businessId), (db) => {
      const program = engine.programOf(db, a.businessId)
      program.notify = { ...program.notify, ...notify }
      program.messages = messages
      program.missYouDays = days
      audit(db, a, a.businessId, "Actualizó los avisos", "", now())
    })
  }

  function checkAudience(db: DB, businessId: string, input: Audience): Audience {
    const kind = input?.kind
    if (kind === "all") return { kind }
    if (kind === "tier") {
      const program = engine.programOf(db, businessId)
      if (!program.tiers.some((t) => t.id === input.tierId)) throw new ApiError("Elige un nivel.")
      return { kind, tierId: input.tierId }
    }
    if (kind === "inactive" || kind === "recent") {
      const days = Number(input.days)
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new ApiError("Escribe de 1 a 365 días.")
      return { kind, days }
    }
    throw new ApiError("Elige a quién se envía.")
  }

  async function campaigns(): Promise<Campaign[]> {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
    return db.campaigns.filter((c) => c.businessId === a.businessId).sort((x, y) => (x.sendAt < y.sendAt ? 1 : -1)).slice(0, 50)
  }

  async function campaignAudience(audience: Audience): Promise<{ count: number; optedOut: number }> {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
    const checked = checkAudience(db, a.businessId, audience)
    const count = engine.audienceOf(db, a.businessId, checked, now()).length
    const everyone = engine.audienceOf(db, a.businessId, checked, now(), true).length
    return { count, optedOut: everyone - count }
  }

  async function createCampaign(input: { message: string; audience: Audience; sendAt?: string }): Promise<Campaign> {
    const a = await inBusiness(["owner", "manager"])
    const message = text(input.message, 400)
    if (!message) throw new ApiError("Escribe el mensaje.")
    if (message.length > MAX_NOTICE) throw new ApiError(`El mensaje es muy largo: máximo ${MAX_NOTICE} caracteres.`)
    const unknown = unknownVars(message, PROMOTION_VARS)
    if (unknown.length) throw new ApiError(`El mensaje usa {${unknown[0]}}, que no está disponible en promociones.`)
    const at = input.sendAt ? new Date(input.sendAt).getTime() : now()
    if (!Number.isFinite(at)) throw new ApiError("La fecha no es válida.")
    if (input.sendAt && at < now() - MINUTE) throw new ApiError("Elige una fecha y hora que no haya pasado.")
    if (at > now() + 90 * DAY) throw new ApiError("Puedes programar hasta 90 días adelante.")
    const sendNow = !input.sendAt || at <= now() + MINUTE
    return store.write(B(a.businessId), (db) => {
      const audience = checkAudience(db, a.businessId, input.audience)
      const day = engine.localTime(at).day
      const sameDay = db.campaigns.filter((c) => c.businessId === a.businessId && c.status !== "canceled" && engine.localTime(new Date(c.sentAt || c.sendAt).getTime()).day === day)
      if (sameDay.length >= MAX_PROMOTIONS_PER_DAY) throw new ApiError(`Puedes enviar hasta ${MAX_PROMOTIONS_PER_DAY} promociones por día. Elige otro día.`, "rate_limited")
      const campaign: Campaign = {
        id: uid("cp_"),
        businessId: a.businessId,
        message,
        audience,
        status: "scheduled",
        sendAt: iso(sendNow ? now() : at),
        createdBy: a.user.name,
        createdAt: iso(),
      }
      db.campaigns.unshift(campaign)
      if (sendNow) engine.sendCampaign(db, campaign, now())
      audit(db, a, a.businessId, sendNow ? "Envió una promoción" : "Programó una promoción", message, now())
      return campaign
    })
  }

  async function cancelCampaign(id: string) {
    const a = await inBusiness(["owner", "manager"])
    await store.write(B(a.businessId), (db) => {
      const campaign = db.campaigns.find((c) => c.id === id && c.businessId === a.businessId)
      if (!campaign) throw new ApiError("No encontramos esa promoción.", "not_found")
      if (campaign.status !== "scheduled") throw new ApiError("Esa promoción ya se envió.")
      campaign.status = "canceled"
      audit(db, a, a.businessId, "Canceló una promoción", campaign.message, now())
    })
  }

  /**
   * Server clock (every minute): daily rules for every business and scheduled
   * promotions that are due. Not callable from the browser.
   */
  async function tick(): Promise<{ sent: number }> {
    const global = await store.read("global")
    let sent = 0
    for (const business of global.businesses.filter((b) => b.status !== "paused")) {
      await maintain(business.id)
      const db = await store.read(B(business.id))
      if (!db.campaigns.some((c) => c.businessId === business.id && c.status === "scheduled" && new Date(c.sendAt).getTime() <= now())) continue
      sent += await store.write(B(business.id), (d) => {
        let count = 0
        for (const c of d.campaigns)
          if (c.businessId === business.id && c.status === "scheduled" && new Date(c.sendAt).getTime() <= now()) count += engine.sendCampaign(d, c, now())
        return count
      })
    }
    return { sent }
  }

  async function suspicious() {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
    return engine.suspiciousCustomers(db, a.businessId, now()).map((row) => ({ name: row.customer.name, id: row.customer.id, count: row.count, average: row.average }))
  }

  async function metrics(options: { days: number; branchId?: string }): Promise<Metrics> {
    const a = await inBusiness(["owner", "manager"])
    const db = await store.read(B(a.businessId))
    const days = [7, 30, 90].includes(Number(options.days)) ? Number(options.days) : 30
    const end = now()
    const span = days * DAY
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
    for (let i = days - 1; i >= 0; i--) {
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
    const { visitsTx: _v, ...rest } = current
    return {
      ...rest,
      previous: { newCustomers: previous.newCustomers, activeCustomers: previous.activeCustomers, visits: previous.visits, avgTicket: previous.avgTicket },
      series,
      totalCustomers: customersAll.length,
      reviewCount: db.payments.filter((p) => p.businessId === a.businessId && p.status === "review").length,
      usesPoints: engine.usesPoints(engine.programOf(db, a.businessId)),
    }
  }

  // ------------------------------------------------------------ admin

  async function adminBusinesses(): Promise<BusinessRow[]> {
    await asAdmin()
    const db = await store.read("global")
    const stats = new Map((await store.businessStats(iso(now() - 30 * DAY))).map((s) => [s.businessId, s]))
    return db.businesses.map((b) => {
      const integration = db.integrations.find((i) => i.businessId === b.id && i.status === "connected")
      const s = stats.get(b.id)
      return {
        ...b,
        customers: s?.customers || 0,
        branches: s?.branches || 0,
        transactions30d: s?.transactions || 0,
        integration: integration ? (integration.provider === "mercadopago" ? "Mercado Pago" : "Clip") : "Sin conectar",
        owner: db.users.find((u) => u.businessId === b.id && u.role === "owner")?.email,
        cardType: (db.programs.find((p) => p.businessId === b.id) || defaultProgram(b.id)).type,
      }
    })
  }

  async function adminBundle(businessId: string): Promise<Bundle & { team: TeamMember[]; audit: AuditEntry[] }> {
    await asAdmin()
    if (!(await store.business(businessId))) throw new ApiError("El negocio no existe.", "not_found")
    const db = await store.read(B(businessId))
    return {
      ...bundleOf(db, businessId),
      team: db.users.filter((u) => u.businessId === businessId).map(publicUser),
      audit: await store.audit({ businessId, limit: 200 }),
    }
  }

  async function createBusiness(input: NewBusiness): Promise<{ id: string; inviteLink: string }> {
    const a = await asAdmin()
    const name = text(input.name, 60)
    if (!name) throw new ApiError("Escribe el nombre del negocio.")
    if (!isEmail(input.email)) throw new ApiError("El correo de contacto no es válido.")
    if (!Array.isArray(input.branches) || !input.branches.length || input.branches.some((b) => !text(b.name))) throw new ApiError("Agrega al menos una sucursal con nombre.")
    const ownerEmail = text(input.ownerEmail, 200).toLowerCase()
    if (!isEmail(ownerEmail)) throw new ApiError("El correo del dueño no es válido.")
    if (await store.emailTaken(ownerEmail)) throw new ApiError("Ya existe una cuenta con el correo del dueño.")
    validateProgram(input.program)
    const id = uid("b_")
    const token = readableCode(32)
    await store.write(B(id), (db) => {
      const created = iso()
      const discreet = !!input.discreet
      db.businesses.push({ id, name, sector: text(input.sector, 60), contactName: text(input.contactName, 80), email: text(input.email, 200), phone: normalizePhone(input.phone || ""), status: input.status === "active" ? "active" : "trial", brand: input.brand, discreet, neutralName: text(input.neutralName, 40) || "Mi tarjeta de beneficios", locationAlerts: discreet ? false : !!input.locationAlerts, askPhone: !!input.askPhone, createdAt: created })
      for (const b of input.branches) {
        const branchId = uid("br_")
        db.branches.push({ id: branchId, businessId: id, name: text(b.name, 80), address: text(b.address, 200), code: readableCode(6), createdAt: created })
        db.registers.push({ id: uid("rg_"), businessId: id, branchId, name: "Caja 1" })
      }
      const rewardIds: string[] = []
      for (const r of (input.rewards || []).filter((x) => text(x.name))) {
        const rid = uid("rw_")
        rewardIds.push(rid)
        db.rewards.push({ id: rid, businessId: id, name: text(r.name, 80), description: text(r.description, 300), cost: Number(r.cost) || 0, active: true, createdAt: created })
      }
      db.programs.push({ ...input.program, businessId: id, stampRewardId: input.stampRewardIndex !== undefined ? rewardIds[input.stampRewardIndex] : undefined })
      for (const provider of ["mercadopago", "clip"] as Provider[])
        db.integrations.push({ businessId: id, provider, status: input.provider === provider ? "connected" : "not_connected", connectedAt: input.provider === provider ? created : undefined })
      db.users.push({ id: uid("u_"), name: text(input.ownerName, 80) || text(input.contactName, 80), email: ownerEmail, password: "", role: "owner", businessId: id, excludedFromEarning: false, active: true, inviteToken: token, createdAt: created })
      audit(db, a, id, "Dio de alta el negocio", `${input.branches.length} sucursal(es), tarjeta de ${input.program.type}`, now())
    })
    const path = `#/invitacion/${token}`
    await sendEmail({
      to: ownerEmail,
      subject: `Tu panel de LoyaLoop para ${name}`,
      heading: "Tu tarjeta de lealtad está lista",
      paragraphs: [`Hola, ${text(input.ownerName, 80) || text(input.contactName, 80)}.`, `Ya configuramos la tarjeta de lealtad de ${name}. Crea tu contraseña para ver a tus clientes, sus visitas y sus recompensas.`],
      action: { label: "Entrar a mi panel", url: link(path) },
    })
    return { id, inviteLink: path }
  }

  async function adminSaveProgram(businessId: string, program: Omit<Program, "businessId">) {
    const a = await asAdmin()
    validateProgram(program)
    await store.write(B(businessId), (db) => {
      if (!db.businesses.some((b) => b.id === businessId)) throw new ApiError("El negocio no existe.")
      if (program.type === "stamps" && program.stampRewardId && !db.rewards.some((r) => r.id === program.stampRewardId && r.businessId === businessId))
        throw new ApiError("La recompensa de los sellos no pertenece a este negocio.")
      const index = db.programs.findIndex((p) => p.businessId === businessId)
      const current = db.programs.find((p) => p.businessId === businessId)
      // The owner's notice texts survive an admin edit of the rules.
      const next = { messages: current?.messages, missYouDays: current?.missYouDays, ...program, businessId, tiers: [...program.tiers].sort((x, y) => x.threshold - y.threshold) }
      if (index === -1) db.programs.push(next)
      else db.programs[index] = next
      if (program.type !== "tiers") for (const c of db.customers) if (c.businessId === businessId) c.tierId = undefined
      for (const c of db.customers.filter((x) => x.businessId === businessId)) engine.recomputeTier(db, c, now())
      audit(db, a, businessId, "Actualizó la tarjeta y sus reglas", `Tipo ${program.type}`, now())
    })
  }

  async function adminUpdateBusiness(businessId: string, input: Partial<Pick<Business, "name" | "sector" | "contactName" | "email" | "phone" | "status" | "brand" | "discreet" | "neutralName" | "locationAlerts" | "askPhone">>) {
    const a = await asAdmin()
    const allowed = ["name", "sector", "contactName", "email", "phone", "status", "brand", "discreet", "neutralName", "locationAlerts", "askPhone"] as const
    const patch: Record<string, unknown> = {}
    for (const key of allowed) if (input[key] !== undefined) patch[key] = input[key]
    if (patch.askPhone !== undefined) patch.askPhone = !!patch.askPhone
    if (patch.email !== undefined && !isEmail(String(patch.email))) throw new ApiError("El correo de contacto no es válido.")
    if (patch.name !== undefined && !text(patch.name)) throw new ApiError("El nombre no puede quedar vacío.")
    if (patch.status !== undefined && !["active", "trial", "paused"].includes(String(patch.status))) throw new ApiError("Estado no válido.")
    await store.write(B(businessId), (db) => {
      const business = db.businesses.find((b) => b.id === businessId)
      if (!business) throw new ApiError("El negocio no existe.")
      Object.assign(business, patch)
      if (business.discreet) business.locationAlerts = false
      audit(db, a, businessId, input.status ? `Cambió el estado a ${input.status}` : "Editó los datos del negocio", "", now())
    })
  }

  async function adminSetIntegration(businessId: string, provider: Provider, status: "connected" | "not_connected") {
    const a = await asAdmin()
    await store.write(B(businessId), (db) => {
      const row = db.integrations.find((i) => i.businessId === businessId && i.provider === provider)
      if (!row) throw new ApiError("Integración desconocida.")
      if (status === "connected") {
        for (const other of db.integrations) if (other.businessId === businessId && other.provider !== provider && other.status === "connected") other.status = "not_connected"
        row.connectedAt = iso()
      }
      row.status = status === "connected" ? "connected" : "not_connected"
      row.lastError = undefined
      const label = provider === "mercadopago" ? "Mercado Pago" : "Clip"
      audit(db, a, businessId, status === "connected" ? `Conectó ${label}` : `Desconectó ${label}`, "", now())
    })
  }

  async function adminMetrics(): Promise<GlobalMetrics> {
    await asAdmin()
    const db = await store.read("global")
    const stats = await store.businessStats(iso(now() - 30 * DAY))
    const sum = (key: "customers" | "branches" | "transactions" | "inReview") => stats.reduce((s, x) => s + x[key], 0)
    return {
      businesses: db.businesses.length,
      active: db.businesses.filter((b) => b.status === "active").length,
      trial: db.businesses.filter((b) => b.status === "trial").length,
      paused: db.businesses.filter((b) => b.status === "paused").length,
      customers: sum("customers"),
      branches: sum("branches"),
      transactions30d: sum("transactions"),
      inReview: sum("inReview"),
      integrationErrors: db.integrations
        .filter((i) => i.status === "error")
        .map((i) => ({ business: db.businesses.find((b) => b.id === i.businessId)?.name || "", provider: i.provider, message: i.lastError || "" })),
      newLeads: db.leads.filter((l) => l.status === "new").length,
    }
  }

  async function adminAudit(): Promise<(AuditEntry & { business?: string })[]> {
    await asAdmin()
    const db = await store.read("global")
    const entries = await store.audit({ limit: 200 })
    return entries.map((e) => ({ ...e, business: db.businesses.find((b) => b.id === e.businessId)?.name }))
  }

  async function leads(): Promise<Lead[]> {
    await asAdmin()
    return (await store.read("global")).leads
  }

  async function markLead(id: string, status: Lead["status"]) {
    await asAdmin()
    await store.write("global", (db) => {
      const lead = db.leads.find((l) => l.id === id)
      if (lead) lead.status = status === "contacted" ? "contacted" : "new"
    })
  }

  /** Records a payment from the provider and tries to match it with a scan. */
  async function recordPayment(input: IncomingPayment): Promise<engine.PaymentOutcome & { customerName?: string; duplicate?: boolean }> {
    if (!(input.amount > 0) || input.tip < 0 || input.tip >= input.amount) throw new ApiError("El monto debe ser mayor que la propina.")
    return store.write(B(input.businessId), (db) => {
      const register = db.registers.find((r) => r.id === input.registerId && r.businessId === input.businessId)
      if (!register) throw new ApiError("Elige una caja.")
      const integration = db.integrations.find((i) => i.businessId === input.businessId && i.status === "connected" && i.provider === input.provider)
      if (!integration) throw new ApiError("Este negocio no tiene un sistema de cobro conectado.")
      const previous = db.payments.find((p) => p.provider === input.provider && p.externalId === input.externalId)
      if (previous) return { kind: "unmatched" as const, duplicate: true }
      const payment: Payment = { id: uid("p_"), businessId: input.businessId, registerId: input.registerId, provider: input.provider, externalId: input.externalId, amount: input.amount, tip: input.tip, status: "unmatched", createdAt: iso() }
      const outcome = engine.registerPayment(db, payment, now())
      const customerName = outcome.kind === "matched" ? db.customers.find((c) => c.id === outcome.tx.customerId)?.name : undefined
      return { ...outcome, customerName }
    })
  }

  /** Preview only: what the provider's webhook will send when a register charges. */
  async function simulatePayment(businessId: string, registerId: string, amount: number, tip: number) {
    const a = await asAdmin()
    if (!ctx.simulator) throw new ApiError("El simulador de cobros está apagado en este servidor.", "forbidden")
    const db = await store.read(B(businessId))
    const integration = db.integrations.find((i) => i.businessId === businessId && i.status === "connected")
    if (!integration) throw new ApiError("Este negocio no tiene un sistema de cobro conectado.")
    const externalId = `${integration.provider === "mercadopago" ? "MP" : "CL"}-${digits(8)}`
    const outcome = await recordPayment({ businessId, registerId, provider: integration.provider, externalId, amount: Number(amount), tip: Number(tip) || 0 })
    await store.write(B(businessId), (d) => audit(d, a, businessId, "Simuló un cobro de prueba", `${externalId} por $${amount}`, now()))
    return outcome
  }

  // ------------------------------------------------------------ public: registration

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
      askPhone: !!business.askPhone,
    }
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

  async function branchByCode(code: string) {
    const branch = typeof code === "string" && /^[A-Z0-9]{4,12}$/i.test(code) ? await store.branchByCode(code) : undefined
    if (!branch) throw new ApiError("Este enlace no corresponde a ninguna sucursal.", "not_found")
    const business = await store.business(branch.businessId)
    if (!business || business.status === "paused") throw new ApiError("Este programa no está disponible por ahora.", "paused")
    return { branch, business }
  }

  async function registration(code: string): Promise<{ card: PublicCard; branchName: string }> {
    const { branch, business } = await branchByCode(code)
    const db = await store.read(B(business.id))
    return { card: publicCard(db, business.id), branchName: business.discreet ? "" : branch.name }
  }

  async function sendCode(code: string, phoneInput: string, mode: "new" | "recover"): Promise<{ previewCode: string; existing: boolean; channel: CodeChannel | "preview" }> {
    const { business } = await branchByCode(code)
    // Businesses that do not ask for the phone never send codes (no cost, no abuse).
    if (!business.askPhone) throw new ApiError("Este negocio no usa el celular para la tarjeta.", "phone_not_used")
    const phone = normalizePhone(String(phoneInput || ""))
    if (phone.length !== 10) throw new ApiError("Escribe un celular de 10 dígitos.")
    const result = await store.write(B(business.id), (db) => {
      const existing = db.customers.some((c) => c.businessId === business.id && c.phone === phone)
      if (mode === "recover" && !existing) throw new ApiError("No encontramos una tarjeta con este celular. Puedes crear una.", "not_found")
      const previous = db.verifications.find((v) => v.phone === phone && v.businessId === business.id)
      if (previous && now() - new Date(previous.sentAt).getTime() < 30_000) throw new ApiError("Espera unos segundos antes de pedir otro código.", "rate_limited")
      db.verifications = db.verifications.filter((v) => !(v.phone === phone && v.businessId === business.id) && new Date(v.expiresAt).getTime() > now())
      const sms = digits(6)
      db.verifications.push({ phone, businessId: business.id, code: sms, attempts: 0, sentAt: iso(), expiresAt: iso(now() + 10 * MINUTE) })
      return { sms, existing }
    })
    const name = business.discreet ? business.neutralName : business.name
    const { verifier, code: deliver, codeChannel = "sms" } = ctx.messenger
    if (verifier || deliver) {
      try {
        if (verifier) await verifier.start(phone)
        else await deliver!(phone, result.sms)
      } catch (error) {
        console.error("[codigo] no se pudo enviar", (error as Error).message)
        throw new ApiError("No pudimos enviar el código. Revisa el número e inténtalo otra vez.", "unavailable")
      }
      return { previewCode: "", existing: result.existing, channel: codeChannel }
    }
    if (ctx.messenger.channels.sms) {
      await ctx.messenger.sms(phone, `${result.sms} es tu código de ${name}. Vence en 10 minutos.`)
      return { previewCode: ctx.preview ? result.sms : "", existing: result.existing, channel: "sms" }
    }
    if (!ctx.preview) throw new ApiError("Por ahora no podemos enviar códigos. Inténtalo más tarde.", "unavailable")
    return { previewCode: result.sms, existing: result.existing, channel: "preview" }
  }

  async function completeRegistration(code: string, input: RegistrationInput, sms: string): Promise<{ card: PublicCard; holder: CardHolder; created: boolean; links: WalletLinks }> {
    const { branch, business } = await branchByCode(code)
    const phone = normalizePhone(String(input.phone || ""))
    const typed = String(sms || "").trim()
    // With Twilio Verify the provider knows the code: ask it before touching the data.
    let approved = false
    if (ctx.messenger.verifier) {
      const pending = (await store.read(B(business.id))).verifications.find((x) => x.phone === phone && x.businessId === business.id)
      if (pending && pending.attempts < 5 && new Date(pending.expiresAt).getTime() >= now() && /^\d{4,10}$/.test(typed)) {
        try {
          approved = await ctx.messenger.verifier.check(phone, typed)
        } catch (error) {
          console.error("[sms] no se pudo revisar el código", (error as Error).message)
          throw new ApiError("No pudimos revisar el código. Inténtalo otra vez.", "unavailable")
        }
      }
    }
    const result = await store.write(B(business.id), (db) => {
      const v = db.verifications.find((x) => x.phone === phone && x.businessId === business.id)
      if (!v || new Date(v.expiresAt).getTime() < now()) throw new ApiError("El código venció. Pide uno nuevo.", "expired")
      if (v.attempts >= 5) throw new ApiError("Demasiados intentos. Pide un código nuevo.", "too_many")
      if (ctx.messenger.verifier ? !approved : v.code !== typed) {
        // Count the failed attempt: return instead of throwing so it is saved.
        v.attempts += 1
        return { wrong: 5 - v.attempts }
      }
      db.verifications = db.verifications.filter((x) => x !== v)
      let customer = db.customers.find((c) => c.businessId === business.id && c.phone === phone)
      let created = false
      if (!customer) {
        if (!input.privacy) throw new ApiError("Necesitas aceptar el aviso de privacidad.")
        const name = text(input.name, 60)
        if (!name) throw new ApiError("Escribe tu nombre.")
        const email = text(input.email, 200)
        if (email && !isEmail(email)) throw new ApiError("El correo no es válido.")
        const at = iso()
        let token = customerToken()
        while (db.customers.some((c) => c.token === token)) token = customerToken()
        customer = {
          id: uid("c_"),
          businessId: business.id,
          name,
          phone,
          email,
          birthday: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(input.birthday || "") ? input.birthday : "",
          token,
          points: 0,
          stamps: 0,
          earnedRewards: [],
          branchId: branch.id,
          promotionsOptIn: !!input.promotions,
          privacyAcceptedAt: at,
          createdAt: at,
          lastActivityAt: at,
        }
        db.customers.push(customer)
        engine.welcome(db, customer, now())
        engine.recomputeTier(db, customer, now())
        created = true
      }
      return { card: publicCard(db, business.id), holder: holder(db, customer), created, customerId: customer.id }
    })
    if ("wrong" in result) throw new ApiError(`El código no coincide. Te quedan ${result.wrong} intentos.`, "wrong_code")
    const { customerId, ...rest } = result
    // The card exists even if a wallet fails; the person can add it later with «Recupérala».
    return cardWithLinks(business.id, customerId, rest)
  }

  async function cardWithLinks(businessId: string, customerId: string, rest: { card: PublicCard; holder: CardHolder; created: boolean }) {
    let links: WalletLinks = {}
    if (ctx.wallets) {
      try {
        links = await ctx.wallets.links(businessId, customerId)
      } catch (error) {
        console.error("[wallet] no se pudo preparar el pase", (error as Error).message)
      }
    }
    return { ...rest, links }
  }

  /** Card with only a name (or nickname): businesses that do not ask for the phone. */
  async function createCard(code: string, input: Omit<RegistrationInput, "phone">): Promise<{ card: PublicCard; holder: CardHolder; created: boolean; links: WalletLinks }> {
    const { branch, business } = await branchByCode(code)
    if (business.askPhone) throw new ApiError("Este negocio pide tu celular para crear la tarjeta.", "phone_required")
    if (!input?.privacy) throw new ApiError("Necesitas aceptar el aviso de privacidad.")
    const name = text(input.name, 60)
    if (!name) throw new ApiError("Escribe tu nombre o cómo te decimos.")
    const email = text(input.email, 200).toLowerCase()
    if (email && !isEmail(email)) throw new ApiError("El correo no es válido.")
    const result = await store.write(B(business.id), (db) => {
      const at = iso()
      let token = customerToken()
      while (db.customers.some((c) => c.token === token)) token = customerToken()
      const customer: Customer = {
        id: uid("c_"),
        businessId: business.id,
        name,
        phone: "",
        email,
        birthday: /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(input.birthday || "") ? input.birthday : "",
        token,
        points: 0,
        stamps: 0,
        earnedRewards: [],
        branchId: branch.id,
        promotionsOptIn: !!input.promotions,
        privacyAcceptedAt: at,
        createdAt: at,
        lastActivityAt: at,
      }
      db.customers.push(customer)
      engine.welcome(db, customer, now(), true)
      engine.recomputeTier(db, customer, now())
      return { card: publicCard(db, business.id), holder: holder(db, customer), created: true, customerId: customer.id }
    })
    const { customerId, ...rest } = result
    return cardWithLinks(business.id, customerId, rest)
  }

  /** Emails a link to open the card again. Same answer whether or not the email has a card. */
  async function sendCardLink(code: string, emailInput: string): Promise<{ previewLink?: string }> {
    const { business } = await branchByCode(code)
    const email = text(emailInput, 200).toLowerCase()
    if (!isEmail(email)) throw new ApiError("Escribe un correo válido.")
    const token = readableCode(32)
    const found = await store.write(B(business.id), (db) => {
      const customer = db.customers
        .filter((c) => c.businessId === business.id && c.email.toLowerCase() === email)
        .sort((x, y) => (x.lastActivityAt < y.lastActivityAt ? 1 : -1))[0]
      if (!customer) return null
      customer.cardLink = { token, expiresAt: iso(now() + 30 * MINUTE) }
      return customer.name
    })
    if (!found) return {}
    const name = business.discreet ? business.neutralName : business.name
    const path = `#/r/${code}/tarjeta/${token}`
    await sendEmail({
      to: email,
      subject: `Tu tarjeta de ${name}`,
      heading: "Aquí está tu tarjeta",
      paragraphs: [`Hola, ${found.split(" ")[0]}.`, `Abre el enlace en tu celular para ver tu tarjeta de ${name} y guardarla en tu Wallet. Vence en 30 minutos.`],
      action: { label: "Abrir mi tarjeta", url: link(path) },
      footnote: "Si no lo pediste, ignora este correo.",
    })
    return ctx.preview ? { previewLink: path } : {}
  }

  async function openCardLink(code: string, token: string): Promise<{ card: PublicCard; holder: CardHolder; created: boolean; links: WalletLinks }> {
    const { business } = await branchByCode(code)
    const clean = String(token || "")
    if (!/^[A-Z0-9]{32}$/.test(clean)) throw new ApiError("El enlace no es válido.", "not_found")
    const db = await store.read(B(business.id))
    const customer = db.customers.find((c) => c.businessId === business.id && c.cardLink?.token === clean)
    if (!customer || new Date(customer.cardLink!.expiresAt).getTime() < now()) throw new ApiError("El enlace venció. Pide otro desde «¿Ya tienes tarjeta?».", "expired")
    return cardWithLinks(business.id, customer.id, { card: publicCard(db, business.id), holder: holder(db, customer), created: false })
  }

  async function recoverCard(code: string, phoneInput: string, sms: string) {
    return completeRegistration(code, { name: "", phone: phoneInput, email: "", birthday: "", promotions: false, privacy: false }, sms)
  }

  async function submitLead(input: Omit<Lead, "id" | "status" | "createdAt">) {
    const lead = {
      name: text(input.name, 80),
      company: text(input.company, 80),
      email: text(input.email, 200),
      phone: text(input.phone, 30),
      branches: text(input.branches, 40),
      preferredDate: text(input.preferredDate, 10),
      preferredTime: text(input.preferredTime, 40),
      notes: text(input.notes, 500),
    }
    if (!lead.name || !lead.company) throw new ApiError("Escribe tu nombre y el de tu negocio.")
    if (!isEmail(lead.email)) throw new ApiError("Escribe un correo válido.")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lead.preferredDate) || !lead.preferredTime) throw new ApiError("Elige fecha y horario.")
    await store.write("global", (db) => {
      db.leads.unshift({ ...lead, id: uid("l_"), status: "new", createdAt: iso() })
    })
  }

  // ------------------------------------------------------------ kiosk

  /** Removes this browser's previous scanner, whatever business it belonged to. */
  async function dropOwnDevice() {
    const token = ctx.device()
    const old = token ? await store.deviceByToken(token) : undefined
    if (old)
      await store.write(B(old.businessId), (db) => {
        db.devices = db.devices.filter((d) => d.id !== old.id)
      })
  }

  async function pairDevice(code: string, name: string): Promise<void> {
    const clean = String(code || "").replace(/\D/g, "")
    const found = clean.length === 6 ? await store.pairingCode(clean) : undefined
    if (!found) throw new ApiError("El código no es válido o ya venció. Genera uno nuevo desde el panel.", "invalid_code")
    // One browser is one scanner: pairing again replaces the old link.
    await dropOwnDevice()
    const token = `dev_${readableCode(40)}`
    await store.write(B(found.businessId), (db) => {
      db.pairingCodes = db.pairingCodes.filter((p) => new Date(p.expiresAt).getTime() > now())
      const pairing = db.pairingCodes.find((p) => p.code === clean)
      if (!pairing) throw new ApiError("El código no es válido o ya venció. Genera uno nuevo desde el panel.", "invalid_code")
      const register = db.registers.find((r) => r.id === pairing.registerId)
      if (!register) throw new ApiError("La caja ya no existe.")
      db.devices.push({ id: uid("dv_"), businessId: pairing.businessId, registerId: pairing.registerId, name: text(name, 40) || `Escáner de ${register.name}`, token, pairedAt: iso(), lastSeenAt: iso() })
      db.pairingCodes = db.pairingCodes.filter((p) => p !== pairing)
    })
    ctx.setDevice(token)
  }

  /** «Desvincular» on the scanner itself: the panel stops listing it too. */
  async function kioskUnpair(): Promise<void> {
    await dropOwnDevice()
    ctx.setDevice(null)
  }

  async function kioskDevice(): Promise<Device> {
    const token = ctx.device()
    const device = token ? await store.deviceByToken(token) : undefined
    if (!device) throw new ApiError("Este escáner ya no está vinculado.", "unpaired")
    const business = await store.business(device.businessId)
    if (!business || business.status === "paused") throw new ApiError("La cuenta del negocio está pausada.", "paused")
    return device
  }

  async function kiosk(): Promise<KioskInfo> {
    const device = await kioskDevice()
    const db = await store.read(B(device.businessId))
    const business = db.businesses.find((b) => b.id === device.businessId)!
    const register = db.registers.find((r) => r.id === device.registerId)!
    // Throttled heartbeat so the panel shows the device as online.
    if (now() - new Date(device.lastSeenAt).getTime() > MINUTE)
      await store.write(B(device.businessId), (d) => {
        const dev = d.devices.find((x) => x.id === device.id)
        if (dev) dev.lastSeenAt = iso()
      })
    return {
      businessId: business.id,
      registerId: register.id,
      businessName: business.discreet ? business.neutralName : business.name,
      brand: business.brand,
      registerName: register.name,
      branchName: db.branches.find((b) => b.id === register.branchId)?.name || "",
      deviceName: device.name,
      type: engine.programOf(db, business.id).type,
      integrated: engine.hasIntegration(db, business.id),
    }
  }

  function kioskView(db: DB, scan: Scan): KioskScan {
    const c = db.customers.find((x) => x.id === scan.customerId)!
    const program = engine.programOf(db, c.businessId)
    const tx =
      scan.status === "visit"
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

  async function kioskScan(raw: string): Promise<KioskScan> {
    if (ctx.online && !ctx.online()) throw new ApiError("Sin conexión. El escaneo no se registró.", "offline")
    const device = await kioskDevice()
    return store.write(B(device.businessId), (db) => {
      const dev = db.devices.find((d) => d.id === device.id)!
      const outcome = engine.registerScan(db, dev, normalizeToken(String(raw || "")), now())
      if (outcome.kind === "error") throw new ApiError(outcome.message, "scan_rejected")
      dev.lastSeenAt = iso()
      return kioskView(db, outcome.scan)
    })
  }

  async function kioskScanStatus(scanId: string): Promise<KioskScan> {
    const device = await kioskDevice()
    let db = await store.read(B(device.businessId))
    const expired = db.scans.some((s) => s.id === scanId && s.status === "pending" && now() - new Date(s.createdAt).getTime() > 5 * MINUTE)
    if (expired) {
      await store.write(B(device.businessId), (d) => engine.expireScans(d, now()))
      db = await store.read(B(device.businessId))
    }
    const scan = db.scans.find((s) => s.id === scanId && s.deviceId === device.id)
    if (!scan) throw new ApiError("El escaneo ya no existe.", "not_found")
    return kioskView(db, scan)
  }

  async function kioskRedeem(scanId: string, rewardId: string, kind: "points" | "earned"): Promise<KioskScan & { redeemed: string }> {
    const device = await kioskDevice()
    return store.write(B(device.businessId), (db) => {
      const dev = db.devices.find((d) => d.id === device.id)!
      const scan = db.scans.find((s) => s.id === scanId && s.deviceId === device.id)
      if (!scan) throw new ApiError("Vuelve a escanear la tarjeta.", "not_found")
      if (now() - new Date(scan.createdAt).getTime() > 5 * MINUTE) throw new ApiError("Pasaron más de 5 minutos. Vuelve a escanear la tarjeta.", "expired")
      const customer = db.customers.find((c) => c.id === scan.customerId)!
      const tx = rule(() => engine.redeem(db, customer, kind === "earned" ? { earnedId: rewardId } : { rewardId }, { device: dev }, now()))
      return { ...kioskView(db, scan), redeemed: tx.reason }
    })
  }

  return {
    // session
    me,
    login,
    logout,
    requestPasswordReset,
    resetPassword,
    invitation,
    acceptInvitation,
    changePassword,
    impersonate,
    stopImpersonating,
    // business
    bundle,
    customers,
    customer,
    adjustBalance,
    exportCustomersCsv,
    activity,
    refundPurchase,
    reviewQueue,
    resolveReview,
    saveReward,
    deleteReward,
    saveBranch,
    deleteBranch,
    saveRegister,
    deleteRegister,
    createPairingCode,
    unpairDevice,
    team,
    inviteMember,
    updateMember,
    updateBusinessContact,
    notices,
    saveNotices,
    campaigns,
    campaignAudience,
    createCampaign,
    cancelCampaign,
    tick,
    suspicious,
    metrics,
    // admin
    adminBusinesses,
    adminBundle,
    createBusiness,
    adminSaveProgram,
    adminUpdateBusiness,
    adminSetIntegration,
    adminMetrics,
    adminAudit,
    leads,
    markLead,
    simulatePayment,
    // public
    registration,
    sendCode,
    completeRegistration,
    recoverCard,
    createCard,
    sendCardLink,
    openCardLink,
    submitLead,
    // kiosk
    pairDevice,
    kioskUnpair,
    kiosk,
    kioskScan,
    kioskScanStatus,
    kioskRedeem,
    // server-only (not exposed over RPC)
    recordPayment,
  }
}

export type Service = ReturnType<typeof createService>

/** Methods the browser may call over HTTP. recordPayment (webhooks) and tick (server clock) are not here. */
export const PUBLIC_METHODS = [
  "me", "login", "logout", "requestPasswordReset", "resetPassword", "invitation", "acceptInvitation", "changePassword", "impersonate", "stopImpersonating",
  "bundle", "customers", "customer", "adjustBalance", "exportCustomersCsv", "activity", "refundPurchase", "reviewQueue", "resolveReview",
  "saveReward", "deleteReward", "saveBranch", "deleteBranch", "saveRegister", "deleteRegister", "createPairingCode", "unpairDevice",
  "team", "inviteMember", "updateMember", "updateBusinessContact", "notices", "saveNotices", "campaigns", "campaignAudience", "createCampaign", "cancelCampaign", "suspicious", "metrics",
  "adminBusinesses", "adminBundle", "createBusiness", "adminSaveProgram", "adminUpdateBusiness", "adminSetIntegration", "adminMetrics", "adminAudit", "leads", "markLead", "simulatePayment",
  "registration", "sendCode", "completeRegistration", "recoverCard", "createCard", "sendCardLink", "openCardLink", "submitLead",
  "pairDevice", "kioskUnpair", "kiosk", "kioskScan", "kioskScanStatus", "kioskRedeem",
] as const satisfies readonly (keyof Service)[]

export type PublicMethod = (typeof PUBLIC_METHODS)[number]

/** Calls that only read: the browser does not need to refresh other views after them. */
export const READ_METHODS = new Set<string>([
  "me", "invitation", "bundle", "customers", "customer", "exportCustomersCsv", "activity", "reviewQueue", "team", "notices", "campaigns", "campaignAudience", "suspicious", "metrics",
  "adminBusinesses", "adminBundle", "adminMetrics", "adminAudit", "leads", "registration", "kiosk", "kioskScanStatus",
])
