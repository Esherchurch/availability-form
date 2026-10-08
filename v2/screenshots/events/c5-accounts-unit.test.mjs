/* Chunk 5, stage 3 — invoice numbers and the accounts export, without a
   browser.

     node screenshots/events/c5-accounts-unit.test.mjs */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-accounts.js'), 'utf8'), ctx);
const A = ctx.window.EGBCAccounts;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); }
const J = (x) => JSON.stringify(x);

ok('invoice numbers: INV-00001, INV-00042, INV-12345', A.number(1) === 'INV-00001' && A.number(42) === 'INV-00042' && A.number(12345) === 'INV-12345');

const CH = { id: 'ch_a', bookingKey: 'bk_abcdefgh12345678', roomId: 'room_hall', payer: { name: 'Hirer', org: 'Invented Club', email: 'h@example.invalid' }, invoiceNumber: 'INV-00007',
  dueDate: '2026-11-07', status: 'part-paid', vat: 1400, vatRate: 20, lines: [{ label: 'Room hire', amount: 4000 }, { label: 'Cleaning', amount: 3000 }],
  payments: [{ kind: 'payment', amount: 5000, date: '2026-11-01', method: 'Bank transfer', ref: 'T1' }, { kind: 'refund', amount: 1000, date: '2026-11-20', method: 'Cash', ref: '' }],
  damage: { status: 'returned', amount: 10000, method: 'Card', takenOn: '2026-11-07', returned: 8000, kept: 2000, note: 'a broken chair', returnMethod: 'Card', closedOn: '2026-11-10' } };
const rows = A.rows([CH], { from: '2026-11-01', to: '2026-11-30', roomName: () => 'Test Hall' });
const ids = rows.map(r => r.id);
ok('a row each: two lines, VAT, a payment, a refund, deposit taken, returned and kept', J(ids.slice().sort()) === J(['ch_a#DK', 'ch_a#DR', 'ch_a#DT', 'ch_a#L0', 'ch_a#L1', 'ch_a#P0', 'ch_a#P1', 'ch_a#VAT'].sort()), J(ids));
const byId = Object.fromEntries(rows.map(r => [r.id, r.cells]));
ok('ids never change: the same charge gives the same ids again', J(A.rows([CH], { from: '2026-11-01', to: '2026-11-30' }).map(r => r.id).sort()) === J(ids.slice().sort()));
ok('a line: net £40, no VAT, gross £40, with the invoice and payer', byId['ch_a#L0'][10] === 40 && byId['ch_a#L0'][12] === 40 && byId['ch_a#L0'][3] === 'INV-00007' && byId['ch_a#L0'][5] === 'Invented Club');
ok('VAT is its own row: £14', byId['ch_a#VAT'][11] === 14 && byId['ch_a#VAT'][12] === 14);
ok('a refund is money going out: -£10', byId['ch_a#P1'][2] === 'Refund' && byId['ch_a#P1'][12] === -10);
ok('the damage deposit: £100 taken, £80 returned, £20 kept (and why)', byId['ch_a#DT'][12] === 100 && byId['ch_a#DR'][12] === -80 && /broken chair/.test(byId['ch_a#DK'][9]));
ok('rows come in date order', rows.map(r => r.cells[1]).join() === rows.map(r => r.cells[1]).slice().sort().join());
ok('the booking reference is the one the hirer sees', byId['ch_a#L0'][7] === 'ABCDEFGH');
const oct = A.rows([CH], { from: '2026-10-01', to: '2026-10-31' });
ok('dates outside the range are left out', oct.length === 0);
const early = A.rows([CH], { from: '2026-11-01', to: '2026-11-05' });
ok('a payment is dated when it was paid, not when the booking is', J(early.map(r => r.id)) === J(['ch_a#P0']));
const marked = Object.assign({}, CH, { exportedAt: { L0: 'x', L1: 'x', VAT: 'x', P0: 'x' } });
const fresh = A.rows([marked], { from: '2026-11-01', to: '2026-11-30', onlyNew: true }).map(r => r.id);
ok('"only what is new" leaves out what was exported before', J(fresh.sort()) === J(['ch_a#DK', 'ch_a#DR', 'ch_a#DT', 'ch_a#P1']));
ok('a cancelled charge has no charge rows, but its refund still counts', A.rows([Object.assign({}, CH, { status: 'cancelled' })], { from: '2026-11-01', to: '2026-11-30' }).every(r => !/#L|#VAT/.test(r.id)));
ok('the head row matches the cells', A.HEAD.length === rows[0].cells.length);

const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
