'use strict';
/*
 * EGBC Monitor Bridge
 *
 * Tablets can't open raw TCP sockets, so they can't talk to the SQ5 directly.
 * This sits on a PC on the church network, accepts WebSocket connections from
 * the Performance App, and forwards each fader move to the mixer as MIDI NRPN
 * over TCP.
 *
 *   tablet  --WebSocket-->  bridge  --TCP MIDI :51325-->  SQ5
 *
 * Run it with start-monitor-bridge.bat, or `node bridge.js`.
 * Configuration comes from config.json next to this file, overridden by
 * environment variables. See README.md.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { WebSocketServer } = require('ws');
const sq = require('./sq5');
const { NrpnParser } = require('./midi-parse');

// ── CONFIG ──────────────────────────────────────────────────────────────────
function loadConfig() {
  let file = {};
  const p = path.join(__dirname, 'config.json');
  try {
    if (fs.existsSync(p)) file = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('config.json could not be read (' + e.message + '), using defaults');
  }
  const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? d : Number(v));
  return {
    sqIp:        process.env.SQ5_IP            || file.sqIp        || '192.168.1.60',
    sqPort:  num(process.env.SQ5_PORT,            num(file.sqPort, 51325)),
    midiChannel: num(process.env.SQ5_MIDI_CHANNEL, num(file.midiChannel, 1)),
    wsPort:  num(process.env.WS_PORT,             num(file.wsPort, 3000)),
    // The level a fader at the very top reaches. Defaults to 0 dB (unity)
    // rather than the mixer's +10 dB ceiling, so a fader pinned to the top
    // cannot push a wedge 10 dB hot. Raise it only deliberately.
    maxDb: Math.min(10, num(process.env.SQ5_MAX_DB, num(file.maxDb, 0))),
    // The Performance App is served from GitHub Pages over HTTPS, and browsers
    // refuse a plain ws:// connection from an HTTPS page. Point these at a
    // certificate and the bridge serves wss:// instead. See README.
    tlsCert: process.env.SQ5_TLS_CERT || file.tlsCert || '',
    tlsKey:  process.env.SQ5_TLS_KEY  || file.tlsKey  || '',
  };
}

const cfg = loadConfig();

const ts = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log('[' + ts() + ']', ...a);

// ── READING THE DESK BACK ───────────────────────────────────────────────────
// Everything the mixer sends runs through one parser. Replies to a 'get' land
// here as (parameter, value); a scan in progress picks up the ones it asked for.
const answers = new Map();      // parameter -> value, most recent wins
let scanCollecting = false;

const parser = new NrpnParser((param, value) => {
  if (scanCollecting) answers.set(param, value);
});

/*
 * Ask the desk what's actually in a mix.
 *
 * For every input channel we request its assignment to this aux and its send
 * level, then wait for the replies to arrive. The SQ answers asynchronously and
 * gives no completion signal, so this is a collection window: send everything,
 * wait, read what came back. Channels that don't answer are reported as unknown
 * rather than guessed at.
 */
async function scanMix(auxBus) {
  if (!sqConnected) throw new Error('mixer offline');
  if (!Number.isInteger(auxBus) || auxBus < 1 || auxBus > sq.AUX_COUNT) {
    throw new RangeError('auxBus must be an integer 1..' + sq.AUX_COUNT);
  }

  answers.clear();
  scanCollecting = true;

  // Paced in small batches. The desk copes with a burst, but 96 requests in one
  // write is a lot to ask of a mixer that is also running a service.
  const gets = [];
  for (let ch = 1; ch <= sq.MAX_INPUT; ch++) {
    gets.push(sq.encodeGet(cfg.midiChannel, sq.auxAssignParam(ch, auxBus)));
    gets.push(sq.encodeGet(cfg.midiChannel, sq.auxSendParam(ch, auxBus)));
  }
  for (let i = 0; i < gets.length; i += 12) {
    if (!sendToSQ(Buffer.concat(gets.slice(i, i + 12)))) {
      scanCollecting = false;
      throw new Error('mixer offline');
    }
    await sleep(25);
  }

  await sleep(SCAN_WINDOW_MS);
  scanCollecting = false;

  const channels = [];
  for (let ch = 1; ch <= sq.MAX_INPUT; ch++) {
    const assign = answers.get(sq.auxAssignParam(ch, auxBus));
    const level  = answers.get(sq.auxSendParam(ch, auxBus));
    if (assign === undefined && level === undefined) continue;   // silent channel
    channels.push({
      inputChannel: ch,
      assigned: assign === undefined ? null : assign > 0,
      value: level === undefined ? null : level,
      db: level === undefined ? null : (level > 0 ? Number(sq.valueToDb(level).toFixed(1)) : null),
      level: level === undefined ? null : Number(sq.valueToPosition(level, cfg.maxDb).toFixed(3)),
    });
  }

  return {
    auxBus,
    answered: channels.length,
    scanned: sq.MAX_INPUT,
    channels,
  };
}

