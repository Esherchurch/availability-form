/* Who can read what, read off firestore.rules itself.
 *
 *   node tests/check-access-levels.mjs            (no emulator needed)
 *   node tests/check-access-levels.mjs --write    and rewrite ACCESS-LEVELS.md
 *
 * WHY THIS EXISTS. NEXT-BRIEF 21 widened `status: 'active'` from "on a team"
 * to "in the address book", which changed what active() MEANS at every one of
 * its call sites at once. Everything meant for volunteers was renamed to
 * volunteer() in the same commit - a no-op on the day, because volunteer() is
 * exactly what active() meant before - and only the places section 21 names
 * were left reading active().
 *
 * The danger is not the change. It is the NEXT change: somebody adding a rule
 * a year from now, writing active() because that is what the rule above it
 * says, and quietly publishing a team's material to the whole church.
 *
 * So this reads the rules and reports every read rule by the widest person it
 * admits. It fails if a collection on the volunteers-only list has drifted to
 * active(), and it fails if a collection section 21 opens to Attenders has
 * drifted the other way. The lists below are the decision; the file is the
 * evidence; this is what keeps the two together.
 */
import fs from 'node:fs';

const SRC = fs.readFileSync('firestore.rules', 'utf8');
const lines = SRC.split(/\r?\n/);

/* Section 21 says Attenders get these. Everything else that is not public and
   not somebody's own record is for volunteers. */
const ATTENDERS = [
  ['hubPages', 'the hub page registry - an Attender needs the hub at all'],
  ['news', 'church notices, and the "I have read it" button'],
  ['resources', 'the resource shelf'],
  ['sites', 'Book a room'],
  ['rooms', 'Book a room'],
  ['bookableResources', 'Book a room'],
  ['venues', 'Book a room'],
  ['bookingSettings', 'Book a room'],
  ['menus', 'what is on the menu, for a hire enquiry'],
  ['groupsSettings', 'small groups'],
  ['smallGroups', 'small groups - this is what resolves F-103'],
];

/* Volunteers only: on a team, or administering something. This is what
   active() meant before section 21. */
const VOLUNTEERS = [
  ['availability', 'who can serve when'],
  ['availabilityRequests', 'the rota'],
  ['rotaSignoff', 'the rota'],
  ['events', 'the rota, and who is serving on it'],
  ['services', 'service plans'],
  ['songSummaries', "the song list for a Sunday - had no rule at all until 9 Oct 2026"],
  ['songs', 'the song library'],
  ['teamContent', 'team panels'],
  ['videoSections', 'the team video library'],
  ['kb_troubleshoot_av', 'AV'],
  ['kb_howto_av', 'AV'],
  ['kb_playthrough', 'Worship'],
  ['kb_training_worship', 'Worship'],
  ['inventory', 'AV'],
  ['av_schematic', 'AV'],
  ['schedules', 'AV'],
  ['portal', 'older shared team content'],
  ['pageContent', 'older shared team content'],
  ['training_portal', 'the practice copies - and this one is a WRITE as well'],
  ['contacts', 'hirer and sign-up contacts: name, email, telephone, isMinor'],
  ['eventChecklists', "the admin's side of an event"],
  ['checklistTemplates', "the admin's side of an event"],
  ['eventLeaders', 'who leads an event'],
  ['safeguardingSettings', 'safeguarding'],
  ['counters', 'invoice numbering'],
  ['kidsSettings', 'Kids Church'],
  ['kidsGroups', 'Kids Church'],
  ['kidsTerms', 'Kids Church term dates'],
  ['screenPages', 'paging a parent on the service screen'],
];

/* The projection PC, per FINDINGS-churchshow.md R4. */
const DEVICE = ['songs', 'services', 'songSummaries', 'events'];

/* The read rule for one collection, as the file has it. A `match` block can
   hold several allow lines; this takes the ones that mention read, get or
   list. */
function readRules(name) {
  const open = lines.findIndex(l => new RegExp('^\\s*match /' + name + '/\\{').test(l));
  if (open < 0) return null;
  const out = [];
  let depth = 0;
  for (let i = open; i < lines.length; i++) {
    const L = lines[i];
    depth += (L.match(/\{/g) || []).length - (L.match(/\}/g) || []).length;
    if (/^\s*allow\s+[^:]*\b(read|get|list)\b/.test(L)) {
      /* An allow can wrap over several lines. */
      let clause = L.trim();
      let j = i;
      while (!/;\s*$/.test(clause) && j + 1 < lines.length) { j++; clause += ' ' + lines[j].trim(); }
      out.push({ line: i + 1, clause: clause.replace(/\s+/g, ' ') });
    }
    if (depth <= 0 && i > open) break;
  }
  return out.length ? out : null;
}

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 220) : ''))); };

