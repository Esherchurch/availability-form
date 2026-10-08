/* Chunk 6, stage 2 — Sunday check-in's sums, without a browser.

     node screenshots/events/k2-sunday-unit.test.mjs */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-events-kids.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-events-qr.js'), 'utf8'), ctx);
const K = ctx.window.EGBCKids, QR = ctx.window.EGBCEventsQR;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); }
const J = (x) => JSON.stringify(x);

ok('a session is one group on one day, E1\'s calEventId', K.sessionId('kg_abc', '2026-10-11') === 'kids_kg_abc_2026-10-11');
ok('a child\'s check-in id is worked out, never random (two phones, one record)', K.checkinIdFor('kc_1', 'kg_abc', '2026-10-11') === 'kids_kg_abc_2026-10-11__kc_1__0');

const codes = Array.from({ length: 300 }, () => K.pickupCode());
ok('collection codes: four characters, none of 0 O 1 I L (read aloud at a door)', codes.every(c => /^[A-HJKMNP-Z2-9]{4}$/.test(c)), codes.find(c => !/^[A-HJKMNP-Z2-9]{4}$/.test(c)));
ok('and they differ', new Set(codes).size > 280, new Set(codes).size);
ok('a typed code is cleaned: "k7 p2" is K7P2', K.cleanCode(' k7-p2 ') === 'K7P2');

ok('the family QR says only the family code', K.familyQR('ABC234') === 'EGBCK1|ABC234');
ok('and reads back', K.parseFamilyQR('EGBCK1|ABC234') === 'ABC234' && K.parseFamilyQR(' EGBCK1|ABC234\n') === 'ABC234');
ok('a ticket\'s code, or anything else, is not a family', K.parseFamilyQR('EGBC1|ev|abcdefghij|0') === '' && K.parseFamilyQR('EGBCK1|abc') === '' && K.parseFamilyQR('') === '');
const m = QR.matrix(K.familyQR('ABC234')), scale = 4, size = (m.length + 8) * scale, px = new Uint8ClampedArray(size * size * 4).fill(255);
m.forEach((row, y) => row.forEach((on, x) => { if (!on) return; for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; } }));
const read = jsQR(px, size, size);
ok('the family QR on the slip is readable by a camera (jsQR, an independent decoder)', read && read.data === 'EGBCK1|ABC234', read && read.data);

const KIDS = [
  { id: 'a', familyId: 'f1', name: 'Ada Synthetic', parentName: 'Parent Synthetic', phone: '07700 900111', familyCode: 'ABC234' },
  { id: 'b', familyId: 'f1', name: 'Ben Synthetic', parentName: 'Parent Synthetic', phone: '07700 900111', familyCode: 'ABC234' },
  { id: 'c', familyId: 'f2', name: 'Cara Invented', parentName: 'Dee Invented', phone: '+44 7700 900222', familyCode: 'XYZ789' },
  { id: 'd', familyId: 'f2', name: 'Old Invented', parentName: 'Dee Invented', phone: '+44 7700 900222', familyCode: 'XYZ789', status: 'left' }
];
const fam = (q) => K.findFamilies(KIDS, q).map(f => f.familyId + ':' + f.children.map(c => c.id).join(''));
ok('found by a child\'s name: the whole family comes up', J(fam('ben')) === J(['f1:ab']), J(fam('ben')));
ok('by the parent\'s name', J(fam('dee')) === J(['f2:c']));
ok('by part of the phone number, however it was written', J(fam('900222')) === J(['f2:c']) && J(fam('07700 900 111')) === J(['f1:ab']) && J(fam('+447700900222')) === J(['f2:c']));
ok('by the family code, typed or scanned', J(fam('xyz789')) === J(['f2:c']) && J(fam('EGBCK1|ABC234')) === J(['f1:ab']));
ok('a child who has left is not offered', !fam('old').length && J(fam('invented')) === J(['f2:c']));
ok('one letter finds nobody; three digits find nobody', !fam('a').length && !fam('900').length);

const cat = { collectors: ['Parent Two', 'Grandma Invented'] };
ok('a listed collector is matched as the list writes them (the rules check that exact name)', K.listedCollector(cat, 'grandma  invented') === 'Grandma Invented' && K.listedCollector(cat, 'A Stranger') === '');
ok('leaders needed at a ratio: 9 children at 1 to 4 need 3', K.leadersNeeded(9, 4) === 3 && K.leadersNeeded(0, 4) === 0 && K.leadersNeeded(8, 8) === 1);

const V = { childName: 'New Child', year: 'Year 2', parentName: 'New Parent', phone: '07700 900333', email: '', consent: true };
ok('the visitor form: enough to keep a child safe', K.visitorProblems(V).length === 0);
ok('it needs the parent\'s consent', J(K.visitorProblems(Object.assign({}, V, { consent: false }))) === J(['the parent\'s consent']));
ok('and a phone number that could be rung', K.visitorProblems(Object.assign({}, V, { phone: '0770' })).indexOf('the parent\'s phone number') >= 0);
ok('an email is not needed, but must work if given', K.visitorProblems(Object.assign({}, V, { email: 'nope' })).length === 1 && K.visitorProblems(Object.assign({}, V, { email: 'new@example.invalid' })).length === 0);

const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
