// Branch locations: reading them from a Google Maps link, and which ones go in
// the passes for «Aviso al llegar a la sucursal». The phone compares its own
// position with them; LoyaLoop never learns where a customer is.

import type { Branch, Business, Customer, Program } from "./types"

export interface LatLng {
  latitude: number
  longitude: number
}

/** Wallets accept up to 10 locations per card. */
export const MAX_PASS_LOCATIONS = 10

const valid = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6 }
    : null

/**
 * Coordinates from what the owner pastes: a Google Maps link from the browser's
 * address bar, or «19.4326, -99.1332». Short share links (maps.app.goo.gl) do
 * not carry them: "short" asks for the long one.
 */
export function parseLocation(input: string): LatLng | "short" | null {
  const text = String(input || "").trim()
  if (!text) return null
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)"
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`), // the place itself
    new RegExp(`[?&](?:q|query|ll|center|destination)=${num}\\s*(?:,|%2C)\\s*${num}`, "i"),
    new RegExp(`@${num},${num}`), // the map's center
    new RegExp(`^${num}\\s*,\\s*${num}$`),
  ]
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m) return valid(Number(m[1]), Number(m[2]))
  }
  if (/goo\.gl|maps\.app/i.test(text)) return "short"
  return null
}

/** Branches that go in the passes: only with «Aviso al llegar» on (Pro) and never in discreet mode. */
export function passLocations(business: Pick<Business, "locationAlerts" | "discreet" | "plan">, branches: Pick<Branch, "name" | "latitude" | "longitude">[]) {
  // A notice like the others: Pro only.
  if (!business.locationAlerts || business.discreet || business.plan === "starter") return []
  return branches
    .filter((b) => typeof b.latitude === "number" && typeof b.longitude === "number")
    .slice(0, MAX_PASS_LOCATIONS)
    .map((b) => ({ latitude: b.latitude!, longitude: b.longitude!, name: b.name }))
}

/** What the lock screen says near a branch, with the customer's own progress. */
export function nearbyText(branchName: string, program: Pick<Program, "type" | "stampGoal">, customer?: Pick<Customer, "stamps" | "points" | "earnedRewards">) {
  const place = `Estás cerca de ${branchName}.`
  if (!customer) return `${place} Muestra tu tarjeta en caja.`
  if (customer.earnedRewards.length) return `${place} Tienes un premio para canjear.`
  if (program.type === "stamps") {
    const left = Math.max(0, program.stampGoal - customer.stamps)
    return left === 1 ? `${place} ¡Te falta un sello para tu premio!` : `${place} Te faltan ${left} sellos para tu premio.`
  }
  return `${place} Llevas ${customer.points} puntos.`
}
