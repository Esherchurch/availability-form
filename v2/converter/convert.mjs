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
import { readPptx } from './pptx.mjs';

const run = promisify(execFile);
const MAX_SLIDES = 200;

/* The real pictures: LibreOffice to PDF, then each page to a JPEG twice. */
export async function realRender(pptxBuf, shown) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
  try {
    const src = path.join(dir, 'deck.pptx');
    fs.writeFileSync(src, pptxBuf);
    await run('soffice', ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, src], { timeout: 240000 });
    const pdf = path.join(dir, 'deck.pdf');
    if (!fs.existsSync(pdf)) throw new Error('LibreOffice could not read this PowerPoint file.');
    await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=86', '-scale-to-x', '1920', '-scale-to-y', '-1', pdf, path.join(dir, 's')], { timeout: 240000 });
    await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=75', '-scale-to-x', '320', '-scale-to-y', '-1', pdf, path.join(dir, 't')], { timeout: 240000 });
    const pick = (p) => fs.readdirSync(dir).filter((f) => f.startsWith(p + '-') && f.endsWith('.jpg')).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
    const full = pick('s'), thumb = pick('t');
    return full.map((f, i) => ({ full: fs.readFileSync(path.join(dir, f)), thumb: fs.readFileSync(path.join(dir, thumb[i] || f)), w: 1920, h: 0 }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
    const pics = await render(src, shown);
    if (pics.length !== shown.length) throw new Error('The slides came out as ' + pics.length + ' pictures, not ' + shown.length + '. Is a slide hidden, or the file damaged?');
    for (let i = 0; i < pics.length; i++) {
      const n = i + 1;
      await bucket.file('present/' + deckId + '/s' + n + '.jpg').save(pics[i].full, { contentType: 'image/jpeg', metadata: { cacheControl: 'private, max-age=31536000' } });
      await bucket.file('present/' + deckId + '/t' + n + '.jpg').save(pics[i].thumb, { contentType: 'image/jpeg', metadata: { cacheControl: 'private, max-age=31536000' } });
    }
    await db.collection('presentNotes').doc(deckId).set({ notes: shown.map((s) => s.notes || '') , context: deck.context || {} });
    await ref.update({ status: 'ready', count: pics.length, ratio: pics[0].h && pics[0].w ? pics[0].w / pics[0].h : 16 / 9, convertedAt: new Date().toISOString(), why: '' });
    return { count: pics.length };
  } catch (e) {
    await ref.update({ status: 'failed', why: String(e.message || e).slice(0, 300) });
    throw e;
  }
}
