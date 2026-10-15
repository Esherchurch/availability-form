/* The family rule, on the server (APP-DESIGN-BRIEF §4; APP-A1 §3; A-066).
 *
 * "The person logging in should only see the teams relevant to them and
 * their family" (Martin). Their own teams are spaces; their FAMILY's serving
 * and groups appear on their Home under "Your family this week", with when
 * and where only, and no team tools.
 *
 * WHY THIS IS A FUNCTION. The household is worked out by householdIds(),
 * which needs the whole address book - and the address book is closed to an
 * Attender (A-030), who is exactly the parent this is most for. So the
 * server works it out and hands back the least that answers the question.
 *
 * WHAT COMES BACK, AND WHAT NEVER DOES (A-043): a first name per person, and
 * for this week their rota slots and their groups' meetings - when, where,
 * what. No surname, telephone number, email or address, ever.
 *
 * ONE HOUSEHOLD MODEL. householdIds() is the calendar feed's, which is a copy
 * of egbc-rota-pdf.js's, checked to agree. Nothing here makes a second one.
 */
import { householdIds } from './rota-feed.js';

const DAYS = 7;

/* ---- the family's youth groups, written onto the parent's record (6c) ----

   The reviewing window, 13 Oct 2026: a parent sees the pin boards of the
   youth groups THEIR CHILDREN are in. The rules cannot work out a
   household (it needs the whole address book), so the server writes the
   answer onto users/{uid}.familyGroups and the board rules read that.
   Nobody can write it about themselves (the users rules); it is rewritten
   whenever the household or a child's groups change (addressBook trigger)
   and whenever the person opens Home (myFamily), so it cannot go stale for
   long and needs no one-off backfill.

   A CHILD is a household member whose record says isMinor. Their groups
   are the youth groups with a board: Youth Worship, Lazers and ReNu - the
   same three the rules' boardGroup() names for 'youth', 'lazers', 'renu'. */
export const YOUTH_GROUPS = ['Youth Worship', 'Lazers', 'ReNu'];

export function familyGroupsFor(book, memberId) {
  const byId = {};
  (book || []).forEach((m) => { byId[m.id] = m; });
  const out = new Set();
  householdIds(book, memberId).forEach((id) => {
    const m = byId[id];
    if (!m || id === memberId || m.archived === true || m.isMinor !== true) return;
    (Array.isArray(m.markers) ? m.markers : []).forEach((t) => { if (YOUTH_GROUPS.includes(t)) out.add(t); });
  });
  return [...out].sort();
}

/* Rewrite familyGroups for every account belonging to these members.
   Only when it changes, so a trigger cannot set off a stream of writes. */
export async function refreshFamilyGroups(db, memberIds, book) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (!ids.length) return 0;
  if (!book) book = (await db.collection('addressBook').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  let changed = 0;
  for (const id of ids) {
    const want = familyGroupsFor(book, id);
    const users = await db.collection('users').where('memberId', '==', id).get();
    for (const u of users.docs) {
      const has = Array.isArray(u.data().familyGroups) ? u.data().familyGroups : [];
      if (JSON.stringify(has) === JSON.stringify(want)) continue;
      await u.ref.update({ familyGroups: want });
      changed++;
    }
  }
  return changed;
}

/* The addressBook trigger's question: a change that could alter somebody's
   family groups - who points at whom, a child's groups, being a child,
   being archived - touches everybody in the household before AND after. */
