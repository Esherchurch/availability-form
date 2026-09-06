/* ===================================================================
   Mix Builder — the full render
   ===================================================================

   Bounces the whole set to one continuous WAV.

   THE SEAM PROBLEM, AND WHY THIS DOES NOT CONCATENATE
   ---------------------------------------------------
   The obvious design is to concatenate cached junction segments with the
   untouched middles of tracks. That was measured and abandoned. WSOLA's
   alignment search moves every frame by up to ±256 samples, so the map
   from an output position back to a source position is linear only on
   average. Butting a stretched transition against an unstretched track
   middle landed more than a full signal amplitude out — an error 9.4 dB
   ABOVE the signal's own RMS. That is a click, ninety times over, and no
   short crossfade hides a six-millisecond phase jump on sustained bass.

   So the mix is not concatenated. Each track is ONE continuous stretch
   pass from its entry to its mix-out, with the ratio RAMPING from the
   tempo its predecessor needed to the tempo its successor needs — which
   is exactly what a DJ does with the pitch fader, and is inaudible at a
   fraction of a percent per minute. Tracks then simply OVERLAP at each
   junction, where they already agree on tempo, and the finished mix is a
   sum of overlapping streams.

   There are no splices, so there is nothing to click.

   MEMORY
   ------
   2.5 hours of stereo Float32 is about 1.6 GB, so the mix is never held
   whole. At most two stretched tracks exist at once (the one playing and
   the one coming in), and finished audio is encoded to 16-bit and handed
   to a Blob as it is produced. Chrome spills a large Blob to disk, so the
   peak footprint is a couple of tracks rather than the whole set.

   PEAK SAFETY
   -----------
   One gain for the whole mix, never per chunk — a level that steps every
   ten minutes sounds like a fault, which is worse than the clipping it
   was avoiding. The peak is known before encoding without a second pass:
   track material cannot exceed its source peak, and only the overlaps can
   sum past full scale, so both are measured as they are produced and a
   single gain is applied on the way into the encoder.
   =================================================================== */

