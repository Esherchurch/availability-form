/* One switch for the e-news's sending (enews.js, hq-mail.js), the
 * payments-gate.js pattern (comms window, 19 Oct 2026).
 *
 * THE E-NEWS STAYS SHUT ON THE LIVE SITE UNTIL SWITCH-OVER (FINDINGS-comms
 * C-1). Until the locked rules deploy, anybody can read the live database,
 * so a subscriber list saved now would publish people's email addresses.
 * So while this is false, on the live site: the sign-up saves nothing and
 * says when it opens, and nothing is sent.
 *
 * This gate is about the subscriber list only (the sign-up, the e-news to
 * subscribers, the welcome emails, and the Canva keys' box, whose
 * privateSettings would be public too). It no longer holds the hub's other
 * email: since 21 Oct 2026 everything else v2 sends goes through Church
 * HQ's Resend as soon as RESEND_API_KEY is in Google Secret Manager
 * (resend-secrets.js, mail-route.js). Set this to true at switch-over,
 * after the rules, then deploy functions:hub.
 *
 * The emulator always runs everything (sending is a stub there), so the
 * tests are unaffected. */
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
export const ENEWS_LIVE = false;
export function enewsShut() { return !EMULATOR && !ENEWS_LIVE; }
