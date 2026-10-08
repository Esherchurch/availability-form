/* The live rota calendar: does a person's feed hold their slots, and only
 * theirs?
 *
 *   set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec ^
 *     --config firebase.spare.json --only firestore,auth,functions ^
 *     --project egbc-worship-planner "node tests/check-rota-feed.mjs"
 *
 * (from v2/. The functions emulator has to be up, so this one brings its own
 * emulators - on the SPARE ports, so it can run while the dev emulators are
 * up. The line above used to leave out both the config and the port, and the
 * check then talked to whichever emulator happened to be on the dev ports:
 * once that was a different dataset, and it reported the function refusing a
 * person it had never been told about.)
 *
 * WHAT IT IS FOR. The link in a subscribe URL cannot be protected by signing
 * in - a calendar app has no way to sign in - so the key in it IS the
 * password, and the feed is the one thing in the suite that answers to
 * somebody with no account at all. Two questions follow, and they are the two
 * this check exists for:
 *
 *   does the right person get the right slots, and
 *   can anybody get anybody else's?
 *
 * Synthetic people throughout. Nothing here resembles a real member.
 */
import http from 'node:http';

const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5101);
const REGION = 'europe-west2';
const FS = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181').split(':');
const FS_HOST = FS[0], FS_PORT = Number(FS[1] || 8181);

/* Seeded over the emulator's REST interface rather than through the Admin SDK,
   so this check needs nothing installed that the other checks do not. The
   owner token is what the emulator accepts for a write that skips the rules -
   which is right here: the point is to test the FEED, not the rules, and the
   rules are tested on their own in firestore-rules.test.mjs. */
const rest = (method, path, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: FS_HOST, port: FS_PORT, method, path,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej);
  req.end(data);
});
const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;

/* Javascript values into the shape Firestore's REST interface wants. */
const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (path, obj) => rest('PATCH', DOCS + '/' + path, { fields: fields(obj) });
const del = (path) => rest('DELETE', DOCS + '/' + path);

const R = [];
const ok = (n, v, x) => { R.push({ n, v }); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')); };

const get = (path) => new Promise((res, rej) => {
  http.get({ host: 'localhost', port: FN_PORT, path }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d, headers: r.headers }));
  }).on('error', rej);
});
const feedUrl = (key) => `/${PROJECT}/${REGION}/rotaFeed?k=${encodeURIComponent(key)}`;

/* ---- invented people and an invented term -------------------------- */
const ALEX = 'ab_alex_synth';     /* on guitar, and in the Worship Team */
const BEA  = 'ab_bea_synth';      /* on keyboard - her name must never be in Alex's feed */
const KEY_ALEX = 'alexkey0000000000000000000000aa';
const KEY_BEA  = 'beakey00000000000000000000000bb';

async function seed() {
  await put('addressBook/' + ALEX, { name: 'Alex Synthetic', email: 'alex@example.invalid', markers: ['Worship Team'] });
  await put('addressBook/' + BEA, { name: 'Bea Synthetic', email: 'bea@example.invalid', markers: ['Worship Team'] });
  await put('calendarFeeds/' + KEY_ALEX, { uid: 'u_alex', memberId: ALEX, createdAt: '2026-10-01' });
  await put('calendarFeeds/' + KEY_BEA, { uid: 'u_bea', memberId: BEA, createdAt: '2026-10-01' });

  const base = { termLabel: 'Autumn 2026', teams: ['Worship Team', 'AV Team'],
    roles: ['Worship Leader', 'Keyboard', 'Guitar'], archived: false, draft: false,
    serviceLeader: 'Carol Synthetic', speaker: 'Dee Synthetic' };

  /* 1. an ordinary Sunday: Alex on guitar, Bea on keyboard */
  await put('events/ev_sunday', { ...base, date: '2026-10-11', startTime: '08:00', endTime: '11:30',
    type: 'Sunday Morning Worship', description: 'Communion, with tea',
    assignments: { Guitar: { id: ALEX, name: 'Alex Synthetic' }, Keyboard: { id: BEA, name: 'Bea Synthetic' } } });

  /* 2. two roles at once, one of them written as a LIST - the shape that is
        easy to miss, and the one that loses a whole band if it is missed */
  await put('events/ev_twice', { ...base, date: '2026-10-18', startTime: '09:30', endTime: '11:00',
    type: 'Sunday Morning Worship', description: '',
    assignments: { Guitar: [{ id: ALEX, name: 'Alex Synthetic' }, { id: BEA, name: 'Bea Synthetic' }],
                   'Worship Leader': { id: ALEX, name: 'Alex Synthetic' } } });

  /* 3. an all-day event with no times */
  await put('events/ev_allday', { ...base, date: '2026-10-24', type: 'Song Writing Workshop',
    description: '', assignments: { Guitar: { id: ALEX, name: 'Alex Synthetic' } } });

  /* 4. a meeting Alex has no role at, but his team is on it */
  await put('events/ev_meeting', { ...base, date: '2026-10-20', startTime: '19:30', endTime: '21:00',
    type: 'Worship Team Meeting', description: '', assignments: {} });

  /* 5. archived, and 6. draft - neither belongs in anybody's calendar */
  await put('events/ev_archived', { ...base, date: '2026-09-06', startTime: '08:00', archived: true,
    type: 'Sunday Morning Worship', description: 'Last term',
    assignments: { Guitar: { id: ALEX, name: 'Alex Synthetic' } } });
  await put('events/ev_draft', { ...base, date: '2026-11-15', startTime: '08:00', draft: true,
    type: 'Sunday Morning Worship', description: 'Not agreed yet',
    assignments: { Guitar: { id: ALEX, name: 'Alex Synthetic' } } });

  /* 7. only Bea - Alex must not see it at all */
  await put('events/ev_bea_only', { ...base, date: '2026-10-25', startTime: '08:00', endTime: '11:30',
    type: 'Sunday Morning Worship', description: '',
    assignments: { Keyboard: { id: BEA, name: 'Bea Synthetic' } } });
}

