/* ===================================================================
   The church's own words, on the server (Comms, 28 Oct 2026)
   ===================================================================

   What a church calls the meeting where its members vote is its own: a
   Baptist church's "Members’ meeting", a parish's "Annual parish meeting".
   It is a church setting, churchSettings/details.meetingWord, set on Your
   church (your-church.html) and read in pages by EGBCAuth.meetingWord().
   Nothing here names one church's word: an empty setting reads "Church
   meeting".

     meetingWordOf(db)        -> "Members’ meeting" (as a title)
     inSentence(word)         -> "members’ meeting" ("APCM" stays as it is)
   =================================================================== */

export const MEETING_WORD = 'Church meeting';

/**
 * The church's word for its members' meeting.
 * @param {FirebaseFirestore.Firestore} db the church's database (scoped)
 * @returns {Promise<string>}
 */
export async function meetingWordOf(db) {
  const s = await db.collection('churchSettings').doc('details').get().catch(() => null);
  const w = String((s && s.exists && s.data().meetingWord) || '').replace(/[<>"&]/g, '').trim().slice(0, 60);
  return w || MEETING_WORD;
}

/**
 * A title's word as it reads mid-sentence: the first letter small, unless
 * the word starts with capitals ("APCM", "PCC meeting").
 * @param {string} word
 * @returns {string}
 */
export function inSentence(word) {
  const w = String(word || '');
  return /^[A-Z][A-Z]/.test(w) ? w : w.charAt(0).toLowerCase() + w.slice(1);
}
