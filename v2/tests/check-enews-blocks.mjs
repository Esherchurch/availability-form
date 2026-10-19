/* The e-news's blocks: what goes in, and what is never in the public copy
 * (FINDINGS-comms C-7, C-8, C-9, C-11). No browser, no emulator.
 *
 *   node tests/check-enews-blocks.mjs      (from v2/)
 *
 * Asks egbc-mailblocks.js directly, with made-up events and notices. Then
 * THE DELIBERATE BREAKS: each one is a small edit to a copy of the file
 * (never the file itself) that the checks must catch - for example letting
 * members-only blocks into the public copy. A break nobody catches is
 * reported as a failure, so a check that cannot fail does not pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const V2 = path.resolve('.');
const SRC = fs.readFileSync(path.join(V2, 'egbc-mailblocks.js'), 'utf8');

function load(src) {
  const module = { exports: {} };
  vm.runInNewContext(src, { module, exports: module.exports, Intl, Date, Math, String, Object, Array, JSON, encodeURIComponent, isNaN });
  return module.exports;
}

/* ---- made-up data (never real records) --------------------------------- */
const NOW = new Date('2026-10-19T09:00:00Z');   /* a Monday */
const ev = (id, o) => Object.assign({ id, title: 'Event ' + id, status: 'confirmed', startLocal: '2026-10-24T18:30', startUtc: Date.UTC(2026, 9, 24, 17, 30), image: 'https://example.invalid/' + id + '.gif' }, o);
const EVENTS = [
  ev('pub', { title: 'Harvest supper', visibility: 'public', signupOn: true, labels: ['Harvest'] }),
  ev('mem', { title: 'Members prayer evening', visibility: 'members' }),
  ev('cm', { title: 'Church members meeting', visibility: 'churchMembers' }),
  ev('team', { title: 'Worship team rehearsal', visibility: 'team', teams: ['Worship'] }),
  ev('unl', { title: 'Tuesday support group', visibility: 'unlisted' }),
  ev('cancel', { title: 'Cancelled quiz', visibility: 'public', status: 'cancelled' }),
  ev('held', { title: 'Held booking', visibility: 'public', status: 'pending' }),
  ev('rota', { title: 'Morning Worship', visibility: 'public', source: 'rota' }),
  ev('late', { title: 'Far-off carols', visibility: 'public', startLocal: '2026-12-20T18:00', startUtc: Date.UTC(2026, 11, 20, 18) }),
  ev('past', { title: 'Last week lunch', visibility: 'public', startLocal: '2026-10-12T12:00', startUtc: Date.UTC(2026, 9, 12, 11) }),
  ev('utc', { title: 'Film club', visibility: 'public', startLocal: undefined, startUtc: Date.UTC(2026, 9, 30, 15) })
];
const NOTICES = [
  { id: 'n1', title: 'Car park closed Saturday', body: '<p>Please park on the road.</p>', teams: [] },
  { id: 'n2', title: 'Worship team only', body: '<p>Bring your folders.</p>', teams: ['Worship'] },
  { id: 'n3', title: 'Old notice', body: '<p>Gone.</p>', teams: [], until: '2026-10-01' }
];
const CHURCH = { name: 'Synthetic Green Church', address: '1 Test Lane, Testtown TT1 1TT', charityNo: '0000001', email: 'office@example.invalid' };
const ZOOM = 'Passcode 271828';

