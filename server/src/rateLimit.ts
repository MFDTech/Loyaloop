// Small in-memory limiter: enough for one server. Counts hits per key in a window.

export class RateLimiter {
  private hits = new Map<string, number[]>()

  /** Returns true when the call is allowed. */
  allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
    const list = (this.hits.get(key) || []).filter((t) => now - t < windowMs)
    if (list.length >= max) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    if (this.hits.size > 50_000) this.sweep(now)
    return true
  }

  private sweep(now: number) {
    for (const [key, list] of this.hits) if (!list.some((t) => now - t < 3_600_000)) this.hits.delete(key)
  }
}

const MIN = 60_000

/** Limits per method: [max calls, window] for the client IP, and optionally for the first argument (email, phone...). */
export const LIMITS: Record<string, { ip: [number, number]; arg?: [number, number]; argIndex?: number }> = {
  login: { ip: [20, 15 * MIN], arg: [8, 15 * MIN], argIndex: 0 },
  requestPasswordReset: { ip: [5, 15 * MIN], arg: [3, 60 * MIN], argIndex: 0 },
  resetPassword: { ip: [10, 15 * MIN] },
  invitation: { ip: [30, 15 * MIN] },
  acceptInvitation: { ip: [10, 15 * MIN] },
  changePassword: { ip: [10, 15 * MIN] },
  sendCode: { ip: [8, 10 * MIN], arg: [4, 10 * MIN], argIndex: 1 },
  completeRegistration: { ip: [20, 10 * MIN] },
  recoverCard: { ip: [20, 10 * MIN] },
  createCard: { ip: [10, 10 * MIN] },
  sendCardLink: { ip: [5, 15 * MIN], arg: [3, 60 * MIN], argIndex: 1 },
  openCardLink: { ip: [30, 10 * MIN] },
  demoVisit: { ip: [40, 10 * MIN] },
  demoCard: { ip: [15, 10 * MIN] },
  privacyNotice: { ip: [120, 10 * MIN] },
  registration: { ip: [120, 10 * MIN] },
  submitLead: { ip: [5, 60 * MIN] },
  pairDevice: { ip: [10, 10 * MIN] },
  kioskScan: { ip: [240, MIN] },
}
