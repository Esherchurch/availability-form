/* PRESENT: A SLIDE'S VIDEO, STORED - and its light copy for phones (F-251;
   deploy day, 21 Oct: the 729 MB deck's video got NO light copy).
   No emulator, no ffmpeg needed: converter/convert.mjs storeMedia() with a
   stand-in Storage and a STAND-IN FFMPEG that reads its arguments the way
   ffmpeg does - in a filter, a comma without a backslash starts the next
   filter. The bug: the filter was written 'scale=-2:min(720\,ih)' in
   JavaScript, which is just a comma; ffmpeg refused it and the error was
   swallowed, so no light copy and nothing in the log.
     node screenshots/events/present-media.test.mjs */
import fs from 'node:fs';
import { inventDeck } from '../../converter/pptx.mjs';
import { storeMedia, lightArgs, LIGHT_FILTER } from '../../converter/convert.mjs';

const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 500))); };
const J = (x) => JSON.stringify(x);

/* An invented MP4: the boxes a browser-ready H.264 file has (ftyp, moov
   first with mvhd and the codec names, then the data), 10 seconds long. */
function mp4(seconds, dataBytes, codec) {
  const box = (type, body) => { const b = Buffer.alloc(8 + body.length); b.writeUInt32BE(b.length, 0); b.write(type, 4, 'latin1'); body.copy(b, 8); return b; };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(seconds * 1000, 16);
  const moov = box('moov', Buffer.concat([box('mvhd', mvhd), box('stsd', Buffer.from((codec || 'avc1') + '....mp4a', 'latin1'))]));
  return Buffer.concat([box('ftyp', Buffer.from('isom0000', 'latin1')), moov, box('mdat', Buffer.alloc(dataBytes, 1))]);
}
/* A stand-in Storage: remembers what was saved */
function bucket() { const saved = {}; return { saved, file: (p) => ({ save: async (b, o) => { saved[p] = { size: b.length, type: o && o.contentType }; } }) }; }
/* A stand-in ffmpeg, as strict as the real one about filters */
function ffmpegLike(log) {
  return async (args) => {
    log.push(args);
    const vf = args[args.indexOf('-vf') + 1];
    if (args.includes('-vf')) {
      const filters = vf.split(/(?<!\\),/);
      if (filters.length !== 1 || !/^scale=-2:min\(720\\,ih\)$/.test(filters[0])) {
        const e = new Error('Command failed'); e.stderr = "[Parsed_scale_0 @ 0x1] Invalid size 'min(720'\nError initializing filter 'scale'\nConversion failed!"; throw e;
      }
    }
    fs.writeFileSync(args[args.length - 1], Buffer.alloc(1234, 2));
  };
}

/* 1. a heavy video (6.4 Mbit/s): stored as it is, AND a light copy */
const HEAVY = inventDeck([{ title: 'A heavy video (invented)', video: mp4(10, 8000000), start: 'click', rect: [0, 0, 1, 1] }]);
let log = [], b = bucket();
let media = await storeMedia({ buf: HEAVY, bucket: b, deckId: 'dk_t', shownCount: 1, ffmpeg: true, runFf: ffmpegLike(log) });
ok('1. THE FILTER reaches ffmpeg with its backslash: scale=-2:min(720\\,ih), one filter', LIGHT_FILTER === 'scale=-2:min(720\\,ih)' && lightArgs('a', 'b')[lightArgs('a', 'b').indexOf('-vf') + 1].split(/(?<!\\),/).length === 1, J(LIGHT_FILTER));
ok('   A HEAVY VIDEO GETS ITS LIGHT COPY for phones (m1-0-light.mp4, stored as video/mp4)', media[0] && media[0].light === 'm1-0-light.mp4' && b.saved['present/dk_t/m1-0-light.mp4'] && b.saved['present/dk_t/m1-0-light.mp4'].type === 'video/mp4' && !media[0].lightWhy, J({ media, saved: b.saved }));
ok('   and the full video is stored as it was (no re-encoding)', b.saved['present/dk_t/m1-0.mp4'] && b.saved['present/dk_t/m1-0.mp4'].size === mp4(10, 8000000).length && log.length === 1, J(b.saved));
ok('   the light copy is 720 high at most, H.264, made to stream at once', J(log[0].slice(log[0].indexOf('-c:v'), log[0].indexOf('-c:v') + 2)) === J(['-c:v', 'libx264']) && log[0].includes('+faststart'));

/* 2. ffmpeg failing: never silent */
const errs = [], was = console.error; console.error = (m) => errs.push(String(m));
b = bucket();
media = await storeMedia({ buf: HEAVY, bucket: b, deckId: 'dk_t2', shownCount: 1, ffmpeg: true, runFf: async () => { const e = new Error('Command failed'); e.stderr = 'something odd\nConversion failed!'; throw e; } });
console.error = was;
ok('2. FFMPEG FAILING IS NEVER SILENT: the deck says why (lightWhy), and so does the log', media[0].light === '' && /Conversion failed!/.test(media[0].lightWhy || '') && errs.some((m) => /light copy.*dk_t2.*Conversion failed!/.test(m)), J({ media: media[0], errs }));
ok('   the slide still has its full video', media[0].src === 'm1-0.mp4' && !!b.saved['present/dk_t2/m1-0.mp4']);

/* 3. a light video (1 Mbit/s): no copy, ffmpeg not even asked */
log = []; b = bucket();
media = await storeMedia({ buf: inventDeck([{ title: 'Light (invented)', video: mp4(10, 1250000), start: 'click' }]), bucket: b, deckId: 'dk_t3', shownCount: 1, ffmpeg: true, runFf: ffmpegLike(log) });
ok('3. A LIGHT VIDEO needs no copy (ffmpeg not run)', media[0].light === '' && log.length === 0 && !media[0].lightWhy, J({ media: media[0], log }));

/* 4. a video browsers cannot play (HEVC): made into H.264 */
log = []; b = bucket();
media = await storeMedia({ buf: inventDeck([{ title: 'HEVC (invented)', video: mp4(10, 1250000, 'hvc1'), start: 'click' }]), bucket: b, deckId: 'dk_t4', shownCount: 1, ffmpeg: true, runFf: ffmpegLike(log) });
ok('4. A VIDEO BROWSERS CANNOT PLAY (HEVC) is made into H.264', media[0].playable && log.length === 1 && log[0].includes('libx264') && !!b.saved['present/dk_t4/m1-0.mp4'], J({ media: media[0], args: log[0] }));

console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