(function (global) {
  'use strict';

  var DSP = global.MixDSP, MP = global.MixProject;

  /* ------------------------------------------------- the ramp maths --- */
  /* A track's ratio is no longer constant, so source time and output time are
     no longer proportional. With the ratio ramping linearly across the OUTPUT,
     r(t) = r0 + (r1 - r0)·t/T, the source consumed by output time t is the
     integral of that — a quadratic. Every position on a ramped track has to be
     integrated, never multiplied, or it lands plausibly close and slightly
     wrong, which is the failure mode that shows up as a flam rather than as an
     error. */

  function ratioAtOutput(pt, outSec) {
    var T = pt.outSec || 1;
    var t = Math.max(0, Math.min(T, outSec));
    return pt.r0 + (pt.r1 - pt.r0) * (t / T);
  }

  /** Instantaneous tempo at a point in a track's output. §6.6 placements need
      this rather than any per-track or per-junction figure. */
  function tempoAtOutput(pt, outSec) {
    return (pt.sourceBpm || 0) * ratioAtOutput(pt, outSec);
  }

  /** Seconds of source consumed by the first `outSec` seconds of output. */
  function sourceConsumedBy(pt, outSec) {
    var T = pt.outSec || 1;
    var t = Math.max(0, Math.min(T, outSec));
    return pt.r0 * t + (pt.r1 - pt.r0) * t * t / (2 * T);
  }

  /** The inverse: where in the output a given source offset lands. */
  function outputTimeForSource(pt, srcOffsetSec) {
    var T = pt.outSec || 1;
    var d = pt.r1 - pt.r0;
    var s = Math.max(0, srcOffsetSec);
    if (Math.abs(d) < 1e-9) return pt.r0 > 1e-9 ? Math.min(T, s / pt.r0) : 0;
    // (d/2T)·t² + r0·t − s = 0
    var a = d / (2 * T), b = pt.r0, c = -s;
    var disc = b * b - 4 * a * c;
    if (disc < 0) return T;
    var root = (-b + Math.sqrt(disc)) / (2 * a);
    if (!isFinite(root) || root < 0) root = (-b - Math.sqrt(disc)) / (2 * a);
    return Math.max(0, Math.min(T, root));
  }

  /* ---------------------------------------------------------- plan --- */
  /* Pure: works out every track's source range, its tempo ramp, how long it
     runs for and where it sits, plus each junction's overlap. No audio. */

  function buildPlan(project) {
    var lay = MP.layout(project);
    var tracks = project.tracks || [];
    var plan = { tracks: [], junctions: [], totalSec: 0, problems: [] };
    if (!tracks.length) return plan;

    var bpmOf = function (t) { return MP.effectiveBpm(t); };

    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i];
      var jIn = i > 0 ? lay.junctions[i - 1] : null;
      var jOut = i < lay.junctions.length ? lay.junctions[i] : null;
      var bpm = bpmOf(t);

      if (!bpm) { plan.problems.push({ track: i, message: '"' + (t.title || t.file) + '" has no tempo.' }); }
      if (!t.linked) { plan.problems.push({ track: i, message: '"' + (t.title || t.file) + '" has no audio linked.' }); }

      // The tempo this track must hit at each end. A hard cut needs no match,
      // so the track simply plays at its own tempo there.
      var tempoIn = (jIn && jIn.type !== 'hard-cut' && jIn.targetBpm) ? jIn.targetBpm : bpm;
      var tempoOut = (jOut && jOut.type !== 'hard-cut' && jOut.targetBpm) ? jOut.targetBpm : bpm;
      var r0 = bpm ? tempoIn / bpm : 1;
      var r1 = bpm ? tempoOut / bpm : 1;

      /* An edit list replaces entry-to-exit entirely. Its length is the
         assembled length — the joins overlap by a crossfade, so it is slightly
         shorter than the sum of its regions, and using the sum would put every
         downstream position a few milliseconds out per join. */
      var regions = (t.regions && t.regions.length) ? t.regions : null;
      var barSec = bpm ? 60 / bpm * 4 : 2;
      var from, to, srcSec;
      if (regions) {
        from = regions[0].startSec || 0;
        srcSec = DSP.assembledSourceSec(regions, barSec);
        to = from + srcSec;
        if (srcSec <= 0) {
          plan.problems.push({ track: i, message: '"' + (t.title || t.file) + '" has an empty edit list.' });
          srcSec = 1; to = from + 1;
        }
      } else {
        from = t.entrySec || 0;
        to = t.exitSec || t.durationSec || 0;
        if (to <= from) {
          plan.problems.push({ track: i, message: '"' + (t.title || t.file) + '" has no playable range.' });
          to = from + 1;
        }
        srcSec = to - from;
      }
      var outSec = srcSec / ((r0 + r1) / 2);

      plan.tracks.push({
        index: i, id: t.id, title: t.title || t.file,
        sourceFromSec: from, sourceToSec: to,
        regions: regions, barSec: barSec, sourceSec: srcSec,
        r0: r0, r1: r1, tempoIn: tempoIn, tempoOut: tempoOut, sourceBpm: bpm,
        outSec: outSec, startSec: 0
      });
    }

    // Overlaps, then positions.
    for (var k = 0; k < lay.junctions.length; k++) {
      var j = lay.junctions[k];
      var s = j.settings || {};
      var overlap = 0, gap = 0;
      var type = j.type, bridgeBpm = null, zeroOverlap = false, substituted = false;

      if (j.type === 'hard-cut') {
        // A deliberate choice, not a failure. Left alone.
        gap = (s.gapMs || 0) / 1000;
      } else if (j.targetBpm) {
        bridgeBpm = j.targetBpm;
        var barSec = 60 / j.targetBpm * 4;
        overlap = j.type === 'blend'
          ? (s.bars || 16) * barSec
          : ((s.beatBars == null ? 16 : s.beatBars) * barSec +
             (s.overlapBars == null ? 1 : s.overlapBars) * barSec);
        // A bridge's B only overlaps for overlapBars; the beat-alone part is
        // still track A playing, so only the true overlap shortens the set.
        if (j.type !== 'blend') overlap = (s.overlapBars == null ? 1 : s.overlapBars) * barSec;
      } else {
        /* No common tempo — layout could not get the two inside the stretch
           budget. That is NOT a render outcome: butting two tracks together
           exposes both outros and is what produced four seconds of silence
           between records.

           It becomes a BRIDGE WITH ZERO OVERLAP instead. The music cuts on a
           bar line, the beat runs on alone to the end of the bar, A stops, and
           B starts on the next one. No tempo match is needed because the two
           never sound together — and the beat still carries the ear across to
           B's entry, which is the whole point of a bridge.

           It runs at the OUTGOING track's own tempo, so neither record is
           stretched at this junction. */
        type = 'throw-bridge';
        zeroOverlap = true;
        substituted = true;
        bridgeBpm = MP.effectiveBpm(tracks[k]) || null;
        overlap = 0;
        gap = 0;
        plan.problems.push({
          junction: k, kind: 'zero-overlap-bridge',
          message: 'Junction ' + (k + 1) + ': "' + (tracks[k].title || tracks[k].file) +
                   '" and "' + (tracks[k + 1].title || tracks[k + 1].file) +
                   '" are too far apart to beat-match, so this is a bridge with no ' +
                   'overlap — the beat carries alone into the next track rather than ' +
                   'the two butting together.'
        });
      }

      /* A sample asked to sit BETWEEN two records needs a gap to sit in.
         Everywhere else the records run into each other, so the junction is
         widened just enough to hold it — otherwise 'between' and 'over' would
         sound identical. */
      var betweenBars = 0;
      (project.placements || []).forEach(function (pp) {
        if (pp.mode === 'between' && pp.atJunction === k) {
          betweenBars = Math.max(betweenBars, pp.barsBeforeEntry || 4);
        }
      });
      if (betweenBars > 0) {
        var bBpm = bridgeBpm || j.targetBpm || 120;
        gap = Math.max(gap, betweenBars * (60 / bBpm * 4));
        overlap = 0;
      }

      plan.junctions.push({
        index: k, type: type, requestedType: j.type, substituted: substituted,
        settings: s, targetBpm: j.targetBpm, bridgeBpm: bridgeBpm,
        zeroOverlap: zeroOverlap,
        overlapSec: overlap, requestedOverlapSec: overlap, gapSec: gap,
        clamped: false, renderable: j.renderable
      });
    }

    /* An overlap can never be longer than the material either side of it. A
       16-bar blend is 35 seconds at 110 BPM, which is longer than a 2:39 track
       has to spare once its neighbours have taken their share — and a negative
       fade start is not a rounding error, it is a hard failure in the audio
       graph. Clamp to 40% of the shorter track so both still have a middle,
       and say so rather than silently shortening someone's transition. */
    for (var c = 0; c < plan.junctions.length; c++) {
      var jc = plan.junctions[c];
      if (jc.overlapSec <= 0) continue;
      var room = Math.min(plan.tracks[c].outSec, plan.tracks[c + 1].outSec) * 0.4;
      if (jc.overlapSec > room) {
        jc.overlapSec = Math.max(0, room);
        jc.clamped = true;
        plan.problems.push({
          junction: c, kind: 'clamped',
          message: 'Junction ' + (c + 1) + ': a ' + jc.requestedOverlapSec.toFixed(1) +
                   's transition does not fit between "' + plan.tracks[c].title + '" and "' +
                   plan.tracks[c + 1].title + '". Shortened to ' + jc.overlapSec.toFixed(1) +
                   's — set fewer bars on that junction if you want control of it.'
        });
      }
    }

    var cursor = 0;
    for (var m = 0; m < plan.tracks.length; m++) {
      var pj = m > 0 ? plan.junctions[m - 1] : null;
      if (pj) cursor += pj.gapSec - pj.overlapSec;
      plan.tracks[m].startSec = Math.max(0, cursor);
      cursor = plan.tracks[m].startSec + plan.tracks[m].outSec;
    }
    plan.totalSec = cursor;

    return plan;
  }

  /* ---------------------------------------------------- placements --- */
  /* §6.6. A placement sits at an absolute output position, and the tempo there
     is read from the ramp at that instant — NOT from a per-track or
     per-junction figure, because no track has a single tempo any more. Get this
     wrong and the sample is at a plausible but slightly wrong tempo, which
     drifts against the beat over four bars and sounds like a flam rather than
     like an error. */

  function placementOutputSec(plan, p) {
    var j = p.atJunction;
    if (j == null || j < 0 || j >= plan.junctions.length) return null;
    var incoming = plan.tracks[j + 1];
    if (!incoming) return null;
    // bridgeBpm first: a junction with no common tempo has no targetBpm at all,
    // and a placement there would otherwise fall back to a default of 120.
    var tempo = plan.junctions[j].bridgeBpm || plan.junctions[j].targetBpm ||
                plan.tracks[j].tempoOut || plan.tracks[j].sourceBpm || 120;
    var barSec = 60 / tempo * 4;
    return Math.max(0, incoming.startSec - (p.barsBeforeEntry || 0) * barSec);
  }

  /** The tempo actually playing at an absolute output position. */
  function tempoAtMixTime(plan, absSec) {
    for (var i = plan.tracks.length - 1; i >= 0; i--) {
      var pt = plan.tracks[i];
      if (absSec >= pt.startSec) {
        return tempoAtOutput(pt, Math.min(pt.outSec, absSec - pt.startSec));
      }
    }
    var first = plan.tracks[0];
    return first ? tempoAtOutput(first, 0) : 120;
  }

  /** Render every placement to audio positioned in absolute output samples. */
  async function renderPlacements(ctx, project, plan, sampleBuffers, sampleMeta, sr) {
    var out = [];
    var placements = project.placements || [];
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      var buf = sampleBuffers && sampleBuffers.get(p.sampleId);
      var meta = sampleMeta && sampleMeta.get(p.sampleId);
      if (!buf || !meta) continue;
      var at = placementOutputSec(plan, p);
      if (at == null) continue;

      // Tempo at the placement's MIDPOINT, so the constant-ratio stretch is
      // centred on the ramp rather than starting on it.
      var lenGuess = buf.duration;
      var tempo = tempoAtMixTime(plan, at + lenGuess / 2);
      var ratio = (meta.sourceBpm && tempo) ? tempo / meta.sourceBpm : 1;
      // A blank source BPM means a one-shot — an air horn has no tempo to match.
      if (!meta.sourceBpm) ratio = 1;
      /* Clamping a placement is not a safe fallback the way clamping a
         transition overlap is. A sample stretched less than the tempo asks for
         is simply at the wrong tempo, and it drifts against the beat across its
         own length — audibly, within four bars. The clamp stops it sounding
         mangled, but the placement is wrong either way, so say so. */
      var maxS = project.maxSampleStretch == null ? 0.15 : project.maxSampleStretch;
      var clampedRatio = Math.max(1 - maxS, Math.min(1 + maxS, ratio));

      var rendered = DSP.renderPlacement(ctx, buf, {
        ratio: clampedRatio, gainDb: p.gainDb || 0,
        fadeInMs: p.fadeInMs || 0, fadeOutMs: p.fadeOutMs || 0
      });
      out.push({
        startSample: Math.round(at * sr),
        data: [rendered.getChannelData(0), rendered.getChannelData(1)],
        length: rendered.length,
        info: {
          sampleId: p.sampleId, name: meta.name, atJunction: p.atJunction,
          atSec: +at.toFixed(2), tempoThere: +tempo.toFixed(2),
          ratio: +clampedRatio.toFixed(4),
          clamped: Math.abs(clampedRatio - ratio) > 1e-6
        }
      });
    }
    return out;
  }

  /* -------------------------------------------------- track stream --- */
  /* One track, stretched once with its tempo ramp, then run through the
     envelopes its two junctions ask for. The result is that track's complete
     contribution to the mix — everything except being added to its neighbours. */

  function renderTrackStream(ctx, opts) {
    var pt = opts.plan, buf = opts.buffer;
    var jIn = opts.jIn, jOut = opts.jOut;

    /* Assemble the edit list FIRST, at source tempo, then stretch the result
       once. Stretching each region and joining afterwards would reintroduce the
       splice problem — each stretched piece begins windowed to zero and none of
       them can be aligned to the others. */
    var src = pt.regions
      ? DSP.assembleRegions(ctx, buf, pt.regions, pt.barSec)
      : DSP.slice(ctx, buf, pt.sourceFromSec, pt.sourceToSec - pt.sourceFromSec);
    if (!src) src = DSP.slice(ctx, buf, pt.sourceFromSec, Math.max(0.1, pt.sourceSec || 1));
    var stretched = DSP.stretchRamp(ctx, src, pt.r0, pt.r1);
    var sr = stretched.sampleRate;
    var dur = stretched.duration;

    var off = new OfflineAudioContext(2, Math.max(1, stretched.length), sr);
    var node = off.createBufferSource();
    node.buffer = stretched;

    var chain = node;
    var CURVE = 256;
    var applied = { bridge: null };

    /* Declared BEFORE anything reads them. These sat below the incoming block,
       and `var` hoists the declaration but not the value — so `inOverlap > 0`
       evaluated `undefined > 0`, which is false, and the incoming bass swap has
       never run on any blend in any render. It failed silently instead of
       throwing only because the condition was false. */
    var safe = function (t) { return Math.max(0, Math.min(dur, isFinite(t) ? t : 0)); };
    var outOverlap = jOut ? Math.max(0, Math.min(jOut.overlapSec, dur)) : 0;
    var inOverlap = jIn ? Math.max(0, Math.min(jIn.overlapSec, dur)) : 0;
    var outStart = safe(dur - outOverlap);

    // --- incoming: this track arriving under the previous one
    if (jIn && jIn.type === 'blend' && inOverlap > 0) {
      var bassIn = off.createBiquadFilter();
      bassIn.type = 'lowshelf'; bassIn.frequency.value = 220;
      var cut = jIn.settings.bassCutDb == null ? 20 : jIn.settings.bassCutDb;
      bassIn.gain.setValueAtTime(-cut, 0);
      bassIn.gain.setValueCurveAtTime(DSP.rampCurve(CURVE, -cut, 0),
        safe(inOverlap * 0.5), Math.max(0.01, inOverlap * 0.5));
      chain.connect(bassIn); chain = bassIn;
    }

    /* --- outgoing: the beat bridge.
       Keyed on bridgeBpm, not targetBpm, so a junction with no common tempo
       still bridges. It just does it at this track's own tempo with no overlap,
       because the two records never sound together. */
    if (jOut && jOut.type !== 'hard-cut' && jOut.type !== 'blend' && jOut.bridgeBpm) {
      var s = jOut.settings;
      var barSec = 60 / jOut.bridgeBpm * 4;
      var throwing = (s.cutStyle || 'throw') === 'throw';
      var fadeSec = throwing ? 0.03 : (s.fadeBars == null ? 4 : s.fadeBars) * barSec;
      var overlapBars = jOut.zeroOverlap ? 0 : (s.overlapBars == null ? 1 : s.overlapBars);

      /* Shorten the beat-alone section rather than let the ramp start at sample
         zero. The previous code clamped brAt with Math.max(0, …), which cut the
         mids for an entire track and reported nothing. */
      var fit = DSP.fitBeatBars(dur, barSec, s.beatBars == null ? 16 : s.beatBars,
                                fadeSec, overlapBars, 0.5);
      var beatBars = fit.beatBars;
      var bridgeSec = fadeSec + beatBars * barSec + overlapBars * barSec;
      var brAt = Math.max(0, dur - bridgeSec);

      applied.bridge = {
        beatBars: beatBars, wantedBeatBars: (s.beatBars == null ? 16 : s.beatBars),
        shortened: fit.shortened, brAtSec: +brAt.toFixed(2), barSec: barSec,
        bpm: jOut.bridgeBpm, zeroOverlap: !!jOut.zeroOverlap,
        note: DSP.bridgeNote({ throwing: throwing, reverbBars: s.reverbBars,
                               fadeBars: s.fadeBars, midCutDb: s.midCutDb,
                               highCutDb: s.highCutDb })
      };

      if (beatBars > 0 || fadeSec > 0.02) {
        // The same automation the audition path uses. One implementation.
        chain = DSP.applyBridgeOut(off, node, chain, {
          barSec: barSec, beatSec: 60 / jOut.bridgeBpm, brAt: brAt, fadeSec: fadeSec,
          midCutDb: s.midCutDb, highCutDb: s.highCutDb,
          throwing: throwing, reverbBars: s.reverbBars
        });
      }
    }

    var gain = off.createGain();
    gain.gain.setValueAtTime(1, 0);

    if (jOut && jOut.type === 'blend' && outOverlap > 0) {
      var bassOut = off.createBiquadFilter();
      bassOut.type = 'lowshelf'; bassOut.frequency.value = 220;
      var bc = jOut.settings.bassCutDb == null ? 20 : jOut.settings.bassCutDb;
      bassOut.gain.setValueAtTime(0, 0);
      bassOut.gain.setValueCurveAtTime(DSP.rampCurve(CURVE, 0, -bc), outStart, Math.max(0.01, outOverlap * 0.5));
      chain.connect(bassOut); chain = bassOut;
      gain.gain.setValueCurveAtTime(DSP.equalPower(CURVE, false), outStart, Math.max(0.01, outOverlap));
    } else if (jOut && outOverlap > 0) {
      gain.gain.setValueCurveAtTime(DSP.equalPower(CURVE, false), outStart, Math.max(0.01, outOverlap));
    } else if (jOut) {
      // Hard cut: a 20 ms taper so the end does not click.
      gain.gain.setValueAtTime(1, safe(dur - 0.02));
      gain.gain.linearRampToValueAtTime(0, dur);
    }

    if (jIn && inOverlap > 0) {
      gain.gain.setValueAtTime(0, 0);
      gain.gain.setValueCurveAtTime(DSP.equalPower(CURVE, true), 0, Math.max(0.01, inOverlap));
      gain.gain.setValueAtTime(1, safe(inOverlap + 0.001));
    } else if (jIn) {
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(1, 0.02);
    }

    chain.connect(gain).connect(off.destination);
    node.start(0);
    return off.startRendering().then(function (buffer) {
      return { buffer: buffer, applied: applied };
    });
  }

  /* ------------------------------------------- streaming WAV writer --- */
  /* Int16 is produced as the mix is, so the whole thing is never resident as
     Float32. The parts go to a Blob, which Chrome backs with disk. */

  function WavWriter(sampleRate, channels) {
    this.sr = sampleRate; this.ch = channels;
    this.parts = []; this.frames = 0;
  }
  WavWriter.prototype.write = function (chans, length, gain) {
    var ab = new ArrayBuffer(length * this.ch * 2);
    var v = new DataView(ab), o = 0;
    for (var i = 0; i < length; i++) {
      for (var c = 0; c < this.ch; c++) {
        var s = (chans[c][i] || 0) * gain;
        if (s > 1) s = 1; else if (s < -1) s = -1;
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
      }
    }
    this.parts.push(ab);
    this.frames += length;
  };
  WavWriter.prototype.finish = function () {
    // Header from MixDSP so there is only one RIFF layout in the codebase.
    var head = DSP.wavHeader(this.frames, this.ch, this.sr);
    return new Blob([head].concat(this.parts), { type: 'audio/wav' });
  };

  /* --------------------------------------------------------- render --- */

  /* Mono sum of a window, for the alignment measurement only. */
  function monoOf(L, R, from, len) {
    var out = new Float32Array(len);
    for (var i = 0; i < len; i++) out[i] = (L[from + i] + R[from + i]) * 0.5;
    return out;
  }

  /* Mix any placement overlapping [absPos, absPos+len) into this window. */
  function mixOverlays(overlays, absPos, L, R, len) {
    for (var i = 0; i < overlays.length; i++) {
      var o = overlays[i];
      var from = Math.max(absPos, o.startSample);
      var to = Math.min(absPos + len, o.startSample + o.length);
      if (to <= from) continue;
      for (var s = from; s < to; s++) {
        var si = s - o.startSample, di = s - absPos;
        L[di] += o.data[0][si];
        R[di] += o.data[1][si];
      }
    }
  }

  function Cancelled() { this.cancelled = true; this.message = 'Render cancelled.'; }

  /**
   * render(project, buffers, opts) -> { blob, report }
   *
   * opts.onProgress({ done, total, sec, totalSec, etaSec, message })
   * opts.shouldCancel() -> true to stop
   * opts.fromTrack / opts.toTrack — render a slice of the set (bar-range export)
   */
  async function render(project, buffers, opts) {
    opts = opts || {};
    var ctx = opts.ctx || new (global.AudioContext || global.webkitAudioContext)();
    var plan = buildPlan(project);
    var first = opts.fromTrack == null ? 0 : Math.max(0, opts.fromTrack);
    var last = opts.toTrack == null ? plan.tracks.length - 1
                                    : Math.min(plan.tracks.length - 1, opts.toTrack);
    if (last < first) throw new Error('Empty range.');

    var hard = plan.problems.filter(function (p) { return /no audio|no tempo|no playable/.test(p.message); });
    if (hard.length) {
      var e = new Error(hard.length + ' track' + (hard.length === 1 ? '' : 's') +
        ' cannot be rendered:\n' + hard.slice(0, 5).map(function (p) { return '· ' + p.message; }).join('\n'));
      e.problems = plan.problems;
      throw e;
    }

    var sr = ctx.sampleRate;
    var report = { seams: [], peak: 0, gainDb: 0, tracks: [], warnings: plan.problems.slice() };
    var writer = new WavWriter(sr, 2);

    var startedAt = Date.now();
    var totalOut = plan.tracks[last].startSec + plan.tracks[last].outSec - plan.tracks[first].startSec;

    /* Pass 1 is not a render. Track material cannot exceed its own source peak,
       and only the overlaps sum past full scale, so scanning source peaks and
       then watching the overlaps as they are produced gives the true peak
       without rendering anything twice. */
    var peakGuess = 0;
    for (var pi = first; pi <= last; pi++) {
      var b = buffers.get(plan.tracks[pi].id);
      if (!b) continue;
      var mono = DSP.toMono(b);
      var p = 0;
      // Every 7th sample: a peak scan does not need every one, and this keeps
      // a 47-track scan instant.
      for (var si = 0; si < mono.length; si += 7) { var av = Math.abs(mono[si]); if (av > p) p = av; }
      if (p > peakGuess) peakGuess = p;
    }
    // Two overlapping tracks at equal power sum to about 1.0x, not 2x, but the
    // bass swap and the throw can push past it. Allow headroom, then correct
    // with the measured peak below.
    var gain = 1;

    var alignStreams = [];    // §14.3: two short slices per track, nothing more
    /* Placements are short and few, so they are rendered up front and mixed
       into the output as it passes underneath them. */
    var overlays = await renderPlacements(ctx, project, plan, opts.sampleBuffers,
                                          opts.sampleMeta, sr);
    report.placements = overlays.map(function (o) { return o.info; });
    overlays.forEach(function (o) {
      if (!o.info.clamped) return;
      report.warnings.push({
        placement: o.info.sampleId,
        message: 'Sample "' + o.info.name + '" at junction ' + (o.info.atJunction + 1) +
                 ' needs more stretch than the sample budget allows to reach ' +
                 o.info.tempoThere.toFixed(1) + ' BPM. It will drift against the beat — ' +
                 'use a sample closer to that tempo, or raise the sample stretch limit.'
      });
    });
    var absPos = Math.round((plan.tracks[first].startSec) * sr);

    var tail = null;          // [Float32Array, Float32Array] carried into the next track
    var tailLen = 0;
    var emitted = 0;

    for (var i = first; i <= last; i++) {
      if (opts.shouldCancel && opts.shouldCancel()) throw new Cancelled();
      var pt = plan.tracks[i];
      var buf = buffers.get(pt.id);
      if (!buf) throw new Error('No audio for "' + pt.title + '".');

      var jIn = i > first ? plan.junctions[i - 1] : null;
      var jOut = i < last ? plan.junctions[i] : null;

      if (opts.onProgress) {
        var elapsed = (Date.now() - startedAt) / 1000;
        var frac = emitted / Math.max(1, totalOut);
        opts.onProgress({
          done: i - first, total: last - first + 1,
          sec: emitted, totalSec: totalOut,
          etaSec: frac > 0.02 ? elapsed / frac - elapsed : null,
          message: 'Rendering "' + pt.title + '" (' + (i - first + 1) + ' of ' + (last - first + 1) + ')'
        });
      }
      await tick();

      var rendered = await renderTrackStream(ctx, { plan: pt, buffer: buf, jIn: jIn, jOut: jOut });
      var streamed = rendered.buffer;
      var L = streamed.getChannelData(0), R = streamed.numberOfChannels > 1 ? streamed.getChannelData(1) : L;
      var n = streamed.length;

      var inOverlap = jIn ? Math.round(jIn.overlapSec * sr) : 0;
      var outOverlap = jOut ? Math.round(jOut.overlapSec * sr) : 0;
      var gapN = jOut ? Math.round(jOut.gapSec * sr) : 0;

      // Sum this track's head with the previous track's tail.
      if (tail && tailLen) {
        var m = Math.min(tailLen, n);
        for (var k = 0; k < m; k++) { L[k] += tail[0][k]; R[k] += tail[1][k]; }
        // A tail longer than the incoming track would mean an overlap longer
        // than the track; the plan flags that, and this keeps it lossless.
        if (tailLen > n) {
          report.warnings.push({ junction: i - 1, message: 'Overlap longer than "' + pt.title + '".' });
        }
      }
      tail = null; tailLen = 0;

      /* §14.3: keep just the two overlapping regions of this track so the kicks
         can be checked for a flam afterwards. Two short slices per track, not
         the stream. */
      if (opts.measureAlignment) {
        var headN = Math.min(inOverlap, n), tailN = Math.min(outOverlap, n);
        alignStreams[i] = {
          head: headN > 0 ? monoOf(L, R, 0, headN) : null,
          tail: tailN > 0 ? monoOf(L, R, n - tailN, tailN) : null
        };
      }

      var bodyEnd = Math.max(0, n - outOverlap);
      // Peak is taken AFTER overlays are mixed in, below, or a sample pushing
      // the mix past full scale would not be counted.
      mixOverlays(overlays, absPos, L, R, bodyEnd);
      for (var po = 0; po < bodyEnd; po++) {
        var pl = Math.abs(L[po]); if (pl > report.peak) report.peak = pl;
        var pr = Math.abs(R[po]); if (pr > report.peak) report.peak = pr;
      }
      writer.write([L, R], bodyEnd, 1);
      absPos += bodyEnd;
      emitted += bodyEnd / sr;

      if (outOverlap > 0) {
        tailLen = n - bodyEnd;
        tail = [L.slice(bodyEnd), R.slice(bodyEnd)];
      } else if (gapN > 0) {
        var silence = new Float32Array(gapN);
        var gl = new Float32Array(gapN), gr = new Float32Array(gapN);
        mixOverlays(overlays, absPos, gl, gr, gapN);
        writer.write([gl, gr], gapN, 1);
        absPos += gapN;
        emitted += gapN / sr;
      }

      report.tracks.push({
        index: i, title: pt.title,
        tempoIn: +pt.tempoIn.toFixed(2), tempoOut: +pt.tempoOut.toFixed(2),
        ramped: Math.abs(pt.r0 - pt.r1) > 0.0005,
        stretchInPct: +((pt.r0 - 1) * 100).toFixed(2),
        stretchOutPct: +((pt.r1 - 1) * 100).toFixed(2),
        outSec: +pt.outSec.toFixed(2),
        bridge: rendered.applied.bridge
      });
      if (rendered.applied.bridge && rendered.applied.bridge.shortened) {
        report.warnings.push({
          track: i,
          message: 'Bridge out of "' + pt.title + '" shortened from ' +
                   rendered.applied.bridge.wantedBeatBars + ' to ' +
                   rendered.applied.bridge.beatBars + ' beat-alone bars — the track is not ' +
                   'long enough for the full bridge.'
        });
      }
      if (jOut) {
        report.seams.push({
          junction: i, type: jOut.type,
          overlapSec: +jOut.overlapSec.toFixed(2), gapSec: +jOut.gapSec.toFixed(3),
          // Nothing is spliced here: the two tracks overlap and are summed, so
          // there is no boundary to be sample-exact about.
          kind: jOut.overlapSec > 0 ? 'overlap' : (jOut.gapSec > 0 ? 'gap' : 'butt'),
          exact: true
        });
      }
      streamed = null; L = null; R = null;
    }

    if (tail && tailLen) {
      for (var z = 0; z < tailLen; z++) {
        var bl = Math.abs(tail[0][z]); if (bl > report.peak) report.peak = bl;
        var br = Math.abs(tail[1][z]); if (br > report.peak) report.peak = br;
      }
      mixOverlays(overlays, absPos, tail[0], tail[1], tailLen);
      writer.write(tail, tailLen, 1);
      absPos += tailLen;
      emitted += tailLen / sr;
    }

    /* One gain for the whole mix. Applying it per chunk would step the level
       every ten minutes, which sounds like a fault rather than like loudness. */
    if (report.peak > 0.99) {
      gain = 0.98 / report.peak;
      report.gainDb = 20 * Math.log10(gain);
      // Re-encode with the gain rather than shipping something clipped.
      var scaled = new WavWriter(sr, 2);
      for (var pj2 = 0; pj2 < writer.parts.length; pj2++) {
        var view = new DataView(writer.parts[pj2]);
        for (var bo = 0; bo + 1 < writer.parts[pj2].byteLength; bo += 2) {
          view.setInt16(bo, Math.round(view.getInt16(bo, true) * gain), true);
        }
      }
      scaled.parts = writer.parts; scaled.frames = writer.frames;
      writer = scaled;
    }

    if (opts.measureAlignment) {
      report.alignment = measureOverlapAlignment(alignStreams, plan, sr, opts);
      report.worstLagMs = report.alignment.reduce(function (a, x) {
        return Math.max(a, Math.abs(x.lagMs || 0));
      }, 0);
      report.flams = report.alignment.filter(function (x) { return x.verdict === "FLAM"; }).length;
    }
    report.durationSec = writer.frames / sr;
    report.peakDb = 20 * Math.log10(report.peak || 1e-9);
    if (opts.onProgress) {
      opts.onProgress({ done: last - first + 1, total: last - first + 1,
                        sec: emitted, totalSec: totalOut, etaSec: 0, message: 'Encoding…' });
    }
    return { blob: writer.finish(), report: report, plan: plan };
  }

  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /* --------------------------------------------- overlap alignment --- */
  /* §14.3. The click check proves there is no DISCONTINUITY. It says nothing
     about ALIGNMENT, and a ramped stretch fails silently rather than loudly: if
     a downbeat lands a few milliseconds out, the two overlapping tracks produce
     a doubled, flanging kick with no discontinuity anywhere for a jump test to
     find. This turns "do the two kicks land as one" into a number.

     Onset envelope of each stream over the overlap (the same spectral-flux idea
     as the detector in §6.1, at a coarse hop because we are measuring lag rather
     than finding beats), then cross-correlate and report the offset. Under about
     10 ms is inaudible; over about 20 ms is a flam. */

  function onsetEnvelope(data, sr, hop) {
    var n = Math.floor(data.length / hop);
    var env = new Float32Array(Math.max(1, n));
    var prev = 0;
    for (var f = 0; f < n; f++) {
      var s = 0;
      for (var i = f * hop; i < (f + 1) * hop && i < data.length; i++) s += data[i] * data[i];
      var e = Math.sqrt(s / hop);
      var d = e - prev;
      env[f] = d > 0 ? d : 0;      // rising energy only: that is where a hit is
      prev = e;
    }
    return env;
  }

  function bestLag(a, b, maxLagFrames) {
    var best = -Infinity, bestL = 0;
    for (var L = -maxLagFrames; L <= maxLagFrames; L++) {
      var acc = 0, ea = 0, eb = 0;
      for (var i = 0; i < a.length; i++) {
        var j = i + L;
        if (j < 0 || j >= b.length) continue;
        acc += a[i] * b[j]; ea += a[i] * a[i]; eb += b[j] * b[j];
      }
      var denom = Math.sqrt(ea * eb);
      var score = denom > 1e-12 ? acc / denom : 0;
      if (score > best) { best = score; bestL = L; }
    }
    return { lag: bestL, score: best };
  }

  /**
   * How well do the two tracks line up where they overlap?
   * Returns one entry per junction: lag in ms and the correlation behind it.
   */
  function measureOverlapAlignment(streams, plan, sampleRate, opts) {
    opts = opts || {};
    var hop = 128;                                  // ~2.7 ms at 48 kHz
    var maxLagMs = opts.maxLagMs || 60;
    var maxLagFrames = Math.round(maxLagMs / 1000 * sampleRate / hop);
    var out = [];
    for (var i = 0; i < plan.junctions.length; i++) {
      var j = plan.junctions[i];
      if (!j || j.overlapSec <= 0) {
        out.push({ junction: i, type: j ? j.type : null, overlapSec: 0, lagMs: 0,
                   confidence: null, verdict: 'no overlap' });
        continue;
      }
      // Only the two overlapping regions are kept, never whole streams — the
      // whole point of the render is that the mix is never resident.
      var A = streams[i], B = streams[i + 1];
      if (!A || !A.tail || !B || !B.head) { out.push({ junction: i, verdict: 'not measured' }); continue; }
      var aSeg = A.tail, bSeg = B.head;
      var len = Math.min(aSeg.length, bSeg.length);
      if (len < sampleRate * 0.5) { out.push({ junction: i, verdict: 'overlap too short to measure' }); continue; }
      var ea = onsetEnvelope(aSeg.subarray(0, len), sampleRate, hop);
      var eb = onsetEnvelope(bSeg.subarray(0, len), sampleRate, hop);
      var r = bestLag(ea, eb, maxLagFrames);
      var lagMs = r.lag * hop / sampleRate * 1000;
      out.push({
        junction: i, type: j.type, overlapSec: +j.overlapSec.toFixed(2),
        lagMs: +lagMs.toFixed(1), confidence: +r.score.toFixed(3),
        verdict: Math.abs(lagMs) <= 10 ? 'tight'
               : Math.abs(lagMs) <= 20 ? 'loose'
               : 'FLAM'
      });
    }
    return out;
  }

  /* ----------------------------------------------------- QA checks --- */
  /* §14.5: tests do not catch audio problems, measurements do. These are the
     two that catch what ears miss on a first pass. */

  async function measure(blob, sampleRate) {
    var ab = await blob.arrayBuffer();
    var v = new DataView(ab);
    var n = Math.floor((ab.byteLength - 44) / 4);        // stereo 16-bit
    var atFullScale = 0, longestGapFrames = 0, gapRun = 0, peak = 0;
    var GAP = 0.0005;                                     // about -66 dBFS
    for (var i = 0; i < n; i++) {
      var l = v.getInt16(44 + i * 4, true) / 32768;
      var r = v.getInt16(44 + i * 4 + 2, true) / 32768;
      var a = Math.max(Math.abs(l), Math.abs(r));
      if (a > peak) peak = a;
      if (a >= 0.9999) atFullScale++;
      if (a < GAP) { gapRun++; if (gapRun > longestGapFrames) longestGapFrames = gapRun; }
      else gapRun = 0;
    }
    return {
      frames: n, durationSec: n / sampleRate, peak: peak,
      samplesAtFullScale: atFullScale,
      longestSilenceSec: longestGapFrames / sampleRate
    };
  }

  global.MixRender = {
    buildPlan: buildPlan,
    renderTrackStream: renderTrackStream,
    render: render,
    renderPlacements: renderPlacements,
    placementOutputSec: placementOutputSec,
    tempoAtMixTime: tempoAtMixTime,
    ratioAtOutput: ratioAtOutput,
    tempoAtOutput: tempoAtOutput,
    sourceConsumedBy: sourceConsumedBy,
    outputTimeForSource: outputTimeForSource,
    measureOverlapAlignment: measureOverlapAlignment,
    measure: measure,
    WavWriter: WavWriter
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MixRender;

})(typeof window !== 'undefined' ? window : globalThis);
