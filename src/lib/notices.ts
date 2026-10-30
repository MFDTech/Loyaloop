// Messages a business sends to its customers' passes: the automatic ones it can
// switch on and rewrite, and the promotions it sends or schedules.
// Shared by the rules, the panel (editor and preview) and the admin editor.

import type { CardType, Program } from "./types"

export type NoticeEvent =
  | "welcome"
  | "stampEarned"
  | "almostThere"
  | "pointsEarned"
  | "rewardAvailable"
  | "tierChange"
  | "pointsExpiring"
  | "birthday"
  | "missYou"
  | "promotion"

export type AutomaticEvent = Exclude<NoticeEvent, "promotion">

export type NoticeVar = "nombre" | "negocio" | "puntos" | "ganados" | "sellos" | "meta" | "faltan" | "recompensa" | "nivel" | "regalo" | "dias"

export const NOTICE_VARS: Record<NoticeVar, { label: string; sample: string }> = {
  nombre: { label: "Nombre del cliente", sample: "Laura" },
  negocio: { label: "Nombre del negocio", sample: "tu negocio" },
  puntos: { label: "Saldo de puntos", sample: "420" },
  ganados: { label: "Puntos de esta compra", sample: "85" },
  sellos: { label: "Sellos que lleva", sample: "5" },
  meta: { label: "Sellos para completar", sample: "8" },
  faltan: { label: "Sellos que faltan", sample: "1" },
  recompensa: { label: "Recompensa", sample: "Café gratis" },
  nivel: { label: "Nivel", sample: "Oro" },
  regalo: { label: "Regalo de cumpleaños", sample: "50 puntos" },
  dias: { label: "Días sin venir", sample: "30" },
}

const points = (type: CardType) => type !== "stamps"

export interface EventInfo {
  key: AutomaticEvent
  title: string
  /** When it is sent. */
  when: string
  vars: NoticeVar[]
  defaultOn: boolean
  applies(type: CardType): boolean
  defaultText(program: Pick<Program, "type" | "birthdayBonus">): string
}

export const NOTICE_EVENTS: EventInfo[] = [
  {
    key: "welcome",
    title: "Bienvenida",
    when: "Al crear la tarjeta. Se ve en el reverso del pase.",
    vars: ["nombre", "negocio", "puntos", "sellos", "meta"],
    defaultOn: true,
    applies: () => true,
    defaultText: () => "¡Bienvenido, {nombre}! Tu tarjeta de {negocio} ya está lista.",
  },
  {
    key: "stampEarned",
    title: "Sello ganado",
    when: "Cada vez que suma un sello.",
    vars: ["nombre", "sellos", "meta", "faltan", "recompensa"],
    defaultOn: true,
    applies: (type) => type === "stamps",
    defaultText: () => "Llevas {sellos} de {meta} sellos.",
  },
  {
    key: "almostThere",
    title: "Te falta un sello",
    when: "Cuando solo le falta un sello. Sustituye al aviso de sello ganado.",
    vars: ["nombre", "sellos", "meta", "recompensa"],
    defaultOn: true,
    applies: (type) => type === "stamps",
    defaultText: () => "¡Te falta un sello para {recompensa}!",
  },
  {
    key: "pointsEarned",
    title: "Puntos ganados",
    when: "Después de cada compra con puntos.",
    vars: ["nombre", "ganados", "puntos"],
    defaultOn: true,
    applies: points,
    defaultText: () => "Ganaste {ganados} puntos. Saldo: {puntos}.",
  },
  {
    key: "rewardAvailable",
    title: "Recompensa disponible",
    when: "Al completar la tarjeta o juntar los puntos de una recompensa.",
    vars: ["nombre", "recompensa", "puntos"],
    defaultOn: true,
    applies: () => true,
    defaultText: () => "¡Ya puedes canjear {recompensa}!",
  },
  {
    key: "tierChange",
    title: "Cambio de nivel",
    when: "Al subir (o bajar) de nivel.",
    vars: ["nombre", "nivel"],
    defaultOn: true,
    applies: (type) => type === "tiers",
    defaultText: () => "Ahora eres nivel {nivel}.",
  },
  {
    key: "pointsExpiring",
    title: "Puntos por vencer",
    when: "30 días antes de que venzan por falta de actividad.",
    vars: ["nombre", "puntos"],
    defaultOn: true,
    applies: points,
    defaultText: () => "Tus {puntos} puntos vencen en menos de 30 días.",
  },
  {
    key: "birthday",
    title: "Cumpleaños",
    when: "El día de su cumpleaños, por la mañana, si lo registró.",
    vars: ["nombre", "regalo", "negocio"],
    defaultOn: true,
    applies: () => true,
    defaultText: (p) => (p.birthdayBonus > 0 ? "¡Feliz cumpleaños, {nombre}! Te regalamos {regalo}." : "¡Feliz cumpleaños, {nombre}! Te esperamos para celebrar."),
  },
  {
    key: "missYou",
    title: "Te extrañamos",
    when: "Cuando lleva varios días sin venir. Una vez hasta que regrese.",
    vars: ["nombre", "negocio", "dias", "puntos", "sellos"],
    defaultOn: false,
    applies: () => true,
    defaultText: () => "{nombre}, te extrañamos. Vuelve pronto a {negocio}.",
  },
]

