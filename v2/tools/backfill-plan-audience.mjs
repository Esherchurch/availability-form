/* ===================================================================
   One-off: write `audience` onto the Sunday plans the old site made
   ===================================================================

   NEXT-BRIEF §26 item 13. A SWITCH-OVER STEP, run by Martin, once, just
   before the rules go live.

   WHY. Since ab09a833 the v2 planners write an `audience` (the uids of
   everyone the plan's email went to) onto each services and
   songSummaries document, and the locked rules let those people read the
   plan. The original site's planners - which the church uses every day
   until switch-over - write no audience. So without this, every plan
   made on the old site would refuse the preacher and service leader the
   moment the rules land.

   WHAT IT WRITES. For every services and songSummaries document dated
   from four weeks ago onwards: `audience` and `audienceUnresolved`, and
   nothing else. They are worked out EXACTLY as the planners do it:
     - the policy (who counts, what did not resolve) is the planners' own
       egbc-plan-audience.js, loaded here rather than copied;
     - the day's services are picked the way SundayServicePlanner.html's
       loadRota picks them (that date, not archived, the first of each
       service type), and merged the way its audienceFor() merges them;
     - a typed name resolves only when exactly one address book record
       has it, and a member to a uid through users.memberId.
   tests/check-audience-backfill.mjs proves the answer is the same one
   the real planner writes, by pressing Save in it.

   SAFE BY DEFAULT.
     - With no --write it only reads, and prints what it WOULD write and
       who did not resolve.
     - Against the real database it does nothing at all without --live,
       so it cannot reach live by accident from a test or a typo.
     - Running it twice changes nothing the second time.

   HOW MARTIN RUNS IT (from the v2 folder; steps also in NEXT-BRIEF §26):
     gcloud auth application-default login       (once, the church account)
     node tools/backfill-plan-audience.mjs --live            (look first)
     node tools/backfill-plan-audience.mjs --live --write    (then write)

   Options:
     --since YYYY-MM-DD   start from this date instead of four weeks ago
     --today YYYY-MM-DD   pretend today is this date (for the checks)
   =================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const PROJECT = 'egbc-worship-planner';
const RECENT_DAYS = 28;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? '' : String(argv[i + 1] || ''); };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const WRITE = flag('--write');
const LIVE = flag('--live');
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';

/* THE DOOR, before anything is loaded or connected. */
if (!EMULATOR && !LIVE) {
  console.error('Refusing: this would read the REAL database, and --live was not given.\n'
    + 'To look at the real plans:  node tools/backfill-plan-audience.mjs --live\n'
    + 'To write them:              node tools/backfill-plan-audience.mjs --live --write');
  process.exit(2);
}
if (EMULATOR && LIVE) {
  console.error('Refusing: --live was given but FIRESTORE_EMULATOR_HOST is set ('
    + EMULATOR + '). Pick one.');
  process.exit(2);
}

function londonToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function daysBefore(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const TODAY = opt('--today') || londonToday();
const SINCE = opt('--since') || daysBefore(TODAY, RECENT_DAYS);
if (!ISO.test(TODAY) || !ISO.test(SINCE)) {
  console.error('Dates must be YYYY-MM-DD (today ' + TODAY + ', since ' + SINCE + ')');
  process.exit(2);
}

/* The planners' own policy, run as it runs in the browser. */
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-plan-audience.js'), 'utf8'),
  sandbox, { filename: 'egbc-plan-audience.js' });
const Policy = sandbox.window.EGBCPlanAudience;

/* firebase-admin lives with the functions, which Martin installs to deploy. */
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp, applicationDefault } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');

initializeApp(EMULATOR ? { projectId: PROJECT }
  : { projectId: PROJECT, credential: applicationDefault() });
const db = getFirestore();

/* The day's services, as SundayServicePlanner.html's loadRota picks them:
   that date, not archived, the first of each type in document order. */
async function servicesOn(date) {
  const snap = await db.collection('events').where('date', '==', date).get();
  const seen = {};
  snap.docs.forEach((d) => {
    const ev = d.data();
    if (ev.archived === true) return;
    const key = ev.type || 'Unknown';
    if (!seen[key]) seen[key] = ev;
  });
  return Object.values(seen);
}

/* Merged as audienceFor() merges them: every service that day, because a
   morning and an evening share one email. */
