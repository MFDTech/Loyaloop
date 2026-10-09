export type Role = "Dueño" | "Gerente" | "Cajero"
export type CardType = "Puntos" | "Sellos" | "Recompensas" | "Niveles"
export type Customer = {
  id: string
  name: string
  phone: string
  email: string
  birthday: string
  points: number
  stamps: number
  spending: number
  tier: string
  earnedRewards?: string[]
  createdAt: string
  privacy: boolean
  promotions: boolean
}
export type Transaction = {
  id: string
  customerId: string
  type: "Compra" | "Canje" | "Ajuste" | "Devolución" | "Visita" | "Bono"
  amount: number
  points: number
  reason: string
  date: string
  branch: string
  register: string
  device: string
  reference?: string
}
export type Program = {
  type: CardType
  rate: string
  minimum: string
  stampMinimum: string
  stampGoal: string
  stampReward: string
  dailyLimit: string
  suspiciousFactor: string
  welcome: string
  promotionLimit: string
  tierThreshold: string
  tierMultiplier: string
  discreet: boolean
  location: boolean
  neutralName: string
  logo: string
  image: string
  color: string
}
export interface Reward {
  id: string
  name: string
  cost: number
}
export interface Branch {
  id: string
  name: string
  address: string
}
export interface Register {
  id: string
  name: string
  branchId: string
}
export interface Device {
  id: string
  name: string
  registerId: string
  code: string
}
export interface TeamMember {
  id: string
  name: string
  phone: string
  role: Role
  excluded: boolean
}
export interface IntegrationError {
  id: string
  provider: string
  message: string
  date: string
}
export type Workspace = {
  name: string
  email: string
  phone: string
  customers: Customer[]
  transactions: Transaction[]
  program: Program
  rewards: Reward[]
  notifications: {
    id: string
    title: string
    message: string
    event: string
    status: string
    date: string
  }[]
  branches: Branch[]
  registers: Register[]
  devices: Device[]
  team: TeamMember[]
  errors: IntegrationError[]
}
export const DEMO_KEY = "loyaloop-workspaces-demo-v1"
export const pilotId = "affair-demo"
export const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    value,
  )