console.log('\nvolunteers only - a team, or administering something');
const volRows = [];
for (const [name, why] of VOLUNTEERS) {
  const rs = readRules(name);
  if (!rs) { ok(name + ': the rule is still there', false, 'no match /' + name + '/ block found'); continue; }
  const all = rs.map(r => r.clause).join(' ');
  /* A bare active() here is the drift this check exists for - but
     `active() && <something> == request.auth.uid` is not drift, it is
     somebody reading their OWN row, which an Attender should be able to do.
     screenPages has exactly that clause, and the first version of this check
     reported it as a leak.

     So the own-identity conjunctions come out first, and whatever is left has
     to be free of active(). Note the shape: it forgives active() only where it
     is ANDed with an identity test, so an active() sitting beside one with an
     OR is still flagged - that would be a second, wider door. */
  const own = all
    .replace(/active\(\)\s*&&[^|)]*?request\.auth\.uid/g, 'OWN')
    .replace(/active\(\)\s*&&[^|)]*?me\(\)\.get\('memberId'[^|)]*?\)/g, 'OWN');
  const bare = /(^|[^.\w])active\(\)/.test(own);
  ok(name + ' is for volunteers, not every Attender', !bare, all);
  volRows.push([name, why, rs]);
}

console.log('\nAttenders - section 21 opens these');
const attRows = [];
for (const [name, why] of ATTENDERS) {
  const rs = readRules(name);
  if (!rs) { ok(name + ': the rule is still there', false, 'no match /' + name + '/ block found'); continue; }
  const all = rs.map(r => r.clause).join(' ');
  ok(name + ' is open to an Attender', /active\(\)/.test(all) || /isAttender\(\)/.test(all), all);
  attRows.push([name, why, rs]);
}

console.log('\nthe address book, the form stores, and the projection PC');
const book = (readRules('addressBook') || []).map(r => r.clause).join(' ');
ok('the address book is NOT readable by anyone on the internet', !/if true/.test(book), book);
ok('nor by every Attender - only volunteers, admins, and your own record',
  /volunteer\(\)/.test(book) && /bookIsMine\(personId\)/.test(book), book);

for (const store of ['formSessions', 'formRateLimit', 'deviceCodes']) {
  const r = (readRules(store) || []).map(x => x.clause).join(' ');
  ok(store + ' is shut to everything but the Admin SDK', /if false/.test(r), r || '(no block)');
}

ok('churchShow() checks the device document, not just the claim',
  /function churchShow\(\)[\s\S]{0,400}devices\/\$\(request\.auth\.uid\)[\s\S]{0,200}active/.test(SRC));
for (const name of DEVICE) {
  const r = (readRules(name) || []).map(x => x.clause).join(' ');
  ok('the projection PC may read ' + name, /churchShow\(\)/.test(r), r);
}
const dev = (readRules('devices') || []).map(x => x.clause).join(' ');
ok('what is paired is visible to an admin and nobody else', /isAdmin\(\)/.test(dev), dev);

console.log('\nsign-ups check who an event is for (F-115)');

/* The events window's own three checks for this are written to skip when the
   clause is absent, so removing it leaves their suite green - measured, at
   750/750 with it gone. This reads the file instead. */
