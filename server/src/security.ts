// Security events: one JSON line per event in the server log (docker compose logs app),
// and an email to LoyaLoop when something spikes, at most once an hour per alert.

import type { Messenger } from "../../src/lib/service"

export type SecurityEvent = "auth.failed_login" | "auth.rate_limited" | "authz.denied" | "webhook.bad_signature"

/** Spikes that send an alert: [events, window] from one IP. */
const ALERTS: Partial<Record<SecurityEvent, { max: number; windowMs: number; text: string }>> = {
  "auth.failed_login": { max: 20, windowMs: 5 * 60_000, text: "intentos fallidos de inicio de sesión" },
  "auth.rate_limited": { max: 50, windowMs: 5 * 60_000, text: "solicitudes bloqueadas por exceso" },
  "authz.denied": { max: 30, windowMs: 5 * 60_000, text: "intentos de ver o cambiar datos sin permiso" },
  "webhook.bad_signature": { max: 20, windowMs: 5 * 60_000, text: "avisos de pago con firma falsa" },
}

export class SecurityMonitor {
  private hits = new Map<string, number[]>()
  private alerted = new Map<string, number>()

  constructor(
    private readonly options: { messenger?: Messenger; alertEmail?: string; now?: () => number; log?: (line: string) => void } = {},
  ) {}

  private now() {
    return (this.options.now || Date.now)()
  }

  /** Logs the event; returns true when it just triggered an alert. */
  record(event: SecurityEvent, fields: { ip: string; [key: string]: unknown }): boolean {
    const at = this.now()
    ;(this.options.log || console.warn)(JSON.stringify({ level: "warn", event, at: new Date(at).toISOString(), ...fields }))
    const rule = ALERTS[event]
    if (!rule) return false
    const key = `${event}:${fields.ip}`
    const list = (this.hits.get(key) || []).filter((t) => at - t < rule.windowMs)
    list.push(at)
    this.hits.set(key, list)
    if (this.hits.size > 20_000) for (const [k, l] of this.hits) if (!l.some((t) => at - t < 3_600_000)) this.hits.delete(k)
    if (list.length < rule.max) return false
    if (at - (this.alerted.get(key) || 0) < 3_600_000) return false
    this.alerted.set(key, at)
    const minutes = Math.round(rule.windowMs / 60_000)
    const subject = `Alerta de seguridad: ${list.length} ${rule.text}`
    ;(this.options.log || console.warn)(JSON.stringify({ level: "error", event: "security.alert", alert: event, ip: fields.ip, count: list.length, minutes }))
    const to = this.options.alertEmail
    if (to && this.options.messenger?.channels.email)
      this.options.messenger
        .email({
          to,
          subject,
          heading: "Algo raro está pasando en LoyaLoop",
          paragraphs: [
            `En los últimos ${minutes} minutos hubo ${list.length} ${rule.text} desde la dirección ${fields.ip}.`,
            "LoyaLoop ya limita esos intentos. Revisa el registro del servidor con: docker compose logs app --since 1h | grep security",
            "Si no reconoces la actividad, puedes bloquear esa dirección en el firewall del VPS (ufw deny from <IP>).",
          ],
        })
        .catch((error) => console.error("[seguridad] no se pudo mandar la alerta:", (error as Error).message))
    return true
  }
}
