/* The main window's part of the data map (data-map/main.json), carried out
   by data-links.js, and the nightly orphan check, on the emulator
   (firestore on 8181):
     node --test functions/on-delete.test.mjs        (from v2/)
   Each of main.json's Cascade and Keep-history kinds, running twice, the
   sweep, and the archive-only records: people, teams, buildings and rooms. */
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { tidyChildren } from './data-links.js';
import { sweepChurch } from './orphan-sweep.js';
import { scopedDb } from './church-scope.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
initializeApp({ projectId: 'demo-ondelete' });
const db = scopedDb(getFirestore(), 'testchurch');
const gone = async (collection, id) => {
  const ref = db.collection(collection).doc(id);
  const data = (await ref.get()).data();
  await ref.delete();
  return tidyChildren(db, collection, id, data);
};
const has = async (p) => (await db.doc(p).get()).exists;
const get = async (p) => (await db.doc(p).get()).data();

test('a deleted meeting takes its private part, guest links, sends and answers', async () => {
  await db.doc('events/E1').set({ meeting: true, date: '2099-01-01' });
  await db.doc('meetings/E1').set({ description: 'x' });
  await db.doc('meetingSends/E1').set({ to: [] });
  await db.doc('meetingGuests/h1').set({ meetingId: 'E1' });
  await db.doc('availability/a1').set({ eventId: 'E1', memberId: 'p1' });
  await gone('events', 'E1');
  for (const p of ['meetings/E1', 'meetingSends/E1', 'meetingGuests/h1', 'availability/a1']) assert.equal(await has(p), false, p);
});

test('a closed account: its settings, devices, feeds and exceptions go; its prayers stay, marked', async () => {
  await db.doc('users/u3').set({ name: 'U' });
  await db.doc('notifyPrefs/u3').set({ types: [] });
  await db.doc('calendarKeys/u3').set({ feeds: {} });
  await db.doc('pushTokens/t3').set({ uid: 'u3' });
  await db.doc('calendarFeeds/f3').set({ uid: 'u3' });
  await db.doc('permissionExceptions/x3').set({ uid: 'u3' });
  await db.doc('prayers/r3').set({ by: 'u3', text: 'x' });
  await gone('users', 'u3');
  for (const p of ['notifyPrefs/u3', 'calendarKeys/u3', 'pushTokens/t3', 'calendarFeeds/f3', 'permissionExceptions/x3']) assert.equal(await has(p), false, p);
  assert.equal((await get('prayers/r3')).parentGone.by.from, 'users');
});

test('running twice changes nothing more', async () => {
  await db.doc('users/u4').set({ name: 'U4' });
  await db.doc('prayers/r4').set({ by: 'u4' });
  await gone('users', 'u4');
  await tidyChildren(db, 'users', 'u4', null);
  assert.equal(await has('prayers/r4'), true);
  assert.equal((await get('prayers/r4')).parentGone.by.from, 'users');
});

test('a first sweep only counts', async () => {
  await db.doc('availability/first').set({ eventId: 'NEVER' });
  const r = await sweepChurch({ db, now: new Date('2099-01-01T03:15:00Z') });
  assert.equal(r.dryRun, true);
  assert.ok(r.orphans >= 1);
  assert.equal(await has('availability/first'), true);
});

test('the nightly sweep fixes orphans (also by id prefix), holds back when most of a link looks orphaned, and keeps the counts', async () => {
  await db.doc('events/E5').set({ date: '2099-01-01' });
  await db.doc('availability/ok5').set({ eventId: 'E5' });
  await db.doc('meetings/NOPE6').set({ description: 'left behind' });
  await db.doc('pastoralVisits/v7').set({ name: 'x' });
  await db.doc('pastoralReminded/v7_2099-01-01').set({ at: 'x' });
  await db.doc('pastoralReminded/v8_2099-01-01').set({ at: 'x' });
  for (let i = 0; i < 25; i++) await db.doc('pushTokens/t' + i).set({ uid: 'gone' + i });
  const r = await sweepChurch({ db, now: new Date('2099-01-02T03:15:00Z') });
  assert.equal(r.dryRun, false);
  assert.equal(await has('availability/first'), false);
  assert.equal(await has('availability/ok5'), true);
  assert.equal(await has('meetings/NOPE6'), false);
  assert.equal(await has('pastoralReminded/v7_2099-01-01'), true);
  assert.equal(await has('pastoralReminded/v8_2099-01-01'), false);
  const held = r.links.find((l) => l.link.startsWith('pushTokens.uid'));
  assert.equal(held.held, true);
  assert.equal(await has('pushTokens/t0'), true, 'nothing changed on a held link');
  assert.equal((await get('orphanSweeps/2099-01-02')).orphans, r.orphans);
});

test('people, teams, buildings and rooms are never deleted by a page; a page cannot take a room out of use', async () => {
  const { initializeTestEnvironment } = await import('../node_modules/@firebase/rules-unit-testing/dist/esm/index.esm.js');
  const env = await initializeTestEnvironment({ projectId: 'demo-ondelete-rules',
    firestore: { host: '127.0.0.1', port: 8181, rules: fs.readFileSync(path.join(HERE, '..', 'firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async (x) => {
    const d = x.firestore();
    await d.doc('users/boss').set({ name: 'Boss', status: 'active', masterAdmin: true, teams: [] });
    await d.doc('addressBook/p7').set({ name: 'P' });
    await d.doc('teams/T7').set({ label: 'T' });
    await d.doc('sites/S7').set({ name: 'Hall', active: true });
    await d.doc('rooms/R7').set({ name: 'Room', active: true });
  });
  const boss = env.authenticatedContext('boss', { email: 'boss@x.org', email_verified: true }).firestore();
  for (const p of ['addressBook/p7', 'teams/T7', 'sites/S7', 'rooms/R7']) await assert.rejects(boss.doc(p).delete(), p);
  await assert.rejects(boss.doc('rooms/R7').update({ active: false }));
  await assert.rejects(boss.doc('sites/S7').update({ active: false }));
  await boss.doc('rooms/R7').update({ name: 'Room 1' });
  await boss.doc('addressBook/p7').update({ archived: true });
  await env.cleanup();
});
