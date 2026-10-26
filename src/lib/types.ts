// Domain model for LoyaLoop. The backend (PostgreSQL) mirrors these shapes:
// one table per entity, `businessId` on every business-scoped row.

export type Role = "admin" | "owner" | "manager" | "cashier"
export type CardType = "points" | "stamps" | "rewards" | "tiers"
/** pending: signed up on the website, waiting for LoyaLoop to activate it (payment or a trial). */
export type BusinessStatus = "pending" | "active" | "trial" | "paused"
export type Provider = "mercadopago" | "clip"

export interface User {
  id: string
  name: string
  email: string
  /** Mock only. The server stores a salted hash, never the password. */
  password: string
  role: Role
  businessId?: string
  /** Branch a cashier works at; empty = all branches. */
  branchId?: string
  phone?: string
  /** Employee phones never earn points when they scan their own card. */
  excludedFromEarning: boolean
  active: boolean
  inviteToken?: string
  createdAt: string
}

export interface Brand {
  color: string
  logo?: string
  strip?: string
  /** Mark inside earned stamps (stamp cards). */
  stampIcon?: import("./stampIcons").StampIcon
}

export interface Business {
  id: string
  name: string
  sector: string
  contactName: string
  email: string
  phone: string
  status: BusinessStatus
  brand: Brand
  /** Ask the customer's mobile number (with a code) to create the card. Off: name only. */
  askPhone?: boolean
  /** Neutral name on the pass and registration page, no location alerts. */
  discreet: boolean
  neutralName: string
  locationAlerts: boolean
  /** LoyaLoop's public demo card: not a real business. */
  demo?: boolean
  /** Starter: the owner sets it up alone (stamps, one branch). Pro (or unset): set up by LoyaLoop. */
  plan?: "starter" | "pro"
  /** Signed up from the website, not created by LoyaLoop. */
  selfServe?: boolean
  /** End of a trial LoyaLoop gave. */
  trialEndsAt?: string
  /** Monthly price agreed with LoyaLoop (MXN). Unset: the plan's price plus extra branches. */
  monthlyPrice?: number
  /** Automatic monthly charge (Mercado Pago subscription). */
  billing?: Billing
  /** Last charges of the subscription, newest first. */
  charges?: BillingCharge[]
  /** Who is responsible for the customers' data, as the privacy notice names it. */
  legalName?: string
  legalAddress?: string
  privacyEmail?: string
  createdAt: string
}

export type SubscriptionStatus = "pending" | "authorized" | "paused" | "cancelled"

export interface Billing {
  provider: "mercadopago"
  subscriptionId: string
  /** pending: the owner has not entered a card yet; authorized: charging every month. */
  status: SubscriptionStatus
  amount: number
  payerEmail: string
  /** Covered until this date: the last successful charge plus one month. */
  paidUntil?: string
  lastChargeAt?: string
  nextChargeAt?: string
  checkedAt: string
  createdAt: string
}

export interface BillingCharge {
  id: string
  amount: number
  status: "approved" | "rejected" | "pending"
  at: string
}

export interface Branch {
  id: string
  businessId: string
  name: string
  address: string
  /** Short opaque code used in the NFC link: /r/<code>. */
  code: string
  createdAt: string
}

export interface Register {
  id: string
  businessId: string
  branchId: string
  name: string
  /** Mercado Pago Point terminal that charges at this register. */
  terminalId?: string
}

export interface Device {
  id: string
  businessId: string
  registerId: string
  name: string
  /** Secret the kiosk keeps in its storage after pairing. */
  token: string
  pairedAt: string
  lastSeenAt: string
}

export interface PairingCode {
  code: string
  businessId: string
  registerId: string
  expiresAt: string
}

export interface Tier {
  id: string
  name: string
  /** Spending in the last 12 months (MXN) needed to reach the tier. */
  threshold: number
  multiplier: number
}

export interface Program {
  businessId: string
  type: CardType
  pointsPerPeso: number
  minPurchase: number
  stampMinPurchase: number
  stampGoal: number
  stampRewardId?: string
  /** 0 = points never expire. */
  expirationMonths: number
  tiers: Tier[]
  tierDowngrade: boolean
  welcomeBonus: number
  birthdayBonus: number
  /** 0 = no limit. */
  dailyLimit: number
  /** Alert when a card has more purchases than N × the average. 0 = off. */
  suspiciousFactor: number
  /** Which automatic notices are on. Missing keys use each notice's default. */
  notify: Partial<Record<import("./notices").AutomaticEvent, boolean>>
  /** The business's own text for each notice; empty uses the default. */
  messages?: Partial<Record<import("./notices").AutomaticEvent, string>>
  /** Days without a visit before «Te extrañamos». */
  missYouDays?: number
}

export interface Reward {
  id: string
  businessId: string
  name: string
  description: string
  cost: number
  active: boolean
  createdAt: string
}

export interface EarnedReward {
  id: string
  rewardId: string
  createdAt: string
}

