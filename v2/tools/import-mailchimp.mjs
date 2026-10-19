/* ===================================================================
   One-off: the Mailchimp list into the e-news subscribers, with consent
   (comms window, 19 Oct 2026; FINDINGS-comms C-14)
   ===================================================================

   WHAT MARTIN EXPORTS. In Mailchimp: Audience -> All contacts -> Export
   Audience. It arrives as a .zip. Right-click it -> Extract All. The
   folder holds up to four .csv files; this reads three of them by name:
     subscribed_...    -> subscribed, with Mailchimp's own sign-up and
                          confirm times kept as the record of consent
     unsubscribed_...  -> kept as "unsubscribed" (never emailed)
     cleaned_...       -> kept as "bounced" (Mailchimp found the address
                          dead; never emailed)
   (nonsubscribed_... is people who never joined the list: left alone.)

   THE RULES IT KEEPS.
     - Somebody who has unsubscribed, bounced or complained in the hub is
       NEVER put back by an import, whatever Mailchimp says.
     - Somebody subscribed in the hub whom Mailchimp has as unsubscribed
       is unsubscribed: the most recent "no" wins.
     - Nobody is ever deleted. The address book is never touched.
     - Running it twice changes nothing the second time ("0 written").

   SHUT UNTIL SWITCH-OVER (C-1). It refuses to write while
   churchSettings/launch.rulesLocked is not true: before the locked rules,
   anybody could read the list it would make.

   SAFE BY DEFAULT.
     - With no --write it only reads, and prints what it WOULD do.
     - Against the real database it does nothing at all without --live.
     - Addresses are printed shortened (al…@example.org), so the output
       can be pasted to a window.

   HOW MARTIN RUNS IT (from the v2 folder), on switch-over day, after the
   rules deploy and after "Open the private forms":
     gcloud auth application-default login                (once, the church account)
     node tools/import-mailchimp.mjs "C:\path\to\the\folder" --live           (look)
     node tools/import-mailchimp.mjs "C:\path\to\the\folder" --live --write   (write)
   =================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const PROJECT = 'egbc-worship-planner';

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const LIVE = argv.includes('--live');
const DIR = argv.find(a => !a.startsWith('--')) || '';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';

/* THE DOOR, before anything is loaded or connected. */
if (!DIR || !fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) {
  console.error('Give the folder Mailchimp\'s export was extracted into, for example:\n'
    + '  node tools/import-mailchimp.mjs "C:\\Users\\marti\\Downloads\\members_export" --live');
  process.exit(2);
}
if (!EMULATOR && !LIVE) {
  console.error('Refusing: this would read the REAL database, and --live was not given.');
  process.exit(2);
}
if (EMULATOR && LIVE) {
  console.error('Refusing: --live was given but FIRESTORE_EMULATOR_HOST is set (' + EMULATOR + '). Pick one.');
  process.exit(2);
}

/* ---- reading Mailchimp's CSV (quoted fields, commas and line breaks
   inside quotes, a byte-order mark at the start) ---------------------- */
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = [];
    } else f += c;
  }
  row.push(f); if (row.some(x => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
const KIND = [['unsubscribed', /^unsubscribed/i], ['cleaned', /^cleaned/i], ['subscribed', /^subscribed/i]];
const kindOf = name => (KIND.find(([, re]) => re.test(name)) || [null])[0];
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
const mask = e => { const [u, d] = String(e).split('@'); return (u || '').slice(0, 2) + '\u2026@' + (d || ''); };
/* Mailchimp writes "2024-03-01 10:22:13" (UTC). */
const when = s => { const t = String(s || '').trim(); if (!t) return ''; const d = new Date(t.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? '' : 'Z')); return isNaN(d) ? '' : d.toISOString(); };
const newToken = () => randomBytes(48).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 32);

/* The decision for one address. Pure. */
export function decide(kind, mc, hub) {
  const hubNo = hub && ['unsubscribed', 'bounced', 'complained'].includes(hub.status);
  if (kind === 'subscribed') {
    if (hubNo) return { act: 'leave', why: 'said no in the hub (' + hub.status + ')' };
    if (hub && hub.status === 'subscribed') return { act: 'leave', why: 'already subscribed' };
    return { act: hub ? 'subscribe-existing' : 'subscribe' };
  }
  if (kind === 'unsubscribed') {
    if (hub && (hub.status === 'unsubscribed' || hub.status === 'complained')) return { act: 'leave', why: 'already ' + hub.status };
    return { act: hub ? 'unsubscribe-existing' : 'unsubscribe' };
  }
  if (kind === 'cleaned') {
    if (hub && ['bounced', 'unsubscribed', 'complained'].includes(hub.status)) return { act: 'leave', why: 'already ' + hub.status };
    return { act: hub ? 'bounce-existing' : 'bounce' };
  }
  return { act: 'leave', why: 'not a list this reads' };
}

