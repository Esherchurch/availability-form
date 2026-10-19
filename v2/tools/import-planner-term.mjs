/* ===================================================================
   A term of plans from a Word table, into the session planner (Martin,
   19 Oct 2026: Karen's "Autumn 2026 Church rota"). Events window.
   ===================================================================
   Reads the table in the .docx - Date | Lesson | <programme> lesson code |
   Team | Additional info - and makes one planSessions document per row for
   the group named:
     - the date (d.m.yy), the lesson title, the lesson code, and the link
       the planner would fill from the group's programme ("{code}" in the
       programme's link becomes the code)
     - SPECIAL WEEKS, read from the table itself, nothing about one church:
         a row with no code but a team  -> a special week (the text as the
                                           note, e.g. nativity preparation)
         a row with no code and no team -> no session that week (special
                                           'none', the text as the reason:
                                           a family service, no service)
     - the group's starting parts, as "Add a Sunday" makes them
     - WHO IS ON AND AWAY come from the rota and the availability form, as
       the planner's "Fill in from the rota" does. NOT A NAME IS READ FROM
       THE DOCUMENT: the Team and Additional info columns are only looked at
       to see whether a row has a team.
   SAFE BY DEFAULT.
     - With no --write it only prints what it would make (the dry run).
     - Against the real database it writes nothing without --live.
     - Each plan's id is term_<group>_<date>, and a group that already has a
       plan for that date is left alone: running it twice makes nothing twice.
   HOW IT IS RUN (from the v2 folder):
     node tools/import-planner-term.mjs --docx "<file.docx>" --group <planGroups id>                 the dry run
     node tools/import-planner-term.mjs ... --write                (on the emulator: FIRESTORE_EMULATOR_HOST set)
     gcloud auth application-default login                          (once, the church account)
     node tools/import-planner-term.mjs ... --live --write
   Options: --project ID (default egbc-worship-planner), --programme NAME (default: the
   group's first programme)
   =================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i === -1 ? '' : String(argv[i + 1] || ''); };

/* ---- the .docx: a zip; only word/document.xml is wanted ---- */
export function docxXml(file) {
  const b = fs.readFileSync(file);
  let e = b.length - 22; while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a .docx (no zip directory).');
  let p = b.readUInt32LE(e + 16); const n = b.readUInt16LE(e + 10);
  for (let i = 0; i < n; i++) {
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nlen = b.readUInt16LE(p + 28), xlen = b.readUInt16LE(p + 30), clen = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nlen);
    if (name === 'word/document.xml') {
      const ln = b.readUInt16LE(off + 26), lx = b.readUInt16LE(off + 28), data = b.subarray(off + 30 + ln + lx, off + 30 + ln + lx + csize);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error('No word/document.xml in the .docx.');
}
const unxml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
/* The first table, as rows of cell texts. */
export function tableRows(xml) {
  const tbl = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/) || [''])[0];
  return (tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map(tr => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [])
    .map(tc => unxml((tc.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')).replace(/\s+/g, ' ').trim()));
}
/* The plan rows: { date, title, code, special } - never a name. */
export function planRows(rows) {
  const head = (rows[0] || []).map(h => h.toLowerCase());
  const ci = (re) => head.findIndex(h => re.test(h));
  const cDate = ci(/date/), cLesson = ci(/lesson$|^lesson|title/), cCode = ci(/code/);
  if (cDate < 0 || cLesson < 0) throw new Error('The table needs Date and Lesson columns (found: ' + rows[0].join(' | ') + ').');
  const rest = head.map((_, i) => i).filter(i => i !== cDate && i !== cLesson && i !== cCode);
  return rows.slice(1).map(r => {
    const m = String(r[cDate] || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (!m) return null;
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const date = y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    const text = String(r[cLesson] || '').trim();
    const code = cCode >= 0 ? String(r[cCode] || '').trim().toUpperCase() : '';
    const hasTeam = rest.some(i => String(r[i] || '').trim());   // looked at, never kept
    if (code && /^[A-Z]{1,4}\d{1,4}$/.test(code)) return { date, title: text, code, special: '' };
    return hasTeam ? { date, title: '', code: '', special: text } : { date, title: text, code: '', special: 'none' };
  }).filter(Boolean);
}

/* Kids Church's rota roles, as egbc-auth.js's roleTeam() has them. */
const KIDS_ROLES = ['Session Leader', 'Leader (Younger)', 'Leader (Older)', 'Leader (Creche)', 'Assistant (Younger)', 'Assistant (Older)', 'Assistant (Creche)', 'Helper 1', 'Helper 2', 'Helper 3', 'Helper 4', 'Helper 5'];
const AV_ROLES_HINT = /sound|projection|camera|stream|av\b|lighting/i;
function roleTeam(r) { if (KIDS_ROLES.includes(r) || /^Helper \d+$/.test(r)) return 'Kids Church'; return AV_ROLES_HINT.test(r) ? 'AV Team' : 'Worship Team'; }

async function onAndAway(db, group, date, markers) {
  const evs = (await db.collection('events').where('date', '==', date).get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(e => !e.archived);
  const on = [];
  evs.forEach(e => Object.keys(e.assignments || {}).forEach(role => {
    if (group.teamName && roleTeam(role) !== group.teamName) return;
    [].concat(e.assignments[role] || []).forEach(a => { const id = a && (a.id || a.memberId); if (id && !on.includes(String(id))) on.push(String(id)); });
  }));
  const team = Object.keys(markers).filter(id => (markers[id] || []).includes(group.teamName)).concat(group.leaderIds || []);
  const away = [];
  for (const e of evs.slice(0, 10)) {
    (await db.collection('availability').where('eventId', '==', e.id).get()).docs.forEach(d => {
      const a = d.data();
      if ((a.status === 'unavailable' || a.status === 'not-avail') && (team.includes(a.memberId) || on.includes(a.memberId)) && !away.includes(a.memberId)) away.push(a.memberId);
    });
  }
  return { onIds: on.filter(i => !away.includes(i)), awayIds: away };
}

async function main() {
  const file = opt('--docx'), gid = opt('--group');
  if (!file || !gid) { console.log('Usage: node tools/import-planner-term.mjs --docx "<file.docx>" --group <planGroups id> [--write] [--live]'); process.exit(2); }
  const rows = planRows(tableRows(docxXml(file)));
  const WRITE = flag('--write'), LIVE = flag('--live'), EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (WRITE && !EMU && !LIVE) { console.log('Not on the emulator: add --live to write to the real database.'); process.exit(2); }
  const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
  const { initializeApp, applicationDefault } = fnRequire('firebase-admin/app');
  const { getFirestore } = fnRequire('firebase-admin/firestore');
  const project = opt('--project') || 'egbc-worship-planner';
  initializeApp(EMU ? { projectId: project } : { projectId: project, credential: applicationDefault() });
  const db = getFirestore();
  const g = await db.collection('planGroups').doc(gid).get();
  if (!g.exists) throw new Error('No planner group ' + gid + '.');
  const group = g.data();
  const progName = opt('--programme') || ((group.programmes || [])[0] || {}).name || '';
  const prog = (group.programmes || []).find(p => p.name === progName) || null;
  const have = new Set((await db.collection('planSessions').where('groupId', '==', gid).get()).docs.map(d => d.data().date));
  const markers = {};
  (await db.collection('addressBook').get()).docs.forEach(d => { markers[d.id] = d.data().markers || []; });
  const parts = (group.parts && group.parts.length ? group.parts : ['Welcome', 'Game', 'Story', 'Video', 'Craft', 'Worship']);
  let made = 0, skipped = 0;
  console.log((WRITE ? (LIVE ? 'WRITING TO THE REAL DATABASE' : 'Writing to the emulator') : 'DRY RUN (nothing written)') + ': ' + group.name + ' (' + gid + '), ' + rows.length + ' rows' + (prog ? ', programme ' + prog.name : ''));
  for (const r of rows) {
    const id = 'term_' + gid + '_' + r.date;
    const what = r.special === 'none' ? 'NO SESSION: ' + r.title : r.special ? 'SPECIAL: ' + r.special : (r.code + ' ' + r.title);
    if (have.has(r.date)) { skipped++; console.log('  ' + r.date + '  already planned - left alone   (' + what + ')'); continue; }
    const oa = await onAndAway(db, group, r.date, markers);
    const doc = {
      groupId: gid, date: r.date, special: r.special, title: r.title,
      programme: r.code && prog ? prog.name : '', lessonCode: r.code,
      lessonLink: r.code && prog && prog.link ? prog.link.replace('{code}', r.code) : '',
      passage: null, onIds: oa.onIds, awayIds: oa.awayIds,
      parts: r.special === 'none' ? [] : parts.map((k, i) => ({ id: 'p' + (i + 1), kind: k, title: k, minutes: 10, notes: '', links: [], files: [], bring: [], show: [] })),
      updatedBy: 'import', updatedByName: 'Imported from the term\'s rota', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString()
    };
    console.log('  ' + r.date + '  ' + what.padEnd(46) + (doc.lessonLink ? '  ' + doc.lessonLink : '') + '   on ' + oa.onIds.length + ', away ' + oa.awayIds.length);
    if (WRITE) {
      try { await db.collection('planSessions').doc(id).create(doc); made++; }
      catch (e) { if (String(e.code) === '6' || /already exists/i.test(String(e.message))) { skipped++; } else throw e; }
    } else made++;
  }
  console.log((WRITE ? 'Made ' : 'Would make ') + made + ', left alone ' + skipped + '.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error('Stopped: ' + (e.message || e)); process.exit(1); });
