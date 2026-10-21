// Loyalty rules. Pure functions over the DB snapshot: the backend runs this
// same logic inside a database transaction when a scan or payment arrives.

import type {
  Campaign,
  Customer,
  DB,
  Device,
  Payment,
  Program,
  Reward,
  Scan,
  Tier,
  Transaction,
} from "./types"
import { DEFAULT_MISS_YOU_DAYS, PROMOTION_VARS, noticeEnabled, noticeTemplate, renderNotice, type Audience, type AutomaticEvent, type NoticeEvent, type NoticeVar } from "./notices"
import { DAY, MATCH_WINDOW_MS, int, normalizePhone, uid } from "./util"

const iso = (now: number) => new Date(now).toISOString()
const time = (value: string) => new Date(value).getTime()

export function programOf(db: DB, businessId: string): Program {
  const program = db.programs.find((p) => p.businessId === businessId)
  if (!program) throw new Error("El negocio no tiene tarjeta configurada.")
  return program
}

export function usesPoints(program: Program): boolean {
  return program.type !== "stamps"
}

export function hasIntegration(db: DB, businessId: string): boolean {
  return db.integrations.some((i) => i.businessId === businessId && i.status === "connected")
}

/** Net spending (purchases minus refunds) in the last 365 days. */
export function spending12m(db: DB, customerId: string, now: number): number {
  return db.transactions
    .filter(
      (t) =>
        t.customerId === customerId &&
        (t.kind === "purchase" || t.kind === "refund") &&
        now - time(t.createdAt) <= 365 * DAY,
    )
    .reduce((sum, t) => sum + t.amount, 0)
}

export function tierFor(tiers: Tier[], spending: number): Tier | undefined {
  return [...tiers].sort((a, b) => b.threshold - a.threshold).find((t) => spending >= t.threshold)
}

export function currentTier(db: DB, customer: Customer): Tier | undefined {
  const program = programOf(db, customer.businessId)
  if (program.type !== "tiers") return undefined
  return program.tiers.find((t) => t.id === customer.tierId)
}

export function multiplierFor(db: DB, customer: Customer): number {
  return currentTier(db, customer)?.multiplier || 1
}

/** Points for a purchase: amount without tip, rounded down. */
export function pointsFor(program: Program, base: number, multiplier = 1): number {
  if (base <= 0 || base < program.minPurchase) return 0
  return Math.floor(base * program.pointsPerPeso * multiplier)
}

/** A card belongs to someone on the team when its phone or email matches theirs. */
export function employeeStatus(db: DB, businessId: string, card: { phone: string; email: string }) {
  const phone = normalizePhone(card.phone || "")
  const email = (card.email || "").trim().toLowerCase()
  const member = db.users.find(
    (u) =>
      u.businessId === businessId &&
      u.active &&
      ((phone && u.phone && normalizePhone(u.phone) === phone) || (email && u.email.toLowerCase() === email)),
  )
  return { employee: !!member, excluded: !!member?.excludedFromEarning }
}

export function earningsToday(db: DB, customerId: string, now: number): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return db.transactions.filter(
    (t) =>
      t.customerId === customerId &&
      (t.kind === "purchase" || t.kind === "visit") &&
      time(t.createdAt) >= start.getTime(),
  ).length
}

/** Returns an error message when this customer may not earn right now. */
export function earnBlocked(db: DB, customer: Customer, now: number): string | null {
  const program = programOf(db, customer.businessId)
  if (employeeStatus(db, customer.businessId, customer).excluded)
    return "Este teléfono es de un empleado y no acumula."
  if (program.dailyLimit > 0 && earningsToday(db, customer.id, now) >= program.dailyLimit)
    return `Se alcanzó el límite de ${program.dailyLimit} compras con beneficio por día.`
  return null
}