const signupClause = (readRules('signups') || []).map(r => r.clause).join(' ');
const signupCreate = (() => {
  const i = lines.findIndex(l => /^\s*match \/signups\//.test(l));
  if (i < 0) return '';
  let out = '';
  for (let j = i; j < lines.length && j < i + 40; j++) {
    if (/^\s*allow create:/.test(lines[j])) {
      out = lines[j].trim();
      let k = j;
      while (!/;\s*$/.test(out) && k + 1 < lines.length) { k++; out += ' ' + lines[k].trim(); }
      break;
    }
  }
  return out.replace(/\s+/g, ' ');
})();

ok('there is a create rule for sign-ups at all', signupCreate !== '', signupCreate);
ok('F-115: SIGNING UP CHECKS WHO THE EVENT IS FOR',
  /canSignUpTo\(request\.resource\.data\.calEventId\)/.test(signupCreate), signupCreate);
ok('and still checks the shape and the places',
  /signupShape\(\)/.test(signupCreate) && /takesItsPlaces\(\)/.test(signupCreate), signupCreate);

console.log('\nyouth access - where youthGranted() may and may not appear');

/* The drift that would matter most is somebody adding `|| youthGranted()` to
   the address book, or to a write. Both are one keystroke, and neither would
   fail any other check - so this reads the file and names the only seven
   places the helper is allowed to be. YOUTH-ACCESS.md says why each.

   It also catches the opposite, which is the fault the reviewing window
   found: the helper defined, and used by nothing at all. */
const YOUTH_MAY_READ = ['songs', 'services', 'events', 'portal',
                        'kb_playthrough', 'kb_training_worship', 'worshipBoardState',
                        /* The moderated boards' queue. A child posts here and
                           reads their own back; the group's adults read the
                           queue. YOUTH-ACCESS.md, and A-059. */
                        'boardSuggestions',
                        /* NAMED HELPERS, not a blanket pass for helpers: a new
                           one wrapping youthGranted() still fails this, which
                           is the point. youthInGroup composes it and is itself
                           only used by the collections above. */
                        'fn:youthInGroup'];

const youthLines = [];
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  /* youthInGroup() counts too. It composes youthGranted() and is how the two
     moderated boards and their queue are gated, so a scan looking only for
     youthGranted() reported boardSuggestions as ungated when it is not. */
  if (!/youthGranted\(\)|youthInGroup\(/.test(t)) continue;
  /* the definitions themselves, and the comments explaining them, are not
     grants */
  if (t.startsWith('//') || t.startsWith('function youthGranted')
      || t.startsWith('function youthInGroup')) continue;
  /* WHICH MATCH BLOCK, OR WHICH HELPER. Walking back to the nearest `match`
     is wrong for a helper defined between two match blocks: youthInGroup()
     sits after availabilityRequests and was reported as a grant inside it.
     So look for a function first - if the nearest thing above is an open
     function body, this line belongs to that function and is named for it. */
  let coll = '(top level)';
  for (let j = i; j >= 0; j--) {
    const fn = lines[j].match(/^\s*function\s+(\w+)\s*\(/);
    if (fn) { coll = 'fn:' + fn[1]; break; }
    const m = lines[j].match(/^\s*match \/([A-Za-z_]+)\//);
    if (m) { coll = m[1]; break; }
  }
  youthLines.push({ line: i + 1, coll, text: t });
}

ok('youthGranted() is used by something at all', youthLines.length > 0,
  'defined, and used nowhere - which is exactly the launch blocker it was');

for (const name of YOUTH_MAY_READ)
  ok('a young person may read ' + name, youthLines.some(y => y.coll === name),
    'found in: ' + youthLines.map(y => y.coll).join(', '));

const strays = youthLines.filter(y => !YOUTH_MAY_READ.includes(y.coll));
ok('and youthGranted() appears NOWHERE ELSE', strays.length === 0,
  strays.map(y => y.coll + ' at line ' + y.line).join('; '));

const youthWrites = youthLines.filter(y => /allow[^:]*\b(write|create|update|delete)\b/.test(y.text));
ok('IT GRANTS NO WRITE, ANYWHERE', youthWrites.length === 0,
  youthWrites.map(y => y.coll + ' at line ' + y.line).join('; '));

const bookClause = (readRules('addressBook') || []).map(r => r.clause).join(' ');
ok('NEVER the address book - no email addresses for under-18s, ever',
  !/youthGranted/.test(bookClause), bookClause);

const board = (readRules('worshipBoardState') || []).map(r => r.clause).join(' ');
ok('and only the YOUTH board, not the worship or Kids Church one',
  /youthGranted\(\) && boardId == 'youth'/.test(board), board);

/* ---- the record ------------------------------------------------------- */

if (process.argv.includes('--write')) {
  const row = ([name, why, rs]) =>
    '| `' + name + '` | ' + why + ' | ' + rs.map(r => '`' + r.clause.replace(/^allow /, '').replace(/\|/g, '\\|') + '` <br>(line ' + r.line + ')').join('<br>') + ' |\n';
  let md = '<!-- Written by tests/check-access-levels.mjs --write. Do not edit by hand:\n'
    + '     it is generated from firestore.rules, which is the point of it. -->\n\n'
    + '# Who can read what\n\n'
    + 'Generated from `firestore.rules`. `node tests/check-access-levels.mjs` checks\n'
    + 'the file still says this and fails if it has drifted.\n\n'
    + '## The four levels (NEXT-BRIEF §21, Martin, 9 October 2026)\n\n'
    + '| Level | How the data says so | Rule function |\n|---|---|---|\n'
    + '| Pending | signed in, no address book record carries their verified address | none - `active()` is false |\n'
    + '| Attender | a record does, not archived, not a child’s record | `isAttender()`, and `active()` |\n'
    + '| Church member | that record also has the office’s **Church member** tick | `isChurchMember()` |\n'
    + '| Team member | that record has teams in `markers` | `onTeam(team)`, and `volunteer()` |\n\n'
    + '**`active()` changed meaning and kept its name.** It used to mean "on a team\n'
    + 'or administering something"; it now means "in the address book". That is\n'
    + '`volunteer()` now, and every rule meant for volunteers was renamed to it in\n'
    + 'the same commit, which moved nothing on the day.\n\n'
    + '## For volunteers only\n\n'
    + '| Collection | What it is | The rule |\n|---|---|---|\n' + volRows.map(row).join('')
    + '\n## Open to any Attender\n\n'
    + '| Collection | What it is | The rule |\n|---|---|---|\n' + attRows.map(row).join('')
    + '\n## The address book\n\n```\n' + (readRules('addressBook') || []).map(r => r.clause).join('\n') + '\n```\n\n'
    + 'It was `allow read: if true` until 9 October 2026, for the availability form.\n'
    + 'See PRIVACY-OPEN-COLLECTIONS.md.\n\n'
    + '## The projection PC\n\n`churchShow()` - the claim AND `devices/{uid}.active`, so\n'
    + 'Disconnect on the hub takes effect at once rather than when the token expires.\n'
    + 'It may read ' + DEVICE.map(d => '`' + d + '`').join(', ') + ', and write nothing anywhere.\n';
  fs.writeFileSync('ACCESS-LEVELS.md', md);
  console.log('\nACCESS-LEVELS.md written');
}

const failed = R.filter(v => !v).length;
console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
process.exit(failed ? 1 : 0);
