/* ===================================================================
   EGBC Present - the converter: a PowerPoint file into slides (F-242)
   ===================================================================

   ONE STEP (Martin, 20 Oct: PowerPoint files only, one file):
     present/<deck>/source.pptx  (uploaded, or fetched from a OneDrive link)
       -> present/<deck>/s<n>.jpg   each shown slide, 1920 px wide
          present/<deck>/t<n>.jpg   its 320 px preview (sent first on weak Wi-Fi)
          presentDecks/<deck>       status 'ready', the slide count and sizes
          presentNotes/<deck>       the speaker notes, slide by slide
                                    (read by presenters only - the rules)

   The pictures are made by LibreOffice (soffice -> PDF -> pdftoppm), in
   the container (converter/Dockerfile, Cloud Run, scales to zero). The
   notes are read from the file itself (pptx.mjs). Hidden slides are left
   out, as PowerPoint does when it presents.

   convertDeck({ db, bucket, deckId, render }) - `render` is the step that
   needs LibreOffice: realRender() in the container; the tests pass a
   stand-in that draws the slides. Everything else here is the same code.
   =================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchDeckToStorage, LINK_MAX } from './fetch.mjs';
import { msConfigFor, msToPdf } from './microsoft.mjs';
import { readPptx, prepareForRender, writeZipWith, readMedia, readZip, mp4Facts, browserPlays } from './pptx.mjs';

const run = promisify(execFile);
const MAX_SLIDES = 200;
const SOFFICE = process.env.SOFFICE || 'soffice';

/* The deck as LibreOffice should see it (pptx.mjs prepareForRender: layout
   sample pictures off, embedded fonts by their own names, media emptied).
   Anything it cannot do, it leaves: the original is rendered, and why is kept. */
export function writeForRender(pptxBuf, file) {
  try {
    const { changes, report } = prepareForRender(pptxBuf);
    if (!changes.size) { fs.writeFileSync(file, pptxBuf); return report; }
    const fd = fs.openSync(file, 'w');
    try { writeZipWith(pptxBuf, changes, fd); } finally { fs.closeSync(fd); }
    return report;
  } catch (e) {
    fs.writeFileSync(file, pptxBuf);
    return ['left as it was: ' + (e.message || e)];
  }
}

/* The real pictures: LibreOffice to PDF, then each page to a JPEG twice. */
/* THE PICTURES (F-252): the deck to a PDF - by Microsoft 365 when the church
   has connected it (microsoft.mjs: PowerPoint's own drawing), otherwise or
   if it fails by LibreOffice (tidied first, writeForRender) - then every
   page into a picture twice (pdftoppm). Each step can be stood in for in
   the tests: makeRender({ ms, loPdf, toPictures }). */
