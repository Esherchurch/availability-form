/* ===================================================================
   Mix Builder — Electron main process
   ===================================================================

   Scaffolding reused from ChurchShow (contextIsolation, preload
   bridge, ipcMain.handle, electron-builder nsis one-click). The
   renderer is the existing v2/mix-builder.html, unchanged — same DSP,
   same render, same layout, same UI. Only the container differs.

   What being a desktop app removes:
     - the File System Access API, and its permission dance
     - re-linking the audio folder every session: the path is saved
       with the project and the files are read straight off disk
     - the service worker, and with it a day of stale-file problems
   =================================================================== */

const { app, BrowserWindow, ipcMain, dialog, shell, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;

/* In development the page lives next door in the repo; once packaged it is
   copied into resources/app-page by electron-builder. */
function pagePath(file) {
  var name = file || 'mix-builder.html';
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app-page', name)
    : path.join(__dirname, '..', 'v2', name);
}

/* Where a remembered project lives when the user has not saved one anywhere
   in particular. Roaming app data, per user, like ChurchShow's store. */
function autoSavePath() {
  return path.join(app.getPath('userData'), 'last-project.mixproj');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: 'Mix Builder ' + app.getVersion(),
    backgroundColor: '#eef4f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Decoding and stretching 47 tracks is heavy; do not let Chromium slow
      // the renderer down when the window is not in front.
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  allowSpeakerChoice(win);
  win.loadFile(pagePath());
  win.on('closed', () => { win = null; });
}

/* Choosing which interface the mix comes out of is the reason the player
   exists: the laptop's own output has Dolby processing on it that compresses
   the mix before it reaches the speakers, and a plain interface does not.
   Chromium will not name the outputs, or let setSinkId switch between them,
   unless the page holds media permission — so grant that, and nothing else. */
function allowSpeakerChoice(w) {
  var ses = w.webContents.session;
  ses.setPermissionRequestHandler(function (wc, permission, done) {
    done(permission === 'media' || permission === 'speaker-selection');
  });
  ses.setPermissionCheckHandler(function (wc, permission) {
    return permission === 'media' || permission === 'speaker-selection';
  });
  ses.setDevicePermissionHandler(function () { return true; });
}

/* The player is its own window. Opening the builder to reach it would mean
   decoding 44 records before a party can start. */
let player = null;
function openPlayer() {
  if (player && !player.isDestroyed()) { player.focus(); return; }
  player = new BrowserWindow({
    width: 1200, height: 860, minWidth: 820, minHeight: 620,
    title: 'Mix Player', backgroundColor: '#0b0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
    }
  });
  player.setMenuBarVisibility(false);
  allowSpeakerChoice(player);
  player.loadFile(pagePath('mix-player.html'));
  player.on('closed', function () { player = null; });
}

app.whenReady().then(function () {
  /* "mix-builder.exe --player" starts straight into it */
  if (process.argv.indexOf('--player') !== -1) openPlayer();
  else createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

/* --------------------------------------------------------- audio --- */

const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'aif', 'aiff', 'wma']);

ipcMain.handle('audio:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose the folder your music is in',
    properties: ['openDirectory']
  });
  return r.canceled ? null : r.filePaths[0];
});

/* List the audio in a folder and its subfolders. Nothing is copied — the paths
   are handles onto the user's own disk, read on demand. */
ipcMain.handle('audio:scanFolder', (e, folder) => {
  const out = [];
  const walk = (dir, depth) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (err) { return; }
    for (const en of ents) {
      if (out.length >= 4000) return;
      const p = path.join(dir, en.name);
      if (en.isDirectory()) {
        /* Deep enough for a library filed by artist and album, and then
           some: a set can be anywhere under the folder that was chosen. */
        if (depth < 5 && !en.name.startsWith('.')) walk(p, depth + 1);
        continue;
      }
      const ext = en.name.split('.').pop().toLowerCase();
      if (!AUDIO_EXT.has(ext)) continue;
      let size = 0;
      try { size = fs.statSync(p).size; } catch (err) {}
      out.push({ name: en.name, path: p, size: size });
    }
  };
  if (!folder) return [];
  walk(folder, 0);
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return out;
});

/* Raw bytes for one file. Returned as a Buffer, which reaches the renderer as
   a Uint8Array — no base64, because 47 tracks would be a third bigger and a
   round trip through a string for no reason. */
ipcMain.handle('audio:read', (e, p) => {
  const st = fs.statSync(p);
  if (st.size > 400 * 1024 * 1024) throw new Error('File too large: ' + p);
  return fs.readFileSync(p);
});

ipcMain.handle('audio:exists', (e, p) => {
  try { return fs.statSync(p).isFile(); } catch (err) { return false; }
});

/* ------------------------------------------------------- project --- */
/* A project is a file on disk. Reopening restores everything, including which
   folder the audio came from, so there is nothing to re-import. */

ipcMain.handle('project:autoSave', (e, json) => {
  try {
    fs.mkdirSync(path.dirname(autoSavePath()), { recursive: true });
    fs.writeFileSync(autoSavePath(), json, 'utf8');
    return true;
  } catch (err) { return false; }
});

ipcMain.handle('project:autoLoad', () => {
  try { return fs.readFileSync(autoSavePath(), 'utf8'); } catch (err) { return null; }
});

ipcMain.handle('project:saveAs', async (e, json) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save mix project',
    defaultPath: 'Disco.mixproj',
    filters: [{ name: 'Mix Builder project', extensions: ['mixproj'] }]
  });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, json, 'utf8');
  return r.filePath;
});

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open mix project',
    properties: ['openFile'],
    filters: [{ name: 'Mix Builder project', extensions: ['mixproj'] }]
  });
  if (r.canceled) return null;
  try {
    return { path: r.filePaths[0], json: fs.readFileSync(r.filePaths[0], 'utf8') };
  } catch (err) { return null; }
});

/* --------------------------------------------------------- mixdown --- */
/* The finished WAV goes straight to disk rather than through a download. */

ipcMain.handle('mix:save', async (e, bytes, suggested) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save the mix',
    defaultPath: suggested || 'mix.wav',
    filters: [{ name: 'WAV audio', extensions: ['wav'] }]
  });
  if (r.canceled) return null;
  fs.writeFileSync(r.filePath, Buffer.from(bytes));
  return r.filePath;
});

/* ------------------------------------------------------- player --- */

ipcMain.handle('player:open', () => { openPlayer(); return true; });

ipcMain.handle('player:pickWav', async (e) => {
  const from = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(from, {
    title: 'Open the mix',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['wav', 'flac', 'mp3', 'm4a'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});

function playerStatePath() {
  return path.join(app.getPath('userData'), 'player-state.json');
}
ipcMain.handle('player:saveState', (e, json) => {
  try { fs.writeFileSync(playerStatePath(), json, 'utf8'); return true; } catch (err) { return false; }
});
ipcMain.handle('player:loadState', () => {
  try { return fs.readFileSync(playerStatePath(), 'utf8'); } catch (err) { return null; }
});

/* A laptop that sleeps at midnight takes the music with it. */
let awake = 0;
ipcMain.handle('player:keepAwake', (e, on) => {
  try {
    if (on && !powerSaveBlocker.isStarted(awake)) awake = powerSaveBlocker.start('prevent-display-sleep');
    else if (!on && powerSaveBlocker.isStarted(awake)) powerSaveBlocker.stop(awake);
    return true;
  } catch (err) { return false; }
});

ipcMain.handle('shell:showItem', (e, p) => { try { shell.showItemInFolder(p); } catch (err) {} });
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:userData', () => app.getPath('userData'));
