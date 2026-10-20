/* ===================================================================
   What this church uses: the server's half (one source of truth)
   ===================================================================

   churchSettings/features holds a master admin's switches,
   { name: true|false }. A switch with nothing stored takes its default
   below. This list is the SAME list as FEATURES in egbc-auth.js (the
   pages' half, EGBCAuth.uses / EGBCChurch.uses), name for name, default
   for default: tests/check-features-agree.mjs fails the moment they
   differ, or a page or function reads the switches its own way.

   The reviewing window, 20 Oct 2026: pages said building compliance was
   ON (nothing stored, default on) while complianceDaily, peepToday and
   the bookings dot said OFF (they wanted it stored as exactly true).
   Every reader asks here (server) or EGBCAuth (pages) instead.

   Martin, 19 Oct 2026: at EGBC every switch starts ON, add-ons included.
   addOn marks the ones a new church could start with off. */

export const FEATURES = [
  { name: 'care', on: true },
  { name: 'prayer', on: true },
  { name: 'notifications', on: true },
  { name: 'watch', on: true },
  { name: 'sermons', on: true },
  { name: 'giftAid', on: true },
  { name: 'teamMail', on: true },
  { name: 'rotaReports', on: true },
  { name: 'preachingPlan', on: true },
  { name: 'pictureLibrary', on: true },
  { name: 'publicWhatson', on: true },
  { name: 'sundaysInWhatsOn', on: true },
  { name: 'newHere', on: true },
  { name: 'usualPeople', on: true },
  { name: 'screenPaging', on: true },
  /* Every part has a switch (the reviewing window, 20 Oct 2026). */
  { name: 'maintenance', on: true },
  { name: 'events', on: true },
  { name: 'roomBookings', on: true },
  { name: 'kids', on: true },
  { name: 'smallGroups', on: true },
  { name: 'forms', on: true },
  { name: 'payments', on: true },
  { name: 'safeguarding', on: true },
  { name: 'pinBoards', on: true },
  { name: 'meetings', on: true },
  { name: 'notices', on: true },
  { name: 'churchShow', on: true },
  { name: 'availability', on: true },
  { name: 'sessionPlanner', on: true, addOn: true },
  { name: 'buildingCompliance', on: true, addOn: true },
  { name: 'enews', on: true, addOn: true },
  { name: 'cardMaker', on: true, addOn: true },
  { name: 'canva', on: true, addOn: true }
];

/* The answer from the switches as stored - exactly EGBCAuth's usesFeature:
   a stored true/false wins; otherwise the default; a name nobody listed is
   on, as before the switches. */
export function uses(switches, name) {
  const v = switches && switches[name];
  if (typeof v === 'boolean') return v;
  const f = FEATURES.find((x) => x.name === name);
  return f ? f.on : true;
}

/* Read once from the database. Unreadable settings count as nothing
   stored, as on the pages. */
export async function readSwitches(db) {
  try {
    const s = await db.collection('churchSettings').doc('features').get();
    return (s.exists && s.data()) || {};
  } catch (e) { return {}; }
}

export async function featureOn(db, name) {
  return uses(await readSwitches(db), name);
}