export async function loToPdf(pptxBuf, dir) {
  const src = path.join(dir, 'deck.pptx');
  const prepared = writeForRender(pptxBuf, src);
  await run(SOFFICE, ['--headless', '--norestore', ...(process.env.LO_PROFILE ? ['-env:UserInstallation=file:///' + process.env.LO_PROFILE] : []), '--convert-to', 'pdf', '--outdir', dir, src], { timeout: 240000 });
  const pdf = path.join(dir, 'deck.pdf');
  if (!fs.existsSync(pdf)) throw new Error('LibreOffice could not read this PowerPoint file.');
  return { pdf: fs.readFileSync(pdf), prepared };
}
export async function pdfToPictures(pdfBuf, dir) {
  const pdf = path.join(dir, 'pages.pdf'); fs.writeFileSync(pdf, pdfBuf);
  await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=86', '-scale-to-x', '1920', '-scale-to-y', '-1', pdf, path.join(dir, 's')], { timeout: 240000 });
  await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=75', '-scale-to-x', '320', '-scale-to-y', '-1', pdf, path.join(dir, 't')], { timeout: 240000 });
  const pick = (p) => fs.readdirSync(dir).filter((f) => f.startsWith(p + '-') && f.endsWith('.jpg')).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
  const full = pick('s'), thumb = pick('t');
  return full.map((f, i) => ({ full: fs.readFileSync(path.join(dir, f)), thumb: fs.readFileSync(path.join(dir, thumb[i] || f)), w: 1920, h: 0 }));
}
export function makeRender({ ms = (ctx) => msConfigFor(ctx && ctx.db), loPdf = loToPdf, toPictures = pdfToPictures } = {}) {
  return async function render(pptxBuf, shown, info, ctx) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
    try {
      let pdf = null, renderer = 'libreoffice', fallback = '', prepared = [];
      const cfg = typeof ms === 'function' ? await Promise.resolve(ms(ctx)).catch(() => null) : ms;
      if (cfg) {
        try { pdf = await msToPdf(cfg, pptxBuf, 'deck-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.pptx'); renderer = 'microsoft'; }
        catch (e) { fallback = String(e.message || e).slice(0, 200); }
      }
      if (!pdf) { const lo = await loPdf(pptxBuf, dir); pdf = lo.pdf; prepared = lo.prepared || []; }
      let pics = await toPictures(pdf, dir);
      /* a PDF that kept the hidden slides: leave them out, as Present does */
      if (info && pics.length === info.slides.length && pics.length !== shown.length) pics = pics.filter((p, i) => !info.slides[i].hidden);
      pics.prepared = prepared; pics.renderer = renderer; pics.fallback = fallback;
      return pics;
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
}
export const realRender = makeRender();

/* FONTS A DECK DOES NOT CARRY, on the LibreOffice route: LibreOffice can
   only use what it has. The container has the free fonts made to Office's
   measurements (Carlito for Calibri, Liberation for Arial and Times,
   Caladea for Cambria); anything else the church is licensed to use on a
   server goes in Storage at converter-fonts/ (only the server reads there -
   the Storage rules close it to pages), and each new instance adds them
   once. Not Aptos (Office's cloud font): its licence does not cover a
   server (Martin, 20 Oct) - the Microsoft 365 route draws it (F-252). */
let fontsLoaded = null;
export function loadChurchFonts(bucket, dir = path.join(os.homedir(), '.fonts')) {
  if (!fontsLoaded) fontsLoaded = (async () => {
    const [files] = await bucket.getFiles({ prefix: 'converter-fonts/' });
    const fonts = files.filter((f) => /\.(ttf|otf|ttc)$/i.test(f.name));
    if (!fonts.length) return 0;
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fonts) await f.download({ destination: path.join(dir, path.basename(f.name)) });
    await run('fc-cache', ['-f', dir]).catch(() => {});
    return fonts.length;
  })().catch((e) => { fontsLoaded = null; console.error('church fonts:', e.message); return 0; });
  return fontsLoaded;
}

/* VIDEO AND SOUND (F-251): each slide's media goes up beside its picture,
   present/<deck>/m<slide>-<k>.<ext>, and the deck lists them (media: where
   on the slide, on click or by itself, loop, volume, how long). Present
   plays them over the slide picture, in step on every screen, streaming
   from Storage (it never downloads a video first).
   - H.264/AAC MP4, MP3, M4A: as they are. An MP4 whose index (moov) is at
     the end is rearranged so it streams at once (ffmpeg, no re-encoding).
   - Anything a browser cannot play (HEVC from an iPhone, WMV, AVI...) is
     made into H.264 by ffmpeg; without ffmpeg it is kept and marked.
   - A heavy video (over 5 Mbit/s) also gets a light 720p copy (about 2.5
     Mbit/s) for phones and weak Wi-Fi; the TV plays the full one.
   - Linked videos (YouTube, OneDrive, Stream) stay links.
   FFMPEG: its path (the container has it). */
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
let ffmpegHere = null;
export function hasFfmpeg() { if (ffmpegHere === null) ffmpegHere = run(FFMPEG, ['-version'], { timeout: 20000 }).then(() => true, () => false); return ffmpegHere; }
const TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav' };
/* The light copy for phones: at most 720 high, keeping the shape. In an
   ffmpeg filter a comma separates filters, so the one inside min() must
   reach ffmpeg as "\," - in JavaScript that is '\\,'. Written '\,' (just a
   comma), ffmpeg refused it and, the error being swallowed, no light copy
   was ever made (deploy day, 21 Oct: the 729 MB deck's video had none). */
