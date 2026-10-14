// Example data for the preview. Every name, phone and amount here is fictional.

import type { Customer, DB, Program, Transaction } from "./types"
import { DAY, customerToken } from "./util"

export const DB_VERSION = 3

export const TEST_ACCOUNTS = [
  { email: "admin@loyaloop.test", password: "loyaloop123", label: "Administrador LoyaLoop" },
  { email: "dueno@affair.test", password: "prueba123", label: "Dueño · Affair" },
  { email: "gerente@affair.test", password: "prueba123", label: "Gerente · Affair" },
  { email: "cajero@affair.test", password: "prueba123", label: "Cajero · Affair" },
  { email: "dueno@laesquina.test", password: "prueba123", label: "Dueño · Café La Esquina" },
]

/** Small deterministic generator so the example history is stable. */
function prng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function defaultProgram(businessId: string): Program {
  return {
    businessId,
    type: "points",
    pointsPerPeso: 0.1,
    minPurchase: 0,
    stampMinPurchase: 0,
    stampGoal: 8,
    expirationMonths: 12,
    tiers: [],
    tierDowngrade: true,
    welcomeBonus: 0,
    birthdayBonus: 0,
    dailyLimit: 0,
    suspiciousFactor: 3,
    notify: { pointsEarned: true, rewardAvailable: true, tierChange: true, pointsExpiring: true },
  }
}