/** Records a notice for the customer's pass, with the business's own text. */
function notice(db: DB, customer: Customer, event: AutomaticEvent, vars: Partial<Record<NoticeVar, string | number>>, now: number) {
  const program = programOf(db, customer.businessId)
  if (!noticeEnabled(program, event)) return
  const message = renderNotice(noticeTemplate(program, event), { ...baseVars(db, customer, program), ...vars })
  if (!message) return
  pushNotice(db, customer, event, message, now)
}

function pushNotice(db: DB, customer: Customer, event: NoticeEvent, message: string, now: number, campaignId?: string) {
  db.notices.unshift({
    id: uid("n_"),
    businessId: customer.businessId,
    customerId: customer.id,
    event,
    message,
    ...(campaignId ? { campaignId } : {}),
    createdAt: iso(now),
  })
}

/** Variables every notice can use. */
function baseVars(db: DB, customer: Customer, program: Program): Partial<Record<NoticeVar, string | number>> {
  const business = db.businesses.find((b) => b.id === customer.businessId)
  const stampReward = db.rewards.find((r) => r.id === program.stampRewardId)
  return {
    nombre: customer.name.split(" ")[0] || customer.name,
    negocio: business ? (business.discreet ? business.neutralName : business.name) : "",
    puntos: int(customer.points),
    sellos: customer.stamps,
    meta: program.stampGoal,
    faltan: Math.max(program.stampGoal - customer.stamps, 0),
    nivel: program.tiers.find((t) => t.id === customer.tierId)?.name || "",
    ...(stampReward ? { recompensa: stampReward.name } : {}),
  }
}

function cheapestReward(db: DB, businessId: string): Reward | undefined {
  return db.rewards
    .filter((r) => r.businessId === businessId && r.active)
    .sort((a, b) => a.cost - b.cost)[0]
}

/** Recalculates the tier after any spending change. */
export function recomputeTier(db: DB, customer: Customer, now: number) {
  const program = programOf(db, customer.businessId)
  if (program.type !== "tiers" || !program.tiers.length) {
    customer.tierId = undefined
    return
  }
  const next = tierFor(program.tiers, spending12m(db, customer.id, now))
  const current = program.tiers.find((t) => t.id === customer.tierId)
  if (next?.id === current?.id) return
  const goingDown = (next?.threshold ?? -1) < (current?.threshold ?? -1)
  if (goingDown && !program.tierDowngrade) return
  customer.tierId = next?.id
  // The first tier a new card gets is not news; moving up or down is.
  if (next && current) notice(db, customer, "tierChange", { nivel: next.name }, now)
}

interface EarnContext {
  device?: Device
  registerId?: string
  paymentId?: string
}

function context(db: DB, ctx: EarnContext) {
  const registerId = ctx.registerId || ctx.device?.registerId
  const register = db.registers.find((r) => r.id === registerId)
  return {
    registerId,
    branchId: register?.branchId,
    deviceId: ctx.device?.id,
    paymentId: ctx.paymentId,
  }
}

function addStamp(db: DB, customer: Customer, program: Program, now: number, quiet = false): number {
  customer.stamps += 1
  if (program.stampGoal > 0 && customer.stamps >= program.stampGoal) {
    customer.stamps = 0
    if (program.stampRewardId) {
      customer.earnedRewards.push({ id: uid("er_"), rewardId: program.stampRewardId, createdAt: iso(now) })
      const reward = db.rewards.find((r) => r.id === program.stampRewardId)
      notice(db, customer, "rewardAvailable", { recompensa: reward?.name || "tu recompensa" }, now)
    }
  } else if (!quiet) {
    const left = program.stampGoal - customer.stamps
    // «Te falta un sello» replaces «Sello ganado» when it is on.
    if (left === 1 && noticeEnabled(program, "almostThere")) notice(db, customer, "almostThere", {}, now)
    else notice(db, customer, "stampEarned", {}, now)
  }
  return 1
}