function checks(M) {
  const R = [];
  const ok = (n, v, x) => R.push({ n, v: !!v, x });
  const blocks = M.draft({ now: NOW, events: EVENTS, notices: NOTICES, sunday: { title: 'Morning Worship', when: 'Sunday 25 October · 10am', speaker: 'Sam Taylor' }, base: 'https://example.invalid/v2' });
  const ids = blocks.filter(b => b.type === 'event').map(b => b.eventId);
  const byId = id => blocks.find(b => b.eventId === id);
  ok('draft: a public event goes in, for everyone', byId('pub') && byId('pub').members !== true);
  ok('draft: a members event goes in as members-only', byId('mem') && byId('mem').members === true);
  ok('draft: a church-members event goes in as members-only', byId('cm') && byId('cm').members === true);
  ok('draft: a team event never goes in', !ids.includes('team'), ids);
  ok('draft: a NOT LISTED event never goes in (the AA case)', !ids.includes('unl'), ids);
  ok('draft: cancelled and held events never go in', !ids.includes('cancel') && !ids.includes('held'), ids);
  ok('draft: services come from the Sunday block, not twice', !ids.includes('rota') && blocks.some(b => b.type === 'sunday' && b.speaker === 'Sam Taylor'));
  ok('draft: only the next 14 days', !ids.includes('late') && !ids.includes('past'), ids);
  ok('draft: an event with only startUtc is placed by London time', byId('utc') && /Friday 30 October · 3pm/.test(byId('utc').when), byId('utc') && byId('utc').when);
  ok('draft: London time from startLocal', byId('pub') && /Saturday 24 October · 6:30pm/.test(byId('pub').when), byId('pub') && byId('pub').when);
  ok('draft: sign-up button only where sign-ups are on', byId('pub').buttonUrl.endsWith('/signup.html?event=pub') && !byId('mem').buttonUrl);
  const nb = blocks.find(b => b.type === 'notices');
  ok('draft: church-wide notices only, not a team’s or an expired one', nb && nb.items.map(i => i.id).join() === 'n1', nb && nb.items.map(i => i.id));

  /* Members-only, rendered. Add Val's Zoom block, members-only. */
  const issue = { subject: 'Test', template: 'classic', blocks: blocks.concat([{ type: 'text', title: 'Prayer on Zoom', html: '<p>' + ZOOM + '</p>', members: true }]) };
  const pub = M.render(issue, { version: 'everyone', church: CHURCH, unsubscribeUrl: M.PLACEHOLDER, webUrl: 'https://example.invalid/v2/enews.html?issue=x' });
  const mem = M.render(issue, { version: 'members', church: CHURCH, unsubscribeUrl: M.PLACEHOLDER });
  ok('public copy: no members-only words (Zoom passcode)', !pub.includes(ZOOM));
  ok('public copy: no members-only event', !pub.includes('Members prayer evening') && !pub.includes('Church members meeting'));
  ok('public copy: no notices (members-only until ticked)', !pub.includes('Car park closed'));
  ok('members copy: has the passcode and members events', mem.includes(ZOOM) && mem.includes('Members prayer evening'));
  ok('both copies: the public event card with its words as text', pub.includes('Harvest supper') && mem.includes('Harvest supper'));
  ok('an unknown version is treated as public', !M.render(issue, { version: 'admin', church: CHURCH }).includes(ZOOM));

  ok('an empty verse (drafted for Val) draws nothing', !pub.includes('“”') && M.render({ blocks: [{ type: 'verse', text: '  ' }] }, {}).indexOf('“') < 0);

  /* Every e-news can be left (C-11), and says who sent it. */
  const empty = M.render({ blocks: [] }, { version: 'everyone', church: CHURCH, unsubscribeUrl: M.PLACEHOLDER });
  ok('unsubscribe link in every copy, even an empty one', [pub, mem, empty].every(h => h.includes('href="' + M.PLACEHOLDER + '"') && />Unsubscribe</.test(h)));
  ok('footer: name, address and charity number', [pub, mem].every(h => h.includes('Synthetic Green Church') && h.includes('1 Test Lane') && h.includes('0000001')));
  const viaBlock = M.render({ blocks: [{ type: 'footer' }, { type: 'text', html: '' }] }, { church: CHURCH, unsubscribeUrl: 'https://example.invalid/u?t=1' });
  ok('a real unsubscribe address is kept', viaBlock.includes('href="https://example.invalid/u?t=1"'));

  /* Nothing dangerous reaches an inbox. */
  const bad = M.render({ blocks: [
    { type: 'button', label: 'Click', url: 'javascript:alert(1)' },
    { type: 'text', html: '<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror=y><a href="javascript:bad()">l</a><a href="https://ok.invalid/">ok</a></p>' },
    { type: 'event', title: '<b>Bold</b>', imageUrl: 'data:image/png;base64,AAAA' }
  ] }, { church: CHURCH });
  ok('no javascript: links', !/javascript:/i.test(bad));
  ok('no scripts, no event handlers, no pasted images', !/<script|onclick|onerror|<img src=x/i.test(bad));
  ok('safe links kept', bad.includes('href="https://ok.invalid/"'));
  ok('titles are text, not HTML', bad.includes('&lt;b&gt;Bold&lt;/b&gt;') && !bad.includes('data:image'));

  /* The two looks, and a church's own colours (decision 4). */
  const green = M.render({ template: 'green', blocks: [{ type: 'section', label: 'Coming up' }] }, { church: CHURCH });
  const own = M.render({ template: 'classic', colours: { bar: '#123456', page: 'red; background:url(x)' }, blocks: [{ type: 'section', label: 'Coming up' }] }, { church: CHURCH });
  ok('green look uses the hub colour', green.includes('bgcolor="#3d6263"'));
  ok('classic look uses the orange bar', pub.includes('bgcolor="#fe7e07"'));
  ok('a church colour is used; a bad one is ignored', own.includes('bgcolor="#123456"') && !own.includes('url(x)'));

  /* The Compiler's snippets are the Compiler's HTML (decision 1). */
  const EB = fs.readFileSync(path.join(V2, 'EmailBuilder2.html'), 'utf8');
  const s = M.snippet;
  ok('Compiler snippets match EmailBuilder2.html',
    EB.includes('<td align="center" bgcolor="#3d6263" style="border-radius:9px;">') && s.button('A', 'https://x.invalid').includes('<td align="center" bgcolor="#3d6263" style="border-radius:9px;">') &&
    EB.includes(s.divider()) && EB.includes(s.spacer()) &&
    EB.includes('<td width="50%" valign="top" style="padding:0 10px 0 0;">Left column…</td>'.replace('…', '…')) && s.columns().includes('Left column'));
  return R;
}

