/* Read a sample library and say what is actually in it.

   Point it at a COPY of a user-data directory (never the live one) and it
   lists every sample, whether its audio is really stored, and what that audio
   measures — level, length, and where its energy sits. A sample that sounds
   like a fog horn and a sample that has nothing behind it are different
   problems with the same symptom, and guessing between them has cost hours.

     node_modules\.bin\electron inspect-library.js <copy-of-userData>
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const target = process.argv[2];
if (!target || !fs.existsSync(path.join(target, 'IndexedDB'))) {
  console.error('usage: electron inspect-library.js <copy-of-userData-with-IndexedDB>');
  process.exit(2);
}
/* A copy, always. Reading the live directory risks its lock and its integrity. */
if (/Roaming[\\/]Mix Builder/i.test(target)) {
  console.error('REFUSING: that is the live user-data directory. Copy it first.');
  process.exit(2);
}
app.setPath('userData', target);
app.disableHardwareAcceleration();

const PAGE = path.join(__dirname, '..', 'v2', 'mix-builder.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 900,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: false } });
  await win.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 2500));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const MP = window.MixProject;
    const list = await MP.listSamples();
    const keys = await MP.keys('sampleAudio');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const rows = [];
    for (const s of list) {
      const blob = await MP.getSampleAudio(s.id);
      const row = { id: s.id, name: s.name, hasKey: keys.indexOf(s.id) >= 0,
                    bytes: blob ? (blob.size || blob.byteLength || 0) : 0,
                    processing: s.processing || null, sourceBpm: s.sourceBpm,
                    metaDur: s.durationSec, sourceFile: s.sourceFile,
                    sourceStartSec: s.sourceStartSec, bars: s.bars, createdFrom: s.createdFrom };
      if (blob && row.bytes > 44) {
        try {
          const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
          const d = buf.getChannelData(0), sr = buf.sampleRate;
          let sum = 0, pk = 0;
          for (let i = 0; i < d.length; i++) { sum += d[i]*d[i]; const a = Math.abs(d[i]); if (a > pk) pk = a; }
          const band = fq => {
            const k = 2 * Math.cos(2 * Math.PI * fq / sr);
            let s1 = 0, s2 = 0;
            for (let i = 0; i < d.length; i++) { const s0 = d[i] + k*s1 - s2; s2 = s1; s1 = s0; }
            return +(20*Math.log10(Math.sqrt(Math.abs(s1*s1 + s2*s2 - k*s1*s2))/d.length + 1e-12)).toFixed(0);
          };
          row.audio = { dur: +buf.duration.toFixed(2), sr: sr, ch: buf.numberOfChannels,
                        rmsDb: +(20*Math.log10(Math.sqrt(sum/d.length)+1e-12)).toFixed(1),
                        peak: +pk.toFixed(3),
                        bands: { '60': band(60), '150': band(150), '400': band(400),
                                 '1k': band(1000), '2k': band(2000), '4k': band(4000),
                                 '8k': band(8000) } };
        } catch (e) { row.decodeError = e.message || String(e); }
      }
      rows.push(row);
    }
    const proj = await MP.loadProject();
    return { rows, keys, placements: (proj.placements || []).map(p => ({
      sampleId: p.sampleId, atJunction: p.atJunction, bars: p.barsBeforeEntry, gainDb: p.gainDb })) };
  })()`, true);

  console.log('\nsamples in the library: ' + out.rows.length +
              ', audio records: ' + out.keys.length + '\n');
  out.rows.forEach(r => {
    console.log('  ' + (r.name || '(unnamed)') + '   [' + r.id + ']');
    console.log('    audio stored: ' + (r.bytes ? r.bytes + ' bytes' : 'NONE') +
                (r.hasKey ? '' : '   (no key in the audio store)'));
    if (r.processing) console.log('    cut with: ' + JSON.stringify(r.processing));
    console.log('    from: ' + (r.sourceFile || r.createdFrom || '?') + ' at ' +
                (r.sourceStartSec == null ? '?' : (+r.sourceStartSec).toFixed(2)) + 's, ' +
                (r.bars == null ? '?' : (+r.bars).toFixed(2)) + ' bars at ' + r.sourceBpm + ' BPM' +
                (r.bars && r.sourceBpm ? '  => expected ' + (r.bars * 4 * 60 / r.sourceBpm).toFixed(2) + 's' : ''));
    if (r.decodeError) console.log('    WILL NOT DECODE: ' + r.decodeError);
    if (r.audio) {
      const a = r.audio;
      console.log('    ' + a.dur + 's  ' + a.ch + 'ch ' + a.sr + 'Hz  rms ' + a.rmsDb +
                  ' dB  peak ' + a.peak);
      console.log('    ' + Object.keys(a.bands).map(k => k + ' ' + a.bands[k]).join('   '));
      const top = Math.max(a.bands['1k'], a.bands['2k'], a.bands['4k']);
      const low = Math.max(a.bands['60'], a.bands['150']);
      console.log('    ' + (low - top > 30
        ? '>>> almost nothing above 1 kHz — this will sound like a fog horn'
        : 'has a top end'));
    }
    console.log('');
  });
  console.log('placements: ' + JSON.stringify(out.placements));
  app.exit(0);
}).catch(e => { console.error('FAILED:', e); app.exit(2); });