/** Credits a matched payment to the customer who scanned. */
export function creditPayment(db: DB, scan: Scan, payment: Payment, now: number): Transaction {
  const customer = db.customers.find((c) => c.id === scan.customerId)!
  const program = programOf(db, customer.businessId)
  if (payment.amount - payment.tip > 0) settleWelcome(db, customer, now)
  const base = Math.max(0, payment.amount - payment.tip)
  const ctx = context(db, { registerId: payment.registerId, paymentId: payment.id })
  let points = 0
  let stamps = 0
  const before = customer.points
  if (usesPoints(program)) {
    points = pointsFor(program, base, multiplierFor(db, customer))
    customer.points += points
  } else if (base >= program.stampMinPurchase) {
    stamps = addStamp(db, customer, program, now)
  }
  const tx: Transaction = {
    id: uid("t_"),
    businessId: customer.businessId,
    customerId: customer.id,
    kind: "purchase",
    amount: base,
    points,
    stamps,
    reason:
      points || stamps
        ? `Cobro ${payment.provider === "mercadopago" ? "Mercado Pago" : "Clip"} ${payment.externalId}`
        : `Cobro ${payment.externalId} por debajo de la compra mínima`,
    ...ctx,
    deviceId: scan.deviceId,
    createdAt: iso(now),
  }
  db.transactions.unshift(tx)
  customer.lastActivityAt = iso(now)
  scan.status = "matched"
  scan.paymentId = payment.id
  payment.status = "matched"
  payment.scanId = scan.id
  if (points > 0) notice(db, customer, "pointsEarned", { ganados: int(points) }, now)
  const cheapest = cheapestReward(db, customer.businessId)
  if (usesPoints(program) && cheapest && before < cheapest.cost && customer.points >= cheapest.cost)
    notice(db, customer, "rewardAvailable", { recompensa: cheapest.name }, now)
  recomputeTier(db, customer, now)
  return tx
}

/** Stamp by visit, for businesses without a connected payment system. */
export function creditVisit(db: DB, scan: Scan, device: Device, now: number): Transaction {
  const customer = db.customers.find((c) => c.id === scan.customerId)!
  const program = programOf(db, customer.businessId)
  settleWelcome(db, customer, now)
  const stamps = addStamp(db, customer, program, now)
  const tx: Transaction = {
    id: uid("t_"),
    businessId: customer.businessId,
    customerId: customer.id,
    kind: "visit",
    amount: 0,
    points: 0,
    stamps,
    reason: "Sello por visita (sin sistema de cobro conectado)",
    ...context(db, { device }),
    createdAt: iso(now),
  }
  db.transactions.unshift(tx)
  customer.lastActivityAt = iso(now)
  scan.status = "visit"
  return tx
}

/** Pending scans older than the window expire without points. */
export function expireScans(db: DB, now: number) {
  for (const scan of db.scans)
    if (scan.status === "pending" && now - time(scan.createdAt) > MATCH_WINDOW_MS) scan.status = "expired"
}

export type ScanOutcome =
  | { kind: "matched"; scan: Scan; tx: Transaction }
  | { kind: "visit"; scan: Scan; tx: Transaction }
  | { kind: "pending"; scan: Scan }
  | { kind: "review"; scan: Scan }
  | { kind: "error"; message: string }