/* ---- the run ------------------------------------------------------------ */
const R = checks(load(SRC));
R.forEach(r => console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))));

/* ---- deliberate breaks: each must turn at least one named check red ---- */
const BREAKS = [
  ['members-only blocks let into the public copy', "if (b.members === true && version !== 'members') return false;", '', 'public copy: no members-only words'],
  ['not-listed events allowed in', "return null;   /* 'team', 'unlisted'", "return 'public';   /* 'team', 'unlisted'", 'NOT LISTED'],
  ['the unsubscribe link dropped from the footer', "'<a href=\"' + (unsub === PLACEHOLDER ? PLACEHOLDER : esc(unsub)) + '\" style=\"color:' + t.footerText + ';\">Unsubscribe</a>' +", '', 'unsubscribe link in every copy'],
  ['javascript: links allowed', "if (/^https?:\\/\\/[^\\s<>\"]+$/i.test(u)", "if (/^(https?|javascript):[^\\s<>\"]+$/i.test(u)", 'no javascript: links'],
  ['team notices let in', 'if ((n.teams || []).length) return false;', '', 'church-wide notices only'],
  ['an empty verse drawn', "if (!String(b.text || '').trim()) return '';", '', 'an empty verse'],
  ['the charity number dropped', "c.charityNo ? 'Registered charity no ' + esc(c.charityNo) : '',", "'',", 'footer: name, address and charity number']
];
let caught = 0;
for (const [what, from, to, expect] of BREAKS) {
  if (!SRC.includes(from)) { console.log('  FAIL  break "' + what + '": the line to break is not in egbc-mailblocks.js any more - update the break'); R.push({ v: false }); continue; }
  let red = [];
  try { red = checks(load(SRC.replace(from, to))).filter(r => !r.v).map(r => r.n); } catch (e) { red = ['(threw) ' + e.message]; }
  const hit = red.some(n => n.includes(expect));
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '  (red: ' + red.filter(n => n.includes(expect)).join('; ') + ')' : '  - NOTHING CAUGHT IT'));
  if (hit) caught++; else R.push({ v: false });
}
const fails = R.filter(r => !r.v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' checks, ' + caught + '/' + BREAKS.length + ' breaks caught');
process.exit(fails ? 1 : 0);
