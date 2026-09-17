/* ===================================================================
   Mix Builder — live preview transport
   ===================================================================

   Play the mix without rendering it.

   The mix already exists as scheduled audio: the plan says where every track
   starts, which part of it plays, and what tempo it needs, and the drums
   between two records are a few hundred milliseconds of synthesis. Nothing has
   to be bounced to hear that — it only has to be started at the right moment.

   The transport is the one from Videoeditor.html, unchanged in shape: a
   playhead advanced by requestAnimationFrame, a tick that starts whatever
   should be sounding and stops whatever should not, and a seek that restarts
   from the new position if it was playing. That editor drives HTML <audio>
   elements because it works from files; here everything is already a decoded
   AudioBuffer, so a clip is an AudioBufferSourceNode started at an offset.

   TEMPO. A track that needs stretching is played at a different rate, which
   moves its pitch — the same thing a pitch fader on a deck does, and the same
   few percent. The full render uses WSOLA instead, which holds the pitch and
   cannot run live. So a preview is a preview: it tells you where everything
   lands, whether the drums carry, whether a sample sits right. Bounce it when
   you want to hear the pitch as it will be.
   =================================================================== */

(function (global) {
  'use strict';

  function createPreview(opts) {
    var ctx = opts.ctx;
    var DSP = opts.DSP;
    /* Where the sound goes. Everything the tool plays ends at one node so the
       meter has something to measure; without that the analyser sees nothing
       and reads silence while the mix is plainly playing. */
    var out = opts.destination || ctx.destination;

    var S = {
      t: 0,                 // the playhead, in mix seconds
      dur: 0,
      playing: false,
      raf: null,
      lastFrame: 0,
      clips: [],            // { fromSec, toSec, buffer, offsetSec, rate0, rate1, gain }
      live: [],             // { clip, node, gain }
      onTick: opts.onTick || function () {}
    };

    /* ---- building the clip list from the plan ---------------------- */

    function addClip(c) {
      S.clips.push(c);
      if (c.toSec > S.dur) S.dur = c.toSec;
    }

    /* Every track, at the position the plan gives it, playing the part of
       itself the plan says, at the rate the plan needs. */
    function build(plan, buffers, extra) {
      S.clips = [];
      S.dur = 0;
      (plan.tracks || []).forEach(function (pt, ti) {
        var buf = buffers.get ? buffers.get(pt.id) : buffers[pt.id];
        if (!buf) return;
        addClip({
          kind: 'track', title: pt.title, index: ti,
          fromSec: pt.startSec,
          toSec: pt.startSec + pt.outSec,
          buffer: buf,
          offsetSec: pt.sourceFromSec || 0,
          rate0: pt.r0 || 1, rate1: pt.r1 || pt.r0 || 1,
          /* the render's own curve: matched at the joins, the record's own
             speed in between. Without it the timeline played a straight ramp
             across a clip whose length had been worked out for the curve. */
          segs: pt.segs || null,
          subDb: pt.subDb || 0,
          fadeInSec: pt.fadeInSec || 0,
          fadeOutSec: pt.fadeOutSec || 0,
          /* The track's own level, from normalising. */
          gain: Math.pow(10, (pt.gainDb || 0) / 20)
        });
      });
      (extra || []).forEach(addClip);
      return S.dur;
    }

    /* ---- the transport, from Videoeditor.html ---------------------- */

    /* A clip's playback speed over its own output time, as segments of
       {sec, a, b} — a hold where a === b, a glide where not. Clips with no
       curve (samples, drums) are one segment from rate0 to rate1. */
    function segsOfClip(c) {
      if (c.segs && c.segs.length) return c.segs;
      return [{ sec: Math.max(1e-6, c.toSec - c.fromSec), a: c.rate0 || 1, b: c.rate1 || c.rate0 || 1 }];
    }
    function rateAt(segs, t) {
      var at = 0;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (t <= at + s.sec || i === segs.length - 1) {
          var u = s.sec > 0 ? Math.max(0, Math.min(1, (t - at) / s.sec)) : 1;
          return s.a + (s.b - s.a) * u;
        }
        at += s.sec;
      }
      return segs[segs.length - 1].b;
    }
    /* Source seconds consumed by the first t seconds of the clip: the
       integral of the speed, never speed times time. Multiplying was close
       enough on a gentle straight ramp and most of a beat out on the curve,
       which after a click on the timeline is a record playing out of step
       with the one it is meant to be blended with. */
    function consumedBy(segs, t) {
      var at = 0, acc = 0;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (t >= at + s.sec) { acc += (s.a + s.b) / 2 * s.sec; at += s.sec; continue; }
        var u = Math.max(0, t - at), slope = s.sec > 0 ? (s.b - s.a) / s.sec : 0;
        return acc + s.a * u + slope * u * u / 2;
      }
      return acc;
    }

    function shouldSound(c) { return S.t >= c.fromSec - 0.001 && S.t < c.toSec; }

    function startClip(c) {
      var node = ctx.createBufferSource();
      node.buffer = c.buffer;
      var g = ctx.createGain();
      g.gain.value = c.gain == null ? 1 : c.gain;
      node.connect(g); g.connect(out);

      var into = Math.max(0, S.t - c.fromSec);          // how far into the clip
      var left = Math.max(0, c.toSec - S.t);

      /* The rate ramp has to start from where the playhead already is, not
         from the top of the clip, or seeking into the middle of a track would
         play the wrong part of its ramp. */
      var segs = segsOfClip(c);
      var now = ctx.currentTime;
      var rateNow = rateAt(segs, into);
      node.playbackRate.setValueAtTime(rateNow, now);
      /* every hold and glide still ahead, scheduled from where we are */
      var segAt = 0;
      for (var si = 0; si < segs.length; si++) {
        var sg = segs[si], sStart = segAt, sEnd = segAt + sg.sec;
        segAt = sEnd;
        if (sEnd <= into) continue;
        var from = Math.max(sStart, into);
        if (from > into) node.playbackRate.setValueAtTime(rateAt(segs, from), now + (from - into));
        if (Math.abs(sg.b - sg.a) > 1e-9) {
          node.playbackRate.linearRampToValueAtTime(sg.b, now + (sEnd - into));
        }
      }

      /* The record's sub-bass: the same filter the render writes. On every
         record, sitting at 0 dB when untouched — a low shelf at 0 dB is exactly
         unity — so the slider can be heard as it moves rather than only after
         the next rebuild. */
      var shelf = null;
      if (c.kind === 'track') {
        shelf = ctx.createBiquadFilter();
        shelf.type = 'lowshelf';
        shelf.frequency.value = (global.MixDSP && global.MixDSP.SUB_SHELF_HZ) || 70;
        shelf.gain.value = c.subDb || 0;
        node.disconnect();
        node.connect(shelf); shelf.connect(g);
      }

      /* The fades the render writes, so the timeline sounds like the file.

         The transport started and stopped clips at a fixed level and nothing
         else, so a crossfade in the preview was simply two records playing at
         once — no fade in, no fade out, which is exactly what it sounded like.
         The render has always done this; the transport never did.

         Equal power, because two uncorrelated records summed at half amplitude
         each are 3 dB down in the middle of a linear fade, which is the dip
         you hear as a hole in the middle of a crossfade. */
      var g0 = c.gain == null ? 1 : c.gain;
      var EP = 64;
      function epCurve(rising) {
        var arr = new Float32Array(EP);
        for (var q = 0; q < EP; q++) {
          var x = q / (EP - 1);
          arr[q] = g0 * Math.cos((rising ? (1 - x) : x) * Math.PI / 2);
        }
        return arr;
      }

      if (c.fadeInSec > 0.05) {
        /* only while the clip is still inside its fade — seeking past it must
           not replay the fade from wherever the cursor landed */
        var intoClip = S.t - c.fromSec;
        if (intoClip < c.fadeInSec) {
          var leftIn = c.fadeInSec - Math.max(0, intoClip);
          g.gain.setValueAtTime(g0 * Math.cos((1 - Math.max(0, intoClip) / c.fadeInSec) * Math.PI / 2),
                                ctx.currentTime);
          g.gain.setValueCurveAtTime(epCurve(true), ctx.currentTime, Math.max(0.02, leftIn));
        }
      }

      if (c.fadeOutSec > 0.05) {
        var startFade = (c.toSec - c.fadeOutSec) - S.t;
        if (startFade > 0) {
          g.gain.setValueCurveAtTime(epCurve(false), ctx.currentTime + startFade,
                                     Math.max(0.02, c.fadeOutSec));
        } else {
          /* already inside it: pick the fade up where it has got to */
          var done = Math.min(1, (S.t - (c.toSec - c.fadeOutSec)) / c.fadeOutSec);
          var leftOut = Math.max(0.02, c.toSec - S.t);
          g.gain.setValueAtTime(g0 * Math.cos(done * Math.PI / 2), ctx.currentTime);
          g.gain.linearRampToValueAtTime(0, ctx.currentTime + leftOut);
        }
      }
      var srcFrom = consumedBy(segs, into);
      var srcLeft = consumedBy(segs, into + left) - srcFrom;
      node.start(0, (c.offsetSec || 0) + srcFrom, srcLeft * 1.02 + 0.05);
      S.live.push({ clip: c, node: node, gain: g, shelf: shelf });
    }

    function stopClip(rec) {
      try { rec.node.stop(); } catch (e) {}
      try { rec.node.disconnect(); rec.gain.disconnect(); } catch (e) {}
    }

    /* Start anything that should be sounding and is not; stop anything that
       should not be. Called every frame, exactly as the editor does it. */
    function tick() {
      var i;
      for (i = S.live.length - 1; i >= 0; i--) {
        if (!shouldSound(S.live[i].clip)) { stopClip(S.live[i]); S.live.splice(i, 1); }
      }
      for (i = 0; i < S.clips.length; i++) {
        var c = S.clips[i];
        if (!shouldSound(c)) continue;
        var on = false;
        for (var k = 0; k < S.live.length; k++) if (S.live[k].clip === c) { on = true; break; }
        if (!on) startClip(c);
      }
    }

    /* Change a clip's level without rebuilding anything.

       A volume control is only worth having if you can hear it move. The clip
       list is rebuilt from the plan, which means synthesising drums — far too
       slow to sit under a slider — so this reaches the stored gain and the
       gain node of anything currently sounding, and nothing else. */
    /* A record's sub-bass, changed while it plays. */
    function setSub(index, db) {
      S.clips.forEach(function (c) { if (c.kind === 'track' && c.index === index) c.subDb = db; });
      S.live.forEach(function (rec) {
        if (rec.clip.kind === 'track' && rec.clip.index === index && rec.shelf) {
          rec.shelf.gain.setValueAtTime(db, ctx.currentTime);
        }
      });
    }

    function setGain(kind, index, gain) {
      var hit = 0;
      S.clips.forEach(function (c) {
        if (c.kind !== kind || c.index !== index) return;
        c.gain = gain; hit++;
      });
      S.live.forEach(function (rec) {
        if (rec.clip.kind === kind && rec.clip.index === index) {
          try { rec.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.01); } catch (e) {}
        }
      });
      return hit;
    }

    function stopAll() {
      S.live.forEach(stopClip);
      S.live = [];
    }

    function loop(ts) {
      if (!S.playing) return;
      var dt = Math.min((ts - S.lastFrame) / 1000, 0.1);
      S.lastFrame = ts;
      S.t = Math.min(S.t + dt, S.dur);
      tick();
      S.onTick(S.t, S.dur);
      if (S.t >= S.dur) { pause(); S.t = S.dur; S.onTick(S.t, S.dur); return; }
      S.raf = requestAnimationFrame(loop);
    }

    function play() {
      if (S.playing) return;
      if (S.t >= S.dur) S.t = 0;
      S.playing = true;
      S.lastFrame = performance.now();
      tick();
      S.raf = requestAnimationFrame(loop);
    }

    function pause() {
      if (!S.playing) return;
      S.playing = false;
      if (S.raf) { cancelAnimationFrame(S.raf); S.raf = null; }
      stopAll();
      S.onTick(S.t, S.dur);
    }

    function seek(t) {
      S.t = Math.max(0, Math.min(S.dur, t || 0));
      if (S.playing) { stopAll(); tick(); }
      S.onTick(S.t, S.dur);
    }

    function stop() { pause(); seek(0); }

    return {
      build: build,
      play: play, pause: pause, seek: seek, stop: stop, setGain: setGain, setSub: setSub,
      /* for the tests: where in its source a track clip is, and how fast, at a
         point in its own output — the numbers a seek actually starts from */
      __trackAt: function (index, outSec) {
        var c = S.clips.filter(function (x) { return x.kind === 'track' && x.index === index; })[0];
        if (!c) return null;
        var sg = segsOfClip(c);
        return { source: (c.offsetSec || 0) + consumedBy(sg, outSec), rate: rateAt(sg, outSec), sub: c.subDb || 0 };
      },
      at: function () { return S.t; },
      duration: function () { return S.dur; },
      isPlaying: function () { return S.playing; },
      clips: function () { return S.clips.slice(); },
      state: S
    };
  }

  global.MixPreview = { create: createPreview };

})(typeof window !== 'undefined' ? window : this);