const SCAN_WINDOW_MS = 900;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── TCP LINK TO THE MIXER ───────────────────────────────────────────────────
let sock = null;
let sqConnected = false;
let reconnectDelay = 1000;
let reconnectTimer = null;

function setConnected(up) {
  if (sqConnected === up) return;
  sqConnected = up;
  log(up ? 'SQ5 connected'  : 'SQ5 disconnected');
  broadcast({ status: up ? 'connected' : 'disconnected' });
}

function connectToSQ() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  sock = new net.Socket();
  sock.setNoDelay(true);          // fader moves are tiny; don't let Nagle sit on them

  sock.connect(cfg.sqPort, cfg.sqIp, () => {
    reconnectDelay = 1000;
    setConnected(true);
  });

  // The SQ talks back - replies to our 'get' commands, plus whatever else it
  // emits. Parse it so a mix scan can read the desk's real state.
  sock.on('data', d => parser.push(d));

  sock.on('error', (err) => {
    if (sqConnected || reconnectDelay === 1000) log('SQ5 socket error:', err.message);
  });

  sock.on('close', () => {
    setConnected(false);
    sock = null;
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToSQ();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 15000);   // back off to 15s
}

function sendToSQ(bytes) {
  if (!sock || !sqConnected) return false;
  try {
    sock.write(bytes);
    return true;
  } catch (e) {
    log('write failed:', e.message);
    return false;
  }
}

// ── WEBSOCKET SERVER ────────────────────────────────────────────────────────
// Plain ws:// unless a certificate is configured, in which case wss:// — which
// is what an HTTPS-hosted Performance App needs.
let httpsServer = null;
let wss;

function onListenError(err) {
  log('listen error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error('\nPort ' + cfg.wsPort + ' is already in use. Is the bridge already running?\n');
    process.exit(1);
  }
}

if (cfg.tlsCert && cfg.tlsKey) {
  try {
    httpsServer = https.createServer({
      cert: fs.readFileSync(cfg.tlsCert),
      key:  fs.readFileSync(cfg.tlsKey),
    });
    httpsServer.on('request', (req, res) => {
      // Handy for trusting the certificate: browse to https://<bridge>:3000/
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('EGBC Monitor Bridge is running. Mixer ' + (sqConnected ? 'connected' : 'offline') + '.\n');
    });
    // ws re-emits 'listening' from the server it's attached to, so don't fire
    // it by hand as well or the startup banner prints twice.
    wss = new WebSocketServer({ server: httpsServer });
    httpsServer.on('error', onListenError);
    httpsServer.listen(cfg.wsPort);
  } catch (e) {
    console.error('\nCould not load the TLS certificate (' + e.message + ').');
    console.error('Falling back to plain ws://, which an HTTPS page cannot connect to.\n');
    httpsServer = null;
  }
}
if (!wss) wss = new WebSocketServer({ port: cfg.wsPort });

const SCHEME = httpsServer ? 'wss' : 'ws';

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.send(msg); } catch (e) { /* client is going away */ }
    }
  }
}