export const phoneId = (value: string) => {
  const digits = value.replace(/\D/g, "")
  return digits.length === 12 && digits.startsWith("52")
    ? digits.slice(2)
    : digits
}
export const uid = () => crypto.randomUUID()
export function seedWorkspace(
  name = "Affair · piloto de demostración",
): Workspace {
  const date = new Date().toISOString()
  return {
    name,
    email: "hola@ejemplo.com",
    phone: "",
    customers: [
      {
        id: "cliente-demo-1",
        name: "Sofía Martínez",
        phone: "5550000001",
        email: "sofia@example.com",
        birthday: "",
        points: 420,
        stamps: 5,
        spending: 1450,
        tier: "Sin nivel configurado",
        createdAt: date,
        privacy: true,
        promotions: true,
      },
      {
        id: "cliente-demo-2",
        name: "Diego López",
        phone: "5550000002",
        email: "",
        birthday: "",
        points: 180,
        stamps: 2,
        spending: 820,
        tier: "Sin nivel configurado",
        createdAt: date,
        privacy: true,
        promotions: false,
      },
    ],
    transactions: [
      {
        id: "compra-demo-1",
        customerId: "cliente-demo-1",
        type: "Compra",
        amount: 200,
        points: 20,
        reason: "Compra de ejemplo, no procesada por un proveedor",
        date,
        branch: "Sucursal principal",
        register: "Caja 1",
        device: "Escáner de ejemplo",
      },
    ],
    program: {
      type: "Sellos",
      rate: "",
      minimum: "0",
      stampMinimum: "",
      stampGoal: "",
      stampReward: "",
      dailyLimit: "",
      suspiciousFactor: "",
      welcome: "",
      promotionLimit: "",
      tierThreshold: "",
      tierMultiplier: "",
      discreet: false,
      location: false,
      neutralName: "Mi tarjeta de beneficios",
      logo: "",
      image: "",
      color: "#8A2E12",
    },
    rewards: [
      { id: "recompensa-demo-1", name: "Beneficio de ejemplo", cost: 100 },
    ],
    notifications: [],
    branches: [
      {
        id: "principal",
        name: "Sucursal principal",
        address: "Dirección por definir",
      },
    ],
    registers: [{ id: "caja-1", name: "Caja 1", branchId: "principal" }],
    devices: [
      {
        id: "dispositivo-demo",
        name: "Escáner de ejemplo",
        registerId: "caja-1",
        code: "123456",
      },
    ],
    team: [],
    errors: [],
  }
}
export function loadWorkspace(id: string, name?: string): Workspace {
  try {
    const workspaces = JSON.parse(localStorage.getItem(DEMO_KEY) || "{}")
    if (Object.prototype.hasOwnProperty.call(workspaces, id))
      return {
        ...workspaces[id],
        program: { ...seedWorkspace().program, ...workspaces[id].program },
      }
    const businesses = JSON.parse(
      localStorage.getItem("ember-companies") || "[]",
    )
    const businessName = Array.isArray(businesses)
      ? businesses.find((item) => item.email === id)?.name
      : undefined
    return seedWorkspace(
      name ||
        businessName ||
        (id === pilotId ? undefined : "Negocio de demostración"),
    )
  } catch {
    return seedWorkspace(name)
  }
}
export function saveWorkspace(id: string, workspace: Workspace) {
  let workspaces: Record<string, Workspace>
  const raw = localStorage.getItem(DEMO_KEY)
  try {
    workspaces = JSON.parse(raw || "{}")
  } catch {
    throw new Error(
      "El almacenamiento de demo contiene datos inválidos. No se han sobrescrito.",
    )
  }
  if (
    !workspaces ||
    typeof workspaces !== "object" ||
    Array.isArray(workspaces)
  )
    throw new Error("Formato de almacenamiento de demo inválido.")
  Object.defineProperty(workspaces, id, {
    value: workspace,
    enumerable: true,
    configurable: true,
    writable: true,
  })
  localStorage.setItem(DEMO_KEY, JSON.stringify(workspaces))
}
export function demoGlobalMetrics() {
  try {
    const all = Object.values(
      JSON.parse(localStorage.getItem(DEMO_KEY) || "{}"),
    ) as Workspace[]
    return {
      passes: all.reduce((sum, item) => sum + item.customers.length, 0),
      transactions: all.reduce(
        (sum, item) => sum + item.transactions.length,
        0,
      ),
      errors: all.reduce((sum, item) => sum + item.errors.length, 0),
    }
  } catch {
    return { passes: 0, transactions: 0, errors: 0 }
  }
}
export interface DemoScan {
  token: string
  time: number
  used: boolean
  customerId: string
  deviceId: string
  online: boolean
  rewardId?: string
}
export interface DemoScanResult {
  next?: Workspace
  error?: string
  message?: string
}
// Local simulator only. Payment matching, signatures and authorization belong on the server.
export function applyDemoScan(
  data: Workspace,
  scan: DemoScan,
  now = Date.now(),
): DemoScanResult {
  if (!scan.online)
    return { error: "Sin conexión. No se ha registrado el escaneo." }
  if (scan.used || now - scan.time > 300000 || now < scan.time)
    return { error: "Escaneo vencido o ya utilizado. Presenta de nuevo el QR." }
  if (data.transactions.some((item) => item.id === scan.token))
    return { error: "Este escaneo ya se registró." }
  const person = data.customers.find((item) => item.id === scan.customerId)
  const device = data.devices.find((item) => item.id === scan.deviceId)
  const register = data.registers.find((item) => item.id === device?.registerId)
  const branch = data.branches.find((item) => item.id === register?.branchId)
  if (!person || !device || !register || !branch)
    return { error: "QR inválido o dispositivo sin emparejar en este negocio." }
  const earned = [...(person.earnedRewards || [])]
  const reward = data.rewards.find((item) => item.id === scan.rewardId)
  const rewardWasEarned = scan.rewardId ? earned.includes(scan.rewardId) : false
  let points = 0,
    stamps = person.stamps,
    type: Transaction["type"] = "Compra",
    amount = 200,
    reason = "Compra integrada de ejemplo: 200 MXN, sin propina"
  if (scan.rewardId) {
    if (!reward || (!rewardWasEarned && person.points < reward.cost))
      return { error: "Saldo insuficiente para esta recompensa." }
    points = rewardWasEarned ? 0 : -reward.cost
    if (rewardWasEarned) earned.splice(earned.indexOf(scan.rewardId), 1)
    type = "Canje"
    amount = 0
    reason = reward.name
  } else {
    if (
      data.team.some(
        (member) =>
          member.excluded && phoneId(member.phone) === phoneId(person.phone),
      )
    )
      return { error: "Este empleado está excluido de acumular puntos." }
    if (
      data.program.dailyLimit &&
      data.transactions.filter(
        (item) =>
          item.customerId === person.id &&
          item.type === "Compra" &&
          item.date.slice(0, 10) === new Date(now).toISOString().slice(0, 10),
      ).length >= Number(data.program.dailyLimit)
    )
      return { error: "Se alcanzó el límite diario configurado." }
    if (data.program.type === "Puntos") {
      if (!data.program.rate)
        return {
          error:
            "El administrador debe configurar los puntos por peso antes de probar una compra.",
        }
      points =
        200 >= Number(data.program.minimum || 0)
          ? Math.floor(200 * Number(data.program.rate))
          : 0
    } else {
      stamps += 1
      type = "Visita"
      amount = 0
      reason = "Visita de ejemplo sin proveedor conectado"
    }
  }
  const completed =
    !reward &&
    type === "Visita" &&
    !!data.program.stampGoal &&
    data.rewards.some((item) => item.id === data.program.stampReward) &&
    stamps >= Number(data.program.stampGoal)
  if (completed) {
    stamps = 0
    earned.push(data.program.stampReward)
  }
  const transaction: Transaction = {
    id: scan.token,
    customerId: person.id,
    type,
    amount,
    points,
    reason,
    date: new Date(now).toISOString(),
    branch: branch.name,
    register: register.name,
    device: device.name,
  }
  return {
    next: {
      ...data,
      customers: data.customers.map((item) =>
        item.id === person.id
          ? {
              ...item,
              points: item.points + points,
              stamps,
              earnedRewards: earned,
              spending: item.spending + amount,
            }
          : item,
      ),
      transactions: [transaction, ...data.transactions],
    },
    message: reward
      ? "Recompensa canjeada en la demo."
      : completed
        ? "Meta alcanzada: recompensa disponible y tarjeta reiniciada en la demo. La actualización real de Wallet requiere backend."
        : type === "Visita"
          ? "1 sello de visita añadido en la demo."
          : `${points} puntos ganados por una compra de ejemplo.`,
  }
}
export function downloadCustomers(customers: Customer[]) {
  const escape = (value: string | number) =>
    `"${String(value)
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replace(/"/g, '""')}"`
  const rows = [
    ["Nombre", "Teléfono", "Correo", "Puntos", "Sellos"],
    ...customers.map((customer) => [
      customer.name,
      customer.phone,
      customer.email,
      customer.points,
      customer.stamps,
    ]),
  ]
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = "clientes-loyaloop-demo.csv"
  link.click()
  URL.revokeObjectURL(url)
}