export const MAX_NOTICE = 150
export const DEFAULT_MISS_YOU_DAYS = 30

export const eventInfo = (key: AutomaticEvent) => NOTICE_EVENTS.find((e) => e.key === key)!

/** Automatic notices and promotions are a Pro feature; Starter cards only update their balance. */
export const planHasNotices = (business?: { plan?: string } | null): boolean => business?.plan !== "starter"

export const NOTICES_PRO_MESSAGE = "Los avisos y las promociones al celular están en el plan Pro. Escríbenos a hola@loyaloop.com.mx para cambiarte."

export function noticeEnabled(program: Program, event: NoticeEvent): boolean {
  if (event === "promotion") return true
  const value = (program.notify as Partial<Record<AutomaticEvent, boolean>>)[event]
  return value ?? eventInfo(event).defaultOn
}

export function noticeTemplate(program: Program, event: AutomaticEvent): string {
  return program.messages?.[event]?.trim() || eventInfo(event).defaultText(program)
}

/** Fills {variables}; unknown ones are left out so the customer never sees braces. */
export function renderNotice(template: string, vars: Partial<Record<NoticeVar, string | number>>): string {
  const text = template
    .replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = vars[name as NoticeVar]
      return value === undefined || value === null ? "" : String(value)
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim()
  return text.length > MAX_NOTICE ? `${text.slice(0, MAX_NOTICE - 1)}…` : text
}

/** Variables a template uses that this event does not fill. */
export function unknownVars(template: string, allowed: NoticeVar[]): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((name) => !allowed.includes(name as NoticeVar))
}

export function sampleVars(businessName: string): Record<NoticeVar, string> {
  const vars = Object.fromEntries(Object.entries(NOTICE_VARS).map(([k, v]) => [k, v.sample])) as Record<NoticeVar, string>
  return { ...vars, negocio: businessName }
}

// ---------------------------------------------------------------- promotions

export type Audience = { kind: "all" } | { kind: "tier"; tierId: string } | { kind: "inactive"; days: number } | { kind: "recent"; days: number }

export function audienceLabel(audience: Audience, tierName?: string): string {
  if (audience.kind === "tier") return `Nivel ${tierName || ""}`.trim()
  if (audience.kind === "inactive") return `Sin venir en ${audience.days} días`
  if (audience.kind === "recent") return `Vinieron en los últimos ${audience.days} días`
  return "Todos"
}

/** Promotions a business can send per day (Google also limits notifications per pass). */
export const MAX_PROMOTIONS_PER_DAY = 2
export const PROMOTION_VARS: NoticeVar[] = ["nombre", "negocio", "puntos", "sellos", "nivel"]
