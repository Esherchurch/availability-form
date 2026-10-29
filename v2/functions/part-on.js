/* A finer switch inside a whole part (functions/parts.js): on only while
 * the church uses the part AND the switch itself is on. The e-news is
 * inside Communications, so switching Communications off stops it too.
 * Nothing stored is on, so EGBC, which stores no parts, sees no change.
 */
import { usesPart } from './parts.js';
import { featureOn } from './features.js';

/**
 * Whether a church uses this part and, if named, this switch inside it.
 * @param {object} db one church's database (churchOf / eachChurch), or EGBC's
 * @param {string} part a part id ('comms', 'meetings'...)
 * @param {string} [feature] a finer switch inside it ('enews', 'cardMaker'...)
 * @returns {Promise<boolean>}
 */
export async function partOn(db, part, feature) {
  if (!(await usesPart(db, part))) return false;
  return feature ? featureOn(db, feature) : true;
}

/** The words a callable refuses with when the part is off. */
export const PART_WORDS = {
  comms: 'This church doesn’t use Communications (Church settings, “Choose what your church uses”).',
  meetings: 'This church doesn’t use meetings (Church settings, “Choose what your church uses”).'
};
