/* The Mailchimp import (FINDINGS-comms C-14), run for real against an
 * emulator of your own, on made-up export files.
 *
 *   node tests/check-import-mailchimp.mjs        (from v2/)
 *
 * Uses the Firestore emulator in firebase.comms.json (this clears its
 * subscribers). Then THE DELIBERATE BREAKS: each runs a copy of the tool
 * with one line changed and must turn a named check red.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
const HOST = '127.0.0.1:' + C1.emulators.firestore.port;
process.env.FIRESTORE_EMULATOR_HOST = HOST;
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();

/* Made-up export, shaped like Mailchimp's (byte-order mark, quotes). */
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-export-'));
const H = '﻿Email Address,First Name,Last Name,MEMBER_RATING,OPTIN_TIME,OPTIN_IP,CONFIRM_TIME,CONFIRM_IP,TAGS\n';
fs.writeFileSync(path.join(DIR, 'subscribed_email_audience_export_x.csv'), H
  + 'New.Person@Example.invalid,"Smith, Jo",X,2,2024-03-01 10:22:13,192.0.2.1,2024-03-01 10:25:00,192.0.2.1,""\n'
  + 'sev.mc@example.invalid,Sev,X,2,2024-03-01 10:22:13,192.0.2.1,2024-03-01 10:25:00,192.0.2.1,""\n'
  + 'gone.mc@example.invalid,Gone,X,2,2023-01-01 09:00:00,,2023-01-01 09:01:00,,\n'
  + 'both.mc@example.invalid,Both,X,2,2023-01-01 09:00:00,,2023-01-01 09:01:00,,\n'
  + 'twice.mc@example.invalid,Twice,X,2,2022-01-01 09:00:00,,,,\n'
  + 'not-an-address,Bad,X,1,,,,,\n');
fs.writeFileSync(path.join(DIR, 'unsubscribed_email_audience_export_x.csv'), H.replace('TAGS', 'TAGS,UNSUB_TIME')
  + 'both.mc@example.invalid,Both,X,2,2023-01-01 09:00:00,,,,"",2025-06-01 12:00:00\n'
  + 'twice.mc@example.invalid,Twice,X,2,2022-01-01 09:00:00,,,,"",2025-07-01 12:00:00\n'
  + 'left.mc@example.invalid,Left,X,1,2021-01-01 09:00:00,,,,"",2024-02-02 12:00:00\n');
fs.writeFileSync(path.join(DIR, 'cleaned_email_audience_export_x.csv'), H.replace('TAGS', 'TAGS,CLEAN_TIME') + 'dead.mc@example.invalid,Dead,X,1,,,,,"",2025-01-01 00:00:00\n');
fs.writeFileSync(path.join(DIR, 'nonsubscribed_email_audience_export_x.csv'), H + 'never.mc@example.invalid,Never,X,1,,,,,\n');

const run = (tool, args, env) => spawnSync(process.execPath, [tool].concat(args), { cwd: V2, env: Object.assign({}, process.env, env || {}), encoding: 'utf8' });
const sub = async e => { const s = await db.collection('enewsSubscribers').where('email', '==', e).get(); return s.empty ? null : s.docs[0].data(); };

