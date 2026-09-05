/* Reordering, replacing and auto-sequencing, against the real running order. */
const MP = require('../mix-project.js');
const data = require('./running-order.json');

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

const rows = MP.parseRunningOrder(data.tracks.filter(t => t.BPM));
const files = rows.map((r, i) => ({ name: (i + 1) + ' ' + r.title + '.mp3', size: 4e6 + i }));
const base = MP.seedProject(rows, files);
base.tracks.forEach((t, i) => {
  t.durationSec = 200 + i; t.entrySec = 0.5; t.exitSec = 190 + i; t.downbeatSec = 0.5;
});
const clone = () => JSON.parse(JSON.stringify(base));

console.log('\n— pinning —');
const pinned = base.tracks.filter(t => t.pinned).map(t => t.title);
ok(pinned.length >= 3, 'anchors pinned: ' + pinned.join(', '));
ok(base.tracks[0].pinned, 'the opener is pinned');
ok(base.tracks[46].pinned, 'the last dance is pinned');
ok(base.tracks[8].pinned, 'the cake is pinned (' + base.tracks[8].title + ')');

console.log('\n— moving a track —');
{
  const p = clone();
  // Configure junction 20 distinctively, then move a track far away from it.
  p.junctions[20] = MP.defaultJunction('blend');
  p.junctions[20].bars = 24;
  p.junctions[20].bassCutDb = 11;
  const keyBefore = MP.junctionCacheKey(p, 20);
  const pairBefore = p.tracks[20].id + '|' + p.tracks[21].id;

  MP.moveTrack(p, 40, 44);
  ok(p.tracks.length === 47, 'track count survives a move');
  ok(p.junctions.length === 46, 'junction count survives a move');

  const idx = p.tracks.findIndex(t => t.id === pairBefore.split('|')[0]);
  ok(p.tracks[idx + 1].id === pairBefore.split('|')[1], 'the untouched pair is still adjacent');
  ok(p.junctions[idx].bars === 24 && p.junctions[idx].bassCutDb === 11,
     'its configured junction moved with it (bars=' + p.junctions[idx].bars + ')');
  ok(MP.junctionCacheKey(p, idx) === keyBefore,
     'and its cache key is unchanged, so its rendered audio is still valid');
}

console.log('\n— moving next to a configured junction —');
{
  const p = clone();
  p.junctions[10].bars = 32;
  const movedFrom = p.tracks[3].id;
  MP.moveTrack(p, 3, 30);
  ok(p.tracks[30].id === movedFrom || p.tracks.findIndex(t => t.id === movedFrom) === 30,
     'the track landed where it was asked to');
  const j = p.junctions.filter(x => x.bars === 32).length;
  ok(j >= 1, 'a configured junction elsewhere was not lost');
}

console.log('\n— removing and benching —');
{
  const p = clone();
  const gone = p.tracks[15].title;
  MP.benchTrack(p, 15);
  ok(p.tracks.length === 46, 'removed from the running order');
  ok(p.junctions.length === 45, 'junction count follows');
  ok(p.bench.some(b => b.title === gone), 'and it went to the bench, not the bin');
}

console.log('\n— replacing from the bench —');
{
  const p = clone();
  p.bench = MP.parseBench([
    { Track: 'Superstition', Artist: 'Stevie Wonder', BPM: 100, 'Fits section': 'Build' }
  ]);
  const outgoing = p.tracks[12].title;
  MP.replaceTrack(p, 12, 0);
  ok(p.tracks[12].title === 'Superstition', 'the bench track is in the set');
  ok(p.tracks[12].sourceBpm === 100, 'with its own BPM');
  ok(p.bench.some(b => b.title === outgoing), 'the outgoing track went to the bench (reversible)');
  ok(p.tracks.length === 47 && p.junctions.length === 46, 'lengths unchanged by a swap');
}

console.log('\n— suggested order —');
{
  const p = clone();
  // Shuffle everything that is not pinned, to give the sequencer real work.
  const pins = p.tracks.map(t => !!t.pinned);
  const loose = p.tracks.filter(t => !t.pinned);
  for (let i = loose.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [loose[i], loose[j]] = [loose[j], loose[i]];
  }
  let li = 0;
  const shuffled = p.tracks.map((t, i) => pins[i] ? t : loose[li++]);
  p.tracks = shuffled;
  MP.rebuildJunctions(p, {});

  const before = MP.orderStats(p.tracks, p.maxStretch);
  const s = MP.suggestOrder(p);
  ok(!!s, 'a suggestion was produced');
  ok(s.order.length === 47, 'it covers every track');
  ok(new Set(s.order).size === 47, 'with no duplicates or losses');

  // Pins must not move.
  let pinsHeld = true;
  s.tracks.forEach((t, i) => { if (pins[i] && !t.pinned) pinsHeld = false; });
  ok(pinsHeld, 'pinned tracks stayed at their index');

  console.log('       before: ' + JSON.stringify(before));
  console.log('       after:  ' + JSON.stringify(s.after));
  ok(s.after.totalJump <= before.totalJump,
     'total tempo jump did not get worse (' + before.totalJump + ' -> ' + s.after.totalJump + ')');
  ok(s.after.hardCuts <= before.hardCuts,
     'forced hard cuts did not increase (' + before.hardCuts + ' -> ' + s.after.hardCuts + ')');

  const applied = MP.applyOrder(p, s.order);
  ok(applied.tracks.length === 47, 'applying the order keeps every track');
  ok(applied.junctions.length === 46, 'and rebuilds every junction');
}

console.log('\n— section direction —');
{
  const p = clone();
  const s = MP.suggestOrder(p);
  const cd = s.sections.find(x => /come/i.test(x.name));
  ok(cd && cd.direction === 'descending',
     'the come-down is sequenced descending, not ascending (' + (cd && cd.direction) + ')');
  const warm = s.sections.find(x => /warm/i.test(x.name));
  ok(warm && warm.direction === 'ascending', 'the warm-up climbs');

  // And the come-down really does descend in the output.
  const cdTracks = s.tracks.filter(t => /come/i.test(t.section || ''));
  const bpms = cdTracks.map(t => MP.effectiveBpm(t));
  let desc = true;
  for (let i = 1; i < bpms.length; i++) if (bpms[i] > bpms[i - 1]) desc = false;
  ok(desc, 'come-down BPMs actually descend: ' + bpms.map(b => b.toFixed(0)).join(' -> '));
}

console.log('\n— an already-good order is left alone —');
{
  const p = clone();
  const s = MP.suggestOrder(p);
  console.log('       moved ' + s.moved + ' of 47 tracks in the hand-sequenced set');
  ok(s.moved <= 8, 'the hand-sequenced order is nearly already optimal (' + s.moved + ' moved)');
}

console.log(fails ? '\n' + fails + ' FAILURES' : '\nall assertions passed');
process.exit(fails ? 1 : 0);