/** A customer presented their QR at a paired device. */
export function registerScan(db: DB, device: Device, token: string, now: number): ScanOutcome {
  expireScans(db, now)
  const customer = db.customers.find((c) => c.businessId === device.businessId && c.token === token)
  if (!customer) return { kind: "error", message: "Este código no corresponde a una tarjeta de este negocio." }
  const program = programOf(db, device.businessId)
  const blocked = earnBlocked(db, customer, now)
  if (!hasIntegration(db, device.businessId)) {
    if (program.type !== "stamps")
      return { kind: "error", message: "El sistema de cobro de este negocio aún no está conectado." }
    if (blocked) return { kind: "error", message: blocked }
    const scan: Scan = {
      id: uid("s_"),
      businessId: device.businessId,
      registerId: device.registerId,
      deviceId: device.id,
      customerId: customer.id,
      status: "visit",
      createdAt: iso(now),
    }
    db.scans.unshift(scan)
    return { kind: "visit", scan, tx: creditVisit(db, scan, device, now) }
  }
  if (blocked) return { kind: "error", message: blocked }
  const inWindow = (value: string) => now - time(value) <= MATCH_WINDOW_MS && time(value) <= now
  const existing = db.scans.find(
    (s) => s.customerId === customer.id && s.registerId === device.registerId && s.status === "pending",
  )
  if (existing) return { kind: "pending", scan: existing }
  const scan: Scan = {
    id: uid("s_"),
    businessId: device.businessId,
    registerId: device.registerId,
    deviceId: device.id,
    customerId: customer.id,
    status: "pending",
    createdAt: iso(now),
  }
  db.scans.unshift(scan)
  const payments = db.payments.filter(
    (p) => p.registerId === device.registerId && p.status === "unmatched" && inWindow(p.createdAt),
  )
  const otherScans = db.scans.filter(
    (s) => s.id !== scan.id && s.registerId === device.registerId && s.status === "pending" && inWindow(s.createdAt),
  )
  if (payments.length === 1 && otherScans.length === 0)
    return { kind: "matched", scan, tx: creditPayment(db, scan, payments[0], now) }
  if (payments.length > 1 || (payments.length === 1 && otherScans.length > 0)) {
    scan.status = "review"
    for (const p of payments) p.status = "review"
    for (const s of otherScans) s.status = "review"
    return { kind: "review", scan }
  }
  return { kind: "pending", scan }
}

export type PaymentOutcome =
  | { kind: "matched"; tx: Transaction }
  | { kind: "review" }
  | { kind: "unmatched" }

/** A payment notification arrived from the provider (webhook). */
export function registerPayment(db: DB, payment: Payment, now: number): PaymentOutcome {
  expireScans(db, now)
  db.payments.unshift(payment)
  const scans = db.scans.filter(
    (s) =>
      s.registerId === payment.registerId &&
      s.status === "pending" &&
      now - time(s.createdAt) <= MATCH_WINDOW_MS,
  )
  const otherPayments = db.payments.filter(
    (p) =>
      p.id !== payment.id &&
      p.registerId === payment.registerId &&
      p.status === "unmatched" &&
      now - time(p.createdAt) <= MATCH_WINDOW_MS,
  )
  if (scans.length === 1 && otherPayments.length === 0)
    return { kind: "matched", tx: creditPayment(db, scans[0], payment, now) }
  if (scans.length > 1 || (scans.length === 1 && otherPayments.length > 0)) {
    payment.status = "review"
    for (const s of scans) s.status = "review"
    for (const p of otherPayments) p.status = "review"
    return { kind: "review" }
  }
  return { kind: "unmatched" }
}

/** A manager assigns a payment in review to one scan, or discards it. */
export function resolveReview(db: DB, paymentId: string, scanId: string | null, now: number): Transaction | null {
  const payment = db.payments.find((p) => p.id === paymentId)
  if (!payment || payment.status !== "review") throw new Error("Este cobro ya no está en revisión.")
  if (!scanId) {
    payment.status = "discarded"
    return null
  }
  const scan = db.scans.find((s) => s.id === scanId)
  if (!scan || scan.registerId !== payment.registerId || (scan.status !== "review" && scan.status !== "pending"))
    throw new Error("Ese escaneo no se puede asignar a este cobro.")
  const tx = creditPayment(db, scan, payment, now)
  // Scans left without a payment once nothing else is in review go back to expired.
  const stillInReview = db.payments.some((p) => p.registerId === payment.registerId && p.status === "review")
  if (!stillInReview)
    for (const s of db.scans) if (s.registerId === payment.registerId && s.status === "review") s.status = "expired"
  return tx
}

