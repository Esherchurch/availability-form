'use strict';
/*
 * End-to-end mix scan. The fake SQ here is a bit more of a mixer than the one
 * in test-bridge.js: it holds a routing table, understands the 'get' command,
 * and answers it the way the real desk does. Nothing here touches hardware.
 *
 *   node test-scan.js
 */
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const sq = require('./sq5');
const { NrpnParser } = require('./midi-parse');

const SQ_PORT = 51997, WS_PORT = 3997, AUX = 3;

let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

// The desk's state: which inputs feed Aux 3, and at what level.
// Deliberately sparse and scattered, the way a real mix is.
const DESK = {
  1:  { assigned: true,  db: -3 },     // Lead vocal
  2:  { assigned: true,  db: -8 },     // Backing vocal
  5:  { assigned: true,  db: -6 },     // Kick
  6:  { assigned: true,  db: -10 },    // Snare
  12: { assigned: true,  db: 0 },      // Acoustic
  20: { assigned: false, db: -40 },    // routed out, level still parked
  33: { assigned: true,  db: -15 },    // Keys
};
const SILENT = 9;                       // a channel that never answers

let sqSock = null;
const fakeSQ = net.createServer(s => {
  sqSock = s;
  const parser = new NrpnParser(() => {});
  // We need the raw 'get' requests, which the NRPN parser deliberately ignores
  // (a get is an increment, not a write), so watch the byte stream directly.
  let buf = Buffer.alloc(0);
  s.on('data', d => {
    buf = Buffer.concat([buf, d]);
    // Each get is exactly 9 bytes: 63 MSB, 62 LSB, 60 7F.
    while (buf.length >= 9) {
      if (buf[1] === 0x63 && buf[4] === 0x62 && buf[7] === 0x60 && buf[8] === 0x7F) {
        answer((buf[2] << 7) | buf[5], s);
        buf = buf.slice(9);
      } else if (buf.length >= 12 && buf[1] === 0x63 && buf[7] === 0x06) {
        buf = buf.slice(12);                 // a normal write, ignore
      } else {
        buf = buf.slice(1);
      }
    }
  });
  s.on('error', () => {});
});

function answer(param, s) {
  const isAssign = param >= sq.LEVEL_BASE + sq.ASSIGN_OFFSET;
  const levelParam = isAssign ? param - sq.ASSIGN_OFFSET : param;
  const d = sq.decodeAuxSendParam(levelParam);
  if (!d || d.auxBus !== AUX) return;
  if (d.inputChannel === SILENT) return;                 // models a channel that never replies
  const st = DESK[d.inputChannel];
  const value = isAssign ? (st?.assigned ? 1 : 0)
                         : (st ? sq.dbToValue(st.db) : 0);
  try { s.write(sq.encodeNrpn(1, param, value)); } catch (e) {}
}

(async () => {
  await new Promise(r => fakeSQ.listen(SQ_PORT, '127.0.0.1', r));

  const bridge = spawn(process.execPath, [path.join(__dirname, 'bridge.js')], {
    env: { ...process.env, SQ5_IP: '127.0.0.1', SQ5_PORT: String(SQ_PORT),
           WS_PORT: String(WS_PORT), SQ5_MIDI_CHANNEL: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bridge.stdout.on('data', d => process.stdout.write('    | ' + d.toString().replace(/\n(?!$)/g, '\n    | ')));
  bridge.stderr.on('data', d => process.stderr.write('    ! ' + d.toString()));

  const done = () => { bridge.kill(); try { if (sqSock) sqSock.destroy(); } catch (e) {}
    fakeSQ.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed\n'); process.exit(fail ? 1 : 0); };

  await wait(1500);
  const ws = new WebSocket('ws://127.0.0.1:' + WS_PORT);
  const seen = [];
  ws.on('message', m => seen.push(JSON.parse(m.toString())));
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  await wait(300);

  console.log('\nScanning Aux ' + AUX + ' off the desk');
  ws.send(JSON.stringify({ action: 'scanMix', auxBus: AUX }));
  await wait(3000);

  const scan = seen.find(m => m.scan)?.scan;
  check('a scan result came back', !!scan, seen);
  if (!scan) return done();

  const byCh = Object.fromEntries(scan.channels.map(c => [c.inputChannel, c]));
  const assigned = scan.channels.filter(c => c.assigned).map(c => c.inputChannel);

  check('found exactly the channels routed into this mix',
    JSON.stringify(assigned) === JSON.stringify([1, 2, 5, 6, 12, 33]), assigned);
  check('a channel routed OUT is reported but not assigned',
    byCh[20] && byCh[20].assigned === false, byCh[20]);
  check('a channel that never answers is left out', !byCh[SILENT], byCh[SILENT]);
  // A real desk answers for all 48 inputs whether or not they are in the mix,
  // so the bridge reports them all and the app filters on `assigned`.
  check('every answering channel is reported',
    scan.answered === sq.MAX_INPUT - 1, scan.answered);
  check('an unrouted channel is present and marked not assigned',
    byCh[44] && byCh[44].assigned === false, byCh[44]);

  console.log('\nLevels read back off the desk');
  check('Ip1 reads -3 dB',  byCh[1]?.db === -3,  byCh[1]);
  check('Ip5 reads -6 dB',  byCh[5]?.db === -6,  byCh[5]);
  check('Ip12 reads 0 dB',  byCh[12]?.db === 0,  byCh[12]);
  check('Ip33 reads -15 dB', byCh[33]?.db === -15, byCh[33]);
  check('  -15 dB is half fader travel',
    Math.abs(byCh[33]?.level - 0.5) < 0.01, byCh[33]?.level);
  check('  0 dB is the top of the fader',
    Math.abs(byCh[12]?.level - 1) < 0.01, byCh[12]?.level);

  console.log('\nSetting a level still works after a scan');
  ws.send(JSON.stringify({ action: 'setLevel', inputChannel: 5, auxBus: AUX, level: 0.5 }));
  await wait(400);
  check('socket still healthy', ws.readyState === WebSocket.OPEN);

  console.log('\nScanning a bus with nothing on it');
  const n = seen.length;
  ws.send(JSON.stringify({ action: 'scanMix', auxBus: 9 }));
  await wait(3000);
  const empty = seen.slice(n).find(m => m.scan)?.scan;
  check('returns an empty mix rather than failing',
    empty && empty.channels.length === 0, empty);

  console.log('\nRejecting a bad scan request');
  const n2 = seen.length;
  ws.send(JSON.stringify({ action: 'scanMix', auxBus: 99 }));
  await wait(1500);
  check('out-of-range aux is refused', seen.slice(n2).some(m => m.error), seen.slice(n2));

  ws.close(); await wait(200); done();
})().catch(e => { console.error(e); process.exit(1); });
