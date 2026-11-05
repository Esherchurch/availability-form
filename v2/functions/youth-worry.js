/* "I'M WORRIED" FROM THE YOUTH HUB (Martin, 5 Nov 2026: "young people must
 * be able to say they're worried" - a going-live stopper for youth, built
 * for any church).
 *
 * A young person signs in with a code (youth-redeem.js): no account, no
 * volunteer record, so the rules rightly refuse them `concerns` - and they
 * are not loosened for youth accounts. The server writes it for them.
 *
 * THE SAME ROUTE AS THE SAFEGUARDING PAGE'S CONCERNS:
 *   - one record in `concerns`, the shape safeguarding.html writes, on the
 *     building whose safeguarding lead counts (notify.js leadSite - the
 *     rules' sgLeadSet reads the same). Only that building's lead and deputy
 *     can read it (rules: sgLeadOf), and they see it in "Concerns reported
 *     to you" with the adults' ones;
 *   - the lead and deputy are told one has come in, and nothing else
 *     (notify.js onWorry, kind 'safeguarding': the lead and deputy ONLY,
 *     never the office or any fallback, never the sender).
 *
 * The young person gets back { sent: true } and nothing more: not what they
 * wrote, not who it went to, not any other record. With no lead set it is
 * not written anywhere (nobody could read it); the page says so plainly and
 * still shows Childline and 999, which it always shows.
 *
 * An adult on the Youth Hub (an active users record) may send one the same
 * way: the safeguarding page would take theirs anyway.
 */
import crypto from 'node:crypto';

const MAX_TEXT = 6000, MAX_ABOUT = 300;
/* Enough for anyone who needs to say more; a stuck button or a game cannot fill the lead's list. */
const MAX_A_DAY = 10;
const ms = (t) => (t && t.toMillis ? t.toMillis() : Date.parse(t || '')) || 0;

/* -> { status, body } like youth-redeem; body is { sent: true } or { error, message } */
export async function youthWorry(db, { uid, about, who, text, now = new Date() }, { leadSite, notify }) {
  if (!uid) return { status: 401, body: { error: 'unauthenticated', message: 'Sign in first.' } };
  const words = String(text || '').trim();
  if (!words) return { status: 400, body: { error: 'invalid-argument', message: 'Write down what you are worried about.' } };
  if (words.length > MAX_TEXT) return { status: 400, body: { error: 'invalid-argument', message: 'That is too long to send in one go. Send the first part, then the rest.' } };
  const forWhom = about === 'someone' ? 'someone else' : 'me';

  /* WHO IS ASKING: a live youth code, or an active adult. Anyone else is refused. */
  let name = '';
  const ya = await db.collection('youthAccess').doc(uid).get();
  if (ya.exists) {
    const d = ya.data();
    if (d.active !== true || !(ms(d.expiresAt) > now.getTime())) {
      return { status: 403, body: { error: 'permission-denied', message: 'Your code has stopped working. Please tell a leader you trust, or call Childline on 0800 1111.' } };
    }
    name = String(d.firstName || 'A young person') + ' (a young person, from the Youth Hub)';
  } else {
    const u = await db.collection('users').doc(uid).get();
    if (!(u.exists && u.data().status === 'active')) return { status: 403, body: { error: 'permission-denied', message: 'Sign in first.' } };
    name = String(u.data().name || '') + ' (from the Youth Hub)';
  }

  /* NOBODY TO READ IT: not written. */
  const site = await leadSite(db);
  const b = site ? await db.collection('bookingSettings').doc(site).get() : null;
  if (!(b && b.exists && b.data().safeguardingLead)) {
    return { status: 409, body: { error: 'failed-precondition', message: 'Nobody is set up to receive this at your church yet, so it was not sent. Please tell a leader you trust, or call Childline on 0800 1111. If you are in danger right now, call 999.' } };
  }

  /* NOT TOO MANY IN A DAY (a stuck button, a game). */
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const mine = await db.collection('concerns').where('reportedBy', '==', uid).get();
  if (mine.docs.filter((d) => String(d.data().createdAt || '') > dayAgo).length >= MAX_A_DAY) {
    return { status: 429, body: { error: 'resource-exhausted', message: 'You have sent a lot today, and they have all arrived. Please tell a leader you trust, or call Childline on 0800 1111.' } };
  }

  const id = 'con_' + crypto.randomBytes(12).toString('hex');
  await db.collection('concerns').doc(id).set({
    siteId: site, calEventId: '',
    about: forWhom === 'me' ? 'Themselves' : String(who || '').trim().slice(0, MAX_ABOUT) || 'Someone else (not named)',
    concern: words, reportedBy: uid, reportedByName: name.slice(0, 160),
    createdAt: now.toISOString(), status: 'new'
  });
  /* The lead and deputy only, told which kind and nothing else. A failed notice never unsends the concern. */
  try { await notify(id, { kind: 'safeguarding', by: uid }); } catch (e) { console.error('youthWorry notify', id, e && e.message); }
  return { status: 200, body: { sent: true } };
}