/** Scans a manager can pick from for a payment in review. */
export function reviewCandidates(db: DB, payment: Payment): Scan[] {
  const at = time(payment.createdAt)
  return db.scans.filter(
    (s) =>
      s.registerId === payment.registerId &&
      (s.status === "review" || s.status === "pending") &&
      Math.abs(time(s.createdAt) - at) <= MATCH_WINDOW_MS,
  )
}

export type RedeemTarget = { rewardId: string } | { earnedId: string }

export function redeem(db: DB, customer: Customer, target: RedeemTarget, ctx: { device?: Device; actorId?: string }, now: number): Transaction {
  let reward: Reward | undefined
  let points = 0
  if ("earnedId" in target) {
    const index = customer.earnedRewards.findIndex((e) => e.id === target.earnedId)
    if (index < 0) throw new Error("Esa recompensa ya se canjeó.")
    reward = db.rewards.find((r) => r.id === customer.earnedRewards[index].rewardId)
    customer.earnedRewards.splice(index, 1)
  } else {
    const program = programOf(db, customer.businessId)
    if (!usesPoints(program)) throw new Error("Esta tarjeta no canjea con puntos.")
    reward = db.rewards.find((r) => r.id === target.rewardId && r.businessId === customer.businessId && r.active)
    if (!reward) throw new Error("La recompensa no está disponible.")
    if (customer.points < reward.cost)
      throw new Error(`Faltan ${int(reward.cost - customer.points)} puntos para esta recompensa.`)
    points = -reward.cost
    customer.points -= reward.cost
  }
  const tx: Transaction = {
    id: uid("t_"),
    businessId: customer.businessId,
    customerId: customer.id,
    kind: "redeem",
    amount: 0,
    points,
    stamps: 0,
    rewardId: reward?.id,
    reason: reward?.name || "Recompensa",
    ...context(db, { device: ctx.device }),
    actorId: ctx.actorId,
    createdAt: iso(now),
  }
  db.transactions.unshift(tx)
  customer.lastActivityAt = iso(now)
  return tx
}

export function adjust(db: DB, customer: Customer, delta: { points: number; stamps: number }, reason: string, actorId: string, now: number): Transaction {
  if (!reason.trim()) throw new Error("El motivo es obligatorio.")
  if (!Number.isInteger(delta.points) || !Number.isInteger(delta.stamps)) throw new Error("Usa números enteros.")
  if (delta.points === 0 && delta.stamps === 0) throw new Error("El ajuste no cambia nada.")
  if (customer.points + delta.points < 0) throw new Error("El ajuste dejaría el saldo de puntos en negativo.")
  if (customer.stamps + delta.stamps < 0) throw new Error("El ajuste dejaría los sellos en negativo.")
  customer.points += delta.points
  customer.stamps += delta.stamps
  const tx: Transaction = {
    id: uid("t_"),
    businessId: customer.businessId,
    customerId: customer.id,
    kind: "adjust",
    amount: 0,
    points: delta.points,
    stamps: delta.stamps,
    reason: reason.trim(),
    actorId,
    createdAt: iso(now),
  }
  db.transactions.unshift(tx)
  return tx
}

/** Reverses the points or stamp of a purchase. Balances never go below zero. */
export function refund(db: DB, txId: string, reason: string, actorId: string | undefined, now: number): Transaction {
  const original = db.transactions.find((t) => t.id === txId)
  if (!original || original.kind !== "purchase") throw new Error("Solo se pueden devolver compras.")
  if (db.transactions.some((t) => t.kind === "refund" && t.refOf === txId)) throw new Error("Esta compra ya se devolvió.")
  const customer = db.customers.find((c) => c.id === original.customerId)!
  const points = Math.min(original.points, customer.points)
  const stamps = Math.min(original.stamps, customer.stamps)
  customer.points -= points
  customer.stamps -= stamps
  const tx: Transaction = {
    ...original,
    id: uid("t_"),
    kind: "refund",
    amount: -original.amount,
    points: -points,
    stamps: -stamps,
    reason: reason.trim() || "Devolución de la compra",
    refOf: original.id,
    actorId,
    createdAt: iso(now),
  }
  db.transactions.unshift(tx)
  const payment = db.payments.find((p) => p.id === original.paymentId)
  if (payment) payment.status = "refunded"
  recomputeTier(db, customer, now)
  return tx
}