wss.on('listening', () => {
  log('Monitor bridge listening on ' + SCHEME + '://0.0.0.0:' + cfg.wsPort);
  log('Mixer target ' + cfg.sqIp + ':' + cfg.sqPort + ', MIDI channel ' + cfg.midiChannel);
  log('Fader top = ' + fmtDb(cfg.maxDb) + ', travel ' + sq.TAPER_RANGE_DB + ' dB' +
      (cfg.maxDb > 0 ? '   *** ABOVE UNITY ***' : ''));
  if (SCHEME === 'ws') {
    log('NOTE: plain ws://. A Performance App served over HTTPS will refuse to');
    log('      connect to this. See "Certificates" in README.md.');
  }
});

wss.on('error', onListenError);

wss.on('connection', (ws, req) => {
  const who = (req.socket.remoteAddress || '?').replace('::ffff:', '');
  log('tablet connected from ' + who + ' (' + wss.clients.size + ' now on)');

  // Tell it where things stand straight away, so the dot is right on open.
  try { ws.send(JSON.stringify({ status: sqConnected ? 'connected' : 'disconnected' })); } catch (e) {}

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return reply(ws, { error: 'bad JSON' });
    }
    handle(ws, msg, who);
  });

  ws.on('close', () => log('tablet ' + who + ' disconnected (' + wss.clients.size + ' left)'));
  ws.on('error', (e) => log('tablet ' + who + ' error: ' + e.message));
});

function reply(ws, obj) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

let scanInFlight = null;

function handle(ws, msg, who) {
  if (msg.action === 'ping') return reply(ws, { pong: true, status: sqConnected ? 'connected' : 'disconnected' });

  if (msg.action === 'scanMix') {
    // One scan at a time - two tablets opening at once would otherwise have
    // their replies land in the same collection window and confuse each other.
    if (!scanInFlight) {
      const aux = Number(msg.auxBus);
      log(who + ': scanning Aux' + aux + ' on the desk');
      scanInFlight = scanMix(aux)
        .then(r => { log('  Aux' + aux + ': ' + r.channels.filter(c => c.assigned).length +
                         ' channels assigned, ' + r.answered + '/' + r.scanned + ' answered'); return r; })
        .finally(() => { scanInFlight = null; });
    }
    scanInFlight
      .then(r => reply(ws, { scan: r }))
      .catch(e => reply(ws, { error: e.message, scanFailed: true }));
    return;
  }

  if (msg.action !== 'setLevel') {
    return reply(ws, { error: 'unknown action: ' + msg.action });
  }

  const inputChannel = Number(msg.inputChannel);
  const auxBus = Number(msg.auxBus);
  const level = Number(msg.level);

  if (!Number.isFinite(level) || level < 0 || level > 1) {
    return reply(ws, { error: 'level must be 0.0 - 1.0' });
  }

  let bytes;
  try {
    const value = sq.levelToValue(level, cfg.maxDb);
    bytes = sq.encodeAuxSend(cfg.midiChannel, inputChannel, auxBus, value);
    if (!sendToSQ(bytes)) {
      return reply(ws, { error: 'mixer offline', status: 'disconnected' });
    }
    log(who + ': Ip' + inputChannel + ' -> Aux' + auxBus + ' = ' +
        (level * 100).toFixed(0) + '% (' + fmtDb(sq.valueToDb(value)) + ')');
    reply(ws, { ok: true, inputChannel, auxBus, level });
  } catch (e) {
    reply(ws, { error: e.message });
  }
}

function fmtDb(db) {
  if (!Number.isFinite(db)) return '-inf';
  return (db > 0.05 ? '+' : '') + db.toFixed(1) + ' dB';
}

// Drop tablets that have walked out of wifi range rather than holding the slot.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 20000);

wss.on('close', () => clearInterval(heartbeat));

// ── GO ──────────────────────────────────────────────────────────────────────
console.log('\n  EGBC Monitor Bridge\n  ===================\n');
connectToSQ();

function shutdown() {
  log('shutting down');
  clearInterval(heartbeat);
  try { wss.close(); } catch (e) {}
  if (httpsServer) { try { httpsServer.close(); } catch (e) {} }
  if (sock) { try { sock.destroy(); } catch (e) {} }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
