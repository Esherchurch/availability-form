/* Chunk 5, stage 1 — what a hire costs, without a browser.

     node screenshots/events/c5-quote-unit.test.mjs

   Every sum in pence. Wednesday 4 Nov 2026 and Saturday 7 Nov 2026. */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-events-quote.js'), 'utf8'), ctx);
const Q = ctx.window.EGBCQuote;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); }
const J = (x) => JSON.stringify(x);
const CARD = { hourly: 2000, halfDay: 7000, fullDay: 12000, evening: 6000, minimum: 4000, setupCharged: true, weekendPct: 25, outOfHoursPct: 50,
  cleaning: 3000, avHourly: 1500, charityPct: 20, regularPct: 10, vat: false, deposit: 5000, damageDeposit: 10000 };
const WED = '2026-11-04', SAT = '2026-11-07';
const q = (o) => Q.price(Object.assign({ card: CARD, day: WED, start: 600, end: 720, setup: 0, pack: 0, people: 10, items: [], kit: [] }, o));
const line = (r, code) => (r.lines.find(l => l.code === code) || {}).amount;

let r = q({});
ok('two hours on a Wednesday: £40 by the hour, plus £30 cleaning', line(r, 'hire') === 4000 && line(r, 'cleaning') === 3000 && r.total === 7000, J(r));
r = q({ end: 660 });
ok('one hour is £20, but the minimum charge is £40', line(r, 'hire') === 4000 && /minimum/.test(r.lines[0].label));
r = q({ start: 540, end: 840, setup: 30 });
ok('five hours with 30 minutes to set up (5½ charged): £110 by the hour beats £120 for the day', line(r, 'hire') === 11000 && /5.5 hours/.test(r.lines[0].label), J(r.lines[0]));
r = q({ start: 540, end: 900, setup: 30, pack: 30 });
ok('seven hours: the full day (£120) beats £140 by the hour', line(r, 'hire') === 12000 && /full day/.test(r.lines[0].label));
r = q({ day: SAT, start: 840, end: 960 });
ok('Saturday adds the weekend surcharge: 25% of £40', line(r, 'weekend') === 1000 && r.total === 8000);
r = q({ start: 1140, end: 1350 });
ok('19:00 to 22:30: the evening rate (£60) is cheapest', line(r, 'hire') === 6000 && /evening/.test(r.lines[0].label));
ok('and running past 22:00 adds the out-of-hours surcharge: 50% of £60', line(r, 'outofhours') === 3000);
r = q({ start: 1140, end: 1320, pack: 45 });
ok('clearing away past 22:00 counts too, when setting up is charged', line(r, 'outofhours') > 0);
r = q({ start: 1140, end: 1320, pack: 45, card: Object.assign({}, CARD, { setupCharged: false }) });
ok('not when it is free: the hire ends at 22:00', !line(r, 'outofhours'));
r = q({ day: SAT, start: 840, end: 960, charity: true });
ok('the charity rate takes 20% off the room and its surcharge (£50 → £10 off)', line(r, 'discount') === -1000 && r.total === 7000);
r = q({ regular: true });
ok('a regular hirer, 10% off the room', line(r, 'discount') === -400);
r = q({ items: [{ name: 'Tea and coffee', qty: 40, unit: 'head', price: 1.5 }] });
ok('catering: 40 × tea and coffee at £1.50 a person', line(r, 'catering') === 6000 && /40 × Tea and coffee \(a person\)/.test(r.lines.find(l => l.code === 'catering').label));
r = q({ kit: [{ name: 'Projector', qty: 1, hirePrice: 2500 }, { name: 'Free urn', qty: 2, hirePrice: 0 }] });
ok('kit with a hire price is charged; kit with none is not', line(r, 'kit') === 2500 && r.lines.filter(l => l.code === 'kit').length === 1);
r = q({ av: { needed: true } });
ok('a technician for the two hours, £15 an hour', line(r, 'av') === 3000);
r = q({ card: Object.assign({}, CARD, { vat: true }) });
ok('VAT at 20% on £70 is £14', r.vat === 1400 && r.total === 8400);
r = q({});
ok('the deposit is part of the total; the damage deposit is on top', r.deposit === 5000 && r.damageDeposit === 10000 && r.total === 7000);
r = q({ end: 660, card: { hourly: 2000, deposit: 5000 } });
ok('a deposit is never more than the total', r.total === 2000 && r.deposit === 2000);
const adj = Q.totals([{ code: 'hire', label: 'Room hire', amount: 4000 }, { code: 'cleaning', label: 'Cleaning', amount: 0 }], CARD);
ok('the office\'s adjusted lines are added up the same way', adj.total === 4000 && adj.subtotal === 4000);
ok('no rate card, nothing charged', Q.price({ card: {}, day: WED, start: 600, end: 720 }).total === 0);
ok('pounds: £1,234.50; and "£12.5" typed is 1250 pence', Q.pounds(123450) === '£1,234.50' && Q.toPence('£12.5') === 1250 && Q.toPence('') === 0);

const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