export function createSeed(now = Date.now()): DB {
  const iso = (t: number) => new Date(t).toISOString()
  const ago = (days: number, hours = 0) => iso(now - days * DAY - hours * 3_600_000)
  const random = prng(42)

  const db: DB = {
    version: DB_VERSION,
    users: [
      { id: "u_admin", name: "Miguel", email: "admin@loyaloop.test", password: "loyaloop123", role: "admin", excludedFromEarning: false, active: true, createdAt: ago(120) },
      { id: "u_aff_owner", name: "Dueño de Affair", email: "dueno@affair.test", password: "prueba123", role: "owner", businessId: "b_affair", excludedFromEarning: false, active: true, createdAt: ago(100) },
      { id: "u_aff_mgr", name: "Gerente de Affair", email: "gerente@affair.test", password: "prueba123", role: "manager", businessId: "b_affair", phone: "5511110002", excludedFromEarning: true, active: true, createdAt: ago(90) },
      { id: "u_aff_cash", name: "Recepción de Affair", email: "cajero@affair.test", password: "prueba123", role: "cashier", businessId: "b_affair", branchId: "br_affair", phone: "5511110003", excludedFromEarning: true, active: true, createdAt: ago(90) },
      { id: "u_esq_owner", name: "Dueña de La Esquina", email: "dueno@laesquina.test", password: "prueba123", role: "owner", businessId: "b_esquina", excludedFromEarning: false, active: true, createdAt: ago(40) },
    ],
    businesses: [
      {
        id: "b_affair",
        name: "Affair Love Suites",
        sector: "Hotel o motel",
        contactName: "Dueño de Affair",
        email: "contacto@affair.test",
        phone: "5511110001",
        status: "active",
        brand: { color: "#5B1A2E" },
        discreet: true,
        neutralName: "Club de beneficios",
        locationAlerts: false,
        createdAt: ago(100),
      },
      {
        id: "b_esquina",
        name: "Café La Esquina",
        sector: "Cafetería",
        contactName: "Dueña de La Esquina",
        email: "hola@laesquina.test",
        phone: "5522220001",
        status: "trial",
        brand: { color: "#8A2E12" },
        discreet: false,
        neutralName: "Mi tarjeta de beneficios",
        locationAlerts: true,
        createdAt: ago(40),
      },
    ],
    branches: [
      { id: "br_affair", businessId: "b_affair", name: "Affair Love Suites", address: "Ciudad de México", code: "AFF7Q2", createdAt: ago(100) },
      { id: "br_esq_roma", businessId: "b_esquina", name: "Roma", address: "Col. Roma Norte, CDMX", code: "ESQR4M", createdAt: ago(40) },
      { id: "br_esq_condesa", businessId: "b_esquina", name: "Condesa", address: "Col. Condesa, CDMX", code: "ESQC9D", createdAt: ago(20) },
    ],
    registers: [
      { id: "rg_affair_1", businessId: "b_affair", branchId: "br_affair", name: "Recepción" },
      { id: "rg_esq_roma", businessId: "b_esquina", branchId: "br_esq_roma", name: "Caja 1" },
      { id: "rg_esq_condesa", businessId: "b_esquina", branchId: "br_esq_condesa", name: "Caja 1" },
    ],
    devices: [
      { id: "dv_affair_1", businessId: "b_affair", registerId: "rg_affair_1", name: "Tablet de recepción", token: "dev_affair_tablet_token", pairedAt: ago(60), lastSeenAt: ago(0, 2) },
    ],
    pairingCodes: [],
    programs: [
      {
        ...defaultProgram("b_affair"),
        type: "tiers",
        pointsPerPeso: 0.1,
        minPurchase: 300,
        expirationMonths: 12,
        tiers: [
          { id: "tier_clasico", name: "Clásico", threshold: 0, multiplier: 1 },
          { id: "tier_plata", name: "Plata", threshold: 6000, multiplier: 1.25 },
          { id: "tier_oro", name: "Oro", threshold: 15000, multiplier: 1.5 },
        ],
        welcomeBonus: 100,
        birthdayBonus: 200,
        dailyLimit: 2,
        suspiciousFactor: 3,
      },
      {
        ...defaultProgram("b_esquina"),
        type: "stamps",
        stampMinPurchase: 50,
        stampGoal: 8,
        stampRewardId: "rw_esq_cafe",
        expirationMonths: 0,
        welcomeBonus: 1,
        dailyLimit: 3,
      },
    ],
    rewards: [
      { id: "rw_aff_hora", businessId: "b_affair", name: "Hora extra", description: "Una hora adicional en tu próxima visita.", cost: 400, active: true, createdAt: ago(90) },
      { id: "rw_aff_vino", businessId: "b_affair", name: "Botella de vino de la casa", description: "Se entrega en la habitación.", cost: 900, active: true, createdAt: ago(90) },
      { id: "rw_aff_noche", businessId: "b_affair", name: "Estancia de cortesía", description: "Sujeta a disponibilidad. Consulta condiciones en recepción.", cost: 3500, active: true, createdAt: ago(90) },
      { id: "rw_esq_cafe", businessId: "b_esquina", name: "Café americano gratis", description: "Tamaño mediano.", cost: 0, active: true, createdAt: ago(40) },
    ],
    customers: [],
    transactions: [],
    scans: [],
    payments: [],
    integrations: [
      { businessId: "b_affair", provider: "mercadopago", status: "connected", connectedAt: ago(60) },
      { businessId: "b_affair", provider: "clip", status: "not_connected" },
      { businessId: "b_esquina", provider: "mercadopago", status: "not_connected" },
      { businessId: "b_esquina", provider: "clip", status: "not_connected" },
    ],
    notices: [],
    audit: [
      { id: "a_1", businessId: "b_affair", actorId: "u_admin", actorName: "Miguel", action: "Configuró la tarjeta", detail: "Tipo Niveles con tres niveles", impersonated: false, createdAt: ago(90) },
      { id: "a_2", businessId: "b_affair", actorId: "u_admin", actorName: "Miguel", action: "Conectó Mercado Pago", detail: "Cuenta del negocio autorizada", impersonated: false, createdAt: ago(60) },
      { id: "a_3", businessId: "b_esquina", actorId: "u_admin", actorName: "Miguel", action: "Dio de alta el negocio", detail: "Dos sucursales", impersonated: false, createdAt: ago(40) },
    ],
    leads: [
      { id: "l_1", name: "Mariana López", company: "Panadería del Centro", email: "mariana@panaderia.test", phone: "5533330001", branches: "2-5", preferredDate: iso(now + 3 * DAY).slice(0, 10), preferredTime: "Mañana · 9:00 a 12:00", notes: "Queremos sellos para el café de la mañana.", status: "new", createdAt: ago(1) },
    ],
    verifications: [],
    resets: [],
    maintenance: {},
  }

  const people: Record<string, [string, string][]> = {
    b_affair: [
      ["Sofía Martínez", "5550000101"],
      ["Diego López", "5550000102"],
      ["Valeria Hernández", "5550000103"],
      ["Andrés Castillo", "5550000104"],
      ["Fernanda Ruiz", "5550000105"],
      ["Jorge Navarro", "5550000106"],
      ["Paula Ríos", "5550000107"],
      ["Emilio Vargas", "5550000108"],
    ],
    b_esquina: [
      ["Lucía Pérez", "5560000201"],
      ["Mateo Silva", "5560000202"],
      ["Camila Ortega", "5560000203"],
      ["Tomás Reyes", "5560000204"],
      ["Renata Flores", "5560000205"],
    ],
  }

  let txCount = 0
  for (const [businessId, list] of Object.entries(people)) {
    const program = db.programs.find((p) => p.businessId === businessId)!
    const branches = db.branches.filter((b) => b.businessId === businessId)
    list.forEach(([name, phone], index) => {
      const joined = Math.floor(10 + random() * (businessId === "b_affair" ? 85 : 35))
      const branch = branches[index % branches.length]
      const register = db.registers.find((r) => r.branchId === branch.id)!
      const customer: Customer = {
        id: `c_${businessId}_${index}`,
        businessId,
        name,
        phone,
        email: index % 3 === 0 ? `${name.split(" ")[0].toLowerCase()}@correo.test` : "",
        birthday: index % 2 === 0 ? `${String(1 + (index % 12)).padStart(2, "0")}-${String(5 + index).padStart(2, "0")}` : "",
        token: customerToken(),
        points: 0,
        stamps: 0,
        earnedRewards: [],
        branchId: branch.id,
        promotionsOptIn: index % 2 === 0,
        privacyAcceptedAt: ago(joined),
        createdAt: ago(joined),
        lastActivityAt: ago(joined),
      }
      db.customers.push(customer)
      const history: Transaction[] = []
      if (program.welcomeBonus) {
        const stampsMode = program.type === "stamps"
        history.push({ id: `t_seed_${txCount++}`, businessId, customerId: customer.id, kind: "bonus", amount: 0, points: stampsMode ? 0 : program.welcomeBonus, stamps: stampsMode ? 1 : 0, reason: "Bono de bienvenida", branchId: branch.id, createdAt: ago(joined) })
      }
      const visits = Math.floor(2 + random() * (index === 0 ? 14 : 8))
      for (let v = 0; v < visits; v++) {
        const day = Math.max(0, Math.floor(joined - ((v + 1) * joined) / (visits + 1) - random() * 2))
        const base = businessId === "b_affair" ? Math.round((650 + random() * 1600) / 10) * 10 : Math.round((55 + random() * 110) / 5) * 5
        const points = program.type === "stamps" ? 0 : base >= program.minPurchase ? Math.floor(base * program.pointsPerPeso) : 0
        const stamps = program.type === "stamps" && base >= program.stampMinPurchase ? 1 : 0
        history.push({
          id: `t_seed_${txCount++}`,
          businessId,
          customerId: customer.id,
          kind: businessId === "b_affair" ? "purchase" : "visit",
          amount: businessId === "b_affair" ? base : 0,
          points,
          stamps,
          reason: businessId === "b_affair" ? `Cobro Mercado Pago MP-${100200 + txCount}` : "Sello por visita (sin sistema de cobro conectado)",
          branchId: branch.id,
          registerId: register.id,
          deviceId: businessId === "b_affair" ? "dv_affair_1" : undefined,
          createdAt: ago(day, Math.floor(random() * 10)),
        })
      }
      history.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      for (const tx of history) {
        customer.points += tx.points
        customer.stamps += tx.stamps
        if (program.type === "stamps" && customer.stamps >= program.stampGoal) {
          customer.stamps = 0
          customer.earnedRewards.push({ id: `er_seed_${txCount++}`, rewardId: program.stampRewardId!, createdAt: tx.createdAt })
        }
        customer.lastActivityAt = tx.createdAt
      }
      // One redemption for the most frequent Affair guest.
      if (businessId === "b_affair" && index === 0 && customer.points >= 400) {
        customer.points -= 400
        history.push({ id: `t_seed_${txCount++}`, businessId, customerId: customer.id, kind: "redeem", amount: 0, points: -400, stamps: 0, rewardId: "rw_aff_hora", reason: "Hora extra", branchId: branch.id, registerId: register.id, deviceId: "dv_affair_1", createdAt: ago(3) })
      }
      db.transactions.push(...history)
    })
  }
  db.transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // Tiers from the seeded spending.
  const affair = db.programs.find((p) => p.businessId === "b_affair")!
  for (const customer of db.customers.filter((c) => c.businessId === "b_affair")) {
    const spent = db.transactions.filter((t) => t.customerId === customer.id && t.kind === "purchase").reduce((s, t) => s + t.amount, 0)
    const tier = [...affair.tiers].sort((a, b) => b.threshold - a.threshold).find((t) => spent >= t.threshold)
    customer.tierId = tier?.id
  }
  return db
}
