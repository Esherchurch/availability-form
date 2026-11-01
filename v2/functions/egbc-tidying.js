/* THE HUB LEAVES EGBC'S DATA ALONE UNTIL IT GOES LIVE (Martin, 1 Nov 2026).
 *
 * EGBC's top-level records are still the original site's. Until the hub
 * goes live, the server's tidying - orphanSweep and tidyAfterDelete - only
 * counts and logs what it would do there, and changes nothing; and only an
 * event the hub itself marked meeting: true is treated as a meeting there
 * (meeting-rooms.js, meeting-split.js), never one guessed from its video
 * room, since the original site's own meetings have rooms too. A church
 * under churches/{cid} is the hub's own from the start, so it is tidied as
 * normal.
 *
 * In the code, not the database, as PAYMENTS_LIVE is (payments-gate.js):
 * until the locked rules are on, anybody can write the live database, so a
 * switch kept there could be turned on by anybody. Going live (GOING-LIVE.md
 * step 12) sets it to true and deploys functions:hub.
 */
export const EGBC_TIDYING_ON = false;

/**
 * Whether the server may change records while tidying this church's data.
 * @param {string|null} churchId null for EGBC's top level
 * @param {boolean} [on] the switch (tests pass it)
 * @returns {boolean}
 */
export function mayTidy(churchId, on = EGBC_TIDYING_ON) {
  return !!churchId || on === true;
}

/**
 * Whether an event may be taken for a meeting from its video room alone, or
 * only when the hub marked it meeting: true. Same switch as mayTidy.
 * @param {string|null} churchId null for EGBC's top level
 * @param {boolean} [on]
 * @returns {boolean}
 */
export function mayGuessMeetings(churchId, on = EGBC_TIDYING_ON) {
  return mayTidy(churchId, on);
}
