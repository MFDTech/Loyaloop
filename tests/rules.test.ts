import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Service } from "../src/lib/service"
import { csv, normalizeToken } from "../src/lib/util"
import { TEST_DATABASE_URL, memoryHarness, pgHarness, type Harness } from "./harness"

const T0 = new Date("2026-10-13T12:00:00-06:00").getTime()
let t = T0
const clock = () => t
const advance = (minutes: number) => {
  t += minutes * 60_000
}

const backends: [string, () => Harness | Promise<Harness>][] = [["memoria", () => memoryHarness(clock)]]
if (TEST_DATABASE_URL) backends.push(["postgres", () => pgHarness(clock)])

for (const [label, make] of backends) {
  describe(label, () => {
    let h: Harness
    let api: Service

    async function as(email: string, password = "prueba123") {
      await api.logout()
      await api.login(email, password)
    }
    const admin = () => as("admin@loyaloop.test", "loyaloop123")
    const useAffairTablet = () => h.useDevice("dev_affair_tablet_token")

    async function affairCustomer(index: number) {
      await as("dueno@affair.test")
      const rows = await api.customers()
      return rows.find((c) => c.id === `c_b_affair_${index}`)!
    }

    beforeAll(async () => {
      h = await make()
      api = h.api
    })
    afterAll(() => h.close())
    beforeEach(async () => {
      t = T0
      await h.reset(T0)
    })

    describe("payment matching on the register", () => {
      it("credits points when the payment arrives after the scan, without tip, rounded down", async () => {
        const c = await affairCustomer(3)
        useAffairTablet()
        const scan = await api.kioskScan(c.token)
        expect(scan.status).toBe("pending")
        advance(2)
        await admin()
        const outcome = await api.simulatePayment("b_affair", "rg_affair_1", 1255, 100)
        expect(outcome.kind).toBe("matched")
        const after = await api.kioskScanStatus(scan.scanId)
        expect(after.status).toBe("matched")
        const multiplier = c.tierName === "Oro" ? 1.5 : c.tierName === "Plata" ? 1.25 : 1
        expect(after.earned?.points).toBe(Math.floor(1155 * 0.1 * multiplier))
      })

      it("credits when the payment came first and the scan follows within 5 minutes", async () => {
        const c = await affairCustomer(4)
        await admin()
        expect((await api.simulatePayment("b_affair", "rg_affair_1", 800, 0)).kind).toBe("unmatched")
        advance(4)
        useAffairTablet()
        const scan = await api.kioskScan(c.token)
        expect(scan.status).toBe("matched")
      })

      it("does not credit a payment that arrives after the 5-minute window", async () => {
        const c = await affairCustomer(4)
        useAffairTablet()
        const scan = await api.kioskScan(c.token)
        advance(6)
        await admin()
        expect((await api.simulatePayment("b_affair", "rg_affair_1", 800, 0)).kind).toBe("unmatched")
        expect((await api.kioskScanStatus(scan.scanId)).status).toBe("expired")
      })

      it("sends ambiguous payments to review and lets a manager assign them", async () => {
        const a = await affairCustomer(5)
        const b = await affairCustomer(6)
        useAffairTablet()
        await api.kioskScan(a.token)
        advance(1)
        await api.kioskScan(b.token)
        await admin()
        expect((await api.simulatePayment("b_affair", "rg_affair_1", 900, 0)).kind).toBe("review")
        await as("gerente@affair.test")
        const queue = await api.reviewQueue()
        expect(queue).toHaveLength(1)
        expect(queue[0].candidates).toHaveLength(2)
        const pick = queue[0].candidates.find((x) => x.customerName === b.name)!
        const before = (await api.customer(b.id)).customer.points
        await api.resolveReview(queue[0].payment.id, pick.scan.id)
        expect((await api.customer(b.id)).customer.points).toBeGreaterThan(before)
        expect(await api.reviewQueue()).toHaveLength(0)
      })

      it("uses each scan and each payment only once", async () => {
        const c = await affairCustomer(7)
        useAffairTablet()
        await api.kioskScan(c.token)
        await admin()
        expect((await api.simulatePayment("b_affair", "rg_affair_1", 700, 0)).kind).toBe("matched")
        expect((await api.simulatePayment("b_affair", "rg_affair_1", 700, 0)).kind).toBe("unmatched")
      })
    })

    describe("anti-fraud", () => {
      it("enforces the daily limit", async () => {
        const c = await affairCustomer(2)
        useAffairTablet()
        for (let i = 0; i < 2; i++) {
          await api.kioskScan(c.token)
          await admin()
          expect((await api.simulatePayment("b_affair", "rg_affair_1", 500, 0)).kind).toBe("matched")
          advance(10)
        }
        await expect(api.kioskScan(c.token)).rejects.toThrow(/límite/)
      })

      it("rejects employees that are excluded, recognized by their email", async () => {
        // The cashier makes a card with their work email, then scans it.
        const result = await api.createCard("AFF7Q2", { name: "Recepción", email: "Cajero@affair.test", birthday: "", promotions: false, privacy: true })
        useAffairTablet()
        await expect(api.kioskScan(result.holder.token)).rejects.toThrow(/empleado/)
      })

      it("rejects cards from another business", async () => {
        await as("dueno@laesquina.test")
        const other = (await api.customers())[0]
        useAffairTablet()
        await expect(api.kioskScan(other.token)).rejects.toThrow(/no corresponde/)
      })
    })

    describe("stamps without a payment integration", () => {
      it("adds a stamp per visit and resets with a reward at the goal", async () => {
        await as("dueno@laesquina.test")
        const { code } = await api.createPairingCode("rg_esq_roma")
        await api.pairDevice(code, "Tablet Roma")
        const c = (await api.customers())[1]
        const start = c.stamps
        let last
        for (let i = start; i < 8; i++) {
          advance(60 * 9)
          last = await api.kioskScan(c.token)
        }
        expect(last!.status).toBe("visit")
        expect(last!.stamps).toBe(0)
        const earned = last!.rewards.filter((r) => r.kind === "earned")
        expect(earned.length).toBeGreaterThan(c.earnedRewards.length)
        const redeemed = await api.kioskRedeem(last!.scanId, earned[0].id, "earned")
        expect(redeemed.redeemed).toBe("Café americano gratis")
      })
    })

    describe("redemptions, refunds and adjustments", () => {
      it("redeems with points and refuses when the balance is short", async () => {
        const base = await affairCustomer(0)
        await api.adjustBalance(base.id, { points: 1000, stamps: 0 }, "Prueba")
        const rich = { ...base, points: base.points + 1000 }
        useAffairTablet()
        const scan = await api.kioskScan(rich.token)
        const expensive = scan.rewards.find((r) => r.cost > rich.points)
        if (expensive) await expect(api.kioskRedeem(scan.scanId, expensive.id, "points")).rejects.toThrow(/Faltan/)
        const cheap = scan.rewards.find((r) => r.kind === "points" && r.cost <= rich.points)!
        const after = await api.kioskRedeem(scan.scanId, cheap.id, "points")
        expect(after.points).toBe(rich.points - cheap.cost)
      })

      it("reverses the points of a refunded purchase once", async () => {
        await as("gerente@affair.test")
        const purchase = (await api.activity({ kind: "purchase" })).find((p) => p.points > 0)!
        const before = (await api.customer(purchase.customerId)).customer.points
        await api.refundPurchase(purchase.id, "Cancelación")
        const after = (await api.customer(purchase.customerId)).customer.points
        expect(after).toBe(Math.max(0, before - purchase.points))
        await expect(api.refundPurchase(purchase.id, "Otra vez")).rejects.toThrow(/ya se devolvió/)
      })

      it("requires a reason and never leaves negative balances", async () => {
        await as("gerente@affair.test")
        const c = (await api.customers())[1]
        await expect(api.adjustBalance(c.id, { points: 10, stamps: 0 }, " ")).rejects.toThrow(/motivo/)
        await expect(api.adjustBalance(c.id, { points: -(c.points + 1), stamps: 0 }, "Error")).rejects.toThrow(/negativo/)
        await api.adjustBalance(c.id, { points: 15, stamps: 0 }, "Compensación")
        expect((await api.customer(c.id)).customer.points).toBe(c.points + 15)
      })
    })

    describe("tiers and expiration", () => {
      it("applies the tier multiplier and upgrades the tier", async () => {
        const c = await affairCustomer(7)
        useAffairTablet()
        await api.kioskScan(c.token)
        await admin()
        await api.simulatePayment("b_affair", "rg_affair_1", 20000, 0)
        await as("dueno@affair.test")
        const detail = await api.customer(c.id)
        expect(detail.customer.tierName).toBe("Oro")
      })

      it("expires points after the configured months of inactivity", async () => {
        const c = await affairCustomer(1)
        expect(c.points).toBeGreaterThan(0)
        t = T0 + 400 * 86_400_000
        await as("dueno@affair.test")
        await api.bundle()
        expect((await api.customer(c.id)).customer.points).toBe(0)
      })
    })

    describe("permissions and isolation", () => {
      it("keeps each role inside its permissions", async () => {
        await as("cajero@affair.test")
        await expect(api.customers()).rejects.toThrow(/permiso/)
        await as("gerente@affair.test")
        await expect(api.exportCustomersCsv()).rejects.toThrow(/permiso/)
        await expect(api.inviteMember({ name: "X", email: "x@x.test", role: "cashier", phone: "", excluded: false })).rejects.toThrow(/permiso/)
        await as("dueno@affair.test")
        await expect(api.adminBusinesses()).rejects.toThrow(/administrador/)
      })

      it("never shows one business's customers to another", async () => {
        await as("dueno@laesquina.test")
        const rows = await api.customers()
        expect(rows.every((c) => c.businessId === "b_esquina")).toBe(true)
      })

      it("lets the admin enter a business and records it", async () => {
        await admin()
        await api.impersonate("b_esquina")
        const rows = await api.customers()
        expect(rows.every((c) => c.businessId === "b_esquina")).toBe(true)
        await api.stopImpersonating()
        const log = await api.adminAudit()
        expect(log[0].action).toMatch(/Entró a la cuenta/)
      })
    })

    describe("demo card", () => {
      it("gives a LoyaLoop card in one tap and keeps the same one for this browser", async () => {
        const first = await api.demoCard("")
        expect(first.card).toMatchObject({ businessName: "LoyaLoop", demo: true })
        expect(first.holder.name).toBe("Invitado")
        const again = await api.demoCard(first.holder.token)
        expect(again.holder.token).toBe(first.holder.token)
        expect(again.created).toBe(false)
        expect((await api.demoVisit("DEMO", first.holder.token)).holder.stamps).toBe(1)
      })

      it("creates the demo business on first use and lets the visitor add stamps", async () => {
        const reg = await api.registration("DEMO")
        expect(reg.card).toMatchObject({ demo: true, type: "stamps", askPhone: false })
        const made = await api.createCard("DEMO", { name: "Prospecto", email: "", birthday: "", promotions: false, privacy: true })
        const first = await api.demoVisit("DEMO", made.holder.token)
        expect(first.holder.stamps).toBe(1)
        await expect(api.demoVisit("DEMO", made.holder.token)).rejects.toThrow(/segundos/)
        advance(1)
        expect((await api.demoVisit("DEMO", made.holder.token)).holder.stamps).toBe(2)
        await expect(api.demoVisit("AFF7Q2", made.holder.token)).rejects.toThrow(/demostración/)
        // After a week the card keeps its stamps but not the name.
        advance(60 * 24 * 8)
        await api.tick()
        const again = await api.demoVisit("DEMO", made.holder.token)
        expect(again.holder.name).toBe("Visitante")
      })
    })

    describe("registration", () => {
      it("names the business as responsible in its card's privacy notice", async () => {
        const before = await api.privacyNotice("AFF7Q2")
        expect(before).toMatchObject({ responsible: "Affair Love Suites", askPhone: false, promotions: false })
        await admin()
        await expect(api.adminUpdateBusiness("b_affair", { privacyEmail: "no-es-correo" })).rejects.toThrow(/privacidad/)
        await api.adminUpdateBusiness("b_affair", { legalName: "Servicios Affair, S.A. de C.V.", legalAddress: "Calle Ejemplo 10, CDMX", privacyEmail: "Privacidad@Affair.test" })
        expect(await api.privacyNotice("AFF7Q2")).toMatchObject({ responsible: "Servicios Affair, S.A. de C.V.", address: "Calle Ejemplo 10, CDMX", email: "privacidad@affair.test" })
        expect((await api.privacyNotice("ESQR4M")).askPhone).toBe(true)
      })

      it("creates the card with only a name; the welcome bonus waits for the first purchase", async () => {
        const reg = await api.registration("AFF7Q2")
        expect(reg.card.askPhone).toBe(false)
        await expect(api.sendCode("AFF7Q2", "5598765432", "new")).rejects.toThrow(/no usa el celular/)
        await expect(api.createCard("AFF7Q2", { name: "  ", email: "", birthday: "", promotions: false, privacy: true })).rejects.toThrow(/nombre/)
        await expect(api.createCard("AFF7Q2", { name: "Mar", email: "no-es-correo", birthday: "", promotions: false, privacy: true })).rejects.toThrow(/correo/)
        const result = await api.createCard("AFF7Q2", { name: "Mar", email: "", birthday: "03-14", promotions: true, privacy: true })
        expect(result.created).toBe(true)
        expect(result.holder.points).toBe(0)
        expect(result.card.businessName).toBe("Club de beneficios")
        // Several cards without a phone can coexist.
        const second = await api.createCard("AFF7Q2", { name: "Otra", email: "", birthday: "", promotions: false, privacy: true })
        expect(second.holder.token).not.toBe(result.holder.token)
        // Visiting the same day a payment comes in gives the bonus once.
        useAffairTablet()
        await api.kioskScan(result.holder.token)
        advance(1)
        await admin()
        await api.simulatePayment("b_affair", "rg_affair_1", 500, 0)
        await as("dueno@affair.test")
        const row = (await api.customers()).find((c) => c.token === result.holder.token)!
        expect(row.points).toBe(100 + 50)
        advance(60 * 24)
        useAffairTablet()
        await api.kioskScan(result.holder.token)
        advance(1)
        await admin()
        await api.simulatePayment("b_affair", "rg_affair_1", 500, 0)
        await as("dueno@affair.test")
        expect((await api.customers()).find((c) => c.token === result.holder.token)!.points).toBe(100 + 50 + 50)
      })

      it("emails a 30-minute link to open the card again", async () => {
        const result = await api.createCard("AFF7Q2", { name: "Mar", email: "mar@example.com", birthday: "", promotions: false, privacy: true })
        expect(await api.sendCardLink("AFF7Q2", "nadie@example.com")).toEqual({})
        const { previewLink } = await api.sendCardLink("AFF7Q2", "MAR@example.com")
        const token = previewLink!.split("/").pop()!
        const opened = await api.openCardLink("AFF7Q2", token)
        expect(opened.holder.token).toBe(result.holder.token)
        await expect(api.openCardLink("ESQR4M", token)).rejects.toThrow()
        advance(31)
        await expect(api.openCardLink("AFF7Q2", token)).rejects.toThrow(/venció/)
      })

      it("uses the phone and gives the bonus at once where the business asks for it", async () => {
        await expect(api.createCard("ESQR4M", { name: "Sin cel", email: "", birthday: "", promotions: false, privacy: true })).rejects.toThrow(/celular/)
        const sent = await api.sendCode("ESQR4M", "5598765432", "new")
        await expect(api.completeRegistration("ESQR4M", { name: "Nueva", phone: "5598765432", email: "", birthday: "03-14", promotions: true, privacy: true }, "000000")).rejects.toThrow(/no coincide/)
        const result = await api.completeRegistration("ESQR4M", { name: "Nueva Clienta", phone: "5598765432", email: "", birthday: "03-14", promotions: true, privacy: true }, sent.previewCode)
        expect(result.created).toBe(true)
        expect(result.holder.stamps).toBe(1)
        advance(1)
        const again = await api.sendCode("ESQR4M", "5598765432", "recover")
        const recovered = await api.recoverCard("ESQR4M", "5598765432", again.previewCode)
        expect(recovered.created).toBe(false)
        expect(recovered.holder.token).toBe(result.holder.token)
      })

      it("requires privacy consent", async () => {
        const sent = await api.sendCode("ESQR4M", "5512340000", "new")
        await expect(api.completeRegistration("ESQR4M", { name: "Sin aviso", phone: "5512340000", email: "", birthday: "", promotions: false, privacy: false }, sent.previewCode)).rejects.toThrow(/privacidad/)
      })
    })

    describe("notices and promotions", () => {
      const at = (local: string) => (t = new Date(`${local}-06:00`).getTime())

      async function esquinaScanner() {
        await as("dueno@laesquina.test")
        await api.pairDevice((await api.createPairingCode("rg_esq_roma")).code, "Tablet")
      }

      it("uses the business's own text with the customer's data", async () => {
        await as("dueno@laesquina.test")
        await expect(api.saveNotices({ notify: {}, messages: { stampEarned: "Vas en {nivel}" } })).rejects.toThrow(/\{nivel\}/)
        await api.saveNotices({ notify: {}, messages: { stampEarned: "{nombre}: {sellos}/{meta}, te faltan {faltan}" } })
        await esquinaScanner()
        const c = (await api.customers()).find((x) => x.stamps < 6)!
        await api.kioskScan(c.token)
        const [last] = await api.notices()
        expect(last.event).toBe("stampEarned")
        expect(last.message).toBe(`${c.name.split(" ")[0]}: ${c.stamps + 1}/8, te faltan ${8 - c.stamps - 1}`)
      })

      it("says «te falta un sello» one stamp before the reward, and stays quiet when switched off", async () => {
        await esquinaScanner()
        const c = (await api.customers()).find((x) => x.stamps < 6)!
        for (let i = c.stamps; i < 7; i++) {
          advance(60 * 9)
          await api.kioskScan(c.token)
        }
        expect((await api.notices())[0]).toMatchObject({ event: "almostThere", message: "¡Te falta un sello para Café americano gratis!" })
        const before = (await api.notices()).length
        await api.saveNotices({ notify: { stampEarned: false, almostThere: false, rewardAvailable: false }, messages: {} })
        advance(60 * 9)
        await api.kioskScan(c.token)
        expect((await api.notices()).length).toBe(before)
      })

      it("welcomes new customers with the neutral name in discreet mode", async () => {
        await api.createCard("AFF7Q2", { name: "Ana López", email: "", birthday: "", promotions: false, privacy: true })
        await as("dueno@affair.test")
        const notices = await api.notices()
        expect(notices.find((n) => n.event === "welcome")!.message).toBe("¡Bienvenido, Ana! Tu tarjeta de Club de beneficios ya está lista.")
        expect(notices.some((n) => n.event === "tierChange")).toBe(false)
      })

      it("greets birthdays once, in the morning, from the server clock", async () => {
        const sent = await api.sendCode("ESQR4M", "5598762222", "new")
        await api.completeRegistration("ESQR4M", { name: "Beto Ruiz", phone: "5598762222", email: "", birthday: "10-14", promotions: false, privacy: true }, sent.previewCode)
        at("2026-10-14T07:00:00")
        await api.tick()
        await as("dueno@laesquina.test")
        expect((await api.notices()).some((n) => n.event === "birthday")).toBe(false)
        at("2026-10-14T11:00:00")
        await api.tick()
        at("2026-10-14T13:00:00")
        await api.tick()
        const birthdays = (await api.notices()).filter((n) => n.event === "birthday")
        expect(birthdays).toHaveLength(1)
        const { program } = await api.bundle()
        expect(birthdays[0].message).toBe(program.birthdayBonus > 0 ? "¡Feliz cumpleaños, Beto! Te regalamos un sello." : "¡Feliz cumpleaños, Beto! Te esperamos para celebrar.")
      })

      it("sends «te extrañamos» once until the customer comes back", async () => {
        await as("dueno@laesquina.test")
        await api.saveNotices({ notify: { missYou: true }, messages: { missYou: "{nombre}, ya son {dias} días" }, missYouDays: 30 })
        await expect(api.saveNotices({ notify: {}, messages: {}, missYouDays: 3 })).rejects.toThrow(/7 y 365/)
        at("2026-12-20T11:00:00")
        await api.tick()
        const first = (await api.notices()).filter((n) => n.event === "missYou")
        expect(first.length).toBeGreaterThan(0)
        expect(first[0].message).toMatch(/^\S+, ya son \d+ días$/)
        at("2026-12-21T11:00:00")
        await api.tick()
        expect((await api.notices()).filter((n) => n.event === "missYou")).toHaveLength(first.length)
      })

      it("sends promotions only to customers who accepted them, personalized, two per day at most", async () => {
        await as("dueno@affair.test")
        const customers = await api.customers()
        const optedIn = customers.filter((c) => c.promotionsOptIn)
        expect(await api.campaignAudience({ kind: "all" })).toEqual({ count: optedIn.length, optedOut: customers.length - optedIn.length })
        await expect(api.createCampaign({ message: "Hola {sellos} {regalo}", audience: { kind: "all" } })).rejects.toThrow(/\{regalo\}/)
        const sent = await api.createCampaign({ message: "{nombre}, hoy tienes 2x1 en suites", audience: { kind: "all" } })
        expect(sent).toMatchObject({ status: "sent", recipients: optedIn.length })
        const promos = (await api.notices()).filter((n) => n.event === "promotion")
        expect(promos).toHaveLength(optedIn.length)
        expect(promos.every((n) => optedIn.some((c) => c.id === n.customerId))).toBe(true)
        const one = promos[0]
        expect(one.message).toBe(`${customers.find((c) => c.id === one.customerId)!.name.split(" ")[0]}, hoy tienes 2x1 en suites`)
        await api.createCampaign({ message: "Segunda del día", audience: { kind: "inactive", days: 10 } })
        await expect(api.createCampaign({ message: "Tercera", audience: { kind: "all" } })).rejects.toThrow(/2 promociones por día/)
      })

      it("sends scheduled promotions on time and never canceled ones", async () => {
        await as("dueno@affair.test")
        const program = (await api.bundle()).program
        const later = await api.createCampaign({ message: "Fin de semana Oro", audience: { kind: "tier", tierId: program.tiers[program.tiers.length - 1].id }, sendAt: new Date("2026-10-17T10:00:00-06:00").toISOString() })
        const canceled = await api.createCampaign({ message: "No sale", audience: { kind: "all" }, sendAt: new Date("2026-10-17T12:00:00-06:00").toISOString() })
        expect(later.status).toBe("scheduled")
        await api.cancelCampaign(canceled.id)
        at("2026-10-17T09:59:00")
        await api.tick()
        expect((await api.campaigns()).find((c) => c.id === later.id)!.status).toBe("scheduled")
        at("2026-10-17T12:30:00")
        await api.tick()
        const list = await api.campaigns()
        expect(list.find((c) => c.id === later.id)).toMatchObject({ status: "sent" })
        expect(list.find((c) => c.id === canceled.id)!.status).toBe("canceled")
        expect((await api.notices()).some((n) => n.message === "No sale")).toBe(false)
        await expect(api.cancelCampaign(later.id)).rejects.toThrow(/ya se envió/)
      })

      it("keeps promotions and notice settings to owners and managers, and admin edits keep the texts", async () => {
        await as("cajero@affair.test")
        await expect(api.createCampaign({ message: "x", audience: { kind: "all" } })).rejects.toThrow(/permiso/)
        await as("gerente@affair.test")
        await api.saveNotices({ notify: {}, messages: { pointsEarned: "+{ganados} pts" } })
        await admin()
        const { program } = await api.adminBundle("b_affair")
        const { businessId: _b, messages: _m, ...rules } = program
        await api.adminSaveProgram("b_affair", rules)
        expect((await api.adminBundle("b_affair")).program.messages).toEqual({ pointsEarned: "+{ganados} pts" })
      })
    })

    describe("devices", () => {
      it("accepts a card in every branch of its business and never in another business", async () => {
        await as("dueno@laesquina.test")
        const customer = (await api.customers()).find((c) => c.branchId === "br_esq_roma")!
        await api.pairDevice((await api.createPairingCode("rg_esq_roma")).code, "Roma")
        expect((await api.kioskScan(customer.token)).status).toBe("visit")
        // The same browser becomes the Condesa scanner: the card still works there.
        await api.pairDevice((await api.createPairingCode("rg_esq_condesa")).code, "Condesa")
        expect((await api.kiosk()).registerId).toBe("rg_esq_condesa")
        advance(60 * 9)
        expect((await api.kioskScan(customer.token)).status).toBe("visit")
        // A card from Affair is rejected at La Esquina...
        await expect(api.kioskScan((await affairCustomer(1)).token)).rejects.toThrow(/no corresponde/)
        // ...and La Esquina's card is rejected at Affair.
        useAffairTablet()
        await expect(api.kioskScan(customer.token)).rejects.toThrow(/no corresponde/)
      })

      it("keeps one scanner per device: pairing again replaces it, unpairing removes it", async () => {
        await as("dueno@laesquina.test")
        await api.pairDevice((await api.createPairingCode("rg_esq_roma")).code, "Tablet")
        await api.pairDevice((await api.createPairingCode("rg_esq_condesa")).code, "Tablet")
        const devices = (await api.bundle()).devices
        expect(devices).toHaveLength(1)
        expect(devices[0].registerId).toBe("rg_esq_condesa")
        expect((await api.kiosk()).businessId).toBe("b_esquina")

        // The Affair tablet moved to La Esquina: Affair no longer has it.
        useAffairTablet()
        await api.pairDevice((await api.createPairingCode("rg_esq_roma")).code, "Tablet")
        await as("dueno@affair.test")
        expect((await api.bundle()).devices.some((d) => d.id === "dv_affair_1")).toBe(false)

        // «Desvincular» on the scanner deletes it on the server too.
        await api.kioskUnpair()
        await expect(api.kiosk()).rejects.toThrow(/vinculado/)
        await as("dueno@laesquina.test")
        expect((await api.bundle()).devices.map((d) => d.registerId)).toEqual(["rg_esq_condesa"])
      })

      it("stops a kiosk once it is unpaired", async () => {
        useAffairTablet()
        await api.kiosk()
        await as("gerente@affair.test")
        await api.unpairDevice("dv_affair_1")
        await expect(api.kiosk()).rejects.toThrow(/vinculado/)
      })
    })
  })
}

describe("helpers", () => {
  it("neutralizes spreadsheet formulas in CSV", () => {
    expect(csv([["=SUM(A1)", 'Dijo "hola"']])).toBe('﻿"\'=SUM(A1)","Dijo ""hola"""')
  })
  it("reads tokens typed or scanned in any format", () => {
    expect(normalizeToken("ll7kq2m9xa")).toBe("LL-7KQ2-M9XA")
    expect(normalizeToken("LL-7KQ2-M9XA\n")).toBe("LL-7KQ2-M9XA")
  })
})
