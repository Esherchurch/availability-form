/* A SIGNED SAFEGUARDING ASSESSMENT'S INSURANCE ANSWER, CHECKED ON THE SERVER.
 *
 * The rules refuse sign-off while a required question is blank, but they
 * can't afford to look at an answer's shape, so the public liability cover
 * given as an amount with nothing after it ("£5,000,000: ") passes them.
 * The page refuses that; this catches anything written another way.
 *
 * When a signed assessment is saved with such an answer, its sign-off is
 * undone exactly as the page undoes it when a signed assessment changes:
 * back to "waiting", a new version, and bookings closed again (sgGate).
 * The lead then sees the question as not answered, and signs once it is.
 * Saving it again changes nothing, so a trigger that runs twice is harmless.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';
import { twinTriggers } from './church-triggers.js';
import { usesPart } from './parts.js';

const require = createRequire(import.meta.url);
const { CHECKLIST, answered } = require('./sg-checklist.cjs');
const REGION = 'europe-west2';

/* Every question answered as an amount of money ("£<amount>: <words>"). */
const MONEY = [...new Set(Object.values(CHECKLIST).flat().filter((q) => q && q.money).map((q) => q.id))];

/**
 * The money questions whose answer starts with "£" but says nothing more.
 * @param {object} answers  an assessment's answers, by question id
 * @returns {string[]} the question ids with a malformed answer
 */
export function coverProblems(answers) {
  return MONEY.filter((id) => {
    const v = String((answers || {})[id] || '').trim();
    return /^£/.test(v) && !answered(v);
  });
}

/**
 * Undo the sign-off of a signed assessment whose money answer is malformed.
 * @param {object} db  the church's db
 * @param {string} id  the assessment's id (its event's id)
 * @param {object|null} d  the assessment as saved
 * @returns {Promise<string[]|null>} the questions at fault, or null when nothing was done
 */
export async function checkSignedCover(db, id, d) {
  if (!d || d.status !== 'signed' || d.waived === true) return null;
  const bad = coverProblems(d.answers);
  if (!bad.length || !(await usesPart(db, 'safeguarding'))) return null;
  const now = new Date().toISOString(), b = db.batch();
  b.update(db.collection('sgAssessments').doc(id), {
    status: 'waiting', version: (Number.isInteger(d.version) ? d.version : 1) + 1,
    signedBy: FieldValue.delete(), signedByName: FieldValue.delete(), signedAt: FieldValue.delete(),
    signedVersion: FieldValue.delete(), signedNote: FieldValue.delete(), signedByRole: FieldValue.delete(),
    updatedAt: now, updatedBy: 'hub'
  });
  b.set(db.collection('sgGate').doc(id), { needed: true, open: false, updatedAt: now });
  await b.commit();
  console.warn('[sgAssessCheck] sign-off undone, cover answer incomplete:', id, bad.join(', '));
  return bad;
}

export const [sgAssessCheck, sgAssessCheckChurch] = twinTriggers(onDocumentWritten, { document: 'sgAssessments/{id}', region: REGION }, ({ db }, event) =>
  checkSignedCover(db, event.params.id, event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null));
