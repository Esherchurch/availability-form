/* Load a folder of drum loops into the library in one go.

   The same path the "Import drum loops…" button takes — analysed, tempo
   reconciled against the filename, stored audio-first — just without picking
   twenty-five files by hand.

     node_modules\.bin\electron import-drums.js "C:\path\to\loops"

   Mix Builder must be CLOSED: the library is a database with one writer.  */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('usage: electron import-drums.js <folder-of-loops>');
  process.exit(2);
}
/* The app's own data, not Electron's.

   Run through the bare electron binary, userData defaults to %APPDATA%\Electron
   — so a first attempt at this loaded twenty-five loops into a profile no
   version of Mix Builder has ever opened, and the library looked untouched.
   Named explicitly now, and printed, so where it went is never a guess. */
const PROFILE = process.argv[3] ||
  path.join(process.env.APPDATA || app.getPath('appData'), 'Mix Builder');
app.setPath('userData', PROFILE);

/* Printing into a closed pipe must not put an error box on the user's screen.
   Piping this to "head" closes stdout part-way through, console.log throws
   EPIPE, and Electron shows an uncaught main-process exception as a modal
   dialog — over whatever they were doing. */
process.stdout.on('error', function (e) { if (e && e.code === 'EPIPE') process.exit(0); });
process.on('uncaughtException', function (e) {
  if (e && e.code === 'EPIPE') process.exit(0);
  console.error(e); process.exit(2);
});
app.disableHardwareAcceleration();
const PAGE = path.join(__dirname, '..', 'v2', 'mix-builder.html');
const AUDIO = /\.(wav|mp3|m4a|flac|ogg|aiff?)$/i;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: false } });
  await win.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 2500));

  const files = fs.readdirSync(dir).filter(f => AUDIO.test(f));
  console.log('importing ' + files.length + ' loops from ' + dir + '\n');

  for (const name of files) {
    const b64 = fs.readFileSync(path.join(dir, name)).toString('base64');
    const r = await win.webContents.executeJavaScript(`(async () => {
      const bin = atob(${JSON.stringify(b64)});
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const already = (await window.MixProject.listDrumLoops())
        .filter(l => l.sourceFile === ${JSON.stringify(name)});
      if (already.length) return { skipped: true };
      const f = new File([u8], ${JSON.stringify(name)}, { type: 'audio/wav' });
      await window.__importDrumLoops([f]);
      const all = await window.MixProject.listDrumLoops();
      const mine = all.filter(l => l.sourceFile === ${JSON.stringify(name)})[0];
      return mine ? { name: mine.name, bpm: mine.bpm, beats: mine.beats, exact: mine.exactTempo }
                  : { err: (document.getElementById('status') || {}).textContent };
    })()`, true);
    if (r.skipped) console.log('  already there: ' + name);
    else if (r.err) console.log('  FAILED  ' + name + '  — ' + r.err);
    else console.log('  ' + (r.bpm ? String(Math.round(r.bpm)).padStart(3) : '  ?') + ' BPM  ' +
                     String(r.beats || '?').padStart(2) + ' beats  ' +
                     (r.exact ? '(exact) ' : '(approx) ') + r.name);
  }

  const total = await win.webContents.executeJavaScript(
    '(async () => (await window.MixProject.listDrumLoops()).length)()', true);
  console.log('\nthe library now holds ' + total + ' drum loops');
  app.exit(0);
}).catch(e => { console.error('FAILED:', e); app.exit(2); });
