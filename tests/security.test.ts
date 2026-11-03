// Security log and alerts: one line per event, one email when something spikes.
import { describe, expect, it } from "vitest"
import type { EmailMessage } from "../src/lib/service"
import { SecurityMonitor } from "../server/src/security"

function monitor() {
  let t = Date.parse("2026-10-27T12:00:00Z")
  const lines: string[] = []
  const emails: EmailMessage[] = []
  const m = new SecurityMonitor({
    alertEmail: "hola@loyaloop.test",
    now: () => t,
    log: (line) => lines.push(line),
    messenger: { channels: { sms: false, email: true }, sms: async () => undefined, email: async (e) => void emails.push(e) },
  })
  return { m, lines, emails, advance: (ms: number) => (t += ms) }
}

describe("security monitor", () => {
  it("logs each event as one JSON line with its context", () => {
    const { m, lines } = monitor()
    m.record("auth.failed_login", { ip: "1.2.3.4", email: "a@b.test" })
    expect(JSON.parse(lines[0])).toMatchObject({ level: "warn", event: "auth.failed_login", ip: "1.2.3.4", email: "a@b.test" })
  })

  it("emails LoyaLoop when one IP fails 20 logins in 5 minutes, once an hour", () => {
    const { m, emails, advance } = monitor()
    for (let i = 0; i < 19; i++) expect(m.record("auth.failed_login", { ip: "9.9.9.9" })).toBe(false)
    expect(m.record("auth.failed_login", { ip: "9.9.9.9" })).toBe(true)
    expect(emails).toHaveLength(1)
    expect(emails[0].subject).toMatch(/20 intentos fallidos/)
    expect(emails[0].paragraphs.join(" ")).toContain("9.9.9.9")
    // More of the same within the hour: no second email.
    m.record("auth.failed_login", { ip: "9.9.9.9" })
    expect(emails).toHaveLength(1)
    // Spread out over time it never alerts.
    advance(2 * 3_600_000)
    for (let i = 0; i < 30; i++) {
      advance(60_000)
      m.record("auth.failed_login", { ip: "8.8.8.8" })
    }
    expect(emails).toHaveLength(1)
  })
})