const vevents = (body) => body.split('BEGIN:VEVENT').slice(1);
const has = (body, s) => body.includes(s);

(async () => {
  await seed();
  console.log('seeded an invented term: 7 events, two invented people\n');

  const r = await get(feedUrl(KEY_ALEX));
  ok('the feed answers, as a calendar', r.status === 200 && /text\/calendar/.test(r.headers['content-type'] || ''),
    r.status + ' ' + (r.headers['content-type'] || ''));
  const body = r.body || '';

  ok('it is a calendar file, opening and closing properly',
    body.startsWith('BEGIN:VCALENDAR') && body.trimEnd().endsWith('END:VCALENDAR'),
    body.slice(0, 40).replace(/\r?\n/g, ' | '));
  ok('every line ends CRLF, as the standard asks',
    !/[^\r]\n/.test(body), 'a bare newline breaks Outlook');

  /* Alex should have five: the Sunday, the two-role Sunday, the all-day one,
     the meeting his team is on. That is four. */
  ok('it holds exactly the events that are his', vevents(body).length === 4,
    vevents(body).length + ' entries: ' + (body.match(/UID:[^\r\n]+/g) || []).join(' '));

  ok('his own roles are on the entry, in the order the event lists them',
    has(body, 'SUMMARY:EGBC: Guitar') && has(body, 'SUMMARY:EGBC: Worship Leader\\, Guitar'),
    (body.match(/SUMMARY:[^\r\n]+/g) || []).join(' | '));

  /* The one that matters most. */
  ok('NOBODY ELSE IS IN IT - not a name, not a leader, not a speaker',
    !/Bea Synthetic/.test(body) && !/Carol Synthetic/.test(body) && !/Dee Synthetic/.test(body),
    'searched for the other three invented names');

  ok('an event he is not on is not in it', !has(body, 'ev_bea_only'));
  ok('last term is not in it', !has(body, 'ev_archived'));
  ok('a draft is not in it', !has(body, 'ev_draft'));

  ok('the meeting his team is on IS in it, with no role',
    has(body, 'egbc-rota-ev_meeting@') && has(body, 'SUMMARY:EGBC: Worship Team Meeting'));

  ok('times are London, not whatever the server thinks',
    has(body, 'DTSTART;TZID=Europe/London:20261011T080000') &&
    has(body, 'DTEND;TZID=Europe/London:20261011T113000'),
    (body.match(/DTSTART[^\r\n]+/g) || []).join(' | '));

  ok('an event with no time is a whole day, ending the day after',
    has(body, 'DTSTART;VALUE=DATE:20261024') && has(body, 'DTEND;VALUE=DATE:20261025'),
    'DTEND is exclusive; same-day DTEND draws as nothing in some calendars');

  ok('a comma in the words is escaped, so the line does not end early',
    has(body, 'Communion\\, with tea'),
    (body.match(/DESCRIPTION:[^\r\n]+/g) || []).join(' | ').slice(0, 120));

  ok('the entry keys on the event alone, so a moved event moves',
    has(body, 'UID:egbc-rota-ev_sunday@esherchurch.org') && !/UID:egbc-rota-ev_sunday-2026/.test(body),
    'a UID with the date in it leaves the old entry behind when a date changes');

  ok('it says how often to come back', has(body, 'REFRESH-INTERVAL') && has(body, 'X-PUBLISHED-TTL'));

  /* ---- the key is the password -------------------------------------- */
  const wrong = await get(feedUrl('nosuchkey000000000000000000000zz'));
  ok('an unknown key gets nothing', wrong.status === 404, wrong.status + ' ' + wrong.body.slice(0, 40));
  const short = await get(feedUrl('short'));
  ok('a key that is not even the right shape gets nothing', short.status === 404, short.status);
  const none = await get(`/${PROJECT}/${REGION}/rotaFeed`);
  ok('no key at all gets nothing', none.status === 404, none.status);
  ok('and a refusal is never cached', /no-store/.test(wrong.headers['cache-control'] || ''),
    wrong.headers['cache-control']);

  /* Bea's feed is Bea's. */
  const rb = await get(feedUrl(KEY_BEA));
  ok('her feed is hers, and his name is not in it',
    rb.status === 200 && /Bea|Keyboard/.test(rb.body) && !/Alex Synthetic/.test(rb.body),
    (rb.body.match(/SUMMARY:[^\r\n]+/g) || []).join(' | '));

  /* ---- making the link, and resetting it -----------------------------
     Through myCalendarLink itself, signed in as a synthetic member, because
     the reset is the part that has to be right: it is what somebody does when
     they think their link has got out. */
  const AUTH = (process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9089').split(':');
  const authReq = (path, body) => new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const r = http.request({ host: AUTH[0], port: Number(AUTH[1]), method: 'POST', path,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res(JSON.parse(d || '{}'))); });
    r.on('error', rej); r.end(data);
  });
  const signedUp = await authReq('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: 'alex.feed@example.invalid', password: 'test-only-password', returnSecureToken: true });
  const uid = signedUp.localId, idToken = signedUp.idToken;
  await put('users/' + uid, { uid, email: 'alex.feed@example.invalid', name: 'Alex Synthetic',
    memberId: ALEX, status: 'active', teams: ['Worship Team'], adminFor: [], masterAdmin: false });

  const callLink = (data) => new Promise((res, rej) => {
    const payload = JSON.stringify({ data: data || {} });
    const r = http.request({ host: 'localhost', port: FN_PORT, method: 'POST',
      path: `/${PROJECT}/${REGION}/myCalendarLink`,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
                 Authorization: 'Bearer ' + idToken } },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => { try { res(JSON.parse(d || '{}')); } catch { res({ raw: d }); } }); });
    r.on('error', rej); r.end(payload);
  });

  const first = await callLink();
  const key1 = first && first.result && first.result.key;
  ok('asking for a link gives one', !!key1 && /^[a-z0-9]{16,64}$/.test(key1), JSON.stringify(first).slice(0, 160));

  const again = await callLink();
  ok('asking twice gives the SAME link, not a new one each time',
    again && again.result && again.result.key === key1 && again.result.created === false,
    JSON.stringify(again && again.result).slice(0, 120));

  const f1 = await get(feedUrl(key1));
  ok('the link it gave works', f1.status === 200 && vevents(f1.body).length === 4,
    f1.status + ', ' + vevents(f1.body || '').length + ' entries');

  const reset = await callLink({ reset: true });
  const key2 = reset && reset.result && reset.result.key;
  ok('resetting gives a different link', !!key2 && key2 !== key1, (key1 || '').slice(0, 8) + '… -> ' + (key2 || '').slice(0, 8) + '…');

  const old = await get(feedUrl(key1));
  ok('and the OLD link stops working that moment', old.status === 404, old.status + ' for the old key');
  const neu = await get(feedUrl(key2));
  ok('while the new one works', neu.status === 200 && vevents(neu.body).length === 4,
    neu.status + ', ' + vevents(neu.body || '').length + ' entries');

  /* Nobody signed in gets nothing at all. */
  const anon = await new Promise((res, rej) => {
    const payload = JSON.stringify({ data: {} });
    const r = http.request({ host: 'localhost', port: FN_PORT, method: 'POST',
      path: `/${PROJECT}/${REGION}/myCalendarLink`,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, body: d })); });
    r.on('error', rej); r.end(payload);
  });
  ok('somebody with no account cannot ask for a link', anon.status >= 400,
    anon.status + ' ' + String(anon.body).slice(0, 80));


  /* ================= THE THREE FEEDS (NEXT-BRIEF 18) ==================

     Martin: "we need to let them choose. for example we need a feed for the
     whole family, or for the full rota if they prefer. Karen as an example
     needs to know if Oliver is on."

     Karen and Oliver are invented, and so is everybody else in this file.
     Oliver points at Karen as his household, which is one of the two shapes
     the address book uses; the other is two people pointing at each other,
     and householdIds handles both - the household PDF has been doing it that
     way since it was written, and this reads the same rule.           */

  const KAREN = 'ab_karen_synth';
  const OLIVER = 'ab_oliver_synth';

  await put('addressBook/' + KAREN, { name: 'Karen Synthetic',
    email: 'karen@example.invalid', markers: ['Kids Church'] });
  await put('addressBook/' + OLIVER, { name: 'Oliver Synthetic',
    email: 'oliver@example.invalid', markers: ['Worship Team'], householdId: KAREN });

  const hBase = { termLabel: 'Autumn 2026', teams: ['Worship Team', 'AV Team', 'Kids Church'],
    roles: ['Drums', 'Guitar', 'Session Leader'], archived: false, draft: false,
    serviceLeader: 'Carol Synthetic', speaker: 'Dee Synthetic' };

  /* Both of them on, which is the entry 18 gives as its example. */
  await put('events/ev_house_both', { ...hBase, date: '2026-11-01',
    startTime: '08:00', endTime: '11:30', type: 'Sunday Morning Worship', description: '',
    assignments: {
      Drums: { id: OLIVER, name: 'Oliver Synthetic' },
      'Session Leader': { id: KAREN, name: 'Karen Synthetic' },
      Guitar: { id: ALEX, name: 'Alex Synthetic' }
    } });

  /* THE ONE THAT MATTERS: Oliver is on and Karen is not. This date has to be
     in her household feed and must not be in her "Just me" feed. */
  await put('events/ev_house_oliver', { ...hBase, date: '2026-11-08',
    startTime: '08:00', endTime: '11:30', type: 'Sunday Morning Worship', description: '',
    assignments: { Drums: { id: OLIVER, name: 'Oliver Synthetic' } } });

  /* Karen's own account, so the callable has somebody to answer. */
  const karenAcct = await authReq('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: 'karen.feed@example.invalid', password: 'test-only-password', returnSecureToken: true });
  const kUid = karenAcct.localId, kToken = karenAcct.idToken;
  await put('users/' + kUid, { uid: kUid, email: 'karen.feed@example.invalid',
    name: 'Karen Synthetic', memberId: KAREN, status: 'active',
    teams: ['Kids Church'], adminFor: [], masterAdmin: false });

  const callAs = (token, fn, data) => new Promise((res, rej) => {
    const payload = JSON.stringify({ data: data || {} });
    const r = http.request({ host: 'localhost', port: FN_PORT, method: 'POST',
      path: '/' + PROJECT + '/' + REGION + '/' + fn,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload),
                 Authorization: 'Bearer ' + token } },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => { try { res(JSON.parse(d || '{}')); } catch { res({ raw: d }); } }); });
    r.on('error', rej); r.end(payload);
  });
  const keyOf = (r) => (r && r.result && r.result.key) || '';
  /* The UIDs in a feed. Two feeds a person may subscribe to at once must not
     share one, or the second quietly replaces the first. */
  const uids = (body) => (String(body || '').match(/^UID:.*$/gm) || []).map(l => l.trim());

  console.log('');
  console.log('Karen, her household, and the full rota (18)');

  const kMe = keyOf(await callAs(kToken, 'myCalendarLink', { feed: 'me' }));
  const kHouse = keyOf(await callAs(kToken, 'myCalendarLink', { feed: 'household' }));
  ok('each feed has a link of its own', !!kMe && !!kHouse && kMe !== kHouse,
    'me=' + kMe.slice(0, 8) + '... household=' + kHouse.slice(0, 8) + '...');

  const meFeed = await get(feedUrl(kMe));
  const houseFeed = await get(feedUrl(kHouse));

  ok("Karen's household feed has Oliver's date", /20261108/.test(houseFeed.body || ''),
    houseFeed.status + ', ' + vevents(houseFeed.body || '').length + ' entries');
  /* THE EXACT LINE Karen reads in her month view. 18 gives the shape:
     "Oliver: Drums". Asking only whether the name appears somewhere let a
     real fault through - firstName() had lost a backslash and split on the
     letter s, so "Rota Tester" came out as "Rota Te", and a test looking
     for a name with no lower-case s in it passed anyway. */
  const hSum = (String(houseFeed.body || '').match(/SUMMARY:[^\r\n]+/g) || []);
  ok('  and it says it is Oliver, and what he is doing',
    hSum.includes('SUMMARY:EGBC: Oliver: Drums'),
    hSum.join(' | ').slice(0, 200));
  ok("her \"Just me\" feed does NOT have Oliver's date", !/20261108/.test(meFeed.body || ''),
    meFeed.status + ', ' + vevents(meFeed.body || '').length + ' entries');
  ok("  nor his name anywhere in it", !/Oliver/.test(meFeed.body || ''),
    'Oliver Synthetic');
  ok('  but it does have the Sunday she is on', /20261101/.test(meFeed.body || ''));
  ok('the two feeds do not collide in one calendar',
    uids(houseFeed.body).length > 0 && uids(meFeed.body).length > 0 &&
    !uids(houseFeed.body).some(u => uids(meFeed.body).includes(u)),
    'every UID differs, so subscribing to both keeps both');

  /* ---- the full rota, and what a Worship member may see ------------- */
  const aAll = keyOf(await callAs(idToken, 'myCalendarLink', { feed: 'full:all' }));
  const fullFeed = await get(feedUrl(aAll));
  ok('a Worship member can have the full rota', !!aAll && fullFeed.status === 200,
    fullFeed.status + ', ' + vevents(fullFeed.body || '').length + ' entries');
  ok('  it holds the whole team, not just their own slot',
    /Oliver Synthetic/.test(fullFeed.body || '') && /Drums/.test(fullFeed.body || ''),
    'Drums: Oliver Synthetic');
  ok('  and NOT a Kids Church role they cannot see',
    !/Session Leader/.test(fullFeed.body || '') && !/Karen/.test(fullFeed.body || ''),
    'Session Leader / Karen Synthetic are Kids Church');

  const kKids = keyOf(await callAs(kToken, 'myCalendarLink', { feed: 'full:kids' }));
  const kidsFeed = await get(feedUrl(kKids));
  ok('Karen, who is Kids Church, CAN have the Kids Church rota',
    !!kKids && /Session Leader/.test(kidsFeed.body || ''),
    kidsFeed.status + ', ' + vevents(kidsFeed.body || '').length + ' entries');
  ok('  and her Kids Church rota leaves out the worship roles',
    !/Drums/.test(kidsFeed.body || ''), 'Drums is a Worship role');

  const refused = await callAs(kToken, 'myCalendarLink', { feed: 'full:worship' });
  ok('a rota somebody cannot see is refused in words, not given empty',
    !!(refused && refused.error && /permission/i.test(JSON.stringify(refused.error))),
    JSON.stringify(refused).slice(0, 140));

  /* ---- resetting one link leaves the others working ----------------- */
  const kHouse2 = keyOf(await callAs(kToken, 'myCalendarLink', { feed: 'household', reset: true }));
  ok('resetting the household link gives a different one', !!kHouse2 && kHouse2 !== kHouse,
    kHouse.slice(0, 8) + '... -> ' + kHouse2.slice(0, 8) + '...');
  ok('  the old household address stops working at once',
    (await get(feedUrl(kHouse))).status === 404, 'was 200, now 404');
  ok('  the new one works', (await get(feedUrl(kHouse2))).status === 200);
  ok('  and "Just me" is untouched',
    (await get(feedUrl(kMe))).status === 200 &&
    keyOf(await callAs(kToken, 'myCalendarLink', { feed: 'me' })) === kMe,
    'same key, still 200');

  const listed = await callAs(kToken, 'myCalendarLinks', {});
  const feeds = (listed && listed.result && listed.result.feeds) || {};
  ok('the page can ask which links she already has',
    !!feeds.me && !!feeds.household && !!feeds['full:kids'] && !feeds['full:worship'],
    Object.keys(feeds).join(', ') + '  (full:worship was refused, so there is none)');

  const bad = R.filter(x => !x.v);
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
