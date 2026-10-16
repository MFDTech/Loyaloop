// Text shown on the back of the pass (Apple) and in the card details (Google).
// Shared by the preview in the browser and by the server that issues real passes.

import type { PublicCard } from "./service"
import { int, money } from "./util"

export function rules(card: PublicCard): string {
  const p = card.program
  switch (card.type) {
    case "stamps":
      return `Cada compra${p.stampMinPurchase ? ` desde ${money(p.stampMinPurchase)}` : ""} suma un sello. Con ${p.stampGoal} sellos obtienes tu recompensa y la tarjeta vuelve a empezar.`
    case "tiers":
      return `Ganas ${int(p.pointsPerPeso * 100)} puntos por cada $100 pagados, sin propina${p.minPurchase ? `, en compras desde ${money(p.minPurchase)}` : ""}. Tu nivel depende de lo que gastas en 12 meses: ${p.tiers.map((t) => `${t.name} desde ${money(t.threshold)} (×${t.multiplier})`).join(", ")}.`
    default:
      return `Ganas ${int(p.pointsPerPeso * 100)} puntos por cada $100 pagados, sin propina${p.minPurchase ? `, en compras desde ${money(p.minPurchase)}` : ""}.`
  }
}

export function backFields(card: PublicCard) {
  const fields = [
    { label: "Cómo funciona", value: rules(card) },
    card.rewards.length
      ? {
          label: "Recompensas",
          value: card.rewards.map((r) => (card.type === "stamps" ? r.name : `${r.name}: ${int(r.cost)} puntos`)).join(" · "),
        }
      : null,
    card.type !== "stamps" && card.program.expirationMonths
      ? { label: "Vigencia", value: `Los puntos vencen tras ${card.program.expirationMonths} meses sin actividad.` }
      : null,
    { label: "Contacto", value: [card.contact.email, card.contact.phone].filter(Boolean).join(" · ") || "En sucursal" },
    { label: "Condiciones", value: "Muestra el código en caja antes o después de pagar. Los beneficios están sujetos a las condiciones del negocio." },
  ]
  return fields.filter(Boolean) as { label: string; value: string }[]
}

