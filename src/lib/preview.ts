/**
 * Preview mode: the app runs without a server, so a few helpers are visible
 * that the production build must not show: test accounts on the login page,
 * the SMS code on screen, password-reset links, and the admin test tools
 * that simulate Mercado Pago payments.
 *
 * Turn this off when the backend is connected.
 */
export const PREVIEW = true
