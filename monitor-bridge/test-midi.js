'use strict';
/*
 * Tests for the inbound MIDI parser. The awkward cases here are the ones that
 * actually happen on a TCP stream from a live desk: messages split across
 * reads, running status, and realtime bytes landing mid-message.
 */
const { NrpnParser } = require('./midi-parse');
const sq = require('./sq5');

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); } };

function collect(...chunks) {
  const got = [];
  const p = new NrpnParser((param, value, channel) => got.push({ param, value, channel }));
  for (const c of chunks) p.push(Buffer.from(c));
  return got;
}

console.log('\nA plain NRPN write');
{
  const bytes = sq.encodeNrpn(1, sq.auxSendParam(12, 3), sq.UNITY);
  const got = collect(bytes);
  check('one parameter reported', got.length === 1, got);
  check('correct address', got[0]?.param === sq.auxSendParam(12, 3), got[0]);
  check('correct value', got[0]?.value === sq.UNITY, got[0]);
  check('correct MIDI channel', got[0]?.channel === 0, got[0]);
}

console.log('\nSplit across TCP reads');
{
  const b = [...sq.encodeNrpn(1, 8300, 12345)];
  // One byte at a time - the worst case a socket can hand us.
  const got = collect(...b.map(x => [x]));
  check('still parsed', got.length === 1 && got[0].value === 12345, got);
  // And split at an awkward midpoint.
  const got2 = collect(b.slice(0, 5), b.slice(5));
  check('split mid-message', got2.length === 1 && got2[0].param === 8300, got2);
}

console.log('\nRunning status');
{
  // Status byte sent once, then bare data pairs - legal MIDI, and a real
  // possibility from a desk trying to be terse.
  const got = collect([0xB0, 0x63, 0x41, 0x62, 0x4A, 0x06, 0x76, 0x26, 0x5C]);
  check('running status parsed', got.length === 1, got);
  check('  address survived', got[0]?.param === (0x41 << 7 | 0x4A), got[0]);
  check('  value survived', got[0]?.value === sq.UNITY, got[0]);
}

console.log('\nRealtime bytes interrupting a message');
{
  // F8 (timing clock) may appear literally anywhere, including between the two
  // data bytes of a CC. It must not corrupt the message around it.
  const got = collect([0xB0, 0x63, 0xF8, 0x41, 0xB0, 0x62, 0x4A,
                       0xFE, 0xB0, 0x06, 0x76, 0xB0, 0x26, 0x5C]);
  check('message survived interruption', got.length === 1 && got[0].value === sq.UNITY, got);
}

console.log('\nNoise that must be ignored');
{
  const nrpn = [...sq.encodeNrpn(1, 8300, 999)];
  const got = collect(
    [0xF0, 0x00, 0x01, 0x02, 0x7F, 0x63, 0x40, 0xF7],   // SysEx containing CC-like bytes
    [0x90, 0x3C, 0x64],                                  // note on
    [0xB0, 0x07, 0x50],                                  // CC7 volume, not part of NRPN
    nrpn);
  check('only the NRPN is reported', got.length === 1 && got[0].value === 999, got);
}
{
  const got = collect([0x40, 0x00, 0x76]);               // data bytes with no status
  check('orphan data bytes ignored', got.length === 0, got);
}
{
  // An unterminated SysEx followed by a real message - the status byte ends it.
  const got = collect([0xF0, 0x11, 0x22], sq.encodeNrpn(1, 8300, 42));
  check('unterminated SysEx recovers', got.length === 1 && got[0].value === 42, got);
}

console.log('\nPartial NRPN writes must not fire');
{
  check('address with no value', collect([0xB0, 0x63, 0x41, 0xB0, 0x62, 0x4A]).length === 0);
  check('value with no address',
    collect([0xB0, 0x06, 0x76, 0xB0, 0x26, 0x5C]).length === 0);
  // A fresh address selection invalidates a stale coarse value.
  const got = collect([0xB0, 0x06, 0x76], [0xB0, 0x63, 0x41], [0xB0, 0x62, 0x4A], [0xB0, 0x26, 0x5C]);
  check('stale coarse value discarded after re-addressing', got.length === 0, got);
}

console.log('\nSeparate MIDI channels do not bleed into each other');
{
  const got = collect(
    [0xB0, 0x63, 0x41, 0xB1, 0x63, 0x42],               // ch1 and ch2 both addressed
    [0xB0, 0x62, 0x4A, 0xB1, 0x62, 0x00],
    [0xB0, 0x06, 0x76, 0xB1, 0x06, 0x10],
    [0xB0, 0x26, 0x5C, 0xB1, 0x26, 0x00]);
  check('both reported', got.length === 2, got);
  check('  channel 1 correct', got[0]?.channel === 0 && got[0]?.value === sq.UNITY, got[0]);
  check('  channel 2 correct', got[1]?.channel === 1 && got[1]?.param === (0x42 << 7), got[1]);
}

console.log('\nRound trip through the address decoder');
{
  let ok = true;
  for (const [ch, aux] of [[1, 1], [12, 3], [40, 5], [48, 12], [7, 4]]) {
    const d = sq.decodeAuxSendParam(sq.auxSendParam(ch, aux));
    if (!d || d.inputChannel !== ch || d.auxBus !== aux) { ok = false; console.log('    mismatch', ch, aux, d); }
  }
  check('every input/aux pair decodes back', ok);
  check('group sends are not mistaken for inputs',
    sq.decodeAuxSendParam(sq.auxSendParam(48, 12) + 1) === null);
  // Assert against the document, not against our own constant - comparing the
  // offset to itself is how the first version of this passed while being wrong.
  // Document: FX1Rtn -> Aux7 assign = 66 1A. The FX returns start at source
  // index 60, so its level address is 8260 + 60*12 + 6 = 8986.
  check('assign address matches the document example',
    8986 + sq.ASSIGN_OFFSET === (0x66 << 7 | 0x1A), 8986 + sq.ASSIGN_OFFSET);
  check('assign address fits in 14 bits',
    sq.auxAssignParam(48, 12) <= 0x3FFF, sq.auxAssignParam(48, 12));
  check('assign MSB lands in the 0x60 page',
    (sq.auxAssignParam(1, 1) >> 7) === 0x60, (sq.auxAssignParam(1, 1) >> 7).toString(16));
}

console.log('\nThe get command');
{
  const g = sq.encodeGet(1, sq.auxSendParam(1, 1));
  const hex = [...g].map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  // Document: "Ip1 to LR Level, Ch1  B0 63 40 B0 62 00 B0 60 7F"
  check('get is 9 bytes ending in a 7F data increment', hex === 'B0 63 40 B0 62 44 B0 60 7F', hex);
  const lr = [...sq.encodeGet(1, sq.LEVEL_BASE)].map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  check('matches the document example for Ip1 to LR level', lr === 'B0 63 40 B0 62 00 B0 60 7F', lr);
}

console.log('\nFader position round trip');
{
  let worst = 0;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const back = sq.valueToPosition(sq.levelToValue(p), 0);
    worst = Math.max(worst, Math.abs(back - Math.min(1, p)));
  }
  check('position -> value -> position is stable', worst < 0.01, worst.toFixed(4));
  check('a silent channel reads as fader down', sq.valueToPosition(0, 0) === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
