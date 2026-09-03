'use strict';
/*
 * Checks the NRPN encoder against the worked examples printed in
 * "SQ MIDI Protocol Issue 5". Run with:  node test-sq5.js
 *
 * If Allen & Heath ever change the address map, this is the file that tells you.
 */
const sq = require('./sq5');

let pass = 0, fail = 0;

function check(name, actual, expected) {
  const a = String(actual).toUpperCase();
  const e = String(expected).toUpperCase();
  if (a === e) { pass++; console.log('  ok   ' + name + '  = ' + a); }
  else { fail++; console.log('  FAIL ' + name + '  expected ' + e + ', got ' + a); }
}

function addr(param) {
  return hex(param >> 7) + ' ' + hex(param & 0x7F);
}
function hex(n) { return n.toString(16).toUpperCase().padStart(2, '0'); }

console.log('\nAddress map - aux send parameter numbers (MSB LSB)');

// From the reference table row for Ip48: Aux1..Aux12 run 44 78 .. 45 03.
check('Ip48 -> Aux1',  addr(sq.auxSendParam(48, 1)),  '44 78');
check('Ip48 -> Aux2',  addr(sq.auxSendParam(48, 2)),  '44 79');
check('Ip48 -> Aux8',  addr(sq.auxSendParam(48, 8)),  '44 7F');
check('Ip48 -> Aux9',  addr(sq.auxSendParam(48, 9)),  '45 00');
check('Ip48 -> Aux12', addr(sq.auxSendParam(48, 12)), '45 03');

// From the level examples: "Ip40 to Aux5 ... B0 63 44 B0 62 1C".
check('Ip40 -> Aux5',  addr(sq.auxSendParam(40, 5)),  '44 1C');

// First entry in the aux region, 68 slots past Ip1's own fader at 40 00.
check('Ip1  -> Aux1',  addr(sq.auxSendParam(1, 1)),   '40 44');

console.log('\nFull message bytes');

// "Ip40 to Aux5, -12dB, Ch4"  ->  B3 63 44 B3 62 1C B3 06 6B B3 26 06
// The document's own example values are rounded a little loosely (its -12 dB
// here is 13702 where the dB table says 13771), so compare the address bytes
// and check the value separately against the published table.
const msg = sq.encodeAuxSend(4, 40, 5, sq.dbToValue(-12));
check('Ip40->Aux5 @ -12dB, MIDI ch4 (address half)',
  [...msg.slice(0, 6)].map(hex).join(' '), 'B3 63 44 B3 62 1C');

console.log('\nLinear taper values, against the published dB table');

// dB -> VC/VF straight out of the protocol document's table.
const TABLE = {
  0: '76 5C', '-1': '75 65', '-10': '6D 39', '-12': '6B 4B', '-20': '64 16',
  '-30': '5A 72', '-40': '51 4F', '-60': '3F 09', '-80': '2C 42', '-89': '24 16',
  '9': '7F 08', '5': '7B 2E', '1': '77 53',
};
for (const db of Object.keys(TABLE)) {
  const v = sq.dbToValue(Number(db));
  const got = hex(v >> 7) + ' ' + hex(v & 0x7F);
  const want = TABLE[db];
  // The straight-line fit is within a couple of steps of the printed table;
  // allow 2 steps rather than demanding an exact byte match.
  const wantV = parseInt(want.split(' ')[0], 16) * 128 + parseInt(want.split(' ')[1], 16);
  if (Math.abs(v - wantV) <= 2) { pass++; console.log('  ok   ' + db + ' dB = ' + got + ' (table ' + want + ')'); }
  else { fail++; console.log('  FAIL ' + db + ' dB = ' + got + ', table says ' + want); }
}

console.log('\nFader mapping and safety');
check('level 1.0 -> unity (0 dB)', sq.levelToValue(1.0), sq.UNITY);
check('level 0.0 -> off',          sq.levelToValue(0.0), 0);
check('level over 1 is clamped',   sq.levelToValue(9.9), sq.UNITY);
check('level below 0 is clamped',  sq.levelToValue(-3),  0);
check('explicit top honoured',     Math.round(sq.valueToDb(sq.levelToValue(1.0, 10))), 10);
check('unity really is 0 dB',      Math.round(sq.valueToDb(sq.UNITY)), 0);

console.log('\nAudio taper - the middle of the fader must be usable');
check('0.75 -> -3.8 dB',  sq.positionToDb(0.75).toFixed(1),  '-3.8');
check('0.50 -> -15.0 dB', sq.positionToDb(0.50).toFixed(1), '-15.0');
check('0.25 -> -33.8 dB', sq.positionToDb(0.25).toFixed(1), '-33.8');
check('0.00 -> -inf',     sq.positionToDb(0),               '-Infinity');
// The bug this replaced: a straight position->value map put half travel at -64 dB.
const midDb = sq.positionToDb(0.5);
check('half travel is nowhere near inaudible', midDb > -25, true);
// Monotonic all the way up, no flat spots or reversals.
let mono = true, prev = -1;
for (let p = 0; p <= 1.0001; p += 0.01) {
  const v = sq.levelToValue(p);
  if (v < prev) mono = false;
  prev = v;
}
check('fader is monotonic end to end', mono, 'true');

console.log('\nRange checking');
for (const [ch, aux, why] of [[0, 1, 'channel 0'], [49, 1, 'channel 49'], [1, 0, 'aux 0'], [1, 13, 'aux 13']]) {
  try { sq.auxSendParam(ch, aux); fail++; console.log('  FAIL ' + why + ' should have thrown'); }
  catch (e) { pass++; console.log('  ok   ' + why + ' rejected'); }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