async function scenario(tool) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  for (const d of (await db.collection('enewsSubscribers').get()).docs) await d.ref.delete();
  await db.collection('enewsSubscribers').doc('hub_gone').set({ email: 'gone.mc@example.invalid', status: 'unsubscribed', lists: { weekly: false }, token: 't'.repeat(32), history: [] });
  await db.collection('enewsSubscribers').doc('hub_both').set({ email: 'both.mc@example.invalid', status: 'subscribed', lists: { weekly: true }, token: 'u'.repeat(32), history: [] });
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: false, opensOn: '' });
  /* A 17-year-old, ticked Under 18 in the address book. */
  await db.collection('addressBook').doc('ab_sev_mc').set({ name: 'Sev Synthetic', email: 'sev.mc@example.invalid', under18: true, isMinor: false });

  let r = run(tool, [DIR, '--write']);
  t('before switch-over it refuses to write', r.status === 3 && !(await sub('new.person@example.invalid')), r.status + ' ' + r.stderr);
  r = run(tool, [DIR], { FIRESTORE_EMULATOR_HOST: '' });
  t('the real database is never read without --live', r.status === 2, r.status);
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true, opensOn: '' });
  r = run(tool, [DIR]);
  t('looking writes nothing', r.status === 0 && /Nothing written/.test(r.stdout) && !(await sub('new.person@example.invalid')), r.stdout.slice(-200));
  t('the output shortens addresses', !/new\.person@/i.test(r.stdout) && /ne…@example\.invalid/.test(r.stdout));
  r = run(tool, [DIR, '--write']);
  t('writing works after switch-over', r.status === 0 && /written\./.test(r.stdout), r.stdout.slice(-300) + r.stderr);
  const np = await sub('new.person@example.invalid');
  t('a Mailchimp subscriber comes in subscribed, address tidied', np && np.status === 'subscribed' && np.lists.weekly === true);
  t('with Mailchimp’s own dates as the consent record', np && np.consent && np.consent.how === 'Mailchimp import' && np.consent.at === '2024-03-01T10:22:13.000Z' && np.consent.confirmedAt === '2024-03-01T10:25:00.000Z', np && np.consent);
  t('a quoted name with a comma is read right', np && np.firstName === 'Smith, Jo', np && np.firstName);
  t('and has an unsubscribe token', np && /^[A-Za-z0-9]{32}$/.test(np.token || ''));
  t('someone who unsubscribed in the hub is NOT put back', (await sub('gone.mc@example.invalid')).status === 'unsubscribed');
  t('subscribed in the hub, unsubscribed in Mailchimp: unsubscribed', (await sub('both.mc@example.invalid')).status === 'unsubscribed');
  t('in both Mailchimp files: the "no" wins', (await sub('twice.mc@example.invalid') || {}).status === 'unsubscribed');
  t('Mailchimp’s unsubscribed are kept as do-not-contact', (await sub('left.mc@example.invalid') || {}).status === 'unsubscribed');
  t('Mailchimp’s cleaned are kept as bounced', (await sub('dead.mc@example.invalid') || {}).status === 'bounced');
  t('a 17-year-old on Mailchimp\u2019s list is NOT imported (the hub never emails under-18s)', !(await sub('sev.mc@example.invalid')));
  t('people who never joined are left alone', !(await sub('never.mc@example.invalid')));
  t('a row with no usable address is skipped', !(await sub('not-an-address')));
  r = run(tool, [DIR, '--write']);
  t('a second run writes nothing', /0 written\./.test(r.stdout), r.stdout.slice(-120));
  return out;
}

const R = [];
const TOOL = path.join('tools', 'import-mailchimp.mjs');
(await scenario(TOOL)).forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });

console.log('-- deliberate breaks --');
const SRC = fs.readFileSync(TOOL, 'utf8');
const BREAKS = [
  ['a hub "no" overwritten by Mailchimp', "if (hubNo) return { act: 'leave', why: 'said no in the hub (' + hub.status + ')' };", '', 'is NOT put back'],
  ['the newest "no" not read first', "for (const name of files.sort((a, b) => KIND.findIndex(k => k[0] === kindOf(a)) - KIND.findIndex(k => k[0] === kindOf(b)))) {", "for (const name of files.sort((a, b) => KIND.findIndex(k => k[0] === kindOf(b)) - KIND.findIndex(k => k[0] === kindOf(a)))) {", 'the "no" wins'],
  ['under-18s imported', "if (kind === 'subscribed' && under18) return { act: 'leave', why: 'under 18: the hub never emails under-18s' };", '', 'NOT imported'],
  ['writing before switch-over', "if (WRITE && !(launch.exists && launch.data().rulesLocked === true)) {", 'if (false) {', 'refuses to write']
];
for (const [what, from, to, expect] of BREAKS) {
  if (!SRC.includes(from)) { R.push(false); console.log('  FAIL  break "' + what + '": that line is not in the tool any more - update the break'); continue; }
  const tmp = path.join('tools', '.check-' + process.pid + '-import-mailchimp.mjs');
  fs.writeFileSync(tmp, SRC.replace(from, to));
  let red = [];
  try { red = (await scenario(tmp)).filter(r => !r.v).map(r => r.n); } finally { fs.unlinkSync(tmp); }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT'));
}
fs.rmSync(DIR, { recursive: true, force: true });
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
