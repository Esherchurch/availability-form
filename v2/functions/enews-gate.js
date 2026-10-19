/* One switch for the e-news's sending (enews.js, hq-mail.js), the
 * payments-gate.js pattern (comms window, 19 Oct 2026).
 *
 * THE E-NEWS STAYS SHUT ON THE LIVE SITE UNTIL SWITCH-OVER (FINDINGS-comms
 * C-1). Until the locked rules deploy, anybody can read the live database,
 * so a subscriber list saved now would publish people's email addresses.
 * So while this is false, on the live site: the sign-up saves nothing and
 * says when it opens, and nothing is sent.
 *
 * The Church HQ Resend key is pasted into Church settings' key box
 * (hq-mail-key.js), which refuses to save while this is false. Set it to
 * true at switch-over, after the rules, then deploy functions:hub, then
 * paste the key (CHURCHHQ-EMAIL-SETUP.md parts D and E).
 *
 * The emulator always runs everything (sending is a stub there), so the
 * tests are unaffected. */
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
export const ENEWS_LIVE = false;
export function enewsShut() { return !EMULATOR && !ENEWS_LIVE; }
