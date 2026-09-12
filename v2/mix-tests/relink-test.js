/* Importing a running order, then pointing at the folder.

   That is the obvious way round — the list is the plan, the folder is where
   the records happen to live — and it matched nothing at all: fifty-three
   tracks, every one saying "no audio", with the folder sitting there full of
   them. Two reasons, both measured here against the real library.

   1. relink() matched on filename or on byte size. A running order imported on
      its own carries neither, so there was nothing to match on and the fuzzy
      title matcher — which already existed, and is used when a folder is
      dropped at import time — was never reached.

   2. Amazon names files "01 - Shine_d5e04ae6-86fe-4474-a384-28eca7c1113e.mp3".
      Stripping punctuation glued that id onto the last word, so "shine" became
      "shined5e04ae6..." and a one-word title matched nothing whatever. */
const fs = require('fs'), path = require('path');

const MP = require('../mix-project.js');

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : '')); if (!c) fails++; };

/* real filenames, as Amazon writes them */
const FILES = [
  '01 - Baby, I Love Your Way_44cd5c42-b44c-4b9f-a549-ad48dc07d982.mp3',
  '01 - Shine_d5e04ae6-86fe-4474-a384-28eca7c1113e.mp3',
  '13 - Motownphilly_045818e2-e26c-4d79-b446-aafe18816dae.mp3',
  '17 - End Of The Road_327b6fb0-0ef6-49c6-928a-43d0b4cee9d3.mp3',
  '04 - Parklife (2012 Remaster)_626a49ed-a8c2-42ce-bade-e1240d0fdba8.mp3',
  '13 - Despacito (Remix) [feat. Justin Bieber].mp3',
  '03 - Here Comes the Hotstepper (Heartical Mix).mp3',
  '04 - I\'m Coming Out.mp3',
  '01 - Weekend Special (with Brenda Fassie) (USA Remix)_08ab595e-7dcd-47fd-97f6-f3c23d18dcf8.mp3'
].map((name, i) => ({ name: name, path: 'C:/music/' + name, size: 4000000 + i }));

/* titles as a running order writes them */
const TITLES = ['Baby I Love Your Way', 'Shine', 'Motownphilly', 'End Of The Road',
                'Parklife', 'Despacito (Remix)', 'Here Comes the Hotstepper',
                'I\'m Coming Out', 'Weekend Special'];

console.log('  cleaned titles, file against running order:');
TITLES.forEach((t, i) => {
  console.log('    "' + MP.cleanTitle(FILES[i].name) + '"  vs  "' + MP.cleanTitle(t) + '"');
});

const project = { tracks: TITLES.map((t, i) => ({
  id: 'trk_' + i, title: t, linked: false, file: null, fileSize: null })) };

const r = MP.relink(project, FILES);
console.log('');
ok(r.matched.length === TITLES.length,
   'every track in the running order finds its file',
   r.matched.length + ' of ' + TITLES.length);
r.missing.forEach(t => console.log('      unmatched: ' + t.title));

/* and each one found the RIGHT file, not merely a file */
let wrong = 0;
r.matched.forEach(m => {
  const want = TITLES.indexOf(m.track.title);
  if (FILES[want] !== m.file) { wrong++; console.log('      ' + m.track.title + ' -> ' + m.file.name); }
});
ok(wrong === 0, 'and each finds the right one, not merely a free one',
   wrong + ' wrong');

/* the id must not be allowed to become part of the title */
ok(MP.cleanTitle('01 - Shine_d5e04ae6-86fe-4474-a384-28eca7c1113e.mp3') === 'shine',
   'a one-word title survives the id Amazon appends',
   '"' + MP.cleanTitle('01 - Shine_d5e04ae6-86fe-4474-a384-28eca7c1113e.mp3') + '"');

/* a file already linked by name must still win over a fuzzy guess */
const p2 = { tracks: [
  { id: 'a', title: 'Shine', file: '13 - Motownphilly_045818e2-e26c-4d79-b446-aafe18816dae.mp3' },
  { id: 'b', title: 'Motownphilly', file: null }
] };
const r2 = MP.relink(p2, FILES);
const byId = {};
r2.matched.forEach(m => { byId[m.track.id] = m.file.name; });
ok(/Motownphilly/.test(byId.a || ''),
   'a filename already on a track still wins over what the title suggests',
   byId.a);
/* There is only one Motownphilly file, and the track that names it takes it.
   The other is left without one, which is the honest answer. */
ok(!byId.b || !/Motownphilly/.test(byId.b),
   'and the file it took is not handed out twice',
   byId.b || 'the other track is left unmatched');

console.log(fails ? '\n' + fails + ' FAILED'
                  : '\na running order finds its audio when the folder is pointed at');
process.exit(fails ? 1 : 0);
