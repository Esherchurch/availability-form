/* A young person's own rota dates and charters, in the Youth app (6b; A-066).
 *
 * Martin, 10 Oct 2026: a young person on the youth band AND the main band
 * should see their main-rota dates and both charters in the Youth app.
 * A young person signs in with a code and has no account, and the rules
 * keep the rota (`events`) and the charters (`pageContent`) from their
 * phone - rightly: the rota names everybody, and a phone that can read one
 * charter document can read them all.
 *
 * So the server answers, for the person asking and nobody else:
 *   - their OWN slots on the main rota, coming weeks - when, what, the
 *     service; never anybody else's name;
 *   - the charters that are THEIRS: the Youth charter for a youth group,
 *     the Worship & AV charter only for somebody whose record puts them on
 *     Worship, AV or Choir. A youth-only young person is never sent the
 *     Worship & AV charter (Martin's deliberate break, A-066).
 *
 * Works for an adult on the Youth app too (their users record), so the
 * same tile means the same thing whoever opens it.
 */
const BANDS = ['Worship Team', 'AV Team', 'Choir'];
const YOUTH = ['Youth Worship', 'Lazers', 'ReNu'];
const WEEKS = 8;

function londonDate(at, n = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
const ms = (t) => (t && t.toMillis ? t.toMillis() : Date.parse(t || '')) || 0;

/* -> { firstName, rota: [{ date, roles, title, time }], charters: [{ id, title, html }] }
      | { error, message } */
export async function myYouthHub(db, { uid, now = new Date() }) {
  if (!uid) return { error: 'unauthenticated', message: 'Sign in first.' };

  /* WHO IS ASKING. A young person's code first - live, and not run out -
     then an adult's own record. */
  let memberId = null, firstName = '';
  const ya = await db.collection('youthAccess').doc(uid).get();
  if (ya.exists) {
    const d = ya.data();
    if (d.active !== true || !(ms(d.expiresAt) > now.getTime())) {
      return { error: 'permission-denied', message: 'This code has stopped working. Ask a leader for a new one.' };
    }
    memberId = d.memberId || null;
    firstName = String(d.firstName || '');
  } else {
    const u = await db.collection('users').doc(uid).get();
    const ud = u.exists ? u.data() : null;
    if (ud && ud.status === 'active') { memberId = ud.memberId || null; firstName = String(ud.name || '').split(/\s+/)[0]; }
  }
  if (!memberId) return { firstName, rota: [], charters: [] };

  const rec = await db.collection('addressBook').doc(memberId).get();
  const markers = rec.exists && Array.isArray(rec.data().markers) ? rec.data().markers : [];
  const onBand = markers.some((t) => BANDS.includes(t));
  const onYouth = markers.some((t) => YOUTH.includes(t));

  /* THEIR OWN SLOTS, the coming weeks. Archived and draft events are not
     the rota. Only the roles that are theirs. */
  const from = londonDate(now, 0), to = londonDate(now, WEEKS * 7);
  const evs = await db.collection('events').where('date', '>=', from).where('date', '<=', to).get();
  const rota = [];
  evs.docs.forEach((d) => {
    const ev = d.data();
    if (ev.archived || ev.draft) return;
    const roles = Object.keys(ev.assignments || {}).filter((r) => {
      /* A role can hold several people (F-204). */
      const raw = ev.assignments[r];
      return (Array.isArray(raw) ? raw : [raw]).some((who) => who && who.id === memberId);
    });
    if (roles.length) rota.push({ date: ev.date, roles, title: String(ev.type || ''), time: String(ev.startTime || '') });
  });
  rota.sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1);

  /* THEIR CHARTERS, and only theirs. */
  const ids = [];
  if (onYouth) ids.push('youth-charter');
  if (onBand) ids.push('wider-worship-charter');
  const charters = [];
  for (const id of ids) {
    const c = await db.collection('pageContent').doc(id).get();
    if (c.exists) charters.push({ id, title: String(c.data().title || ''), html: String(c.data().html || '') });
  }
  return { firstName, rota, charters };
}
