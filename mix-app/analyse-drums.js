/* What is in a folder of drum loops.

   Tempo, length in beats, where the downbeat is, and how much of it is low end
   — read with the same analyser the records go through, so a loop and a record
   are described in the same terms and can be matched to each other.

     node_modules\.bin\electron analyse-drums.js "C:\path\to\loops" [out.json]

   A loop whose detected tempo disagrees with the number in its filename is
   worth knowing about before it is used, so both are reported.  */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const dir = process.argv[2];
const outFile = process.argv[3] || null;
if (!dir || !fs.existsSync(dir)) {
  console.error('usage: electron analyse-drums.js <folder> [out.json]');
  process.exit(2);
}
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'mixel-drums-')));
app.disableHardwareAcceleration();

const PAGE = path.join(__dirname, '..', 'v2', 'mix-builder.html');
const AUDIO = /\.(wav|mp3|m4a|flac|ogg|aiff?)$/i;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: false } });
  await win.loadFile(PAGE);
  await new Promise(r => setTimeout(r, 2000));

  const files = fs.readdirSync(dir).filter(f => AUDIO.test(f));
  console.log('analysing ' + files.length + ' loops\n');

  const rows = [];
  for (const name of files) {
    const b64 = fs.readFileSync(path.join(dir, name)).toString('base64');
    const r = await win.webContents.executeJavaScript(`(async () => {
      const bin = atob(${JSON.stringify(b64)});
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      let buf;
      try { buf = await ctx.decodeAudioData(u8.buffer); }
      catch (e) { return { err: e.message || String(e) }; }
      const DSP = window.MixDSP;
      const mono = DSP.toMono(buf);
      const a = await DSP.analyseBeat(mono, buf.sampleRate);

      /* where the energy sits, so a loop that is all kick can be told from one
         with a kit on it — the synthesised kit's failing was having no top */
      const band = fq => {
        const sr = buf.sampleRate, k = 2 * Math.cos(2 * Math.PI * fq / sr);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < mono.length; i++) { const s0 = mono[i] + k*s1 - s2; s2 = s1; s1 = s0; }
        return +(20*Math.log10(Math.sqrt(Math.abs(s1*s1 + s2*s2 - k*s1*s2))/mono.length + 1e-12)).toFixed(0);
      };
      let sum = 0, pk = 0;
      for (let i = 0; i < mono.length; i++) { sum += mono[i]*mono[i]; const v = Math.abs(mono[i]); if (v > pk) pk = v; }
      const rms = Math.sqrt(sum / mono.length);
      return {
        dur: +buf.duration.toFixed(3), sr: buf.sampleRate, ch: buf.numberOfChannels,
        bpm: a && a.bpm ? +a.bpm.toFixed(2) : null,
        downbeatSec: a && a.downbeatSec != null ? +a.downbeatSec.toFixed(3) : null,
        confidence: a && a.confidence != null ? +a.confidence.toFixed(2) : null,
        rmsDb: +(20*Math.log10(rms + 1e-12)).toFixed(1),
        crestDb: +(20*Math.log10(pk / (rms + 1e-12))).toFixed(1),
        low: band(70), mid: band(900), top: band(6000)
      };
    })()`, true);

    if (r.err) { console.log('  ' + name + '\n    WILL NOT DECODE: ' + r.err); continue; }

    /* the number in the filename, where there is one */
    const m = name.match(/(\d{2,3})\s*bpm/i) || name.match(/[-_ ](\d{2,3})[-_. ]/);
    const said = m ? parseInt(m[1], 10) : null;
    const beats = r.bpm ? r.dur / (60 / r.bpm) : null;

    rows.push(Object.assign({ file: name, filenameBpm: said,
                              beats: beats ? +beats.toFixed(2) : null }, r));

    const agree = (said && r.bpm)
      ? (Math.abs(said - r.bpm) < 2 ? 'agrees'
        : Math.abs(said - r.bpm * 2) < 3 ? 'detected half'
        : Math.abs(said * 2 - r.bpm) < 3 ? 'detected double'
        : 'DISAGREES')
      : '';
    console.log('  ' + name.replace(/^looperman-l-\d+-\d+-/, '').replace(/\.wav$/i, ''));
    console.log('    ' + r.dur + 's  detected ' + (r.bpm || '?') + ' BPM' +
                (said ? ' (filename says ' + said + ' — ' + agree + ')' : '') +
                '  ' + (beats ? beats.toFixed(1) + ' beats' : ''));
    console.log('    downbeat ' + r.downbeatSec + 's   rms ' + r.rmsDb + ' dB, crest ' +
                r.crestDb + ' dB   70Hz ' + r.low + '  900Hz ' + r.mid + '  6kHz ' + r.top);
  }

  if (outFile) { fs.writeFileSync(outFile, JSON.stringify(rows, null, 1)); console.log('\nwrote ' + outFile); }
  app.exit(0);
}).catch(e => { console.error('FAILED:', e); app.exit(2); });