function mergeDay(events) {
  const merged = { assignments: {}, serviceLeader: '', speaker: '' };
  events.forEach((e) => {
    Object.keys(e.assignments || {}).forEach((r) => {
      merged.assignments[r + '|' + e.date + (e.startTime || '')] = e.assignments[r];
    });
    if (!merged.serviceLeader) merged.serviceLeader = e.serviceLeader || '';
    if (!merged.speaker) merged.speaker = e.speaker || '';
  });
  return merged;
}

const nameCache = new Map(), uidCache = new Map(), bookName = new Map();
const host = {
  findMemberIdsByNames: async (names) => {
    const out = {};
    for (const n of names) {
      if (!nameCache.has(n)) {
        const s = await db.collection('addressBook').where('name', '==', n).limit(2).get();
        /* ONE MATCH ONLY, as the planners: two people with one name is
           exactly when a guess is dangerous. */
        nameCache.set(n, s.size === 1 ? s.docs[0].id : '');
      }
      if (nameCache.get(n)) out[n] = nameCache.get(n);
    }
    return out;
  },
  findUidsByMemberIds: async (ids) => {
    const out = {};
    for (const id of ids) {
      if (!uidCache.has(id)) {
        const s = await db.collection('users').where('memberId', '==', id).limit(1).get();
        uidCache.set(id, s.empty ? '' : s.docs[0].id);
      }
      if (uidCache.get(id)) out[id] = uidCache.get(id);
    }
    return out;
  }
};

async function memberName(id) {
  if (!bookName.has(id)) {
    const d = await db.collection('addressBook').doc(id).get();
    bookName.set(id, d.exists ? (d.data().name || id) : id);
  }
  return bookName.get(id);
}

const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

(async () => {
  console.log((EMULATOR ? 'EMULATOR ' + EMULATOR : 'LIVE DATABASE ' + PROJECT)
    + ' - ' + (WRITE ? 'WRITING' : 'dry run, nothing will be written'));
  console.log('Plans dated ' + SINCE + ' onwards (today is ' + TODAY + ')\n');

  /* Every plan document in range. A songSummaries id is its date, but a
     plan sent with no date is saved as "TBC", which is not a Sunday. */
  const targets = [];
  for (const coll of ['services', 'songSummaries']) {
    const snap = await db.collection(coll).where('date', '>=', SINCE).get();
    snap.docs.forEach((d) => {
      const date = String(d.data().date || '');
      if (ISO.test(date)) targets.push({ coll, ref: d.ref, id: d.id, date, data: d.data() });
    });
  }
  const dates = [...new Set(targets.map((t) => t.date))].sort();

  let changed = 0, unchanged = 0;
  for (const date of dates) {
    const events = await servicesOn(date);
    const aud = await Policy.build(mergeDay(events), host);
    const want = { audience: aud.audience, audienceUnresolved: aud.unresolved };
    const docs = targets.filter((t) => t.date === date);

    console.log(date + '  ' + (events.length ? events.map((e) => e.type || 'Unknown').join(' + ')
      : 'NO ROTA EVENT - nobody named; the teams still read it')
      + '  ->  ' + want.audience.length + (want.audience.length === 1 ? ' person' : ' people'));
    if (aud.unresolved.length) console.log('    not in the address book (or two records share the name): '
      + aud.unresolved.join(', '));
    if (aud.withoutAccount.length) {
      const names = [];
      for (const id of aud.withoutAccount) names.push(await memberName(id));
      console.log('    in the address book but not signed in yet: ' + names.join(', '));
    }

    for (const t of docs) {
      const has = { audience: t.data.audience, audienceUnresolved: t.data.audienceUnresolved };
      if (same(has.audience, want.audience) && same(has.audienceUnresolved, want.audienceUnresolved)) {
        unchanged++;
        console.log('    ' + t.coll + '/' + t.id + '  already right');
        continue;
      }
      changed++;
      console.log('    ' + t.coll + '/' + t.id + '  ' + (WRITE ? 'WRITTEN' : 'would write')
        + ' (had ' + (Array.isArray(has.audience) ? has.audience.length + ' people' : 'no audience') + ')');
      /* update(), so only these two fields are touched. */
      if (WRITE) await t.ref.update(want);
    }
  }

  console.log('\n' + dates.length + ' dates, ' + targets.length + ' plan documents: '
    + changed + (WRITE ? ' written, ' : ' to write, ') + unchanged + ' already right.');
  if (!WRITE && changed) console.log('Nothing has been written. Add --write to write them.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
