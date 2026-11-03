/**
 * Preview mode shows helpers the production app must not show: test accounts on
 * the login page, the payment simulator and the "not yet connected" notices.
 *
 * - Without a server (VITE_API_URL unset) the app always runs in preview.
 * - With a server, set VITE_PREVIEW=true only for a staging build.
 *
 * SMS codes and password-reset links appear on screen only when the server
 * sends them back, which it does only while it has no SMS or email provider.
 */
export const SERVER = !!import.meta.env.VITE_API_URL
export const PREVIEW = !SERVER || import.meta.env.VITE_PREVIEW === "true"
