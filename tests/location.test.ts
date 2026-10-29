// Branch locations: reading Google Maps links and choosing what goes in the passes.
import { describe, expect, it } from "vitest"
import { nearbyText, parseLocation, passLocations } from "../src/lib/location"

describe("branch locations", () => {
  it("reads the place from Google Maps links and plain coordinates", () => {
    expect(parseLocation("https://www.google.com/maps/place/Caf%C3%A9/@19.4180,-99.1650,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d19.4194123!4d-99.1621456!16s")).toEqual({ latitude: 19.419412, longitude: -99.162146 })
    expect(parseLocation("https://www.google.com/maps/@19.3,-99.15,15z")).toEqual({ latitude: 19.3, longitude: -99.15 })
    expect(parseLocation("https://maps.google.com/?q=19.4326,-99.1332")).toEqual({ latitude: 19.4326, longitude: -99.1332 })
    expect(parseLocation("19.4326, -99.1332")).toEqual({ latitude: 19.4326, longitude: -99.1332 })
    expect(parseLocation("https://maps.app.goo.gl/AbCdEf")).toBe("short")
    expect(parseLocation("Av. Insurgentes 123")).toBeNull()
    expect(parseLocation("123, 456")).toBeNull()
  })

  it("only goes in Pro passes with the notice on, outside discreet mode, up to 10", () => {
    const branches = Array.from({ length: 12 }, (_, i) => ({ name: `S${i}`, latitude: 19 + i / 100, longitude: -99 }))
    expect(passLocations({ locationAlerts: true, discreet: false, plan: "pro" }, branches)).toHaveLength(10)
    expect(passLocations({ locationAlerts: false, discreet: false, plan: "pro" }, branches)).toEqual([])
    expect(passLocations({ locationAlerts: true, discreet: true, plan: "pro" }, branches)).toEqual([])
    expect(passLocations({ locationAlerts: true, discreet: false, plan: "starter" }, branches)).toEqual([])
    expect(passLocations({ locationAlerts: true, discreet: false }, [{ name: "Sin ubicación" }])).toEqual([])
  })

  it("tells the customer what is waiting for them", () => {
    expect(nearbyText("Roma", { type: "stamps", stampGoal: 8 }, { stamps: 5, points: 0, earnedRewards: [] })).toBe("Estás cerca de Roma. Te faltan 3 sellos para tu premio.")
    expect(nearbyText("Roma", { type: "points", stampGoal: 0 }, { stamps: 0, points: 420, earnedRewards: [] })).toBe("Estás cerca de Roma. Llevas 420 puntos.")
    expect(nearbyText("Roma", { type: "points", stampGoal: 0 }, { stamps: 0, points: 0, earnedRewards: [{ id: "e", rewardId: "r", createdAt: "" }] })).toBe("Estás cerca de Roma. Tienes un premio para canjear.")
  })
})
