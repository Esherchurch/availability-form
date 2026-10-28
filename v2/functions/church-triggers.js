/* A TRIGGER FOR EVERY CHURCH: one on EGBC's own (top-level) data, and its
 * twin on the same path under churches/{cid}/, both handled the same way
 * with that church's own db. A church's pages write under its own folder,
 * so a trigger on EGBC's path alone would never hear them.
 *
 * index.js has the same pattern (twins) for main's triggers; this is the
 * one the other function files use.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { churchFromPath } from './church-scope.js';

/**
 * Two triggers on one path: EGBC's, and the same path under every church.
 * @param {Function} on  onDocumentWritten, onDocumentCreated, onDocumentUpdated or onDocumentDeleted
 * @param {object} opts  the trigger's options; opts.document is EGBC's path, e.g. 'bookings/{key}'
 * @param {(ch: {id: string|null, legacy: boolean, db: object}, event: object) => Promise<any>} handler
 * @returns {Array<object>} [EGBC's trigger, every church's trigger], to export as name and nameChurch
 */
export function twinTriggers(on, opts, handler) {
  const run = (event) => handler(churchFromPath(event, getFirestore()), event);
  return [on(opts, run), on({ ...opts, document: 'churches/{cid}/' + opts.document }, run)];
}