export async function onBookChange(db, id, before, after) {
  const keys = ['householdId', 'markers', 'isMinor', 'archived'];
  const b = before || {}, a = after || {};
  if (keys.every((k) => JSON.stringify(b[k] === undefined ? null : b[k]) === JSON.stringify(a[k] === undefined ? null : a[k]))) return 0;
  const book = (await db.collection('addressBook').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const affected = new Set(householdIds(book, id));
  /* The household this record has just LEFT: whoever it used to point at,
     and everybody joined to them. */
  if (b.householdId) householdIds(book, b.householdId).forEach((x) => affected.add(x));
  affected.add(id);
  return refreshFamilyGroups(db, [...affected], book);
}

function londonDate(at, n = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';

/* Where a calendar event is, as words, without the events window's page code:
   its rooms' names, an outside venue's name, or Online. */
function placeOf(ev, rooms) {
  const loc = ev.location || {};
  if (loc.kind === 'online') return 'Online';
  if (loc.kind === 'venue') return String(loc.venueName || '');
  const names = (loc.roomIds || []).map((id) => rooms[id] || '').filter(Boolean);
  return names.join(', ') || String(loc.siteName || '');
}

/* -> { members: [{ id, firstName }], week: [ ... ] }
     week rows, soonest first:
       { kind: 'serving', id, firstName, date, roles: [..], title, time }
       { kind: 'group',   id, firstName, date, group, title, time, where } */
export async function myFamily(db, { uid, now = new Date() }) {
  if (!uid) return { error: 'unauthenticated', message: 'Sign in first.' };
  const u = await db.collection('users').doc(uid).get();
  const me = u.exists ? u.data() : null;
  /* Somebody the church does not hold yet has no household to show. */
  if (!me || !me.memberId || me.status !== 'active') return { members: [], week: [] };

  const bookSnap = await db.collection('addressBook').get();
  const book = bookSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  /* Opening Home keeps their own family groups right (6c). */
  await refreshFamilyGroups(db, [me.memberId], book).catch((e) => console.warn('[myFamily] familyGroups', e));
  const byId = {};
  book.forEach((m) => { byId[m.id] = m; });
  const others = householdIds(book, me.memberId)
    .filter((id) => id !== me.memberId && byId[id] && byId[id].archived !== true);
  if (!others.length) return { members: [], week: [] };

  const members = others.map((id) => ({ id, firstName: firstName(byId[id].name || byId[id].fullName) }));
  const nameOf = {};
  members.forEach((m) => { nameOf[m.id] = m.firstName; });

  const from = londonDate(now, 0), to = londonDate(now, DAYS - 1);
  const week = [];

  /* THEIR ROTA SLOTS this week. Archived and draft events are not the rota
     (the calendar feeds skip the same ones). */
  const evSnap = await db.collection('events').where('date', '>=', from).where('date', '<=', to).get();
  evSnap.docs.forEach((d) => {
    const ev = d.data();
    if (ev.archived || ev.draft) return;
    const mine = {};
    Object.keys(ev.assignments || {}).forEach((role) => {
      /* A role can hold several people (F-204): each of them counts. */
      const raw = ev.assignments[role];
      (Array.isArray(raw) ? raw : [raw]).forEach((who) => {
        if (who && who.id && nameOf[who.id] !== undefined && !(mine[who.id] || []).includes(role)) (mine[who.id] = mine[who.id] || []).push(role);
      });
    });
    Object.keys(mine).forEach((id) => {
      week.push({ kind: 'serving', id, firstName: nameOf[id], date: ev.date, roles: mine[id],
        title: String(ev.type || ''), time: String(ev.startTime || '') });
    });
  });

  /* THEIR GROUPS' MEETINGS this week: the events window's calendar events for
     a team the family member is on (Lazers, ReNu, Youth Worship...). Not
     confirmed only: not cancelled, and not one still held for approval (pending). */
  const teamsOf = {};
  others.forEach((id) => { teamsOf[id] = Array.isArray(byId[id].markers) ? byId[id].markers : []; });
  const wanted = [...new Set(others.flatMap((id) => teamsOf[id]))];
  if (wanted.length) {
    const calSnap = await db.collection('calEvents')
      .where('startLocal', '>=', from).where('startLocal', '<=', to + 'T23:59').get();
    const cals = calSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((ev) => (ev.status || 'confirmed') === 'confirmed'
        && (ev.teams || []).some((t) => wanted.includes(t)));
    const roomIds = [...new Set(cals.flatMap((ev) => ((ev.location || {}).roomIds || [])))];
    const rooms = {};
    if (roomIds.length) {
      const rs = await db.getAll(...roomIds.map((id) => db.collection('rooms').doc(id)));
      rs.forEach((r) => { if (r.exists) rooms[r.id] = String(r.data().name || ''); });
    }
    cals.forEach((ev) => {
      others.forEach((id) => {
        const t = (ev.teams || []).find((x) => teamsOf[id].includes(x));
        if (!t) return;
        week.push({ kind: 'group', id, firstName: nameOf[id], date: String(ev.startLocal).slice(0, 10),
          group: t, title: String(ev.title || ''), time: String(ev.startLocal || '').slice(11, 16),
          where: placeOf(ev, rooms) });
      });
    });
  }

  week.sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1);
  return { members, week };
}
