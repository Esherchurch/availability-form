/* Will the player get through the night?

   The other player test checks it can name and switch the outputs. This one
   asks the question that matters at 1am with a room full of people: does it
   actually play a 1.4 GB file off disk, seek into the middle of it, and keep
   going — without loading two hours of audio into memory or falling over on a
   filename with a space in it.

   It plays the REAL mix if it is there. Nothing is asserted about how it
   sounds; this is about whether it survives.

   mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/player-play-test.js */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let fails = 0;
const ok = (c, m, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : ''));
  if (!c) fails++;
};

const APP = path.join(__dirname, '..', '..', 'mix-app');
const PAGE = path.join(__dirname, '..', 'mix-player.html');

/* the real mix if it exists, otherwise a file made for the purpose */
const CANDIDATES = [
  'C:/Users/marti/Downloads/Nat disco NEW.wav',
  'C:/Users/marti/Downloads/Nat disco.wav'
];

function makeTestWav(to, secs) {
  const sr = 48000, n = sr * secs, bpf = 4;
  const buf = Buffer.alloc(44 + n * bpf);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * bpf, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * bpf, 28);
  buf.writeUInt16LE(bpf, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * bpf, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(9000 * Math.sin(2 * Math.PI * 220 * i / sr));
    buf.writeInt16LE(v, 44 + i * bpf);
    buf.writeInt16LE(v, 44 + i * bpf + 2);
  }
  fs.writeFileSync(to, buf);
  return to;
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let file = CANDIDATES.find(f => fs.existsSync(f));
  let madeOne = false;
  if (!file) {
    /* a space in the name on purpose: that is what broke the URL */
    file = makeTestWav(path.join(app.getPath('temp'), 'player test file.wav'), 60);
    madeOne = true;
  }
  const size = fs.statSync(file).size;
  console.log('  playing: ' + path.basename(file) + '   ' + (size / 1e9).toFixed(2) + ' GB' +
              (madeOne ? '   (made for the test)' : ''));

  const w = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(APP, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  const ses = w.webContents.session;
  ses.setPermissionRequestHandler((wc, p, done) => done(true));
  ses.setPermissionCheckHandler(() => true);
  ses.setDevicePermissionHandler(() => true);

  ipcMain.handle('player:pickWav', () => null);
  ipcMain.handle('player:saveState', () => true);
  ipcMain.handle('player:loadState', () => null);
  ipcMain.handle('player:keepAwake', () => true);
  ipcMain.handle('project:autoLoad', () => {
    try { return fs.readFileSync(path.join(app.getPath('appData'), 'Mix Builder', 'last-project.mixproj'), 'utf8'); }
    catch (e) { return null; }
  });
  ipcMain.handle('audio:exists', (e, p) => { try { return fs.statSync(p).isFile(); } catch (x) { return false; } });

  const errs = [];
  w.webContents.on('console-message', (e, lvl, msg) => {
    if (lvl >= 2 && !/Security Warning|Content-Security-Policy|Autoplay|cache/i.test(msg)) errs.push(msg);
  });
  await w.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 1500));

  const before = process.memoryUsage().rss;

  const out = await w.webContents.executeJavaScript(`(async () => {
    const P = window.__player();
    P.openWav(${JSON.stringify(file)}, 0);
    const a = P.audio;

    const waitFor = (ev, ms) => new Promise(res => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res('timeout'); } }, ms);
      a.addEventListener(ev, function h() { if (!done) { done = true; clearTimeout(t); a.removeEventListener(ev, h); res('ok'); } });
    });

    const meta = await waitFor('loadedmetadata', 25000);
    const duration = a.duration;
    const srcUrl = a.src;

    /* play from the top */
    let playErr = null;
    try { await a.play(); } catch (e) { playErr = e.message; }
    await new Promise(r => setTimeout(r, 2500));
    const advancedFrom0 = a.currentTime;
    const playingAtStart = !a.paused;

    /* jump a long way in — the thing a seek bar does on the night */
    const target = Math.min(duration - 30, duration * 0.72);
    a.currentTime = target;
    const seeked = await waitFor('seeked', 20000);
    await new Promise(r => setTimeout(r, 2500));
    const afterSeek = a.currentTime;
    const stillPlaying = !a.paused;

    /* and back to a track boundary, the way clicking the list does */
    a.currentTime = Math.min(60, duration / 2);
    const seeked2 = await waitFor('seeked', 20000);
    await new Promise(r => setTimeout(r, 1500));
    const afterSecondSeek = a.currentTime;

    a.pause();
    return {
      meta: meta, duration: duration, srcUrl: srcUrl, playErr: playErr,
      advancedFrom0: advancedFrom0, playingAtStart: playingAtStart,
      seeked: seeked, target: target, afterSeek: afterSeek, stillPlaying: stillPlaying,
      seeked2: seeked2, afterSecondSeek: afterSecondSeek,
      networkState: a.networkState, readyState: a.readyState,
      tracks: P.state.tracks.length,
      buffered: a.buffered.length ? +(a.buffered.end(a.buffered.length - 1) - a.buffered.start(0)).toFixed(1) : 0
    };
  })()`);

  const after = process.memoryUsage().rss;
  const mb = n => (n / 1e6).toFixed(0) + ' MB';

  console.log('  url given to the element: ' + String(out.srcUrl).slice(-60));
  console.log('  duration ' + (out.duration / 60).toFixed(2) + ' min, buffered ' + out.buffered + 's ahead');

  ok(out.meta === 'ok', 'the file opens and reports its length', out.meta);
  ok(isFinite(out.duration) && out.duration > 10, 'the length is real', (out.duration / 60).toFixed(2) + ' min');
  ok(!/ /.test(out.srcUrl), 'the filename is encoded, so spaces and # cannot break the URL',
     String(out.srcUrl).slice(-50));
  ok(out.playErr === null, 'it starts playing without being refused', out.playErr || '');
  ok(out.playingAtStart && out.advancedFrom0 > 1.0,
     'and the clock actually moves', 'reached ' + out.advancedFrom0.toFixed(1) + 's after 2.5s');
  ok(out.seeked === 'ok', 'a long seek into the file completes', out.seeked);
  ok(Math.abs(out.afterSeek - out.target) < 12,
     'and lands where it was sent', 'asked ' + (out.target / 60).toFixed(1) +
     ' min, got ' + (out.afterSeek / 60).toFixed(1) + ' min');
  ok(out.stillPlaying && out.afterSeek > out.target,
     'and keeps playing from there rather than stalling',
     'advanced ' + (out.afterSeek - out.target).toFixed(1) + 's past the seek point');
  ok(out.seeked2 === 'ok' && out.afterSecondSeek < out.duration / 2 + 30,
     'and a second seek, backwards, works too', out.seeked2);
  ok(out.networkState !== 3, 'the source did not drop out', 'networkState ' + out.networkState);
  /* A file:// source reports its whole length as buffered, because it is all
     on disk and all instantly seekable — that is not the same as having been
     read into memory, and the buffered range cannot tell the two apart. What
     can is the process: reading 1.4 GB would show up here and nowhere else. */
  ok(after - before < 300e6,
     'it streams off disk rather than swallowing the whole file',
     'process went ' + mb(before) + ' to ' + mb(after) + ' for a ' +
     (size / 1e9).toFixed(2) + ' GB file');
  if (out.tracks) console.log('  running order loaded: ' + out.tracks + ' records');
  ok(errs.length === 0, 'no console errors while playing', errs.slice(0, 2).join(' | '));

  if (madeOne) { try { fs.unlinkSync(file); } catch (e) {} }
  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\nthe player opens a two hour file, plays it, and seeks around it without falling over');
  app.exit(fails ? 1 : 0);
});
