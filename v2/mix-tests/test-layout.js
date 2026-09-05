const MP = require('../mix-project.js');
const data = require('./running-order.json');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.log('  FAIL ' + msg); fails++; } };

// The sheet's last row is a TOTAL RUNNING TIME line, not a track.
const rows = MP.parseRunningOrder(data.tracks.filter(t => t.BPM));
console.log('parsed rows: ' + rows.length);
ok(rows.length === 47, 'expected 47 tracks, got ' + rows.length);
ok(rows[0].title === 'Groove Thang', 'first title');
ok(rows[0].bpm === 104, 'first bpm');
ok(rows[8].mix === 'STOP / START', 'cake mix value, got ' + rows[8].mix);

// Fake the dropped folder: filenames in the messy shape they really arrive in.
const files = rows.map((r, i) => ({
  name: String(i + 1).padStart(2, '0') + ' ' + r.title + '.mp3',
  size: 4000000 + i
}));
// Shuffle so matching is actually doing work.
files.sort(() => Math.random() - 0.5);

const project = MP.seedProject(rows, files);
const unmatched = project.tracks.filter(t => !t.file);
console.log('matched ' + (project.tracks.length - unmatched.length) + '/' + project.tracks.length + ' files');
if (unmatched.length) unmatched.forEach(t => console.log('   unmatched: ' + t.title));
ok(unmatched.length === 0, 'every track matched a file');

// Junction seeding from the Mix column.
const types = {};
project.junctions.forEach(j => types[j.type] = (types[j.type] || 0) + 1);
console.log('junction types from Mix column:', JSON.stringify(types));
ok(project.junctions.length === 46, '46 junctions for 47 tracks');
ok(project.junctions[7].type === 'hard-cut', 'junction 7 (into the cake) is a hard cut, got ' + project.junctions[7].type);
ok(project.junctions[7].gapMs === 1500, 'cake junction has a full-stop gap');
ok(project.junctions[8].type === 'hard-cut', 'junction 8 (COLD START out of cake) is a hard cut');

// Give every track plausible geometry so layout has something to compute.
project.tracks.forEach((t, i) => {
  t.durationSec = 200 + i;
  t.entrySec = 0.5;
  t.exitSec = 190 + i;
  t.downbeatSec = 0.5;
});

const lay = MP.layout(project);
console.log('\nlayout: ' + lay.tracks.length + ' tracks, ' + lay.junctions.length +
            ' junctions, total ' + Math.floor(lay.totalSec / 60) + 'm' +
            String(Math.round(lay.totalSec % 60)).padStart(2, '0') + 's');

ok(lay.tracks.length === 47, 'layout track count');
ok(lay.totalSec > 0, 'total is positive');

// Monotonic: no track may start before the one before it.
for (let i = 1; i < lay.tracks.length; i++) {
  ok(lay.tracks[i].startSec >= lay.tracks[i - 1].startSec,
     'track ' + i + ' starts at or after track ' + (i - 1));
}

// Stretch budget must be respected on every beat-matched junction.
let overBudget = 0;
lay.junctions.forEach(j => {
  if (j.type === 'hard-cut') return;
  if (j.stretchA > project.maxStretch + 1e-9 || j.stretchB > project.maxStretch + 1e-9) {
    overBudget++;
    console.log('  over budget at junction ' + j.index + ': A ' +
      (j.stretchA * 100).toFixed(1) + '% B ' + (j.stretchB * 100).toFixed(1) + '%');
  }
});
ok(overBudget === 0, overBudget + ' junctions exceed the stretch budget');

console.log('\nwarnings (' + lay.warnings.length + '):');
lay.warnings.forEach(w => console.log('  j' + w.junction + ': ' + w.message));

console.log('\nsample of computed junction tempos:');
[0, 1, 8, 9, 20, 43, 44, 45].forEach(i => {
  const j = lay.junctions[i];
  if (!j) return;
  const a = project.tracks[i], b = project.tracks[i + 1];
  console.log('  j' + String(i).padStart(2) + '  ' + String(a.sourceBpm).padStart(3) + ' -> ' +
    String(b.sourceBpm).padStart(3) + '  target ' + String(j.targetBpm || '—').padStart(6) +
    '  ' + j.type.padEnd(12) + ' A' + (j.stretchA * 100).toFixed(1) + '% B' + (j.stretchB * 100).toFixed(1) + '%');
});

// Cache key must change when the junction changes and not otherwise.
const k1 = MP.junctionCacheKey(project, 20);
const k2 = MP.junctionCacheKey(project, 20);
ok(k1 === k2, 'cache key is stable');
project.junctions[20].bars = 8;
ok(MP.junctionCacheKey(project, 20) !== k1, 'cache key changes when the junction changes');
project.junctions[20].bars = 16;
ok(MP.junctionCacheKey(project, 20) === k1, 'cache key returns when the change is undone');
const other = MP.junctionCacheKey(project, 30);
project.tracks[40].exitSec = 123;
ok(MP.junctionCacheKey(project, 30) === other, 'editing track 40 does not invalidate junction 30');

// Re-link.
const rl = MP.relink(project, files.map(f => ({ name: f.name, size: f.size })));
ok(rl.missing.length === 0, 're-link finds every file, missing ' + rl.missing.length);
const partial = MP.relink(project, files.slice(0, 40).map(f => ({ name: f.name, size: f.size })));
ok(partial.missing.length === 7, 'a short folder reports exactly what is absent, got ' + partial.missing.length);

console.log(fails ? '\n' + fails + ' FAILURES' : '\nall assertions passed');
process.exit(fails ? 1 : 0);