export interface Customer {
  id: string
  businessId: string
  name: string
  phone: string
  email: string
  /** MM-DD, without the year. */
  birthday: string
  /** Opaque identifier encoded in the pass QR. Never personal data. */
  token: string
  points: number
  stamps: number
  earnedRewards: EarnedReward[]
  tierId?: string
  branchId?: string
  promotionsOptIn: boolean
  privacyAcceptedAt: string
  createdAt: string
  lastActivityAt: string
  /** Welcome bonus waiting for the first purchase or visit (cards without a verified phone). */
  welcomePending?: boolean
  /** One-time link to open the card again, sent by email. */
  cardLink?: { token: string; expiresAt: string }
  /** Year of the last birthday notice, so it is sent once. */
  birthdayNoticeYear?: number
  /** Last «Te extrañamos»; sent again only after a new visit. */
  missYouAt?: string
}

export type TransactionKind =
  | "purchase"
  | "visit"
  | "redeem"
  | "adjust"
  | "refund"
  | "bonus"
  | "expire"

export interface Transaction {
  id: string
  businessId: string
  customerId: string
  kind: TransactionKind
  /** Amount without tip, MXN. Negative on refunds. */
  amount: number
  points: number
  stamps: number
  rewardId?: string
  reason: string
  branchId?: string
  registerId?: string
  deviceId?: string
  paymentId?: string
  refOf?: string
  actorId?: string
  createdAt: string
}

export type ScanStatus = "pending" | "matched" | "expired" | "review" | "visit"

export interface Scan {
  id: string
  businessId: string
  registerId: string
  deviceId: string
  customerId: string
  status: ScanStatus
  paymentId?: string
  createdAt: string
}

export type PaymentStatus = "unmatched" | "matched" | "review" | "refunded" | "discarded"

export interface Payment {
  id: string
  businessId: string
  registerId: string
  provider: Provider
  externalId: string
  /** Total charged, including tip. */
  amount: number
  tip: number
  status: PaymentStatus
  scanId?: string
  createdAt: string
}

export interface Integration {
  businessId: string
  provider: Provider
  status: "not_connected" | "connected" | "error"
  connectedAt?: string
  lastError?: string
}

export interface WalletNotice {
  id: string
  businessId: string
  customerId: string
  event: import("./notices").NoticeEvent
  message: string
  campaignId?: string
  createdAt: string
}

/** A promotion sent now or scheduled by the business. */
export interface Campaign {
  id: string
  businessId: string
  message: string
  audience: import("./notices").Audience
  status: "scheduled" | "sent" | "canceled"
  sendAt: string
  sentAt?: string
  recipients?: number
  createdBy: string
  createdAt: string
}

export interface AuditEntry {
  id: string
  businessId?: string
  actorId: string
  actorName: string
  action: string
  detail: string
  impersonated: boolean
  createdAt: string
}

export interface Lead {
  id: string
  name: string
  company: string
  email: string
  phone: string
  branches: string
  preferredDate: string
  preferredTime: string
  notes: string
  status: "new" | "contacted"
  createdAt: string
}

/** Where a prospect is in the sale, from the first visit to a paying business. */
export type ProspectStage = "to_visit" | "visited" | "demo" | "trial" | "won" | "lost"

/** A business LoyaLoop wants to sell to (LoyaLoop's own sales list, admin only). */
export interface Prospect {
  id: string
  name: string
  /** Giro: pilates, barre, café... */
  sector: string
  /** Colonia or area, to plan visit routes. */
  zone: string
  address: string
  contactName: string
  /** WhatsApp or phone, 10 digits. */
  phone: string
  email: string
  instagram: string
  /** Google Maps or website link. */
  link: string
  stage: ProspectStage
  nextStep: string
  /** YYYY-MM-DD */
  nextDate: string
  notes: string
  /** Contact history, newest first. */
  log: { at: string; text: string; by: string }[]
  /** Set when the prospect became a LoyaLoop business. */
  businessId?: string
  createdAt: string
  updatedAt: string
}

export interface Session {
  userId: string
  /** Set when the admin enters a business account. */
  impersonating?: string
  createdAt: string
}

export interface DB {
  version: number
  users: User[]
  businesses: Business[]
  branches: Branch[]
  registers: Register[]
  devices: Device[]
  pairingCodes: PairingCode[]
  programs: Program[]
  rewards: Reward[]
  customers: Customer[]
  transactions: Transaction[]
  scans: Scan[]
  payments: Payment[]
  integrations: Integration[]
  notices: WalletNotice[]
  campaigns: Campaign[]
  audit: AuditEntry[]
  leads: Lead[]
  prospects: Prospect[]
  verifications: { phone: string; businessId: string; code: string; attempts: number; expiresAt: string; sentAt: string }[]
  resets: { token: string; userId: string; expiresAt: string }[]
  /** Last time the daily job ran for each business. */
  maintenance: Record<string, string>
}
