import type { Messenger } from "../../src/lib/service"

/**
 * Until an SMS provider and an email provider are chosen, messages are written
 * to the server log. In that state the server must run with PREVIEW=true so
 * codes and links appear on screen; index.ts warns if it does not.
 */
export const consoleMessenger: Messenger = {
  async sms(phone, text) {
    console.log(`[sms] ${phone.slice(0, 2)}****${phone.slice(-2)}: ${text.replace(/\d{6}/, "******")}`)
  },
  async email(to, subject) {
    console.log(`[email] ${to}: ${subject}`)
  },
}
