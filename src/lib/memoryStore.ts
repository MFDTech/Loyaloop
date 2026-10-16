// Store that keeps the whole database in one object. Used by the browser
// preview (saved in localStorage) and by the tests.

import type { Store, TransactionQuery } from "./service"
import type { DB } from "./types"

export function createMemoryStore(io: { load(): DB; save(db: DB): void }): Store {
  const db = () => io.load()
  const byTime = (query: TransactionQuery) => (t: { createdAt: string }) => (!query.from || t.createdAt >= query.from) && (!query.to || t.createdAt <= query.to)
  return {
    async read() {
      return db()
    },
    async write(_scope, change) {
      const draft = structuredClone(db())
      const result = change(draft)
      io.save(draft)
      return result
    },
    async user(id) {
      return db().users.find((u) => u.id === id)
    },
    async business(id) {
      return db().businesses.find((b) => b.id === id)
    },
    async deviceByToken(token) {
      return db().devices.find((d) => d.token === token)
    },
    async branchByCode(code) {
      return db().branches.find((b) => b.code.toUpperCase() === code.toUpperCase())
    },
    async pairingCode(code) {
      const found = db().pairingCodes.find((p) => p.code === code)
      return found && { businessId: found.businessId }
    },
    async emailTaken(email) {
      return db().users.some((u) => u.email.toLowerCase() === email.toLowerCase())
    },
    async transactions(businessId, query) {
      return db()
        .transactions.filter(
          (t) =>
            t.businessId === businessId &&
            (!query.customerId || t.customerId === query.customerId) &&
            (!query.kind || t.kind === query.kind) &&
            (!query.branchId || t.branchId === query.branchId) &&
            (!query.registerId || t.registerId === query.registerId),
        )
        .filter(byTime(query))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, query.limit || 1000)
    },
    async countTransactions(businessId, query) {
      return db().transactions.filter((t) => t.businessId === businessId && (!query.branchId || t.branchId === query.branchId) && (!query.registerId || t.registerId === query.registerId)).length
    },
    async visitCounts(businessId) {
      const counts = new Map<string, number>()
      for (const t of db().transactions) if (t.businessId === businessId && (t.kind === "purchase" || t.kind === "visit")) counts.set(t.customerId, (counts.get(t.customerId) || 0) + 1)
      return counts
    },
    async notices(businessId, limit) {
      return db().notices.filter((n) => n.businessId === businessId).slice(0, limit)
    },
    async audit(query) {
      return db().audit.filter((e) => !query.businessId || e.businessId === query.businessId).slice(0, query.limit)
    },
    async businessStats(since) {
      const d = db()
      return d.businesses.map((b) => ({
        businessId: b.id,
        customers: d.customers.filter((c) => c.businessId === b.id).length,
        branches: d.branches.filter((x) => x.businessId === b.id).length,
        transactions: d.transactions.filter((t) => t.businessId === b.id && t.createdAt > since).length,
        inReview: d.payments.filter((p) => p.businessId === b.id && p.status === "review").length,
      }))
    },
  }
}
