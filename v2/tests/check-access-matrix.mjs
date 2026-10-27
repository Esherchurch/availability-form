/* Who sees what, against what Martin decided (FINDINGS-churchhq H-16,
 * step C). Builds the access matrix again (tools/access-matrix.mjs: made-up
 * people signed in on the emulator) and fails on:
 *   - any page the Menu offers that then refuses the person (always a bug);
 *   - any of Martin's decisions the code does not follow (DECIDED there).
 * When Martin has approved the whole table (access-matrix.approved.json),
 * any difference from it fails too.
 *
 *   node tests/check-access-matrix.mjs                 (from v2/, the dev emulators up)
 *   BREAK=rooms     node tests/check-access-matrix.mjs   Book a room offered to every member again
 *   BREAK=preaching node tests/check-access-matrix.mjs   the Preaching plan for anyone on a team again
 *   BREAK=refused   node tests/check-access-matrix.mjs   the Menu offers Church settings to everybody
 *   BREAK=deputy       the safeguarding lead and deputy no longer offered Safeguarding
 *   BREAK=availability the Availability form for core teams only again
 *   BREAK=checkin      Check-in no longer offered to the event's own team
 * Each break must fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, cells, differences } from '../tools/access-matrix.mjs';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BREAK = process.env.BREAK || '';
const R = [];
const ok = (name, pass, detail) => { R.push(!!pass); console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + name + (pass || !detail ? '' : '\n          ' + detail)); };

/* The breaks, each a change to one served file. */
const BREAKS = {
  rooms: ['/egbc-menu.js', "feature: 'roomBookings', leadsOrCore: true,", "feature: 'roomBookings',"],
  preaching: ['/egbc-menu.js', "icon: 'book-open', preaching: true,", "icon: 'book-open', anyTeam: true,"],
  refused: ['/egbc-menu.js', "if (node.master && !who.isMaster) return false;", ''],
  /* The reviewer's findings (27 Oct). */
  deputy: ['/egbc-menu.js', "if (node.sg && !who.isMaster && !who.isSgLead) return false;", "if (node.sg && !who.isMaster) return false;"],
  availability: ['/egbc-menu.js', "feature: 'availability', rotaTeam: true,", "feature: 'availability', core: true,"],
  checkin: ['/egbc-menu.js', "feature: 'events', core: true, admin: true, eventTeam: true,\n        description: 'Check people in", "feature: 'events', core: true, admin: true,\n        description: 'Check people in"],
};
let applied = !BREAK;
const transform = BREAK ? (url, t) => {
  const [u, a, b] = BREAKS[BREAK] || [];
  if (url !== u) return t;
  const crlf = t.includes('\r\n'), n = crlf ? t.replace(/\r\n/g, '\n') : t;
  if (!n.includes(a)) return t;
  applied = true;
  return n.replace(a, b);
} : undefined;

let exitCode = 1;
try {
  const r = await build({ quiet: true, transform });
  if (BREAK) ok('the break "' + BREAK + '" applied', applied);
  const rows = cells(r);

  console.log('\nOffered, then refused (always a bug)');
  const refused = [...rows].flatMap(([url, x]) => r.people.filter((p) => x.row[p.key] === '⚠').map((p) => p.short + ': ' + x.title + ' (' + url + ')'));
  ok('nobody is offered a page that then turns them away', refused.length === 0, refused.slice(0, 8).join('; '));

  console.log('\nMartin\'s decisions');
  for (const d of differences(r)) ok(d.what, d.wrong.length === 0,
    d.wrong.map((w) => w.short + (w.want ? ' is not offered it' : ' is offered it')).join(', '));

  const approved = path.join(V2, 'access-matrix.approved.json');
  if (fs.existsSync(approved)) {
    console.log('\nThe table Martin approved');
    const want = JSON.parse(fs.readFileSync(approved, 'utf8'));
    const diff = [];
    for (const [url, x] of rows) for (const p of r.people) {
      const a = ((want.rows || {})[url] || {})[p.key];
      if (a !== undefined && a !== x.row[p.key]) diff.push(p.short + ' / ' + x.title + ': ' + a + ' -> ' + x.row[p.key]);
    }
    ok('every cell is as approved', diff.length === 0, diff.slice(0, 10).join('; '));
  }
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