/* ---- the run ---------------------------------------------------------- */
const files = fs.readdirSync(DIR).filter(n => /\.csv$/i.test(n) && kindOf(n));
if (!files.length) { console.error('No subscribed_ / unsubscribed_ / cleaned_ .csv files in ' + DIR); process.exit(2); }

const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp, applicationDefault } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
initializeApp(EMULATOR ? { projectId: PROJECT } : { projectId: PROJECT, credential: applicationDefault() });
const db = getFirestore();

console.log((WRITE ? 'WRITING to ' : 'Looking only (add --write to write), ') + (EMULATOR ? 'the emulator at ' + EMULATOR : 'the REAL database'));
const launch = await db.collection('churchSettings').doc('launch').get();
if (WRITE && !(launch.exists && launch.data().rulesLocked === true)) {
  console.error('Refusing to write: the locked rules are not on yet (Church settings > Private forms > "Open the private forms").\n'
    + 'Until then anybody could read the list this would make. Run it on switch-over day, after the rules.');
  process.exit(3);
}

const existing = new Map();
(await db.collection('enewsSubscribers').get()).docs.forEach(d => existing.set(String(d.data().email || '').toLowerCase(), d));

const counts = {}; let writes = 0, bad = 0;
const seen = new Set();
const now = new Date().toISOString();
for (const name of files.sort((a, b) => KIND.findIndex(k => k[0] === kindOf(a)) - KIND.findIndex(k => k[0] === kindOf(b)))) {
  const kind = kindOf(name);
  const rows = parseCsv(fs.readFileSync(path.join(DIR, name), 'utf8'));
  console.log('\n' + name + ': ' + rows.length + ' rows (' + kind + ')');
  for (const r of rows) {
    const email = String(r['Email Address'] || r['Email'] || '').trim().toLowerCase();
    if (!EMAIL.test(email)) { bad++; continue; }
    /* An address in both files (it happens): unsubscribed and cleaned are
       read first, so a "no" is never overwritten by an older "yes". */
    if (seen.has(email)) continue;
    seen.add(email);
    const hubDoc = existing.get(email), hub = hubDoc ? hubDoc.data() : null;
    const d = decide(kind, r, hub);
    counts[d.act] = (counts[d.act] || 0) + 1;
    if (counts[d.act] <= 5) console.log('  ' + d.act.padEnd(22) + mask(email) + (d.why ? '  (' + d.why + ')' : ''));
    if (d.act === 'leave' || !WRITE) continue;
    const first = String(r['First Name'] || '').slice(0, 60);
    const entry = { at: now, what: kind === 'subscribed' ? 'imported from Mailchimp (subscribed)' : kind === 'unsubscribed' ? 'imported from Mailchimp: had unsubscribed there' + (r.UNSUB_TIME ? ' on ' + r.UNSUB_TIME.slice(0, 10) : '') : 'imported from Mailchimp: address bounced there' };
    let data;
    if (kind === 'subscribed') {
      data = { email, status: 'subscribed', lists: { weekly: true, special: false },
        consent: { how: 'Mailchimp import', source: 'mailchimp', at: when(r.OPTIN_TIME) || when(r.CONFIRM_TIME) || '', confirmedAt: when(r.CONFIRM_TIME) || when(r.OPTIN_TIME) || '', optinIp: String(r.OPTIN_IP || '').slice(0, 45), importedAt: now } };
      if (first && !(hub && hub.firstName)) data.firstName = first;
    } else {
      data = { email, status: kind === 'cleaned' ? 'bounced' : 'unsubscribed', lists: { weekly: false, special: false } };
      if (first && !hub) data.firstName = first;
    }
    data.updatedAt = now;
    const ref = hubDoc ? hubDoc.ref : db.collection('enewsSubscribers').doc();
    if (!hubDoc) Object.assign(data, { createdAt: now, token: newToken(), history: [entry] });
    else data.history = (hub.history || []).concat([entry]).slice(-50);
    await ref.set(data, { merge: true });
    writes++;
  }
}
console.log('\nSummary: ' + Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ') + (bad ? ', ' + bad + ' rows with no usable address' : ''));
console.log(WRITE ? writes + ' written.' : 'Nothing written.');
process.exit(0);