export const LIGHT_FILTER = 'scale=-2:min(720\\,ih)';
export function lightArgs(inF, outF) {
  return ['-y', '-i', inF, '-vf', LIGHT_FILTER, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-maxrate', '2500k', '-bufsize', '5000k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outF];
}
/* ffmpeg's own words when it fails: its last lines (they say why) */
function ffWhy(e) { return String((e && (e.stderr || e.message)) || e || '').trim().split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300); }
export async function storeMedia({ buf, bucket, deckId, shownCount, ffmpeg, runFf }) {
  const list = readMedia(buf).filter((m) => m.shown < shownCount);
  if (!list.length) return [];
  const ff = runFf || ((args, opts) => run(FFMPEG, args, opts));
  const zip = readZip(buf), canFf = ffmpeg === undefined ? await hasFfmpeg() : ffmpeg, out = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
  try {
    for (const m of list) {
      const item = { shown: m.shown, k: m.k, kind: m.kind, rect: m.rect, start: m.start, loop: m.loop, volume: m.volume, src: '', light: '', link: m.link || '', youtube: m.youtube || '', seconds: 0, playable: true, why: '' };
      if (!m.part) { out.push(item); continue; }
      const bytes = zip.raw(m.part);
      if (!bytes || !bytes.length) { item.playable = false; item.why = 'The video is missing from the file.'; out.push(item); continue; }
      const ext0 = (m.part.split('.').pop() || '').toLowerCase(), isMp4 = /^(mp4|m4v|mov|m4a)$/.test(ext0);
      const facts = isMp4 ? mp4Facts(bytes) : { codecs: [], moovFirst: true, seconds: 0, mbps: 0 };
      item.seconds = Math.round(facts.seconds || 0);
      const base = 'm' + (m.shown + 1) + '-' + m.k, plays = browserPlays(m.part, facts);
      let file = null, ext = ext0;
      if (plays && (!isMp4 || facts.moovFirst)) { file = bytes; }
      else if (canFf) {
        const inF = path.join(dir, base + '-in.' + ext0); fs.writeFileSync(inF, bytes);
        ext = m.kind === 'audio' && !/^(mp4|m4v|mov)$/.test(ext0) ? 'm4a' : 'mp4';
        const outF = path.join(dir, base + '.' + ext);
        const args = plays ? ['-y', '-i', inF, '-c', 'copy', '-movflags', '+faststart', outF]
          : m.kind === 'audio' ? ['-y', '-i', inF, '-vn', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outF]
          : ['-y', '-i', inF, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outF];
        try { await ff(args, { timeout: 600000, maxBuffer: 1 << 24 }); file = fs.readFileSync(outF); fs.rmSync(inF, { force: true }); }
        catch (e) { file = bytes; ext = ext0; item.playable = plays; item.why = plays ? '' : 'This video could not be made playable in a browser.'; item.ffWhy = ffWhy(e); console.error('ffmpeg (playable) ' + deckId + ' ' + base + ': ' + item.ffWhy); }
        if (!item.seconds && file !== bytes) item.seconds = Math.round(mp4Facts(file).seconds || 0);
      } else { file = bytes; item.playable = plays; item.why = plays ? '' : 'This video is in a form browsers do not play (the converter needs ffmpeg).'; }
      item.src = base + '.' + ext;
      await bucket.file('present/' + deckId + '/' + item.src).save(file, { contentType: TYPES[ext] || 'application/octet-stream', resumable: file.length > 5e6, metadata: { cacheControl: 'private, max-age=31536000' } });
      /* the light copy for phones and weak Wi-Fi */
      const heavy = m.kind === 'video' && item.playable && (facts.mbps || 0) > 5 && item.seconds && item.seconds <= 3600;
      if (heavy && canFf) {
        const inF = path.join(dir, base + '-full.' + ext), lightF = path.join(dir, base + '-light.mp4');
        fs.writeFileSync(inF, file);
        try {
          await ff(lightArgs(inF, lightF), { timeout: 840000, maxBuffer: 1 << 24 });
          item.light = base + '-light.mp4';
          await bucket.file('present/' + deckId + '/' + item.light).save(fs.readFileSync(lightF), { contentType: 'video/mp4', resumable: true, metadata: { cacheControl: 'private, max-age=31536000' } });
        } catch (e) {
          /* never silent again: the deck says why, and so does the converter's log */
          item.light = ''; item.lightWhy = ffWhy(e);
          console.error('ffmpeg (light copy) ' + deckId + ' ' + base + ': ' + item.lightWhy);
        }
        fs.rmSync(inF, { force: true }); fs.rmSync(lightF, { force: true });
      }
      out.push(item);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return out;
}

/* One job, as the web service runs it (and the tests, with a stand-in
   render): a link is fetched first (fetch.mjs), then the deck converted.
   Every step is written on the deck (status: fetching, converting, video,
   ready / failed + why), so the page follows it whatever the wait. */
export async function handleConvert({ db, bucket, deckId, link, render, allowLocal = false, max = LINK_MAX, kind }) {
  const ref = db.collection('presentDecks').doc(deckId);
  if (link) {
    try {
      await ref.update({ status: 'fetching', why: '', size: 0 });
      const got = await fetchDeckToStorage({ url: link, file: bucket.file('present/' + deckId + '/source.pptx'), max, allowLocal, kind, onSize: (n) => { ref.update({ size: n }).catch(() => {}); } });
      await ref.update({ size: got.bytes });
    } catch (e) {
      await ref.update({ status: 'failed', why: String(e.message || e).slice(0, 300) }).catch(() => {});
      throw e;
    }
  }
  return convertDeck({ db, bucket, deckId, render: render || realRender });
}

/* One job as the web service runs it, with every result in the log and
   the reason with every refusal (deploy day, 21 Oct: a 422 with no word of
   why in the converter's log). -> { status: 200 | 422, body } */
export async function runJob({ db, bucket, deckId, link, render, allowLocal = false }) {
  const t0 = Date.now(), secs = () => Math.round((Date.now() - t0) / 1000) + ' s';
  console.log('convert ' + deckId + ': started' + (link ? ' (a link)' : ''));
  try {
    const r = await handleConvert({ db, bucket, deckId, link, render, allowLocal });
    console.log('convert ' + deckId + ': ready, ' + r.count + ' slides, in ' + secs());
    return { status: 200, body: r };
  } catch (e) {
    console.error('convert ' + deckId + ': REFUSED after ' + secs() + ': ' + String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '));
    return { status: 422, body: { error: String((e && e.message) || e) } };
  }
}

export async function convertDeck({ db, bucket, deckId, render = realRender }) {
  const ref = db.collection('presentDecks').doc(deckId);
  const deck = (await ref.get()).data();
  if (!deck) throw new Error('No such deck.');
  try {
    const [src] = await bucket.file('present/' + deckId + '/source.pptx').download();
    const info = readPptx(src);
    const shown = info.slides.filter((s) => !s.hidden).slice(0, MAX_SLIDES);
    if (!shown.length) throw new Error('This PowerPoint has no slides to show.');
    const pics = await render(src, shown, info, { db });
    if (pics.length !== shown.length) throw new Error('The slides came out as ' + pics.length + ' pictures, not ' + shown.length + '. Is a slide hidden, or the file damaged?');
    for (let i = 0; i < pics.length; i++) {
      const n = i + 1;
      if (i === 0) await ref.update({ status: 'converting' }).catch(() => {});
      await bucket.file('present/' + deckId + '/s' + n + '.jpg').save(pics[i].full, { contentType: 'image/jpeg', metadata: { cacheControl: 'private, max-age=31536000' } });
      await bucket.file('present/' + deckId + '/t' + n + '.jpg').save(pics[i].thumb, { contentType: 'image/jpeg', metadata: { cacheControl: 'private, max-age=31536000' } });
    }
    if (readMedia(src).length) await ref.update({ status: 'video', why: '' }).catch(() => {});
    const media = await storeMedia({ buf: src, bucket, deckId, shownCount: pics.length, ffmpeg: render === realRender ? undefined : false });
    await db.collection('presentNotes').doc(deckId).set({ notes: shown.map((s) => s.notes || '') , context: deck.context || {} });
    await ref.update({ status: 'ready', count: pics.length, ratio: pics[0].h && pics[0].w ? pics[0].w / pics[0].h : 16 / 9, convertedAt: new Date().toISOString(), why: '', prepared: pics.prepared || [], media, renderer: pics.renderer || 'stand-in', fallbackWhy: pics.fallback || '' });
    return { count: pics.length };
  } catch (e) {
    await ref.update({ status: 'failed', why: String(e.message || e).slice(0, 300) });
    throw e;
  }
}
