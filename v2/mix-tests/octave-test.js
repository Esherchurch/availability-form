/* Octave choice from the running order. The numbers below are measured
   detections from the real library, not invented: "Baby, I Love Your Way" really
   does detect at 148 and Hotstepper at 100.4. */
const MP = require('../mix-project.js').MixProject ||
           (function(){ global.window = global; require('../mix-project.js'); return global.MixProject; })();

let fails = 0;
const ok = (c, m, extra) => { console.log((c?'  ok   ':'  FAIL ')+m+(extra?'   '+extra:'')); if(!c) fails++; };

function proj(list){
  return { tracks: list.map((x,i)=>({ id:'t'+i, title:x[0], sourceBpm:x[1],
            bpmMultiplier: x[2]||1, bpmLocked: !!x[3] })),
           junctions: [], maxStretch: 0.06 };
}
const bpms = p => p.tracks.map(t => +(t.sourceBpm*(t.bpmMultiplier||1)).toFixed(1));

// 1. The case that started this: a double-time detection between two ~90s.
let p = proj([['Despacito',89.3],['Baby I Love Your Way',148.0],['Proud Mary',76.0]]);
MP.autoOctave(p);
ok(bpms(p)[1] === 74, 'a 148 between 89 and 76 is played at 74', bpms(p).join(' / '));

// 2. Hotstepper must not be halved just because it alternates.
p = proj([['Hotstepper',100.4],['Despacito',89.3],['Another',95]]);
MP.autoOctave(p);
ok(bpms(p)[0] === 100.4, 'a 100 among 89s is left alone', bpms(p).join(' / '));

// 3. A genuinely fast set stays fast: 148 among 140s is not halved.
p = proj([['A',140],['B',148],['C',144]]);
MP.autoOctave(p);
ok(bpms(p)[1] === 148, 'a 148 among 140s stays at 148', bpms(p).join(' / '));

// 4. A half-time detection is doubled when the set is fast.
p = proj([['A',130],['B',65],['C',128]]);
MP.autoOctave(p);
ok(bpms(p)[1] === 130, 'a 65 among 130s is played at 130', bpms(p).join(' / '));

// 5. A hand-pinned track is obeyed and the rest fit around it.
p = proj([['A',89],['B',148,0.5,true],['C',150]]);
MP.autoOctave(p);
ok(bpms(p)[1] === 74, 'a pinned half-time is not overruled', bpms(p).join(' / '));
ok(bpms(p)[2] === 75, 'the neighbour moves to meet it instead', bpms(p).join(' / '));

// 6. Idempotent: running it twice changes nothing.
p = proj([['A',89.3],['B',148],['C',76]]);
MP.autoOctave(p);
const once = bpms(p).join('/');
const changed = MP.autoOctave(p);
ok(changed === false && bpms(p).join('/') === once, 'a second pass changes nothing', once);

// 7. Tracks without a tempo do not break the chain.
p = proj([['A',89],['NoBpm',0],['B',148],['C',76]]);
MP.autoOctave(p);
ok(bpms(p)[2] === 74, 'an un-analysed track between them is stepped over', bpms(p).join(' / '));

// 8. Nothing silly: a lone track is untouched.
p = proj([['A',148]]);
MP.autoOctave(p);
ok(bpms(p)[0] === 148, 'a single track has no neighbours to fit', bpms(p).join(' / '));

// 9. The whole set is chosen together, not pairwise: a run of half-time
//    detections resolves as one, rather than each fighting its neighbour.
p = proj([['A',128],['B',63],['C',64],['D',65],['E',130]]);
MP.autoOctave(p);
ok(bpms(p).slice(1,4).every(b => b > 120), 'a run of half-time detections all lift', bpms(p).join(' / '));

console.log(fails ? '\n'+fails+' FAILED' : '\nall octave choices correct');
process.exit(fails?1:0);
