/* One switch for the e-news's sending (enews.js, hq-mail.js), the
 * payments-gate.js pattern (comms window, 19 Oct 2026).
 *
 * THE E-NEWS STAYS SHUT ON THE LIVE SITE UNTIL SWITCH-OVER (FINDINGS-comms
 * C-1). Until the locked rules deploy, anybody can read the live database,
 * so a subscriber list saved now would publish people's email addresses.
 * So while this is false, on the live site: the sign-up saves nothing and
 * says when it opens, and nothing is sent.
 *
 * It is ALSO what asks Google for the Church HQ Resend key. While false,
 * no function declares the secret, so a deploy of functions:hub never
 * needs it - the reviewing window can deploy before Martin has done
 * CHURCHHQ-EMAIL-SETUP.md part D. Set it to true at switch-over, after the
 * rules and after part D, then deploy functions:hub.
 *
 * The emulator always runs everything (sending is a stub there), so the
 * tests are unaffected. */
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
export const ENEWS_LIVE = false;
export function enewsShut() { return !EMULATOR && !ENEWS_LIVE; }