/**
 * New card. Without a verified phone the bonus waits for the first purchase or
 * visit, so registering again and again gives nothing.
 */
export function welcome(db: DB, customer: Customer, now: number, defer = false): Transaction | null {
  const program = programOf(db, customer.businessId)
  let tx: Transaction | null = null
  if (defer) customer.welcomePending = program.welcomeBonus > 0 || undefined
  else tx = welcomeBonus(db, customer, now)
  notice(db, customer, "welcome", {}, now)
  return tx
}

function settleWelcome(db: DB, customer: Customer, now: number) {
  if (!customer.welcomePending) return
  customer.welcomePending = undefined
  welcomeBonus(db, customer, now)
}

function welcomeBonus(db: DB, customer: Customer, now: number): Transaction | null {
  const program = programOf(db, customer.businessId)
  if (!program.welcomeBonus) return null
  const stampsMode = !usesPoints(program)
  const tx: Transaction = {
    id: uid("t_"),
    businessId: customer.businessId,
    customerId: customer.id,
    kind: "bonus",
    amount: 0,
    points: stampsMode ? 0 : program.welcomeBonus,
    stamps: stampsMode ? Math.min(program.welcomeBonus, Math.max(program.stampGoal - 1, 0)) : 0,
    reason: "Bono de bienvenida",
    branchId: customer.branchId,
    createdAt: iso(now),
  }
  customer.points += tx.points
  customer.stamps += tx.stamps
  db.transactions.unshift(tx)
  return tx
}

