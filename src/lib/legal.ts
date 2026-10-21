/**
 * Who operates LoyaLoop, as the privacy notice and the terms name it.
 * The law (LFPDPPP 2025, art. 15) asks for the identity and address of the
 * responsible party: fill `name` and `address` before relying on these texts.
 */
export const LOYALOOP_LEGAL = {
  /** Legal name (persona física o moral) that operates LoyaLoop. */
  name: "",
  /** Address for notices (domicilio). */
  address: "",
  /** Inbox for privacy requests (derechos ARCO). */
  email: "privacidad@loyaloop.com.mx",
  /** Last update of the texts, shown on the page. */
  updated: "21 de octubre de 2026",
  /** Days the data of a business that cancels is kept before being deleted. */
  retentionDays: 90,
}

export const loyaloopName = () => LOYALOOP_LEGAL.name || "LoyaLoop"
