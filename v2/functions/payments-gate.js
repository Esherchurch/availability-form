/* One switch for every payment function (payments.js, gocardless.js). */
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
/* PAYMENTS STAY SHUT ON THE LIVE SITE UNTIL SWITCH-OVER (reviewing window,
   15 Oct 2026). Until the locked rules deploy, the live database can be read
   AND written by anybody, so a key saved now would be public, and anybody
   could swap in their own Stripe key or GoCardless token and take the money.
   This is in the code, not the database, for exactly that reason. Set it to
   true in the same commit as switch-over (NEXT-BRIEF §26), after the rules.
   The emulator always runs them, so the tests are unaffected. */
export const PAYMENTS_LIVE = false;
export function paymentsShut() { return !EMULATOR && !PAYMENTS_LIVE; }
