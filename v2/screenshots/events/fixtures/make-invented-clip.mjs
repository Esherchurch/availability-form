/* The invented video for Present's tests (F-251): 20 seconds, 640x360,
   H.264, a big seconds counter over moving stripes - nothing real. Made
   by Chrome (canvas -> MediaRecorder, MP4). Run once:
     node screenshots/events/fixtures/make-invented-clip.mjs */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
try {
  const p = await b.newPage();
  await p.setContent('<html><body><canvas width="640" height="360"></canvas></body></html>');
  const b64 = await p.evaluate(async () => {
    const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) return 'NO-MP4';
    const c = document.querySelector('canvas'), g = c.getContext('2d'), stream = c.captureStream(30);
    /* a quiet tone, so there is a sound track */
    const ac = new AudioContext(), osc = ac.createOscillator(), gain = ac.createGain(), dest = ac.createMediaStreamDestination();
    osc.frequency.value = 440; gain.gain.value = 0.05; osc.connect(gain).connect(dest); osc.start();
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 600000 }), parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    const t0 = performance.now();
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      for (let i = 0; i < 8; i++) { g.fillStyle = ['#29335c', '#f3a712', '#e4572e', '#669bbc'][(i + Math.floor(t * 4)) % 4]; g.fillRect(i * 80, 0, 80, 360); }
      g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(170, 90, 300, 180);
      g.fillStyle = '#29335c'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.fillText(t.toFixed(1), 320, 215);
      g.font = 'bold 18px Arial'; g.fillText('INVENTED CLIP', 320, 255);
      if (t < 20.2) requestAnimationFrame(draw);
    };
    rec.start(250); draw();
    await new Promise((r) => setTimeout(r, 20200));
    rec.stop(); await new Promise((r) => (rec.onstop = r)); osc.stop();
    const blob = new Blob(parts, { type }), buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return type + '|' + btoa(s);
  });
  if (b64 === 'NO-MP4') throw new Error('This Chrome cannot record MP4.');
  const [type, data] = b64.split('|');
  fs.writeFileSync(path.join(HERE, 'invented-clip.mp4'), Buffer.from(data, 'base64'));
  console.log('invented-clip.mp4: ' + type + ', ' + Buffer.from(data, 'base64').length + ' bytes');
} finally { await b.close(); }
