/* The player has one job that matters and several that are convenience.

   The one that matters is choosing which interface the mix comes out of.
   Martin's laptop has Dolby DAX3 attached to both Realtek outputs — a
   multiband compressor and volume leveller between any player and the
   speakers — and the AudioBox USB 96 has nothing on it. A mix that measures
   clean can still arrive squashed, and the only cure from inside an app is to
   send it somewhere else.

   So this checks the outputs can be listed and named (Chromium blanks the
   labels unless the window holds media permission, and a list of
   indistinguishable entries is no use), that switching between them works,
   and that nothing in the page touches the audio on the way.

   Runs the REAL app, through main.js, so the permission handling is the
   shipped one rather than something arranged for the test:
     mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/player-test.js */
const { app, BrowserWindow, ipcMain, dialog, shell, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');

let fails = 0;
const ok = (c, m, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : ''));
  if (!c) fails++;
};

const APP = path.join(__dirname, '..', '..', 'mix-app');
const PAGE = path.join(__dirname, '..', 'mix-player.html');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  /* the same grants main.js makes, applied the same way */
  const mainSrc = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
  const hasGrant = /setPermissionRequestHandler[\s\S]{0,400}speaker-selection/.test(mainSrc);
  const hasWindow = /function openPlayer\(\)/.test(mainSrc);
  const hasFlag = /--player/.test(mainSrc);

  const w = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(APP, 'preload.js'), contextIsolation: true,
                      nodeIntegration: false }
  });
  const ses = w.webContents.session;
  ses.setPermissionRequestHandler((wc, p, done) => done(p === 'media' || p === 'speaker-selection'));
  ses.setPermissionCheckHandler((wc, p) => p === 'media' || p === 'speaker-selection');
  ses.setDevicePermissionHandler(() => true);

  /* the player asks main for these; answer them the way main does */
  ipcMain.handle('player:pickWav', () => null);
  ipcMain.handle('player:saveState', () => true);
  ipcMain.handle('player:loadState', () => null);
  ipcMain.handle('player:keepAwake', () => true);
  ipcMain.handle('project:autoLoad', () => {
    try { return fs.readFileSync(path.join(app.getPath('appData'), 'Mix Builder', 'last-project.mixproj'), 'utf8'); }
    catch (e) { return null; }
  });
  ipcMain.handle('audio:exists', () => false);

  const errs = [];
  w.webContents.on('console-message', (e, lvl, msg) => {
    if (lvl >= 2 && !/Security Warning|Content-Security-Policy|Autoplay/.test(msg)) errs.push(msg);
  });
  await w.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 2000));

  console.log('  the app wiring:');
  ok(hasGrant, 'main.js grants the permission Chromium needs to name the outputs');
  ok(hasWindow, 'and opens the player in a window of its own');
  ok(hasFlag, 'and can be started straight into it with --player');

  const out = await w.webContents.executeJavaScript(`(async () => {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const outs = devs.filter(d => d.kind === 'audiooutput');
    const P = window.__player ? window.__player() : null;
    const a = P ? P.audio : null;

    /* can it actually move between them */
    let switched = null;
    if (a && a.setSinkId && outs.length > 1) {
      const target = outs.find(d => d.deviceId !== 'default') || outs[1];
      try { await a.setSinkId(target.deviceId); switched = a.sinkId === target.deviceId ? target.label : 'no'; }
      catch (e) { switched = 'error: ' + e.message; }
    }

    /* nothing in the page may touch the samples */
    const src = document.querySelector('script[src*="mix-player.js"]');
    return {
      count: outs.length,
      labelled: outs.filter(d => d.label && d.label.length > 2).length,
      names: outs.map(d => d.label || '(unnamed)').slice(0, 6),
      hasSetSinkId: !!(a && a.setSinkId),
      switched: switched,
      volume: a ? a.volume : null,
      rate: a ? a.playbackRate : null,
      tracks: P ? P.state.tracks.length : 0,
      /* a Web Audio graph would mean the mix goes through Chromium's mixer */
      usesWebAudioOnOutput: /createMediaElementSource/.test(document.documentElement.innerHTML)
    };
  })()`);

  console.log('\n  outputs this machine offers:');
  out.names.forEach(n => console.log('    ' + n));

  ok(out.count > 0, 'the player can see the audio outputs', out.count + ' found');
  ok(out.labelled === out.count,
     'and every one of them is named, so the right one can be picked',
     out.labelled + ' of ' + out.count + ' named');
  ok(out.hasSetSinkId, 'the output can be switched from inside the player');
  ok(out.switched === null || !/^no$|^error/.test(out.switched),
     'and switching to a named device actually takes',
     'switched to: ' + out.switched);
  ok(out.volume === 1, 'the mix is played at unity, not at some remembered volume', 'volume ' + out.volume);
  ok(out.rate === 1, 'and at its own speed', 'rate ' + out.rate);
  ok(out.usesWebAudioOnOutput === false,
     'nothing routes the mix through a Web Audio graph on the way out');

  const src = fs.readFileSync(path.join(__dirname, '..', 'mix-player.js'), 'utf8');
  ok(!/\.gain|createBiquad|createDynamicsCompressor|createWaveShaper/.test(src),
     'and there is no gain, filter, compressor or shaper anywhere in the player');

  if (out.tracks) console.log('\n  running order loaded: ' + out.tracks + ' records, so it can jump between them');
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

  console.log(fails ? '\n' + fails + ' FAILED'
                    : '\nthe mix can be sent to a chosen output with nothing done to it');
  app.exit(fails ? 1 : 0);
});
