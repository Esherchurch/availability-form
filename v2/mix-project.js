/* ===================================================================
   Mix Builder — project model, layout and persistence
   ===================================================================

   The project is an ordered list of tracks, each with its own edit
   points, plus a transition record at each junction. Positions on the
   timeline are COMPUTED from those by layout() — the timeline is a
   view, not the source of truth. Clips are never dragged to arbitrary
   positions, so every edit is bar-quantised by construction.

   layout() is pure and touches no audio, so it can run on every
   keystroke and be tested outside a browser.

   Nothing here goes to Firebase. Source audio is never stored — only
   the analysis, the project and the samples. On reopening, the folder
   is re-dropped and files are matched by name + size + duration.
   =================================================================== */

(function (global) {
  'use strict';

  var DB_NAME = 'mix-builder';
  var DB_VERSION = 1;
  var PROJECT_ID = 'current';          // v1 holds a single project (brief §12)

  var STORES = ['project', 'analysis', 'samples', 'sampleAudio', 'segments'];

  /* ------------------------------------------------------ defaults --- */

  function emptyProject(name) {
    return {
      id: PROJECT_ID,
      name: name || 'Untitled mix',
      created: new Date().toISOString(),
      maxStretch: 0.06,
      maxSampleStretch: 0.15,
      tracks: [],
      junctions: [],
      placements: [],
      bench: []          // alternates: everything not in the running order
    };
  }

  function defaultJunction(type) {
    var j = { type: type || 'blend' };
    if (type === 'hard-cut') { j.gapMs = 0; }
    else if (type === 'throw-bridge') {
      j.reverbBars = 2; j.beatBars = 16; j.midCutDb = 24; j.highCutDb = 0;
      j.isolation = 'eq'; j.overlapBars = 1; j.cutStyle = 'throw';
    } else {
      j.bars = 16; j.bassCutDb = 20;
    }
    return j;
  }

  /* -------------------------------------------------------- layout --- */
  /* Pure. Given a project, works out the tempo every junction should run at,
     which junctions cannot be beat-matched at all, and where everything sits
     in bars and seconds.

     Tempo model. A set that climbs 89 -> 132 BPM cannot share one tempo, and a
     track can only be stretched at a constant rate, so the tempo moves INSIDE
     each transition — which is what a DJ does with the pitch fader. Each
     junction therefore has its own target: the mean of its two tracks' BPMs,
     clamped so neither is asked for more than maxStretch. The untouched middle
     of a track plays at its own tempo.

     With this running order the steps are 0-2%, so the tempo step at a segment
     boundary is inaudible. If a set ever needs bigger steps, ramp the outgoing
     track into the target across the pre-roll bars instead — the layout already
     reports the per-track stretch it would need. */

  function clampToBudget(desired, bpm, maxStretch) {
    var lo = bpm * (1 - maxStretch), hi = bpm * (1 + maxStretch);
    return Math.max(lo, Math.min(hi, desired));
  }

  /* The tempo a track is actually played at, which is not always the tempo that
     was detected. "Happy" detects at 160 and the running order says HALF-TIME:
     played at 80 it sits next to Proud Mary at 76 and blends; taken literally it
     is 52% away from it and nothing can be done. bpmMultiplier carries that
     decision, and the Halve / Double buttons write it. */
  function effectiveBpm(t) {
    if (!t || !t.sourceBpm) return 0;
    return t.sourceBpm * (t.bpmMultiplier || 1);
  }

  /* HALF AND DOUBLE TIME, decided by the running order.
     ------------------------------------------------------------------
     A tempo detector cannot settle this on its own, and it is not a defect in
     the detector: 74 and 148 are both true descriptions of the same record, and
     a record at 74 with a backbeat has just as much energy on the half-beats.
     Measured across this library, neither the full-band nor the low-band
     alternation separates the cases — "Baby, I Love Your Way" (really 74, read
     as 148) and "Hotstepper" (really ~100, must not be halved) sit on the wrong
     sides of every threshold worth drawing.

     What DOES settle it is the neighbours, which is what the Halve button was
     really being used for. A track's playing tempo is free to be its detected
     tempo halved, unchanged or doubled; the mix only cares which of those sits
     closest to the tracks either side of it. So choose the multipliers for the
     whole running order at once, minimising the tempo step at every junction.

     Solved exactly by dynamic programming over three states per track — not a
     heuristic and not a search, so the answer is the best one available rather
     than a good one. Distance is measured in log tempo, so a step from 80 to 88
     counts the same as 120 to 132.

     A track the user has decided by hand (bpmLocked) is fixed and the rest are
     fitted around it. */

  var OCTAVE_CHOICES = [0.5, 1, 2];
  var OCTAVE_MIN_BPM = 60;         // below this nothing reads as a dance tempo
  var OCTAVE_MAX_BPM = 190;

  function octaveCandidates(t) {
    var base = t.sourceBpm || 0;
    if (!base) return [1];
    if (t.bpmLocked) return [t.bpmMultiplier || 1];
    var out = OCTAVE_CHOICES.filter(function (m) {
      var b = base * m;
      return b >= OCTAVE_MIN_BPM && b <= OCTAVE_MAX_BPM;
    });
    return out.length ? out : [1];
  }

  function autoOctave(project) {
    var tracks = (project && project.tracks) || [];
    // Only tracks with a tempo take part; the others neither constrain nor
    // are constrained, and must not break the chain between their neighbours.
    var idx = [];
    for (var i = 0; i < tracks.length; i++) if (tracks[i].sourceBpm) idx.push(i);
    if (idx.length < 2) return false;

    var cands = idx.map(function (i) { return octaveCandidates(tracks[i]); });
    var bpmAt = function (n, c) { return tracks[idx[n]].sourceBpm * cands[n][c]; };

    /* Per-track cost: a nudge back towards the detected tempo so nothing is
       moved for nothing, and a weak pull towards the middle of the dance range.

       That second term IS a tempo prior, and on its own a prior is what put a
       74 BPM record at 148 in the first place. Its job here is much smaller.
       Because distance is measured in log tempo, halving EVERY track in a run
       fits the neighbours exactly as well as halving none — 64/63/64/65 and
       128/126/128/130 score identically — and the chain criterion cannot
       separate them because there is nothing to separate. The prior is weighted
       far below a real junction cost, so it only ever settles a tie, never
       overrules the neighbours. */
    /* Moving a track away from its detected tempo costs something, so between
       two chains that beat-match equally well the one that re-labels fewer
       tracks wins. This matters because halving every track in a run and
       halving none are genuinely equivalent for matching — the stretch ratios
       come out identical — so what is left to choose on is which set of numbers
       is the more honest description. Measured against the cases below, this
       has to sit above 0.098 and below 0.697; the midpoint is not a tuned
       threshold so much as the whole of the usable range. */
    var TIE = 0.30;
    var CENTRE_BPM = 120, CENTRE_W = 0.25;
    var cost = cands.map(function (list, n) {
      return list.map(function (m) {
        var pull = CENTRE_W * Math.abs(Math.log(bpmAt(n, list.indexOf(m)) / CENTRE_BPM));
        return (m === 1 ? 0 : TIE) + pull;
      });
    });
    var from = cands.map(function (list) { return list.map(function () { return -1; }); });

    for (var n = 1; n < idx.length; n++) {
      for (var c = 0; c < cands[n].length; c++) {
        var best = Infinity, bestP = -1;
        for (var pC = 0; pC < cands[n - 1].length; pC++) {
          var step = Math.abs(Math.log(bpmAt(n, c)) - Math.log(bpmAt(n - 1, pC)));
          var tot = cost[n - 1][pC] + step;
          if (tot < best) { best = tot; bestP = pC; }
        }
        cost[n][c] += best;
        from[n][c] = bestP;
      }
    }

    var last = 0;
    for (var c2 = 1; c2 < cands[idx.length - 1].length; c2++) {
      if (cost[idx.length - 1][c2] < cost[idx.length - 1][last]) last = c2;
    }

    var pick = new Array(idx.length);
    for (var n2 = idx.length - 1; n2 >= 0; n2--) {
      pick[n2] = last;
      last = from[n2][last];
      if (last < 0) last = 0;
    }

    var changed = false;
    for (var n3 = 0; n3 < idx.length; n3++) {
      var t = tracks[idx[n3]], m = cands[n3][pick[n3]];
      if ((t.bpmMultiplier || 1) !== m) { t.bpmMultiplier = m; changed = true; }
    }
    return changed;
  }

  function layout(project) {
    var tracks = project.tracks || [];
    var maxStretch = project.maxStretch == null ? 0.06 : project.maxStretch;
    var out = { tracks: [], junctions: [], totalSec: 0, warnings: [] };
    if (!tracks.length) return out;

    // 1. Desired tempo per track: rolling mean of itself and its neighbours.
    var desired = tracks.map(function (t, i) {
      var vals = [], bpm = effectiveBpm(t);
      if (i > 0 && effectiveBpm(tracks[i - 1])) vals.push(effectiveBpm(tracks[i - 1]));
      if (bpm) vals.push(bpm);
      if (i < tracks.length - 1 && effectiveBpm(tracks[i + 1])) vals.push(effectiveBpm(tracks[i + 1]));
      if (!vals.length) return bpm;
      var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      return clampToBudget(mean, bpm || mean, maxStretch);
    });

    // 2. Per-junction target, and whether it can be beat-matched at all.
    for (var i = 0; i < tracks.length - 1; i++) {
      var a = tracks[i], b = tracks[i + 1];
      var bpmA = effectiveBpm(a), bpmB = effectiveBpm(b);
      var j = (project.junctions || [])[i] || defaultJunction('blend');
      var target = (desired[i] + desired[i + 1]) / 2;
      var stretchA = bpmA ? Math.abs(target / bpmA - 1) : 0;
      var stretchB = bpmB ? Math.abs(target / bpmB - 1) : 0;
      var reachable = stretchA <= maxStretch + 1e-9 && stretchB <= maxStretch + 1e-9;

      // Out of budget after clamping: there is no common tempo, so no target is
      // reported at all. Reporting one would hand the renderer a stretch it has
      // already been told is too far, and the render would sound processed.
      // A hard cut is proposed; the user's own choice of type is left alone.
      var proposed = null, apartPct = null;
      if (j.type === 'hard-cut') {
        target = null; stretchA = 0; stretchB = 0; reachable = true;
      } else if (!reachable) {
        proposed = 'hard-cut';
        /* Kept ON the junction so the timeline warning and the junction panel
           read the same number. They used to disagree — 12.6% in one, 0.0% in
           the other — because this message was built here from the real values
           and then stretchA/stretchB were nulled on the next line, leaving the
           panel to read `null || 0`. One source, no drift. */
        apartPct = Math.max(stretchA, stretchB) * 100;
        out.warnings.push({
          junction: i,
          message: '"' + (a.title || a.file) + '" at ' + Math.round(bpmA) + ' BPM and "' +
                   (b.title || b.file) + '" at ' + Math.round(bpmB) + ' BPM are too far apart ' +
                   'in tempo to play over each other. Bringing them together would mean ' +
                   'stretching one of them by ' + apartPct.toFixed(0) + '%, which is enough to ' +
                   'make a record sound processed — so a blend will not work here. Instead ' +
                   'drums play between them, walking the tempo from one to the other, so neither ' +
                   'record is stretched at all. Open the junction and press Render, then Play, ' +
                   'to hear it.'
        });
        target = null; stretchA = null; stretchB = null;
      }

      out.junctions.push({
        index: i, afterTrackId: a.id, beforeTrackId: b.id,
        type: j.type, proposedType: proposed,
        targetBpm: target ? Math.round(target * 100) / 100 : null,
        stretchA: stretchA, stretchB: stretchB, reachable: reachable,
        apartPct: apartPct, bpmA: bpmA, bpmB: bpmB,
        /* A bridge is always renderable. This used to require a common tempo,
           which meant the junctions that most needed hearing — the ones with
           no tempo match — had their Render button disabled, so Play stayed
           greyed out and bouncing the whole set to a WAV was the only way to
           hear them at all. Carrying an unmatched tempo is what the fill is
           for; refusing to render it was the rule from before it existed. */
        renderable: reachable || j.type === 'hard-cut' || j.type === 'throw-bridge',
        settings: j
      });
    }

    // 3. Bar positions. A track occupies its own body; a junction overlaps the
    //    two tracks it joins, so the set is shorter than the sum of its parts.
    var cursorSec = 0;
    for (var k = 0; k < tracks.length; k++) {
      var t = tracks[k];
      var jIn = k > 0 ? out.junctions[k - 1] : null;
      var jOut = k < out.junctions.length ? out.junctions[k] : null;

      var bodySec = trackBodySec(t);
      var overlapIn = jIn ? junctionOverlapSec(jIn) : 0;
      var startSec = Math.max(0, cursorSec - overlapIn);

      out.tracks.push({
        index: k, id: t.id, title: t.title || t.file,
        startSec: startSec,
        bodySec: bodySec,
        endSec: startSec + bodySec,
        sourceBpm: t.sourceBpm || null,
        effectiveBpm: effectiveBpm(t) || null,
        halfTime: (t.bpmMultiplier || 1) !== 1,
        playBpm: jOut && jOut.targetBpm ? jOut.targetBpm : (effectiveBpm(t) || null),
        linked: !!t.linked,
        maxStretch: Math.max((jIn && jIn.stretchB) || 0, (jOut && jOut.stretchA) || 0)
      });
      cursorSec = startSec + bodySec;
    }
    out.totalSec = cursorSec;
    return out;
  }

  /** How long a track actually plays: its edit list if it has one, else entry
      to mix-out. Regions are bar-snapped, so this is exact. */
  var REGION_JOIN_SEC = 0.010;   // must match MixDSP.REGION_JOIN_SEC

  function trackBodySec(t) {
    if (t.regions && t.regions.length) {
      // Assembled length, not the sum of the parts: each join overlaps by a
      // 10 ms crossfade, so an edit list is slightly shorter than its regions.
      var bpm = effectiveBpm(t);
      var barSec = bpm ? 60 / bpm * 4 : 2;
      var total = 0, n = 0;
      for (var i = 0; i < t.regions.length; i++) {
        var len = (t.regions[i].bars || 0) * barSec;
        if (len > 0) { total += len; n++; }
      }
      return Math.max(0, total - REGION_JOIN_SEC * Math.max(0, n - 1));
    }
    var entry = t.entrySec || 0;
    var exit = t.exitSec || (t.durationSec || 0);
    return Math.max(0, exit - entry);
  }

  /** Seconds of the outgoing track the incoming one plays over. */
  function junctionOverlapSec(j) {
    var s = j.settings || {};
    if (j.type === 'hard-cut') return -((s.gapMs || 0) / 1000);  // a gap lengthens
    if (!j.targetBpm) return 0;
    var barSec = 60 / j.targetBpm * 4;
    if (j.type === 'blend') return (s.bars || 16) * barSec;
    return (s.overlapBars == null ? 1 : s.overlapBars) * barSec;
  }

  /* ------------------------------- reordering, replacing, removing --- */
  /* A junction belongs to the PAIR of tracks it joins, not to a position in an
     array. So whenever the order changes, junction settings are re-attached by
     pair: a join you configured survives being moved somewhere else, and only
     genuinely new pairs get defaults. Cached audio survives the same way,
     because the segment cache is keyed by content (see junctionCacheKey) rather
     than by index. Move a track and the other 44 junctions keep their renders. */

  function pairKey(a, b) { return (a && a.id) + '|' + (b && b.id); }

  function capturePairs(project) {
    var map = {};
    for (var i = 0; i < (project.junctions || []).length; i++) {
      var a = project.tracks[i], b = project.tracks[i + 1];
      if (a && b) map[pairKey(a, b)] = project.junctions[i];
    }
    return map;
  }

  /* Rebuild the junction list for the current track order, reusing any join
     that still connects the same two tracks. A brand-new pair is seeded from
     the tempo gap: too far to stretch and it starts life as a hard cut, because
     proposing a blend that cannot be rendered helps nobody. */
  function rebuildJunctions(project, pairs) {
    var out = [];
    for (var i = 0; i < project.tracks.length - 1; i++) {
      var a = project.tracks[i], b = project.tracks[i + 1];
      var existing = pairs && pairs[pairKey(a, b)];
      if (existing) { out.push(existing); continue; }
      var bpmA = effectiveBpm(a), bpmB = effectiveBpm(b);
      var apart = (bpmA && bpmB) ? Math.abs(bpmB / bpmA - 1) : 0;
      out.push(defaultJunction(apart > (project.maxStretch || 0.06) * 2 ? 'hard-cut' : 'blend'));
    }
    project.junctions = out;
    return project;
  }

  function moveTrack(project, from, to) {
    if (from === to || from < 0 || to < 0 ||
        from >= project.tracks.length || to >= project.tracks.length) return project;
    var pairs = capturePairs(project);
    var t = project.tracks.splice(from, 1)[0];
    project.tracks.splice(to, 0, t);
    return rebuildJunctions(project, pairs);
  }

  function removeTrack(project, i) {
    if (i < 0 || i >= project.tracks.length) return project;
    var pairs = capturePairs(project);
    project.tracks.splice(i, 1);
    return rebuildJunctions(project, pairs);
  }

  function insertTrack(project, i, track) {
    var pairs = capturePairs(project);
    project.tracks.splice(Math.max(0, Math.min(i, project.tracks.length)), 0, track);
    return rebuildJunctions(project, pairs);
  }

  /* Swap a track for one off the bench, in place. The outgoing track goes to the
     bench rather than being thrown away, so a swap is always reversible — which
     is the whole point of having alternates. */
  function replaceTrack(project, i, benchIndex) {
    var incoming = (project.bench || [])[benchIndex];
    var outgoing = project.tracks[i];
    if (!incoming || !outgoing) return project;
    var pairs = capturePairs(project);
    project.bench.splice(benchIndex, 1);
    project.tracks[i] = Object.assign({}, incoming, {
      id: incoming.id || 'trk_' + hash(incoming.title + Date.now()),
      section: incoming.section || outgoing.section,
      pinned: outgoing.pinned
    });
    project.bench.push(benchToEntry(outgoing));
    return rebuildJunctions(project, pairs);
  }

  function benchTrack(project, i) {
    if (i < 0 || i >= project.tracks.length) return project;
    var pairs = capturePairs(project);
    var t = project.tracks.splice(i, 1)[0];
    (project.bench = project.bench || []).push(benchToEntry(t));
    return rebuildJunctions(project, pairs);
  }

  function benchToEntry(t) {
    return {
      id: t.id, title: t.title, artist: t.artist, section: t.section,
      sourceBpm: t.sourceBpm, bpmMultiplier: t.bpmMultiplier || 1,
      bpmLocked: t.bpmLocked, confidence: t.confidence,
      file: t.file, fileSize: t.fileSize,
      downbeatSec: t.downbeatSec, entrySec: t.entrySec, exitSec: t.exitSec,
      durationSec: t.durationSec, peaks: t.peaks, note: t.note
    };
  }

  /* --------------------------------------------- suggested order --- */
  /* Once real BPMs are in, the running order can be proposed rather than
     hand-sequenced.

     The whole problem is choosing an order that minimises the tempo jump at
     every join, and for that there is an exact answer rather than a heuristic:
     the tracks lie on a line (their tempo), and for points on a line the path
     that minimises the sum of adjacent distances is the sorted one. So sorting
     by tempo IS optimal — no search, no annealing, nothing to tune.

     Three things sit on top of that, because a disco is not only a tempo curve:

       - Sections keep their identity and their order. Warm-up stays before
         Peak; the sort happens within each section.
       - A section's DIRECTION is read from how it is currently arranged. The
         come-down descends 80 -> 76 -> 68, so sorting it ascending would be
         exactly wrong. If a section currently ends lower than it starts, it is
         sorted descending.
       - Pinned tracks do not move at all. The opener, the last dance and the
         cake are fixed points in the evening, not sequencing decisions. */

  function orderStats(tracks, maxStretch) {
    var totalJump = 0, maxJump = 0, cuts = 0, budget = maxStretch || 0.06;
    for (var i = 0; i < tracks.length - 1; i++) {
      var a = effectiveBpm(tracks[i]), b = effectiveBpm(tracks[i + 1]);
      if (!a || !b) continue;
      var rel = Math.abs(b / a - 1);
      var mid = (a + b) / 2;
      var need = Math.max(Math.abs(mid / a - 1), Math.abs(mid / b - 1));
      totalJump += Math.abs(b - a);
      if (rel > maxJump) maxJump = rel;
      if (need > budget) cuts++;
    }
    return {
      totalJump: Math.round(totalJump * 10) / 10,
      maxJumpPct: Math.round(maxJump * 1000) / 10,
      hardCuts: cuts,
      blendable: Math.max(0, tracks.length - 1 - cuts)
    };
  }

  function suggestOrder(project, opts) {
    opts = opts || {};
    var respectSections = opts.respectSections !== false;
    var tracks = project.tracks || [];
    if (tracks.length < 3) return null;
    var budget = project.maxStretch || 0.06;

    // Section order and direction, taken from how the set is arranged now.
    var sectionSeq = [], dir = {};
    tracks.forEach(function (t) {
      var s = respectSections ? (t.section || '') : '';
      if (sectionSeq.indexOf(s) === -1) sectionSeq.push(s);
    });
    /* Direction is read from the trend across the section, comparing the mean of
       its first half against its second, and pinned tracks are excluded from
       that reading. Comparing the endpoints instead gets the warm-up backwards:
       it opens on a 104 BPM anchor and then runs 89 up to 100, so its last
       track is lower than its first while the section is plainly climbing. */
    sectionSeq.forEach(function (s) {
      var inSec = tracks.filter(function (t) {
        return (respectSections ? (t.section || '') : '') === s && effectiveBpm(t);
      });
      var loose = inSec.filter(function (t) { return !t.pinned; });
      var use = loose.length >= 2 ? loose : inSec;
      if (use.length < 2) { dir[s] = 1; return; }
      var half = Math.floor(use.length / 2);
      var mean = function (arr) {
        return arr.reduce(function (a, t) { return a + effectiveBpm(t); }, 0) / (arr.length || 1);
      };
      var head = mean(use.slice(0, half || 1));
      var tail = mean(use.slice(use.length - (half || 1)));
      dir[s] = tail < head ? -1 : 1;
    });

    var pinnedAt = {};
    tracks.forEach(function (t, i) { if (t.pinned) pinnedAt[i] = t; });

    var movable = tracks.filter(function (t) { return !t.pinned; });
    movable.sort(function (x, y) {
      var sx = respectSections ? (x.section || '') : '', sy = respectSections ? (y.section || '') : '';
      if (sx !== sy) return sectionSeq.indexOf(sx) - sectionSeq.indexOf(sy);
      return (effectiveBpm(x) - effectiveBpm(y)) * (dir[sx] || 1);
    });

    var out = [], mi = 0;
    for (var i = 0; i < tracks.length; i++) {
      out.push(pinnedAt[i] ? pinnedAt[i] : movable[mi++]);
    }

    var before = orderStats(tracks, budget);
    var after = orderStats(out, budget);
    var moved = 0;
    out.forEach(function (t, i) { if (tracks[i] !== t) moved++; });

    return {
      order: out.map(function (t) { return t.id; }),
      tracks: out,
      before: before, after: after, moved: moved,
      sections: sectionSeq.map(function (s) {
        return { name: s || '(none)', direction: dir[s] < 0 ? 'descending' : 'ascending' };
      }),
      improved: after.hardCuts < before.hardCuts ||
                (after.hardCuts === before.hardCuts && after.totalJump < before.totalJump)
    };
  }

  function applyOrder(project, order) {
    var pairs = capturePairs(project);
    var byId = {};
    project.tracks.forEach(function (t) { byId[t.id] = t; });
    var next = order.map(function (id) { return byId[id]; }).filter(Boolean);
    if (next.length !== project.tracks.length) return project;   // refuse a lossy reorder
    project.tracks = next;
    return rebuildJunctions(project, pairs);
  }

  /* ------------------------------------------- segment cache keys --- */
  /* A junction's rendered audio depends only on the two tracks' edit points and
     the junction's own settings. Anything else can change without invalidating
     it — which is what makes editing junction 12 cost one render, not forty. */

  function junctionCacheKey(project, i) {
    var a = project.tracks[i], b = project.tracks[i + 1];
    var j = project.junctions[i];
    if (!a || !b) return null;
    var lay = layout(project).junctions[i];
    var parts = [
      a.file, a.fileSize, a.sourceBpm, a.downbeatSec, a.exitSec,
      JSON.stringify(a.regions || []),
      b.file, b.fileSize, b.sourceBpm, b.downbeatSec, b.entrySec,
      lay ? lay.targetBpm : null,
      JSON.stringify(j || {})
    ];
    return 'j' + i + ':' + hash(parts.join('|'));
  }

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /* ---------------------------------------------------- IndexedDB --- */

  var _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        });
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var req = fn(t.objectStore(store));
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  var get = function (store, key) { return tx(store, 'readonly', function (s) { return s.get(key); }); };
  var put = function (store, key, val) { return tx(store, 'readwrite', function (s) { return s.put(val, key); }); };
  var del = function (store, key) { return tx(store, 'readwrite', function (s) { return s.delete(key); }); };
  var keys = function (store) { return tx(store, 'readonly', function (s) { return s.getAllKeys(); }); };
  var all = function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); };

  function loadProject() {
    return get('project', PROJECT_ID).then(function (p) { return p || emptyProject(); });
  }

  /* Auto-save on every change; there is no save button. Debounced so a slider
     drag is one write, not two hundred. */
  var _saveTimer = null, _saveWaiters = [];
  function saveProject(project, immediate) {
    project.modified = new Date().toISOString();
    if (immediate) {
      clearTimeout(_saveTimer); _saveTimer = null;
      return put('project', PROJECT_ID, project);
    }
    return new Promise(function (resolve) {
      _saveWaiters.push(resolve);
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        _saveTimer = null;
        put('project', PROJECT_ID, project).then(function () {
          var w = _saveWaiters; _saveWaiters = [];
          w.forEach(function (r) { r(); });
        });
      }, 400);
    });
  }

  /* Analysis is keyed by the file's identity, not the project, so re-dropping a
     folder into a new project still costs nothing. */
  /* Bumped whenever the detector changes, so a cached result from an older
     algorithm is re-analysed instead of being trusted forever. Without this,
     fixing half/double-time detection would have had no effect on any project
     that had already been analysed once. */
  var ANALYSIS_VERSION = 1;

  function analysisKey(file, durationSec) {
    return ['v' + ANALYSIS_VERSION, file.name, file.size,
            durationSec ? durationSec.toFixed(3) : '?'].join('|');
  }
  var getAnalysis = function (key) { return get('analysis', key); };
  var putAnalysis = function (key, val) { return put('analysis', key, val); };

  var getSegment = function (key) { return get('segments', key); };
  var putSegment = function (key, val) { return put('segments', key, val); };
  function clearSegments() { return tx('segments', 'readwrite', function (s) { return s.clear(); }); }

  /* ----------------------------------------------------- samples --- */
  /* Metadata in `samples`, audio in `sampleAudio` under the same id. Audio goes
     in as a WAV Blob — well past what localStorage could hold, which is why the
     whole thing is IndexedDB.

     Samples are ASSETS; placements are USES. The same hook dropped at a 108 BPM
     junction and a 124 BPM one is one stored sample and two placements, which is
     why nothing about tempo is baked into the stored audio. */

  function saveSample(meta, wavBlob) {
    var id = meta.id || ('smp_' + hash(meta.name + '|' + Date.now()));
    var rec = Object.assign({}, meta, { id: id, saved: new Date().toISOString() });
    return put('samples', id, rec)
      .then(function () { return wavBlob ? put('sampleAudio', id, wavBlob) : null; })
      .then(function () { return rec; });
  }

  function listSamples() {
    return all('samples').then(function (rows) {
      return (rows || []).sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
    });
  }

  var getSampleAudio = function (id) { return get('sampleAudio', id); };

  function deleteSample(id) {
    return del('samples', id).then(function () { return del('sampleAudio', id); });
  }

  /** How many placements use a sample — §6.6's "used in N places". */
  function sampleUsage(project, id) {
    return (project.placements || []).filter(function (p) { return p.sampleId === id; }).length;
  }

  function addPlacement(project, placement) {
    (project.placements = project.placements || []).push(Object.assign({
      gainDb: -8, fadeInMs: 40, fadeOutMs: 300, barsBeforeEntry: 8
    }, placement));
    return project;
  }

  function removePlacement(project, index) {
    if (project.placements && index >= 0 && index < project.placements.length) {
      project.placements.splice(index, 1);
    }
    return project;
  }

  /* Placements refer to junctions by index, so removing or reordering tracks can
     leave one pointing at a junction that no longer exists. */
  function prunePlacements(project) {
    var n = (project.junctions || []).length;
    var before = (project.placements || []).length;
    project.placements = (project.placements || []).filter(function (p) {
      return p.atJunction != null && p.atJunction >= 0 && p.atJunction < n;
    });
    return before - project.placements.length;
  }

  /* ----------------------------------------------------- re-link --- */
  /* Source audio is never stored — forty tracks is gigabytes. On reopening, the
     project has every setting and waveform but no audio. Drop the folder and
     files are matched back by name, then size, then duration. */

  function relink(project, files) {
    var byName = {}, bySize = {};
    files.forEach(function (f) {
      byName[f.name.toLowerCase()] = f;
      (bySize[f.size] = bySize[f.size] || []).push(f);
    });
    var matched = [], missing = [];
    (project.tracks || []).forEach(function (t) {
      var f = byName[(t.file || '').toLowerCase()];
      if (!f && t.fileSize && bySize[t.fileSize] && bySize[t.fileSize].length === 1) {
        f = bySize[t.fileSize][0];       // renamed but byte-identical
      }
      if (f) matched.push({ track: t, file: f });
      else missing.push(t);
    });
    var used = matched.map(function (m) { return m.file; });
    var spare = files.filter(function (f) { return used.indexOf(f) === -1; });
    return { matched: matched, missing: missing, spare: spare };
  }

  /* ------------------------------------------ running-order import --- */
  /* cleanTitle / getMatches / getConfidence are lifted from
     availability-form/batchupload.html, where they were written to match
     dropped PDF filenames to song titles. The job here is identical with audio
     files, so this is reuse rather than a second matcher. */

  function cleanTitle(name) {
    return String(name || '').toLowerCase()
      .replace(/\.(mp3|wav|m4a|flac|ogg|aac|aiff?)$/i, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/^\s*\d{1,2}[\s._-]+/, '')          // leading track number
      .replace(/\b(remix|radio edit|extended|mix|version|remaster(ed)?)\b/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getMatches(title, candidates, keyFn) {
    var words = cleanTitle(title).split(' ').filter(Boolean);
    return candidates.map(function (c) {
      var cWords = cleanTitle(keyFn ? keyFn(c) : c).split(' ').filter(Boolean);
      if (!cWords.length || !words.length) return { item: c, score: 0 };
      var overlap = words.filter(function (w) { return cWords.indexOf(w) !== -1; });
      // Symmetric: penalise both missing and extra words, so "Good Times" does
      // not score 1.0 against "Good Times Bad Times".
      var score = overlap.length / Math.max(words.length, cWords.length);
      return { item: c, score: score };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
  }

  function getConfidence(matches) {
    if (!matches || !matches.length) return 'low';
    var top = matches[0].score;
    if (top >= 0.7) return 'high';
    if (top >= 0.4) return 'medium';
    return 'low';
  }

  /* The Mix column already carries the junction decision, so the project seeds
     itself rather than asking. Values seen in the real running order:
       OPENER, HARD CUT, STOP / START, COLD START, HALF-TIME, TEMPO CHANGE,
       LAST DANCE, "Lock on (same BPM)", "Straight blend (+1/+2)",
       "Nudge pitch (+3/+4)". */
  function mixColumnToJunction(mix) {
    var m = String(mix || '').trim().toUpperCase();
    if (!m) return null;
    if (m === 'HARD CUT' || m === 'COLD START') return defaultJunction('hard-cut');
    if (m === 'STOP / START' || m === 'STOP/START') {
      var j = defaultJunction('hard-cut'); j.gapMs = 1500; j.note = 'full stop'; return j;
    }
    // HALF-TIME halves the track's own tempo (see bpmMultiplier in seedProject).
    // Even so the step into it is far too big to bridge — 132 into 80 — so the
    // junction itself is a cut.
    if (m === 'HALF-TIME' || m === 'DOUBLE-TIME') return defaultJunction('hard-cut');
    if (m === 'TEMPO CHANGE') return defaultJunction('throw-bridge');
    if (m === 'OPENER' || m === 'LAST DANCE') return null;   // markers, not junctions
    if (m.indexOf('LOCK ON') === 0) { var b = defaultJunction('blend'); b.bars = 16; return b; }
    if (m.indexOf('STRAIGHT BLEND') === 0) { var s = defaultJunction('blend'); s.bars = 16; return s; }
    if (m.indexOf('NUDGE PITCH') === 0) { var n = defaultJunction('blend'); n.bars = 12; return n; }
    return defaultJunction('blend');
  }

  /* ----------------------------------------------- reading the .xlsx ---
     An .xlsx is a zip of XML, so it can be read here without a library. This
     is the parser from mix-tests/xlsx2json.js, which already reads the real
     running-order sheet, with zlib swapped for the browser's own
     DecompressionStream — everything below the unzip is unchanged.

     The rest of the suite reads spreadsheets with SheetJS off a CDN
     (birthday.html), but Mix Builder has to work with no network at all, and
     vendoring 900 KB of third-party code into the repo to save eighty lines is
     the worse trade. */

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('This browser cannot unpack .xlsx files.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }

  /* Walk local file headers (PK 03 04). Good enough for Office output. */
  function unzip(arrayBuffer) {
    var buf = new Uint8Array(arrayBuffer);
    var dv = new DataView(arrayBuffer);
    var dec = new TextDecoder('utf-8');
    var jobs = [], names = [];
    for (var i = 0; i + 4 <= buf.length; ) {
      if (dv.getUint32(i, true) !== 0x04034b50) { i++; continue; }
      var method = dv.getUint16(i + 8, true);
      var csize = dv.getUint32(i + 18, true);
      var nameLen = dv.getUint16(i + 26, true), extraLen = dv.getUint16(i + 28, true);
      var name = dec.decode(buf.subarray(i + 30, i + 30 + nameLen));
      var start = i + 30 + nameLen + extraLen;
      if (csize === 0) {                    // streamed entry: find the next signature
        var j = start;
        while (j + 4 <= buf.length && dv.getUint32(j, true) !== 0x08074b50 &&
               dv.getUint32(j, true) !== 0x04034b50 &&
               dv.getUint32(j, true) !== 0x02014b50) j++;
        csize = j - start;
      }
      var raw = buf.subarray(start, start + csize);
      names.push(name);
      jobs.push(method === 0 ? Promise.resolve(raw)
                             : inflateRaw(raw).catch(function () { return null; }));
      i = start + csize;
    }
    return Promise.all(jobs).then(function (parts) {
      var files = {};
      for (var k = 0; k < names.length; k++) if (parts[k]) files[names[k]] = parts[k];
      return files;
    });
  }

  function decodeEntities(str) {
    return String(str).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
  }

  function matchAll(re, str) {
    var out = [], m;
    re.lastIndex = 0;
    while ((m = re.exec(str)) !== null) {
      out.push(m);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return out;
  }

  /* Which row holds the column names. The real sheet has three rows of title
     and blurb above it, so this cannot assume row 1 — it looks for the row that
     names the track column. */
  function headerRowOf(rows) {
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].cells;
      for (var col in cells) {
        if (/^(track|title|song)$/i.test(String(cells[col]).trim())) return i;
      }
    }
    return -1;
  }

  function sheetToObjects(rows) {
    var h = headerRowOf(rows);
    if (h < 0) return [];
    var header = rows[h].cells, out = [];
    for (var i = h + 1; i < rows.length; i++) {
      var cells = rows[i].cells, o = {}, any = false;
      for (var col in header) {
        var name = String(header[col]).trim();
        if (!name || cells[col] === undefined) continue;
        o[name] = cells[col]; any = true;
      }
      if (any) out.push(o);
    }
    return out;
  }

  /* Reads an .xlsx and returns { sheets, sheetUsed, tracks }. The tracks come
     from the sheet that looks like a running order — by name if there is one,
     otherwise the first sheet that has a track column. */
  function readWorkbook(arrayBuffer) {
    return unzip(arrayBuffer).then(function (files) {
      var td = new TextDecoder('utf-8');
      var text = function (n) { return files[n] ? td.decode(files[n]) : ''; };

      // One <si> may hold several <t> runs; join them.
      var shared = matchAll(/<si>([\s\S]*?)<\/si>/g, text('xl/sharedStrings.xml')).map(function (m) {
        return decodeEntities(matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g, m[1]).map(function (t) {
          return t[1];
        }).join(''));
      });

      var names = matchAll(/<sheet[^>]*name="([^"]*)"/g, text('xl/workbook.xml')).map(function (m) {
        return decodeEntities(m[1]);
      }).filter(function (n) { return n.indexOf('_xlnm') !== 0; });

      var sheets = names.map(function (name, idx) {
        var xml = text('xl/worksheets/sheet' + (idx + 1) + '.xml');
        var rows = [];
        matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, xml).forEach(function (rm) {
          var cells = {}, got = false;
          matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g, rm[2]).forEach(function (cm) {
            var vm = cm[3].match(/<v>([\s\S]*?)<\/v>/);
            if (!vm) {
              // inline string: <c t="inlineStr"><is><t>...</t></is></c>
              var im = cm[3].match(/<t[^>]*>([\s\S]*?)<\/t>/);
              if (!im) return;
              cells[cm[1]] = decodeEntities(im[1]); got = true; return;
            }
            cells[cm[1]] = /t="s"/.test(cm[2]) ? shared[+vm[1]] : decodeEntities(vm[1]);
            got = true;
          });
          if (got) rows.push({ r: +rm[1], cells: cells });
        });
        return { name: name, rows: rows };
      });

      var pick = null, i;
      for (i = 0; i < sheets.length; i++) {
        if (/running\s*order/i.test(sheets[i].name)) { pick = sheets[i]; break; }
      }
      if (!pick) {
        for (i = 0; i < sheets.length; i++) {
          if (headerRowOf(sheets[i].rows) >= 0) { pick = sheets[i]; break; }
        }
      }
      return {
        sheets: sheets.map(function (sh) { return sh.name; }),
        sheetUsed: pick ? pick.name : null,
        tracks: pick ? sheetToObjects(pick.rows) : []
      };
    });
  }

  /* Accepts the JSON produced from the .xlsx, or pasted tab/comma-separated
     rows with a header line. Returns rows; matching to files happens after. */
  function parseRunningOrder(input) {
    if (typeof input !== 'string') {
      var rows = input && input.tracks ? input.tracks : input;
      // Filter AFTER normalising. The column may be called Track, Title or
      // Song, and only normaliseRow knows that; filtering on r.Track first
      // threw away every sheet that used one of the other two.
      return (rows || []).map(function (r) { return r ? normaliseRow(r) : null; })
                         .filter(function (r) { return r && r.title; });
    }
    var text = input.trim();
    if (text.charAt(0) === '{' || text.charAt(0) === '[') {
      try { return parseRunningOrder(JSON.parse(text)); } catch (e) { /* fall through */ }
    }
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var sep = lines[0].indexOf('\t') !== -1 ? '\t' : ',';
    var header = splitRow(lines[0], sep).map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (l) {
      var cells = splitRow(l, sep), o = {};
      header.forEach(function (h, i) { o[h] = (cells[i] || '').trim(); });
      return normaliseRow(o);
    }).filter(function (r) { return r.title; });
  }

  function splitRow(line, sep) {
    if (sep === '\t') return line.split('\t');
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function normaliseRow(o) {
    var pick = function () {
      for (var i = 0; i < arguments.length; i++) {
        var k = arguments[i];
        for (var key in o) if (key.toLowerCase() === k) return o[key];
      }
      return '';
    };
    return {
      idx: Number(pick('#', 'no', 'num')) || null,
      title: String(pick('track', 'title', 'song') || '').trim(),
      artist: String(pick('artist') || '').trim(),
      bpm: Number(pick('bpm')) || null,
      // The Swap-ins sheet calls it "Fits section"; the running order calls it
      // "Section". Same thing.
      section: String(pick('section', 'fits section') || '').trim(),
      mix: String(pick('mix') || '').trim(),
      note: String(pick('note', 'notes') || '').trim()
    };
  }

  /** The Swap-ins sheet: alternates that are not in the running order. Same
      columns minus #/Mix, so the same parser handles it. */
  function parseBench(input) {
    return parseRunningOrder(input).map(function (r, i) {
      return {
        id: 'bench_' + hash(r.title + '|' + r.artist) + '_' + i,
        title: r.title, artist: r.artist, section: r.section,
        sourceBpm: r.bpm || null, bpmMultiplier: 1, bpmLocked: false,
        file: null, fileSize: null, note: r.note,
        downbeatSec: 0, entrySec: 0, exitSec: 0, durationSec: 0,
        linked: false, regions: null
      };
    });
  }

  /** Match running-order rows to dropped files and build a project. */
  function seedProject(rows, files, existing) {
    var project = existing || emptyProject();
    var pool = files ? files.slice() : [];
    project.tracks = rows.map(function (r, i) {
      var matches = pool.length ? getMatches(r.title, pool, function (f) { return f.name; }) : [];
      var conf = getConfidence(matches);
      var file = (matches[0] && matches[0].score >= 0.4) ? matches[0].item : null;
      if (file) pool.splice(pool.indexOf(file), 1);
      // A HALF-TIME / DOUBLE-TIME instruction is about how this track is played,
      // not about the join before it, so it lands on the track.
      var mixUpper = String(r.mix || '').trim().toUpperCase();
      var mult = mixUpper === 'HALF-TIME' ? 0.5 : mixUpper === 'DOUBLE-TIME' ? 2 : 1;
      // The opener, the last dance and the cake are fixed points in the evening,
      // not sequencing decisions — the auto-sequencer must leave them alone.
      var pinned = mixUpper === 'OPENER' || mixUpper === 'LAST DANCE' ||
                   mixUpper === 'STOP / START' || mixUpper === 'STOP/START' ||
                   /^cake$/i.test(r.section || '');
      return {
        id: 'trk_' + String(i + 1).padStart(2, '0'),
        title: r.title, artist: r.artist, section: r.section, note: r.note,
        pinned: pinned,
        file: file ? file.name : null,
        fileSize: file ? file.size : null,
        matchConfidence: file ? conf : 'unmatched',
        sourceBpm: r.bpm || null,       // from the sheet until analysis overrides
        bpmMultiplier: mult,
        // HALF-TIME on the sheet is an instruction, so autoOctave leaves it be.
        bpmLocked: mult !== 1,
        downbeatSec: 0, entrySec: 0, exitSec: 0, durationSec: 0,
        linked: false, regions: null,
        mixNote: r.mix
      };
    });
    project.junctions = [];
    for (var i = 0; i < project.tracks.length - 1; i++) {
      // The Mix value on row i+1 describes how row i+1 arrives, i.e. junction i.
      var j = mixColumnToJunction(rows[i + 1] && rows[i + 1].mix);
      project.junctions.push(j || defaultJunction('blend'));
    }
    return project;
  }

  /* --------------------------------------------------------- API --- */

  var api = {
    PROJECT_ID: PROJECT_ID,
    emptyProject: emptyProject,
    defaultJunction: defaultJunction,
    layout: layout,
    trackBodySec: trackBodySec,
    junctionOverlapSec: junctionOverlapSec,
    junctionCacheKey: junctionCacheKey,
    hash: hash,
    open: open,
    loadProject: loadProject,
    saveProject: saveProject,
    analysisKey: analysisKey,
    getAnalysis: getAnalysis,
    putAnalysis: putAnalysis,
    getSegment: getSegment,
    putSegment: putSegment,
    clearSegments: clearSegments,
    get: get, put: put, del: del, keys: keys, all: all,
    saveSample: saveSample,
    listSamples: listSamples,
    getSampleAudio: getSampleAudio,
    deleteSample: deleteSample,
    sampleUsage: sampleUsage,
    addPlacement: addPlacement,
    removePlacement: removePlacement,
    prunePlacements: prunePlacements,
    relink: relink,
    effectiveBpm: effectiveBpm,
    moveTrack: moveTrack,
    removeTrack: removeTrack,
    insertTrack: insertTrack,
    replaceTrack: replaceTrack,
    benchTrack: benchTrack,
    benchToEntry: benchToEntry,
    rebuildJunctions: rebuildJunctions,
    capturePairs: capturePairs,
    orderStats: orderStats,
    suggestOrder: suggestOrder,
    applyOrder: applyOrder,
    parseBench: parseBench,
    cleanTitle: cleanTitle,
    getMatches: getMatches,
    getConfidence: getConfidence,
    mixColumnToJunction: mixColumnToJunction,
    autoOctave: autoOctave,
    readWorkbook: readWorkbook,
    parseRunningOrder: parseRunningOrder,
    seedProject: seedProject
  };

  global.MixProject = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