/** Date and hour in Mexico City: birthdays and greetings follow the business's day, not the server's. */
export function localTime(now: number, timeZone = "America/Mexico_City") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(now))
      .map((p) => [p.type, p.value]),
  )
  return { year: Number(parts.year), mmdd: `${parts.month}-${parts.day}`, day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

const sameDay = (mmdd: string, now: number) => mmdd === localTime(now).mmdd

/** Greetings go out in the morning or afternoon, never at night. */
const greetingHour = (now: number) => {
  const { hour } = localTime(now)
  return hour >= 10 && hour < 20
}

/** Daily job: expirations, expiry warnings, birthday bonuses and tier review. */
export function runMaintenance(db: DB, businessId: string, now: number) {
  const program = programOf(db, businessId)
  expireScans(db, now)
  for (const customer of db.customers.filter((c) => c.businessId === businessId)) {
    const idle = now - time(customer.lastActivityAt)
    if (program.expirationMonths > 0 && customer.points > 0 && usesPoints(program)) {
      const limit = program.expirationMonths * 30 * DAY
      if (idle >= limit) {
        db.transactions.unshift({
          id: uid("t_"),
          businessId,
          customerId: customer.id,
          kind: "expire",
          amount: 0,
          points: -customer.points,
          stamps: 0,
          reason: `Sin actividad en ${program.expirationMonths} meses`,
          createdAt: iso(now),
        })
        customer.points = 0
      } else if (
        idle >= limit - 30 * DAY &&
        !db.notices.some(
          (n) => n.customerId === customer.id && n.event === "pointsExpiring" && time(n.createdAt) > time(customer.lastActivityAt),
        )
      ) {
        notice(db, customer, "pointsExpiring", {}, now)
      }
    }
    const year = localTime(now).year
    if (customer.birthday && sameDay(customer.birthday, now) && customer.birthdayNoticeYear !== year && greetingHour(now) && noticeEnabled(program, "birthday")) {
      customer.birthdayNoticeYear = year
      const gift = program.birthdayBonus > 0 ? (usesPoints(program) ? `${int(program.birthdayBonus)} puntos` : "un sello") : ""
      notice(db, customer, "birthday", { regalo: gift }, now)
    }
    const missYouDays = program.missYouDays || DEFAULT_MISS_YOU_DAYS
    const lastVisit = time(customer.lastActivityAt)
    if (
      idle >= missYouDays * DAY &&
      (!customer.missYouAt || time(customer.missYouAt) < lastVisit) &&
      greetingHour(now) &&
      noticeEnabled(program, "missYou")
    ) {
      customer.missYouAt = iso(now)
      notice(db, customer, "missYou", { dias: Math.floor(idle / DAY) }, now)
    }
    if (program.birthdayBonus > 0 && customer.birthday && sameDay(customer.birthday, now)) {
      const already = db.transactions.some(
        (t) => t.customerId === customer.id && t.kind === "bonus" && t.reason === "Bono de cumpleaños" && new Date(t.createdAt).getFullYear() === year,
      )
      if (!already) {
        const stampsMode = !usesPoints(program)
        const tx: Transaction = {
          id: uid("t_"),
          businessId,
          customerId: customer.id,
          kind: "bonus",
          amount: 0,
          points: stampsMode ? 0 : program.birthdayBonus,
          stamps: stampsMode ? 1 : 0,
          reason: "Bono de cumpleaños",
          createdAt: iso(now),
        }
        customer.points += tx.points
        if (tx.stamps) addStamp(db, customer, program, now, true)
        db.transactions.unshift(tx)
      }
    }
    recomputeTier(db, customer, now)
  }
}

/** Cards with far more purchases than the business average in 30 days. */
export function suspiciousCustomers(db: DB, businessId: string, now: number): { customer: Customer; count: number; average: number }[] {
  const program = programOf(db, businessId)
  if (!program.suspiciousFactor) return []
  const customers = db.customers.filter((c) => c.businessId === businessId)
  const counts = new Map<string, number>()
  for (const t of db.transactions)
    if (t.businessId === businessId && (t.kind === "purchase" || t.kind === "visit") && now - time(t.createdAt) <= 30 * DAY)
      counts.set(t.customerId, (counts.get(t.customerId) || 0) + 1)
  const active = [...counts.values()]
  if (active.length < 2) return []
  const average = active.reduce((a, b) => a + b, 0) / active.length
  return customers
    .map((customer) => ({ customer, count: counts.get(customer.id) || 0, average }))
    .filter((row) => row.count >= 3 && row.count > average * program.suspiciousFactor)
    .sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------- promotions

/** Customers a promotion reaches: only those who accepted promotions. */
export function audienceOf(db: DB, businessId: string, audience: Audience, now: number, includeOptedOut = false): Customer[] {
  return db.customers.filter((c) => {
    if (c.businessId !== businessId || (!c.promotionsOptIn && !includeOptedOut)) return false
    const idle = now - time(c.lastActivityAt)
    if (audience.kind === "tier") return c.tierId === audience.tierId
    if (audience.kind === "inactive") return idle >= audience.days * DAY
    if (audience.kind === "recent") return idle < audience.days * DAY
    return true
  })
}

/** Sends a promotion: one notice per customer, with their own name and balance. */
export function sendCampaign(db: DB, campaign: Campaign, now: number): number {
  const program = programOf(db, campaign.businessId)
  const allowed = new Set<string>(PROMOTION_VARS)
  const recipients = audienceOf(db, campaign.businessId, campaign.audience, now)
  for (const customer of recipients) {
    const vars = Object.fromEntries(Object.entries(baseVars(db, customer, program)).filter(([k]) => allowed.has(k)))
    const message = renderNotice(campaign.message, vars)
    if (message) pushNotice(db, customer, "promotion", message, now, campaign.id)
  }
  campaign.status = "sent"
  campaign.sentAt = iso(now)
  campaign.recipients = recipients.length
  return recipients.length
}
