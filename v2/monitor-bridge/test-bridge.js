'use strict';
/*
 * End-to-end smoke test. Stands up a fake SQ5 that just records the bytes it
 * receives, starts the real bridge against it, drives it over a WebSocket the
 * way a tablet would, and checks what came out the other side.
 *
 *   node test-bridge.js
 *
 * Nothing here touches a real mixer.
 */
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const sq = require('./sq5');

const FAKE_SQ_PORT = 51999;
const WS_PORT = 3999;

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
};
const hex = b => [...b].map(x => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const wait = ms => new Promise(r => setTimeout(r, ms));

let received = Buffer.alloc(0);
let sqSocket = null;

const fakeSQ = net.createServer(s => {
  sqSocket = s;
  s.on('data', d => { received = Buffer.concat([received, d]); });
  s.on('error', () => {});
});

async function main() {
  await new Promise(r => fakeSQ.listen(FAKE_SQ_PORT, '127.0.0.1', r));
  console.log('\nfake SQ5 listening on 127.0.0.1:' + FAKE_SQ_PORT);

  const bridge = spawn(process.execPath, [path.join(__dirname, 'bridge.js')], {
    env: { ...process.env,
      SQ5_IP: '127.0.0.1', SQ5_PORT: String(FAKE_SQ_PORT),
      WS_PORT: String(WS_PORT), SQ5_MIDI_CHANNEL: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bridge.stdout.on('data', d => process.stdout.write('    | ' + d.toString().replace(/\n(?!$)/g, '\n    | ')));
  bridge.stderr.on('data', d => process.stderr.write('    ! ' + d.toString()));

  const done = () => {
    bridge.kill();
    try { if (sqSocket) sqSocket.destroy(); } catch (e) {}
    fakeSQ.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
    process.exit(fail ? 1 : 0);
  };

  await wait(1500);
  check('bridge opened a TCP connection to the mixer', sqSocket !== null);

  console.log('\nConnecting a tablet');
  const ws = new WebSocket('ws://127.0.0.1:' + WS_PORT);
  const seen = [];
  ws.on('message', m => seen.push(JSON.parse(m.toString())));
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  await wait(300);

  check('bridge announces mixer status on connect',
    seen.some(m => m.status === 'connected'), JSON.stringify(seen));

  console.log('\nMoving a fader: Ip12 -> Aux3 at unity');
  received = Buffer.alloc(0);
  ws.send(JSON.stringify({ action: 'setLevel', inputChannel: 12, auxBus: 3, level: 1.0 }));
  await wait(400);

  const expected = sq.encodeAuxSend(1, 12, 3, sq.UNITY);
  check('exactly 12 bytes reached the mixer', received.length === 12, received.length + ' bytes');
  check('bytes are the right NRPN sequence', received.equals(expected),
    'got ' + hex(received) + ', expected ' + hex(expected));
  // 8192 + 68 + (12-1)*12 + (3-1) = 8394 = 41 4A
  check('  address is 41 4A (Ip12 -> Aux3)',
    hex(received.slice(0, 6)) === 'B0 63 41 B0 62 4A', hex(received.slice(0, 6)));
  check('  value is unity 76 5C',
    hex(received.slice(6)) === 'B0 06 76 B0 26 5C', hex(received.slice(6)));

  console.log('\nFader all the way down');
  received = Buffer.alloc(0);
  ws.send(JSON.stringify({ action: 'setLevel', inputChannel: 12, auxBus: 3, level: 0 }));
  await wait(300);
  check('sends value 0 (off)', hex(received.slice(6)) === 'B0 06 00 B0 26 00', hex(received));

  console.log('\nRejecting nonsense');
  const before = seen.length;
  received = Buffer.alloc(0);
  ws.send(JSON.stringify({ action: 'setLevel', inputChannel: 99, auxBus: 3, level: 0.5 }));
  await wait(300);
  check('out-of-range channel sends nothing to the mixer', received.length === 0, hex(received));
  check('out-of-range channel returns an error', seen.slice(before).some(m => m.error), JSON.stringify(seen.slice(before)));

  received = Buffer.alloc(0);
  ws.send(JSON.stringify({ action: 'setLevel', inputChannel: 5, auxBus: 2, level: 4 }));
  await wait(300);
  check('level above 1.0 sends nothing', received.length === 0, hex(received));

  ws.send('this is not json');
  await wait(200);
  check('bad JSON does not kill the bridge', ws.readyState === WebSocket.OPEN);

  console.log('\nMixer goes away mid-service');
  const n0 = seen.length;
  sqSocket.destroy();
  await wait(600);
  check('tablet is told the mixer dropped',
    seen.slice(n0).some(m => m.status === 'disconnected'), JSON.stringify(seen.slice(n0)));

  received = Buffer.alloc(0);
  ws.send(JSON.stringify({ action: 'setLevel', inputChannel: 5, auxBus: 2, level: 0.5 }));
  await wait(300);
  check('fader move while offline returns an error rather than throwing',
    seen.some(m => m.error === 'mixer offline'));

  console.log('\nMixer comes back');
  const n1 = seen.length;
  await wait(2500);
  check('bridge reconnected on its own',
    seen.slice(n1).some(m => m.status === 'connected'), JSON.stringify(seen.slice(n1)));

  received = Buffer.alloc(0);
  ws.send(JSON.stringify({ action: 'setLevel', inputChannel: 1, auxBus: 1, level: 0.5 }));
  await wait(400);
  check('faders work again after the reconnect', received.length === 12, hex(received));
  check('  address is 40 44 (Ip1 -> Aux1)',
    hex(received.slice(0, 6)) === 'B0 63 40 B0 62 44', hex(received.slice(0, 6)));
  check('  half travel lands at -15 dB, not -64 dB',
    hex(received.slice(6)) === hex(sq.encodeNrpn(1, 0, sq.dbToValue(-15)).slice(6)), hex(received.slice(6)));

  ws.close();
  await wait(200);
  done();
}

main().catch(e => { console.error(e); process.exit(1); });
