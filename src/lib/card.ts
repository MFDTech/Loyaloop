import type { Bundle, PublicCard } from "./api"
import type { Business, Program, Reward } from "./types"

/** The public view of a card, built from the data the panels already have. */
export function cardFrom(business: Business, program: Program, rewards: Reward[]): PublicCard {
  return {
    businessName: business.discreet ? business.neutralName : business.name,
    discreet: business.discreet,
    brand: business.brand,
    type: program.type,
    program: {
      pointsPerPeso: program.pointsPerPeso,
      minPurchase: program.minPurchase,
      stampGoal: program.stampGoal,
      stampMinPurchase: program.stampMinPurchase,
      expirationMonths: program.expirationMonths,
      tiers: program.tiers,
      welcomeBonus: program.welcomeBonus,
      birthdayBonus: program.birthdayBonus,
    },
    rewards: rewards.filter((r) => r.active).map(({ id, name, cost, description }) => ({ id, name, cost, description })),
    contact: { email: business.email, phone: business.phone },
    askPhone: !!business.askPhone,
  }
}

export const cardFromBundle = (b: Bundle) => cardFrom(b.business, b.program, b.rewards)
