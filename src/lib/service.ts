// LoyaLoop's business logic: every rule and permission check lives here.
// The same code runs in two places:
//  - on the server, with a PostgreSQL store (server/src/pgStore.ts)
//  - in the browser preview, with a store kept in localStorage (memoryStore.ts)
// The pages never call this directly; they go through src/lib/api.ts.

import * as engine from "./engine"
import { DEFAULT_MISS_YOU_DAYS, MAX_NOTICE, MAX_PROMOTIONS_PER_DAY, NOTICE_EVENTS, NOTICES_PRO_MESSAGE, PROMOTION_VARS, planHasNotices, unknownVars, type Audience } from "./notices"
import { parseLocation, type LatLng } from "./location"
import { DEMO_BUSINESS_ID, DEMO_CODE, DEMO_RETENTION_DAYS, defaultProgram, demoBusiness } from "./seed"
import type {
  Campaign,
  AuditEntry,
  Billing,
  BillingCharge,
  SubscriptionStatus,
  Branch,
  Business,
  CardType,
  Customer,
  DB,
  Device,
  Lead,
  Prospect,
  ProspectStage,
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
  /** Erases a business and everything in it: team, branches, scanners, customers, history and passes. */
  deleteBusiness(id: string): Promise<void>
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

/** A monthly subscription as the payment provider reports it. */
export interface SubscriptionInfo {
  id: string
  status: SubscriptionStatus
  /** Our business id, sent when the subscription was created. */
  externalReference: string
  amount: number
  payerEmail: string
  lastChargeAt?: string
  nextChargeAt?: string
}

/** One monthly charge of a subscription. */
export interface SubscriptionCharge {
  id: string
  subscriptionId: string
  status: BillingCharge["status"]
  amount: number
  at: string
}

/** Automatic monthly charges to businesses (Mercado Pago subscriptions, LoyaLoop's own account). */
export interface Subscriptions {
  /** Creates a subscription waiting for the payer's card; `url` is Mercado Pago's checkout. */
  create(input: { reason: string; externalReference: string; payerEmail: string; amount: number; backUrl: string }): Promise<{ id: string; url: string }>
  get(id: string): Promise<SubscriptionInfo>
  update(id: string, change: { amount?: number; status?: "cancelled" }): Promise<void>
  charge(id: string): Promise<SubscriptionCharge>
}

/** A payment from the provider as LoyaLoop read it, for the admin's log. */
export interface ProviderEvent {
  at: string
  externalId: string
  amount: number
  status: "processed" | "ignored" | "error" | "received"
  detail: string
}

/** Server only: each business's Mercado Pago account, its Point terminals and the payments read from it. */
export interface PaymentAccounts {
  /** «Conectar con Mercado Pago» needs LoyaLoop's own application (MERCADOPAGO_CLIENT_ID/SECRET). */
  oauth: boolean
  /** Why credentials cannot be stored (no INTEGRATIONS_KEY), if so. */
  problem?: string
  status(businessId: string): Promise<{ connected: boolean; method?: "oauth" | "token"; account?: string; lastSyncAt?: string; lastError?: string }>
  connectWithToken(businessId: string, token: string): Promise<{ account: string }>
  /** Link the owner opens to authorize LoyaLoop in Mercado Pago. */
  connectLink(businessId: string): string
  disconnect(businessId: string): Promise<void>
  terminals(businessId: string): Promise<{ id: string; mode: string }[]>
  events(businessId: string): Promise<ProviderEvent[]>
}

export interface MercadoPagoPanel {
  available: boolean
  oauth: boolean
  problem?: string
  connected: boolean
  method?: "oauth" | "token"
  account?: string
  lastSyncAt?: string
  lastError?: string
  link?: string
  terminals: { id: string; mode: string; registerId?: string }[]
  terminalsError?: string
  registers: { id: string; name: string; branch: string; terminalId?: string }[]
  events: ProviderEvent[]
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
  /** Charges businesses every month. Without it, LoyaLoop charges by hand. */
  subscriptions?: Subscriptions
  /** Mercado Pago accounts of the businesses (server only). */
  paymentAccounts?: PaymentAccounts
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
  status: "pending" | "active" | "trial"
  /** Starter: one branch and a stamps card the owner edits. Unset: Pro. */
  plan?: "starter" | "pro"
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
  /** The prospect this business came from, to close it in the sales list. */
  prospectId?: string
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
  /** Registration offers the promotions checkbox (Pro, not discreet). */
  promotions: boolean
  brand: Business["brand"]
  type: CardType
  program: Pick<Program, "pointsPerPeso" | "minPurchase" | "stampGoal" | "stampMinPurchase" | "expirationMonths" | "tiers" | "welcomeBonus" | "birthdayBonus">
  rewards: Pick<Reward, "id" | "name" | "cost" | "description">[]
  contact: { email: string; phone: string }
  /** Registration asks for the mobile number and a code; otherwise only a name. */
  askPhone: boolean
  /** LoyaLoop's public demo card. */
  demo: boolean
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

/**
 * Only the card's rule fields, typed. Anything else a request carries (notice
 * texts, ids of other things, extra keys) is dropped before it is saved.
 */
export function cleanProgram(p: Partial<Omit<Program, "businessId">>): Omit<Program, "businessId" | "messages" | "missYouDays"> {
  const input = (p && typeof p === "object" ? p : {}) as Partial<Omit<Program, "businessId">>
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN)
  const notify: Program["notify"] = {}
  for (const e of NOTICE_EVENTS) if (typeof input.notify?.[e.key] === "boolean") notify[e.key] = input.notify[e.key]
  const tiers = Array.isArray(input.tiers) ? input.tiers.slice(0, 10) : []
  return {
    type: input.type as Program["type"],
    pointsPerPeso: num(input.pointsPerPeso),
    minPurchase: num(input.minPurchase),
    stampMinPurchase: num(input.stampMinPurchase),
    stampGoal: num(input.stampGoal),
    stampRewardId: typeof input.stampRewardId === "string" && input.stampRewardId ? input.stampRewardId.slice(0, 64) : undefined,
    expirationMonths: num(input.expirationMonths),
    tiers: tiers.map((t) => ({
      id: typeof t?.id === "string" && /^[\w-]{1,40}$/.test(t.id) ? t.id : uid("tier_"),
      name: text(t?.name, 40),
      threshold: num(t?.threshold),
      multiplier: num(t?.multiplier),
    })),
    tierDowngrade: !!input.tierDowngrade,
    welcomeBonus: num(input.welcomeBonus),
    birthdayBonus: num(input.birthdayBonus),
    dailyLimit: num(input.dailyLimit),
    suspiciousFactor: num(input.suspiciousFactor),
    notify,
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

/** Prospect stages as the admin shows them. */
export const STAGE_LABEL: Record<ProspectStage, string> = { to_visit: "Por visitar", visited: "Visitado", demo: "Demo hecha", trial: "En prueba", won: "Cliente", lost: "No por ahora" }

/** Monthly prices in MXN, as the website shows them. */
export const PRICES = { starter: 390, pro: 990, extraBranch: 250 } as const
/** Days a card keeps working after the paid month ends while Mercado Pago retries the charge. */
export const BILLING_GRACE_DAYS = 7
/** How often the server re-reads each subscription, in case a notification was lost. */
const BILLING_CHECK_HOURS = 12

/** The monthly price of a business: the agreed one, or its plan plus extra branches. */
export function monthlyAmount(business: Pick<Business, "plan" | "monthlyPrice">, branches: number) {
  if (typeof business.monthlyPrice === "number" && business.monthlyPrice > 0) return business.monthlyPrice
  return PRICES[business.plan || "pro"] + PRICES.extraBranch * Math.max(0, branches - 1)
}

function addMonth(at: string) {
  const d = new Date(at)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + 1)
  if (d.getUTCDate() < day) d.setUTCDate(0)
  return d.toISOString()
}

function systemAudit(db: DB, businessId: string, action: string, detail: string, at: number) {
  db.audit.unshift({ id: uid("a_"), businessId, actorId: "system", actorName: "Cobro automático", action, detail, impersonated: false, createdAt: new Date(at).toISOString() })
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

  /** Payment details are for the owner (and LoyaLoop) only. */
  function forRole(business: Business | undefined, role: Role) {
    if (!business || role === "owner" || role === "admin") return business
    const { billing, charges: _c, ...rest } = business
    return { ...rest, billing: billing ? { ...billing, payerEmail: "", subscriptionId: "" } : undefined }
  }

  async function me(): Promise<Me | null> {
    try {
      const a = await actor()
      return {
        user: publicUser(a.user),
        role: a.role,
        business: a.businessId ? forRole(await store.business(a.businessId), a.role) : undefined,
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
    // The link is shown on screen only in a preview without email: anywhere else it would let anyone take over the account.
    return ctx.preview && !ctx.messenger.channels.email ? { previewLink: path } : {}
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
    const bundle = bundleOf(await store.read(B(a.businessId)), a.businessId)
    return { ...bundle, business: forRole(bundle.business, a.role)! }
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

  async function saveBranch(input: { id?: string; name: string; address: string; location?: string }) {
    const a = await inBusiness(["owner"])
    // undefined: keep the location; "": remove it; else a Google Maps link or «lat, lng».
    let place: LatLng | null | undefined
    if (typeof input.location === "string") {
      const parsed = input.location.trim() ? parseLocation(input.location) : null
      if (parsed === "short") throw new ApiError("Ese enlace corto no trae la ubicación. Ábrelo y copia el enlace largo de la barra del navegador, o pega las coordenadas (clic derecho en el mapa).")
      if (input.location.trim() && !parsed) throw new ApiError("No encontramos la ubicación en ese enlace. Pega el enlace de Google Maps de la sucursal o sus coordenadas, por ejemplo 19.4326, -99.1332.")
      place = parsed
    }
    const setPlace = (branch: Branch) => {
      if (place === undefined) return
      if (place) Object.assign(branch, place)
      else {
        delete branch.latitude
        delete branch.longitude
      }
    }
    const saved = await store.write(B(a.businessId), (db) => {
      const name = text(input.name, 80)
      if (!name) throw new ApiError("Escribe el nombre de la sucursal.")
      if (input.id) {
        const branch = db.branches.find((b) => b.id === input.id && b.businessId === a.businessId)
        if (!branch) throw new ApiError("No encontramos esa sucursal.")
        branch.name = name
        branch.address = text(input.address, 200)
        setPlace(branch)
        audit(db, a, a.businessId, "Editó una sucursal", branch.name, now())
        return branch
      }
      if (db.businesses.find((b) => b.id === a.businessId)?.plan === "starter" && db.branches.some((b) => b.businessId === a.businessId))
        throw new ApiError("El plan Starter incluye 1 sucursal. Para agregar más (+$250 al mes cada una) escríbenos a hola@loyaloop.com.mx.", "plan_limit")
      const branch: Branch = { id: uid("br_"), businessId: a.businessId, name, address: text(input.address, 200), code: readableCode(6), createdAt: iso() }
      setPlace(branch)
      db.branches.push(branch)
      db.registers.push({ id: uid("rg_"), businessId: a.businessId, branchId: branch.id, name: "Caja 1" })
      audit(db, a, a.businessId, "Creó una sucursal", branch.name, now())
      return branch
    })
    if (!input.id) await pushAmount(a.businessId).catch((error) => console.error("[cobro]", (error as Error).message))
    return saved
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
    await pushAmount(a.businessId).catch((error) => console.error("[cobro]", (error as Error).message))
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

  async function inviteMember(input: { name: string; email: string; role: Role; phone: string; excluded: boolean; branchId?: string }): Promise<{ link: string; emailed: boolean }> {
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
    const emailed = await sendEmail({
      to: email,
      subject: `Te invitaron al panel de ${businessName}`,
      heading: `Bienvenido al equipo de ${businessName}`,
      paragraphs: [`Hola, ${name}.`, `Te dieron acceso al panel de LoyaLoop de ${businessName}. Crea tu contraseña para entrar.`],
      action: { label: "Crear mi contraseña", url: link(path) },
      footnote: "Si no esperabas esta invitación, ignora este correo.",
    })
    return { link: path, emailed }
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
      if (input.branchId && !db.branches.some((b) => b.id === input.branchId && b.businessId === a.businessId)) throw new ApiError("Elige una de tus sucursales.")
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

  /** Avisos and promotions are Pro only. */
  async function requireNotices(businessId: string) {
    if (!planHasNotices(await store.business(businessId))) throw new ApiError(NOTICES_PRO_MESSAGE, "plan_limit")
  }

  async function saveNotices(input: { notify: Program["notify"]; messages: Program["messages"]; missYouDays?: number }) {
    const a = await inBusiness(["owner", "manager"])
    await requireNotices(a.businessId)
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
    await requireNotices(a.businessId)
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
    // Demo cards keep a name for a few days only.
    if (global.businesses.some((b) => b.id === DEMO_BUSINESS_ID)) {
      const limit = now() - DEMO_RETENTION_DAYS * DAY
      const demo = await store.read(B(DEMO_BUSINESS_ID))
      if (demo.customers.some((c) => c.businessId === DEMO_BUSINESS_ID && c.name !== "Visitante" && new Date(c.createdAt).getTime() < limit))
        await store.write(B(DEMO_BUSINESS_ID), (db) => {
          for (const c of db.customers)
            if (c.businessId === DEMO_BUSINESS_ID && c.name !== "Visitante" && new Date(c.createdAt).getTime() < limit) {
              c.name = "Visitante"
              c.email = ""
              c.birthday = ""
              c.cardLink = undefined
            }
        })
    }
    await billingTick(global.businesses.filter((b) => b.billing))
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

  async function adminBundle(businessId: string): Promise<Bundle & { team: TeamMember[]; audit: AuditEntry[]; customerCount: number }> {
    await asAdmin()
    if (!(await store.business(businessId))) throw new ApiError("El negocio no existe.", "not_found")
    const db = await store.read(B(businessId))
    return {
      ...bundleOf(db, businessId),
      team: db.users.filter((u) => u.businessId === businessId).map(publicUser),
      audit: await store.audit({ businessId, limit: 200 }),
      customerCount: db.customers.filter((c) => c.businessId === businessId).length,
    }
  }

  /**
   * Erases a business for good: its team can no longer sign in, its scanners
   * unpair and its customers' data is gone. The admin types the name to confirm.
   */
  async function adminDeleteBusiness(businessId: string, confirmName: string): Promise<{ customers: number }> {
    const a = await asAdmin()
    if (businessId === DEMO_BUSINESS_ID) throw new ApiError("La tarjeta de demostración de LoyaLoop no se puede eliminar.")
    const business = await store.business(businessId)
    if (!business) throw new ApiError("El negocio no existe.", "not_found")
    const plain = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()
    if (plain(String(confirmName ?? "")) !== plain(business.name)) throw new ApiError(`Escribe el nombre del negocio, «${business.name}», para confirmar.`)
    if (business.billing?.status === "authorized") throw new ApiError("Este negocio tiene el pago automático activo. Cancélalo primero en la pestaña Cobro.")
    const customers = (await store.read(B(businessId))).customers.filter((c) => c.businessId === businessId).length
    await store.deleteBusiness(businessId)
    await store.write("global", (db) => {
      for (const p of db.prospects)
        if (p.businessId === businessId) {
          delete p.businessId
          p.updatedAt = iso()
          p.log.unshift({ at: iso(), text: "Se eliminó su cuenta de LoyaLoop", by: a.user.name })
        }
      audit(db, a, undefined, "Eliminó un negocio", `${business.name}, con ${customers} ${customers === 1 ? "cliente" : "clientes"}`, now())
    })
    const session = await ctx.session()
    if (session?.impersonating === businessId) await ctx.setSession({ ...session, impersonating: undefined })
    return { customers }
  }

  async function createBusiness(input: NewBusiness): Promise<{ id: string; inviteLink: string; emailed: boolean }> {
    const a = await asAdmin()
    const name = text(input.name, 60)
    if (!name) throw new ApiError("Escribe el nombre del negocio.")
    if (!isEmail(input.email)) throw new ApiError("El correo de contacto no es válido.")
    if (!Array.isArray(input.branches) || !input.branches.length || input.branches.some((b) => !text(b.name))) throw new ApiError("Agrega al menos una sucursal con nombre.")
    const ownerEmail = text(input.ownerEmail, 200).toLowerCase()
    if (!isEmail(ownerEmail)) throw new ApiError("El correo del dueño no es válido.")
    if (await store.emailTaken(ownerEmail)) throw new ApiError("Ya existe una cuenta con el correo del dueño.")
    const plan = input.plan === "starter" ? "starter" : "pro"
    if (plan === "starter") {
      if (input.branches.length > 1) throw new ApiError("El plan Starter incluye 1 sucursal.")
      if (input.program.type !== "stamps") throw new ApiError("En el plan Starter la tarjeta es de sellos.")
    }
    input = { ...input, program: cleanProgram(input.program) }
    validateProgram(input.program)
    const id = uid("b_")
    const token = readableCode(32)
    await store.write(B(id), (db) => {
      const created = iso()
      const discreet = !!input.discreet
      db.businesses.push({ id, name, sector: text(input.sector, 60), contactName: text(input.contactName, 80), email: text(input.email, 200), phone: normalizePhone(input.phone || ""), status: input.status === "active" ? "active" : input.status === "pending" ? "pending" : "trial", plan, brand: input.brand, discreet, neutralName: text(input.neutralName, 40) || "Mi tarjeta de beneficios", locationAlerts: discreet ? false : !!input.locationAlerts, askPhone: !!input.askPhone, createdAt: created })
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
      audit(db, a, id, "Dio de alta el negocio", `Plan ${plan === "starter" ? "Starter" : "Pro"}, ${input.branches.length} sucursal(es), tarjeta de ${input.program.type}`, now())
    })
    if (input.prospectId)
      await store.write("global", (db) => {
        const p = (db.prospects || []).find((x) => x.id === input.prospectId)
        if (!p) return
        p.businessId = id
        p.stage = input.status === "active" ? "won" : "trial"
        p.log.unshift({ at: iso(), text: `Dado de alta en LoyaLoop (plan ${plan === "starter" ? "Starter" : "Pro"})`, by: a.user.name })
        p.updatedAt = iso()
      })
    const path = `#/invitacion/${token}`
    const emailed = await sendEmail({
      to: ownerEmail,
      subject: `Tu panel de LoyaLoop para ${name}`,
      heading: "Tu tarjeta de lealtad está lista",
      paragraphs: [`Hola, ${text(input.ownerName, 80) || text(input.contactName, 80)}.`, `Ya configuramos la tarjeta de lealtad de ${name}. Crea tu contraseña para ver a tus clientes, sus visitas y sus recompensas.`],
      action: { label: "Entrar a mi panel", url: link(path) },
    })
    return { id, inviteLink: path, emailed }
  }

  async function adminSaveProgram(businessId: string, input: Omit<Program, "businessId">) {
    const a = await asAdmin()
    const program = cleanProgram(input)
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

  async function adminUpdateBusiness(businessId: string, input: Partial<Pick<Business, "name" | "sector" | "contactName" | "email" | "phone" | "status" | "brand" | "discreet" | "neutralName" | "locationAlerts" | "askPhone" | "legalName" | "legalAddress" | "privacyEmail" | "plan">> & { trialDays?: number; monthlyPrice?: number | null }) {
    const a = await asAdmin()
    const allowed = ["name", "sector", "contactName", "email", "phone", "status", "brand", "discreet", "neutralName", "locationAlerts", "askPhone", "legalName", "legalAddress", "privacyEmail", "plan"] as const
    const patch: Record<string, unknown> = {}
    for (const key of allowed) if (input[key] !== undefined) patch[key] = input[key]
    if (patch.askPhone !== undefined) patch.askPhone = !!patch.askPhone
    if (patch.plan !== undefined && !["starter", "pro"].includes(String(patch.plan))) throw new ApiError("Plan no válido.")
    const price = input.monthlyPrice === undefined ? undefined : input.monthlyPrice === null || Number(input.monthlyPrice) === 0 ? null : Math.round(Number(input.monthlyPrice))
    if (price !== undefined && price !== null && !(price >= 50 && price <= 100000)) throw new ApiError("El precio mensual debe estar entre $50 y $100,000.")
    if (patch.legalName !== undefined) patch.legalName = text(patch.legalName, 160)
    if (patch.legalAddress !== undefined) patch.legalAddress = text(patch.legalAddress, 300)
    if (patch.privacyEmail !== undefined) {
      patch.privacyEmail = text(patch.privacyEmail, 200).toLowerCase()
      if (patch.privacyEmail && !isEmail(String(patch.privacyEmail))) throw new ApiError("El correo para privacidad no es válido.")
    }
    if (patch.email !== undefined && !isEmail(String(patch.email))) throw new ApiError("El correo de contacto no es válido.")
    if (patch.name !== undefined && !text(patch.name)) throw new ApiError("El nombre no puede quedar vacío.")
    if (patch.status !== undefined && !["active", "trial", "paused"].includes(String(patch.status))) throw new ApiError("Estado no válido.")
    const trialDays = input.trialDays === undefined ? undefined : Math.floor(Number(input.trialDays))
    if (trialDays !== undefined && !(trialDays >= 1 && trialDays <= 90)) throw new ApiError("La prueba debe durar entre 1 y 90 días.")
    if (trialDays !== undefined) {
      patch.status = "trial"
      patch.trialEndsAt = iso(now() + trialDays * DAY)
    } else if (patch.status !== undefined) patch.trialEndsAt = undefined
    await store.write(B(businessId), (db) => {
      const business = db.businesses.find((b) => b.id === businessId)
      if (!business) throw new ApiError("El negocio no existe.")
      Object.assign(business, patch)
      if (business.trialEndsAt === undefined) delete business.trialEndsAt
      if (price === null) delete business.monthlyPrice
      else if (price !== undefined) business.monthlyPrice = price
      if (business.discreet) business.locationAlerts = false
      audit(db, a, businessId, trialDays ? `Le dio una prueba de ${trialDays} días` : input.status ? `Cambió el estado a ${input.status}` : price !== undefined ? "Cambió el precio mensual" : "Editó los datos del negocio", price ? `$${price}` : "", now())
    })
    if (price !== undefined || patch.plan !== undefined) await pushAmount(businessId)
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

  function markIntegration(db: DB, businessId: string, provider: Provider, connected: boolean) {
    const row = db.integrations.find((i) => i.businessId === businessId && i.provider === provider)
    if (!row) throw new ApiError("Integración desconocida.")
    if (connected) {
      for (const other of db.integrations) if (other.businessId === businessId && other.provider !== provider && other.status === "connected") other.status = "not_connected"
      row.connectedAt = iso()
    }
    row.status = connected ? "connected" : "not_connected"
    row.lastError = undefined
  }

  function accounts(): PaymentAccounts {
    if (!ctx.paymentAccounts) throw new ApiError("La conexión con Mercado Pago solo funciona en el servidor.", "forbidden")
    return ctx.paymentAccounts
  }

  /** Cobro tab: Mercado Pago account, terminals and the last payments read. */
  async function adminMercadoPago(businessId: string): Promise<MercadoPagoPanel> {
    await asAdmin()
    const db = await store.read(B(businessId))
    if (!db.businesses.some((b) => b.id === businessId)) throw new ApiError("El negocio no existe.", "not_found")
    const registers = db.registers
      .filter((r) => r.businessId === businessId)
      .map((r) => ({ id: r.id, name: r.name, branch: db.branches.find((b) => b.id === r.branchId)?.name || "", terminalId: r.terminalId }))
    const pa = ctx.paymentAccounts
    if (!pa) return { available: false, oauth: false, connected: false, terminals: [], registers, events: [] }
    const status = await pa.status(businessId)
    let terminals: MercadoPagoPanel["terminals"] = []
    let terminalsError: string | undefined
    if (status.connected) {
      try {
        terminals = (await pa.terminals(businessId)).map((t) => ({ ...t, registerId: registers.find((r) => r.terminalId === t.id)?.id }))
      } catch (error) {
        terminalsError = (error as Error).message
      }
    }
    return {
      available: true,
      oauth: pa.oauth,
      problem: pa.problem,
      ...status,
      link: pa.oauth && !pa.problem ? pa.connectLink(businessId) : undefined,
      terminals,
      terminalsError,
      registers,
      events: await pa.events(businessId),
    }
  }

  async function adminConnectMercadoPago(businessId: string, token: string): Promise<{ account: string }> {
    const a = await asAdmin()
    const clean = String(token || "").trim()
    if (!/^APP_USR-[\w-]{20,}$/.test(clean)) throw new ApiError("Pega el Access Token de producción: empieza con APP_USR-.")
    const result = await accounts()
      .connectWithToken(businessId, clean)
      .catch((error: Error) => {
        throw error instanceof ApiError ? error : new ApiError(error.message)
      })
    await integrationConnected(businessId, "mercadopago", `con Access Token (${result.account})`, a)
    return result
  }

  async function adminDisconnectMercadoPago(businessId: string) {
    const a = await asAdmin()
    await accounts().disconnect(businessId)
    await store.write(B(businessId), (db) => {
      markIntegration(db, businessId, "mercadopago", false)
      audit(db, a, businessId, "Desconectó Mercado Pago", "", now())
    })
  }

  /** Which Point terminal charges at a register; one terminal per register. */
  async function adminAssignTerminal(businessId: string, registerId: string, terminalId: string) {
    const a = await asAdmin()
    const id = text(terminalId, 120)
    await store.write(B(businessId), (db) => {
      const register = db.registers.find((r) => r.id === registerId && r.businessId === businessId)
      if (!register) throw new ApiError("La caja ya no existe.")
      for (const r of db.registers) if (r.businessId === businessId && id && r.terminalId === id) delete r.terminalId
      if (id) register.terminalId = id
      else delete register.terminalId
      audit(db, a, businessId, id ? "Asignó una terminal" : "Quitó la terminal de una caja", id ? `${id} a ${register.name}` : register.name, now())
    })
  }

  /** Called when an account connects (admin with a token, or the owner through Mercado Pago). */
  async function integrationConnected(businessId: string, provider: Provider, how: string, actor?: Actor) {
    await store.write(B(businessId), (db) => {
      markIntegration(db, businessId, provider, true)
      const who: Actor = actor ?? { user: { id: "system", name: "Mercado Pago" } as User, role: "admin", impersonated: false }
      audit(db, who, businessId, `Conectó ${provider === "mercadopago" ? "Mercado Pago" : "Clip"}`, how, now())
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

  // ------------------------------------------------------------ prospects (LoyaLoop's sales list)

  const STAGES: ProspectStage[] = ["to_visit", "visited", "demo", "trial", "won", "lost"]

  async function prospects(): Promise<Prospect[]> {
    await asAdmin()
    return (await store.read("global")).prospects || []
  }

  /** Creates or edits a prospect. A first note goes to its history. */
  async function saveProspect(input: Partial<Omit<Prospect, "log" | "createdAt" | "updatedAt">> & { note?: string }): Promise<Prospect> {
    const a = await asAdmin()
    const name = text(input.name, 80)
    if (!name) throw new ApiError("Escribe el nombre del negocio.")
    const email = text(input.email, 200).toLowerCase()
    if (email && !isEmail(email)) throw new ApiError("El correo no es válido.")
    const phoneRaw = text(input.phone, 30)
    const phone = phoneRaw ? normalizePhone(phoneRaw) : ""
    if (phoneRaw && phone.length !== 10) throw new ApiError("El teléfono debe tener 10 dígitos.")
    const stage = STAGES.includes(input.stage as ProspectStage) ? (input.stage as ProspectStage) : "to_visit"
    const nextDate = text(input.nextDate, 10)
    if (nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) throw new ApiError("La fecha del siguiente paso no es válida.")
    const link = text(input.link, 500)
    if (link && !/^https?:\/\//i.test(link)) throw new ApiError("El enlace debe empezar con https://")
    const fields = {
      name,
      sector: text(input.sector, 60),
      zone: text(input.zone, 80),
      address: text(input.address, 200),
      contactName: text(input.contactName, 80),
      phone,
      email,
      instagram: text(input.instagram, 60).replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, ""),
      link,
      stage,
      nextStep: text(input.nextStep, 200),
      nextDate,
      notes: text(input.notes, 2000),
    }
    const note = text(input.note, 500)
    return store.write("global", (db) => {
      db.prospects = db.prospects || []
      const at = iso()
      if (input.id) {
        const p = db.prospects.find((x) => x.id === input.id)
        if (!p) throw new ApiError("No encontramos ese prospecto.", "not_found")
        if (p.stage !== stage) p.log.unshift({ at, text: `Etapa: ${STAGE_LABEL[p.stage]} → ${STAGE_LABEL[stage]}`, by: a.user.name })
        Object.assign(p, fields, { updatedAt: at })
        if (note) p.log.unshift({ at, text: note, by: a.user.name })
        return p
      }
      const duplicate = db.prospects.find((x) => x.name.toLowerCase() === name.toLowerCase() && x.zone.toLowerCase() === fields.zone.toLowerCase())
      if (duplicate) throw new ApiError(`Ya tienes a ${duplicate.name} en tu lista.`, "conflict")
      const p: Prospect = { id: uid("pr_"), ...fields, log: note ? [{ at, text: note, by: a.user.name }] : [], createdAt: at, updatedAt: at }
      db.prospects.unshift(p)
      return p
    })
  }

  /** Adds a line to the contact history (a visit, a call, a message). */
  async function addProspectNote(id: string, note: string): Promise<Prospect> {
    const a = await asAdmin()
    const t = text(note, 500)
    if (!t) throw new ApiError("Escribe qué pasó.")
    return store.write("global", (db) => {
      const p = (db.prospects || []).find((x) => x.id === id)
      if (!p) throw new ApiError("No encontramos ese prospecto.", "not_found")
      p.log.unshift({ at: iso(), text: t, by: a.user.name })
      p.updatedAt = iso()
      return p
    })
  }

  async function deleteProspect(id: string) {
    await asAdmin()
    await store.write("global", (db) => {
      const before = (db.prospects || []).length
      db.prospects = (db.prospects || []).filter((x) => x.id !== id)
      if (db.prospects.length === before) throw new ApiError("No encontramos ese prospecto.", "not_found")
    })
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
      promotions: !business.discreet && planHasNotices(business),
      brand: business.brand,
      type: program.type,
      program: { pointsPerPeso: program.pointsPerPeso, minPurchase: program.minPurchase, stampGoal: program.stampGoal, stampMinPurchase: program.stampMinPurchase, expirationMonths: program.expirationMonths, tiers: program.tiers, welcomeBonus: program.welcomeBonus, birthdayBonus: program.birthdayBonus },
      rewards: db.rewards.filter((r) => r.businessId === businessId && r.active).map(({ id, name, cost, description }) => ({ id, name, cost, description })),
      contact: { email: business.email, phone: business.phone },
      askPhone: !!business.askPhone,
      demo: !!business.demo,
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

  /** A trial LoyaLoop gave with an end date, already over and not activated. */
  function trialOver(business: Business) {
    return business.status === "trial" && !!business.trialEndsAt && new Date(business.trialEndsAt).getTime() < now()
  }

  /** The card does not take customers or scans: paused, waiting for activation, or a trial that ended. */
  function closed(business: Business) {
    return business.status === "paused" || business.status === "pending" || trialOver(business)
  }

  /** Website sign-up for the Starter plan: the owner designs the card; LoyaLoop activates it once paid (or gives a trial). */
  async function signupBusiness(input: { ownerName: string; businessName: string; sector: string; email: string; password: string; phone?: string; branchAddress?: string; terms: boolean }): Promise<Me> {
    const ownerName = text(input?.ownerName, 80)
    const name = text(input?.businessName, 60)
    const email = text(input?.email, 200).toLowerCase()
    const password = String(input?.password || "")
    if (!ownerName) throw new ApiError("Escribe tu nombre.")
    if (!name) throw new ApiError("Escribe el nombre de tu negocio.")
    if (!isEmail(email)) throw new ApiError("Escribe un correo válido.")
    if (password.length < 8) throw new ApiError("La contraseña necesita al menos 8 caracteres.")
    if (!input.terms) throw new ApiError("Para crear tu cuenta necesitas aceptar los términos y el aviso de privacidad.")
    if (await store.emailTaken(email)) throw new ApiError("Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.", "email_taken")
    const id = uid("b_")
    const userId = uid("u_")
    const hashed = await ctx.hash(password)
    const created = iso()
    await store.write(B(id), (db) => {
      db.businesses.push({ id, name, sector: text(input.sector, 60) || "Otro", contactName: ownerName, email, phone: normalizePhone(input.phone || ""), status: "pending", plan: "starter", selfServe: true, brand: { color: "#8A2E12", stampIcon: "check" }, discreet: false, neutralName: "Mi tarjeta de beneficios", locationAlerts: false, askPhone: false, createdAt: created })
      const branchId = uid("br_")
      db.branches.push({ id: branchId, businessId: id, name: "Sucursal principal", address: text(input.branchAddress, 200), code: readableCode(6), createdAt: created })
      db.registers.push({ id: uid("rg_"), businessId: id, branchId, name: "Caja 1" })
      const rewardId = uid("rw_")
      db.rewards.push({ id: rewardId, businessId: id, name: "Producto de regalo", description: "Cámbialo por la recompensa que quieras dar.", cost: 0, active: true, createdAt: created })
      db.programs.push({ ...defaultProgram(id), type: "stamps", stampGoal: 8, stampRewardId: rewardId, expirationMonths: 0, dailyLimit: 1, notify: { stampEarned: true, almostThere: true, rewardAvailable: true } })
      for (const provider of ["mercadopago", "clip"] as Provider[]) db.integrations.push({ businessId: id, provider, status: "not_connected" })
      db.users.push({ id: userId, name: ownerName, email, password: hashed, role: "owner", businessId: id, excludedFromEarning: false, active: true, createdAt: created })
      audit(db, { user: db.users.find((u) => u.id === userId)!, businessId: id, role: "owner", impersonated: false }, id, "Creó su cuenta desde la página", "Plan Starter, por activar", now())
    })
    await ctx.setSession({ userId, createdAt: iso() })
    await sendEmail({
      to: email,
      subject: "Tu tarjeta de lealtad ya está lista",
      heading: `Bienvenido a LoyaLoop, ${ownerName.split(" ")[0]}`,
      paragraphs: [
        `Creamos la tarjeta de sellos de ${name}. En tu panel puedes ponerle tu logo y colores, elegir la recompensa e imprimir el QR para tu mostrador.`,
        ctx.subscriptions
          ? "Para activarla, entra a «Plan y pagos» y paga con tarjeta a través de Mercado Pago ($390 al mes en automático). En cuanto se cobre, tus clientes pueden registrarse."
          : "Para activarla, responde este correo o escríbenos a hola@loyaloop.com.mx y te mandamos los datos para pagar el plan Starter ($390 al mes). En cuanto lo recibamos, tus clientes pueden registrarse.",
      ],
      action: { label: "Entrar a mi panel", url: link("#/panel") },
    })
    const admins = (await store.read("global")).users.filter((u) => u.role === "admin" && u.active).map((u) => u.email)
    for (const to of admins)
      await sendEmail({ to, subject: `Nuevo negocio en Starter: ${name}`, heading: "Un negocio se dio de alta solo", paragraphs: [`${ownerName} · ${name} (${text(input.sector, 60) || "sin giro"})`, `Correo: ${email}`, "Está por activar: se activa solo cuando pague desde su panel, o dale una prueba desde su ficha."], action: { label: "Ver negocios", url: link("#/admin/negocios") } })
    return (await me())!
  }

  /** Starter owners design their own card: stamps only, no minimum purchase. */
  async function saveCard(input: { program: Omit<Program, "businessId">; brand: Pick<Business, "brand" | "discreet" | "neutralName"> }) {
    const a = await inBusiness(["owner"])
    const business = await store.business(a.businessId)
    if (business?.plan !== "starter") throw new ApiError("Las reglas de tu tarjeta las configura LoyaLoop. Escríbenos para cambiarlas.", "forbidden")
    const program = { ...cleanProgram(input?.program), type: "stamps" as const, stampMinPurchase: 0, tiers: [] }
    validateProgram(program)
    const color = String(input.brand?.brand?.color || "")
    if (!/^#[\da-f]{6}$/i.test(color)) throw new ApiError("Elige un color válido para tu tarjeta.")
    for (const image of [input.brand.brand.logo, input.brand.brand.strip])
      if (image !== undefined && image !== "" && !(typeof image === "string" && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(image) && image.length < 700_000))
        throw new ApiError("La imagen no es válida. Usa PNG, JPG, WebP o SVG de menos de 400 KB.")
    const discreet = !!input.brand.discreet
    const neutralName = text(input.brand.neutralName, 40)
    if (discreet && !neutralName) throw new ApiError("Escribe el nombre neutro para el modo discreto.")
    await store.write(B(a.businessId), (db) => {
      if (program.stampRewardId && !db.rewards.some((r) => r.id === program.stampRewardId && r.businessId === a.businessId)) throw new ApiError("Elige una de tus recompensas.")
      const b = db.businesses.find((x) => x.id === a.businessId)!
      b.brand = { color, logo: input.brand.brand.logo, strip: input.brand.brand.strip, stampIcon: input.brand.brand.stampIcon }
      b.discreet = discreet
      b.neutralName = neutralName || b.neutralName
      if (discreet) b.locationAlerts = false
      const index = db.programs.findIndex((p) => p.businessId === a.businessId)
      const current = db.programs[index]
      db.programs[index] = { messages: current?.messages, missYouDays: current?.missYouDays, ...program, businessId: a.businessId }
      audit(db, a, a.businessId, "Actualizó el diseño y las reglas de su tarjeta", "", now())
    })
  }

  // ------------------------------------------------------------ automatic monthly charge

  /** What the owner sees in «Plan y pagos». */
  async function billing() {
    const a = await inBusiness(["owner"])
    const db = await store.read(B(a.businessId))
    const business = db.businesses.find((b) => b.id === a.businessId)!
    const branches = db.branches.filter((b) => b.businessId === a.businessId).length
    const owner = db.users.find((u) => u.businessId === a.businessId && u.role === "owner" && u.active)
    return {
      plan: business.plan || "pro",
      status: business.status,
      amount: monthlyAmount(business, branches),
      branches,
      custom: typeof business.monthlyPrice === "number" && business.monthlyPrice > 0,
      trialEndsAt: business.trialEndsAt,
      billing: business.billing,
      charges: (business.charges || []).slice(0, 12),
      available: !!ctx.subscriptions,
      ownerEmail: owner?.email || business.email,
    }
  }

  /** Starts the monthly charge: returns Mercado Pago's page where the owner enters the card. */
  async function startSubscription(payerEmail: string): Promise<{ url: string }> {
    const a = await inBusiness(["owner"])
    if (!ctx.subscriptions) throw new ApiError("El pago automático aún no está disponible. Escríbenos a hola@loyaloop.com.mx y te ayudamos a pagar.", "unavailable")
    const email = text(payerEmail, 200).toLowerCase()
    if (!isEmail(email)) throw new ApiError("Escribe el correo de tu cuenta de Mercado Pago.")
    const db = await store.read(B(a.businessId))
    const business = db.businesses.find((b) => b.id === a.businessId)!
    if (business.billing?.status === "authorized") throw new ApiError("Tu pago automático ya está activo.", "conflict")
    const amount = monthlyAmount(business, db.branches.filter((b) => b.businessId === a.businessId).length)
    const plan = business.plan === "starter" ? "Starter" : "Pro"
    const created = await ctx.subscriptions.create({
      reason: `LoyaLoop ${plan} · ${business.name}`.slice(0, 120),
      externalReference: business.id,
      payerEmail: email,
      amount,
      backUrl: `${ctx.baseUrl}api/billing/return`,
    })
    await store.write(B(a.businessId), (d) => {
      const b = d.businesses.find((x) => x.id === a.businessId)!
      b.billing = { provider: "mercadopago", subscriptionId: created.id, status: "pending", amount, payerEmail: email, paidUntil: b.billing?.paidUntil, checkedAt: iso(), createdAt: iso() }
      audit(d, a, a.businessId, "Inició el pago automático", `$${amount} al mes · ${email}`, now())
    })
    return { url: created.url }
  }

  /** Reads the subscription again (the owner just came back from Mercado Pago). */
  async function refreshBilling() {
    const a = await inBusiness(["owner"])
    const business = await store.business(a.businessId)
    if (business?.billing && ctx.subscriptions) await syncSubscription(business.billing.subscriptionId).catch((error) => console.error("[cobro]", (error as Error).message))
    return billing()
  }

  /** Stops future charges. The card keeps working until the paid month ends. */
  async function cancelSubscription() {
    const a = await inBusiness(["owner"])
    const business = await store.business(a.businessId)
    if (!business?.billing || business.billing.status === "cancelled") throw new ApiError("No tienes un pago automático activo.")
    if (ctx.subscriptions) await ctx.subscriptions.update(business.billing.subscriptionId, { status: "cancelled" })
    await store.write(B(a.businessId), (db) => {
      const b = db.businesses.find((x) => x.id === a.businessId)!
      if (b.billing) b.billing.status = "cancelled"
      audit(db, a, a.businessId, "Canceló el pago automático", b.billing?.paidUntil ? `Pagado hasta ${b.billing.paidUntil.slice(0, 10)}` : "", now())
    })
    const admins = await adminEmails()
    for (const to of admins) await sendEmail({ to, subject: `Canceló su pago automático: ${business.name}`, heading: "Un negocio canceló su suscripción", paragraphs: [`${business.name} canceló el cobro mensual.`, business.billing.paidUntil ? `Su tarjeta funciona hasta el ${business.billing.paidUntil.slice(0, 10)}.` : "No tenía meses pagados."] })
    return billing()
  }

  async function adminEmails() {
    return (await store.read("global")).users.filter((u) => u.role === "admin" && u.active).map((u) => u.email)
  }

  /** Brings a subscription's state from Mercado Pago into the business and opens or closes its card. */
  async function syncSubscription(subscriptionId: string) {
    if (!ctx.subscriptions) return
    const info = await ctx.subscriptions.get(subscriptionId)
    const business = info.externalReference ? await store.business(info.externalReference) : undefined
    if (!business || business.billing?.subscriptionId !== info.id) return
    const result = await store.write(B(business.id), (db) => {
      const b = db.businesses.find((x) => x.id === business.id)!
      const billing = b.billing as Billing
      const before = { status: billing.status, business: b.status }
      billing.status = info.status
      billing.amount = info.amount || billing.amount
      billing.nextChargeAt = info.nextChargeAt
      if (info.lastChargeAt) {
        billing.lastChargeAt = info.lastChargeAt
        const until = addMonth(info.lastChargeAt)
        if (!billing.paidUntil || until > billing.paidUntil) billing.paidUntil = until
      }
      billing.checkedAt = iso()
      const covered = !billing.paidUntil || new Date(billing.paidUntil).getTime() + BILLING_GRACE_DAYS * DAY > now()
      // Paid: a card waiting for activation or on trial opens. A business LoyaLoop paused stays paused.
      if (info.status === "authorized" && covered && (b.status === "pending" || b.status === "trial")) {
        b.status = "active"
        delete b.trialEndsAt
        systemAudit(db, b.id, "Activó la cuenta con el pago automático", `$${billing.amount} al mes`, now())
      }
      if (before.status !== billing.status) systemAudit(db, b.id, `Pago automático: ${billing.status}`, "", now())
      const owner = db.users.find((u) => u.businessId === b.id && u.role === "owner" && u.active)
      return { activated: before.business !== "active" && b.status === "active", name: b.name, owner: owner?.email, amount: billing.amount }
    })
    if (result.activated) {
      if (result.owner)
        await sendEmail({ to: result.owner, subject: "Tu tarjeta de lealtad ya está activa", heading: "¡Listo! Tu tarjeta está activa", paragraphs: [`Recibimos tu pago. Desde ahora tus clientes pueden registrarse en ${result.name}.`, `Cada mes se cobran $${result.amount} a tu tarjeta en automático. Puedes cancelarlo cuando quieras desde «Plan y pagos».`], action: { label: "Entrar a mi panel", url: link("#/panel") } })
      for (const to of await adminEmails()) await sendEmail({ to, subject: `Pago recibido: ${result.name}`, heading: "Un negocio activó su pago automático", paragraphs: [`${result.name} · $${result.amount} al mes.`] })
    }
  }

  /** A Mercado Pago notification about subscriptions (server only, signature already checked). */
  async function billingNotification(topic: string, id: string) {
    if (!ctx.subscriptions || !id) return
    if (topic === "subscription_preapproval" || topic === "preapproval") return syncSubscription(id)
    if (topic !== "subscription_authorized_payment" && topic !== "authorized_payment") return
    const charge = await ctx.subscriptions.charge(id)
    const info = await ctx.subscriptions.get(charge.subscriptionId)
    const business = info.externalReference ? await store.business(info.externalReference) : undefined
    if (!business || business.billing?.subscriptionId !== info.id) return
    const isNew = await store.write(B(business.id), (db) => {
      const b = db.businesses.find((x) => x.id === business.id)!
      const charges = b.charges || []
      const existing = charges.find((c) => c.id === charge.id)
      if (existing) {
        const changed = existing.status !== charge.status
        existing.status = charge.status
        return changed && charge.status === "rejected"
      }
      b.charges = [{ id: charge.id, amount: charge.amount, status: charge.status, at: charge.at }, ...charges].slice(0, 24)
      if (charge.status === "approved") systemAudit(db, b.id, "Cobro mensual aprobado", `$${charge.amount}`, now())
      if (charge.status === "rejected") systemAudit(db, b.id, "Cobro mensual rechazado", `$${charge.amount}`, now())
      return charge.status === "rejected"
    })
    await syncSubscription(info.id)
    if (isNew) {
      const owner = (await store.read(B(business.id))).users.find((u) => u.businessId === business.id && u.role === "owner" && u.active)
      if (owner)
        await sendEmail({ to: owner.email, subject: "No pudimos cobrar tu mensualidad", heading: "Revisa tu tarjeta en Mercado Pago", paragraphs: [`Mercado Pago no pudo cobrar los $${charge.amount} de este mes y lo intentará de nuevo en los próximos días.`, `Si tu tarjeta venció o no tiene saldo, cámbiala en Mercado Pago. Tu tarjeta de lealtad sigue funcionando ${BILLING_GRACE_DAYS} días después de terminar tu mes pagado.`], action: { label: "Ver mi plan", url: link("#/panel/plan") } })
    }
  }

  /** Server clock: re-read subscriptions now and then, and close cards whose paid month ran out. */
  async function billingTick(businesses: Business[]) {
    for (const business of businesses) {
      const billing = business.billing
      if (!billing) continue
      if (ctx.subscriptions && billing.status !== "cancelled" && now() - new Date(billing.checkedAt).getTime() > BILLING_CHECK_HOURS * 60 * MINUTE)
        await syncSubscription(billing.subscriptionId).catch((error) => console.error("[cobro]", business.id, (error as Error).message))
      const fresh = await store.business(business.id)
      // Authorized but never charged: it had until the subscription started.
      const paidUntil = fresh?.billing?.paidUntil ?? (fresh?.billing?.status === "authorized" ? fresh.billing.createdAt : undefined)
      if (!fresh || fresh.status !== "active" || !paidUntil || new Date(paidUntil).getTime() + BILLING_GRACE_DAYS * DAY > now()) continue
      const owner = await store.write(B(business.id), (db) => {
        const b = db.businesses.find((x) => x.id === business.id)!
        b.status = "pending"
        systemAudit(db, b.id, "Cerró la tarjeta por falta de pago", `Pagado hasta ${paidUntil.slice(0, 10)}`, now())
        return db.users.find((u) => u.businessId === b.id && u.role === "owner" && u.active)?.email
      })
      if (owner) await sendEmail({ to: owner, subject: "Tu tarjeta de lealtad se pausó", heading: "Tu tarjeta ya no acepta clientes nuevos", paragraphs: ["No recibimos el pago de tu mensualidad. Tus clientes y su historial siguen guardados.", "Activa de nuevo tu pago automático para que tu tarjeta vuelva a funcionar."], action: { label: "Ver mi plan", url: link("#/panel/plan") } })
      for (const to of await adminEmails()) await sendEmail({ to, subject: `Tarjeta cerrada por falta de pago: ${business.name}`, heading: "Un negocio dejó de pagar", paragraphs: [`${business.name} estaba pagado hasta el ${paidUntil.slice(0, 10)}.`] })
    }
  }

  /** Keeps the subscription amount in step with the plan, the agreed price and the number of branches. */
  async function pushAmount(businessId: string) {
    const db = await store.read(B(businessId))
    const business = db.businesses.find((b) => b.id === businessId)
    const billing = business?.billing
    if (!business || !billing || billing.status === "cancelled" || !ctx.subscriptions) return
    const amount = monthlyAmount(business, db.branches.filter((b) => b.businessId === businessId).length)
    if (amount === billing.amount) return
    await ctx.subscriptions.update(billing.subscriptionId, { amount })
    await store.write(B(businessId), (d) => {
      const b = d.businesses.find((x) => x.id === businessId)!
      if (b.billing) b.billing.amount = amount
      systemAudit(d, businessId, "Cambió el monto del pago automático", `$${billing.amount} → $${amount}`, now())
    })
  }

  /** The public demo card's business, created the first time anyone needs it. */
  async function ensureDemo() {
    const parts = demoBusiness(iso())
    const current = await store.business(DEMO_BUSINESS_ID)
    if (current && current.name === parts.businesses[0].name) return
    await store.write(B(DEMO_BUSINESS_ID), (db) => {
      const existing = db.businesses.find((b) => b.id === DEMO_BUSINESS_ID)
      if (!existing) {
        for (const key of Object.keys(parts) as (keyof typeof parts)[]) (db[key] as unknown[]).push(...parts[key])
        return
      }
      // An earlier version of the demo: bring its look and rules up to date.
      const { createdAt: _c, ...business } = parts.businesses[0]
      Object.assign(existing, business)
      const program = db.programs.find((p) => p.businessId === DEMO_BUSINESS_ID)
      if (program) Object.assign(program, parts.programs[0])
      const reward = db.rewards.find((r) => r.id === parts.rewards[0].id)
      if (reward) Object.assign(reward, { name: parts.rewards[0].name, description: parts.rewards[0].description })
    })
  }

  /** One tap from the landing page: an anonymous LoyaLoop card, or the one this browser already has. */
  async function demoCard(token = ""): Promise<{ card: PublicCard; holder: CardHolder; created: boolean; links: WalletLinks }> {
    await ensureDemo()
    const clean = normalizeToken(String(token || ""))
    const result = await store.write(B(DEMO_BUSINESS_ID), (db) => {
      let customer = clean ? db.customers.find((c) => c.businessId === DEMO_BUSINESS_ID && c.token === clean) : undefined
      const created = !customer
      if (!customer) {
        const at = iso()
        let fresh = customerToken()
        while (db.customers.some((c) => c.token === fresh)) fresh = customerToken()
        customer = { id: uid("c_"), businessId: DEMO_BUSINESS_ID, name: "Invitado", phone: "", email: "", birthday: "", token: fresh, points: 0, stamps: 0, earnedRewards: [], branchId: "br_demo", promotionsOptIn: false, privacyAcceptedAt: at, createdAt: at, lastActivityAt: at }
        db.customers.push(customer)
      }
      return { card: publicCard(db, DEMO_BUSINESS_ID), holder: holder(db, customer), created, customerId: customer.id }
    })
    const { customerId, ...rest } = result
    return cardWithLinks(DEMO_BUSINESS_ID, customerId, rest)
  }

  async function branchByCode(code: string) {
    if (typeof code === "string" && code.toUpperCase() === DEMO_CODE) await ensureDemo()
    const branch = typeof code === "string" && /^[A-Z0-9]{4,12}$/i.test(code) ? await store.branchByCode(code) : undefined
    if (!branch) throw new ApiError("Este enlace no corresponde a ninguna sucursal.", "not_found")
    const business = await store.business(branch.businessId)
    if (!business || closed(business)) throw new ApiError("Este programa no está disponible por ahora.", "paused")
    return { branch, business }
  }

  async function registration(code: string): Promise<{ card: PublicCard; branchName: string }> {
    const { branch, business } = await branchByCode(code)
    const db = await store.read(B(business.id))
    return { card: publicCard(db, business.id), branchName: business.discreet ? "" : branch.name }
  }

  /** What the card's privacy notice needs: who is responsible and how to reach them. */
  async function privacyNotice(code: string): Promise<{ responsible: string; address: string; email: string; askPhone: boolean; promotions: boolean }> {
    const { branch, business } = await branchByCode(code)
    return {
      responsible: business.legalName || business.name,
      address: business.legalAddress || branch.address,
      email: business.privacyEmail || business.email,
      askPhone: !!business.askPhone,
      promotions: !business.discreet && planHasNotices(business),
    }
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
      return { previewCode: "", existing: result.existing, channel: "sms" }
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
          promotionsOptIn: !!input.promotions && planHasNotices(business),
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

  /** Demo card: adds a stamp so the visitor sees the pass update and the notification. */
  async function demoVisit(code: string, token: string): Promise<{ holder: CardHolder }> {
    const { business } = await branchByCode(code)
    if (!business.demo) throw new ApiError("Solo la tarjeta de demostración puede sumar sellos desde aquí.", "forbidden")
    return store.write(B(business.id), (db) => {
      const customer = db.customers.find((c) => c.businessId === business.id && c.token === normalizeToken(String(token || "")))
      if (!customer) throw new ApiError("No encontramos esta tarjeta de demostración.", "not_found")
      const mine = db.transactions.filter((t) => t.customerId === customer.id && t.kind === "visit")
      if (mine[0] && now() - new Date(mine[0].createdAt).getTime() < 10_000) throw new ApiError("Espera unos segundos para que llegue el aviso del sello anterior.", "rate_limited")
      if (mine.filter((t) => now() - new Date(t.createdAt).getTime() < DAY).length >= 20) throw new ApiError("Por hoy ya fueron suficientes visitas de prueba.", "rate_limited")
      engine.demoVisit(db, customer, now())
      return { holder: holder(db, customer) }
    })
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
        promotionsOptIn: !!input.promotions && planHasNotices(business),
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
    return ctx.preview && !ctx.messenger.channels.email ? { previewLink: path } : {}
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
    const admins = await store.write("global", (db) => {
      db.leads.unshift({ ...lead, id: uid("l_"), status: "new", createdAt: iso() })
      return db.users.filter((u) => u.role === "admin" && u.active).map((u) => u.email)
    })
    // Tell LoyaLoop right away; the lead is saved even if the email fails.
    for (const to of admins)
      await sendEmail({
        to,
        subject: `Nueva solicitud de llamada: ${lead.company}`,
        heading: "Alguien quiere conocer LoyaLoop",
        paragraphs: [
          `${lead.name} · ${lead.company} (${lead.branches || "sucursales sin indicar"})`,
          `Correo: ${lead.email}${lead.phone ? ` · Teléfono: ${lead.phone}` : ""}`,
          `Prefiere: ${lead.preferredDate}, ${lead.preferredTime}`,
          ...(lead.notes ? [`Notas: ${lead.notes}`] : []),
        ],
        action: { label: "Ver solicitudes", url: link("#/admin/solicitudes") },
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
    // «vinculado» sends the scanner back to the pairing screen.
    if (!business) throw new ApiError("Este escáner ya no está vinculado: su negocio ya no existe en LoyaLoop.", "unpaired")
    if (business.status === "paused")
      throw new ApiError(`La cuenta de ${business.discreet ? business.neutralName : business.name} está pausada en LoyaLoop, así que no se suman visitas. Para reactivarla, el dueño puede escribir a hola@loyaloop.com.mx.`, "paused")
    if (business.status === "pending") throw new ApiError("Tu tarjeta aún no está activa. Escríbenos a hola@loyaloop.com.mx para activarla.", "paused")
    if (trialOver(business)) throw new ApiError("Terminó la prueba. Activa tu plan para seguir sumando visitas.", "paused")
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
    adminDeleteBusiness,
    adminMercadoPago,
    adminConnectMercadoPago,
    adminDisconnectMercadoPago,
    adminAssignTerminal,
    integrationConnected,
    adminSetIntegration,
    adminMetrics,
    adminAudit,
    leads,
    prospects,
    saveProspect,
    addProspectNote,
    deleteProspect,
    markLead,
    simulatePayment,
    // public
    registration,
    sendCode,
    completeRegistration,
    recoverCard,
    privacyNotice,
    signupBusiness,
    saveCard,
    demoCard,
    demoVisit,
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
    // plan and payments
    billing,
    startSubscription,
    refreshBilling,
    cancelSubscription,
    // server-only (not exposed over RPC)
    recordPayment,
    billingNotification,
  }
}

export type Service = ReturnType<typeof createService>

/** Methods the browser may call over HTTP. recordPayment and billingNotification (webhooks) and tick (server clock) are not here. */
export const PUBLIC_METHODS = [
  "me", "login", "logout", "requestPasswordReset", "resetPassword", "invitation", "acceptInvitation", "changePassword", "impersonate", "stopImpersonating",
  "bundle", "customers", "customer", "adjustBalance", "exportCustomersCsv", "activity", "refundPurchase", "reviewQueue", "resolveReview",
  "saveReward", "deleteReward", "saveBranch", "deleteBranch", "saveRegister", "deleteRegister", "createPairingCode", "unpairDevice",
  "team", "inviteMember", "updateMember", "updateBusinessContact", "notices", "saveNotices", "campaigns", "campaignAudience", "createCampaign", "cancelCampaign", "suspicious", "metrics",
  "adminBusinesses", "adminBundle", "createBusiness", "adminSaveProgram", "adminUpdateBusiness", "adminDeleteBusiness", "adminMercadoPago", "adminConnectMercadoPago", "adminDisconnectMercadoPago", "adminAssignTerminal", "adminSetIntegration", "adminMetrics", "adminAudit", "leads", "markLead", "prospects", "saveProspect", "addProspectNote", "deleteProspect", "simulatePayment",
  "billing", "startSubscription", "refreshBilling", "cancelSubscription",
  "registration", "privacyNotice", "signupBusiness", "saveCard", "demoCard", "demoVisit", "sendCode", "completeRegistration", "recoverCard", "createCard", "sendCardLink", "openCardLink", "submitLead",
  "pairDevice", "kioskUnpair", "kiosk", "kioskScan", "kioskScanStatus", "kioskRedeem",
] as const satisfies readonly (keyof Service)[]

export type PublicMethod = (typeof PUBLIC_METHODS)[number]

/** Calls that only read: the browser does not need to refresh other views after them. */
export const READ_METHODS = new Set<string>([
  "me", "invitation", "bundle", "customers", "customer", "exportCustomersCsv", "activity", "reviewQueue", "team", "notices", "campaigns", "campaignAudience", "suspicious", "metrics",
  "adminBusinesses", "adminBundle", "adminMercadoPago", "adminMetrics", "adminAudit", "leads", "prospects", "registration", "privacyNotice", "kiosk", "kioskScanStatus", "billing",
])
