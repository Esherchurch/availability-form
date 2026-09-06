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
      (plan.tracks || []).forEach(function (pt) {
        var buf = buffers.get ? buffers.get(pt.id) : buffers[pt.id];
        if (!buf) return;
        addClip({
          kind: 'track', title: pt.title,
          fromSec: pt.startSec,
          toSec: pt.startSec + pt.outSec,
          buffer: buf,
          offsetSec: pt.sourceFromSec || 0,
          rate0: pt.r0 || 1, rate1: pt.r1 || pt.r0 || 1,
          gain: 1
        });
      });
      (extra || []).forEach(addClip);
      return S.dur;
    }

    /* ---- the transport, from Videoeditor.html ---------------------- */

    function shouldSound(c) { return S.t >= c.fromSec - 0.001 && S.t < c.toSec; }

    function startClip(c) {
      var node = ctx.createBufferSource();
      node.buffer = c.buffer;
      var g = ctx.createGain();
      g.gain.value = c.gain == null ? 1 : c.gain;
      node.connect(g); g.connect(ctx.destination);

      var into = Math.max(0, S.t - c.fromSec);          // how far into the clip
      var left = Math.max(0, c.toSec - S.t);

      /* The rate ramp has to start from where the playhead already is, not
         from the top of the clip, or seeking into the middle of a track would
         play the wrong part of its ramp. */
      var frac = (c.toSec - c.fromSec) > 0 ? into / (c.toSec - c.fromSec) : 0;
      var rateNow = c.rate0 + (c.rate1 - c.rate0) * frac;
      node.playbackRate.value = rateNow;
      if (Math.abs(c.rate1 - rateNow) > 0.0005) {
        node.playbackRate.linearRampToValueAtTime(c.rate1, ctx.currentTime + left);
      }

      node.start(0, (c.offsetSec || 0) + into * rateNow, left * 1.05);
      S.live.push({ clip: c, node: node, gain: g });
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
      play: play, pause: pause, seek: seek, stop: stop,
      at: function () { return S.t; },
      duration: function () { return S.dur; },
      isPlaying: function () { return S.playing; },
      clips: function () { return S.clips.slice(); },
      state: S
    };
  }

  global.MixPreview = { create: createPreview };

})(typeof window !== 'undefined' ? window : this);
