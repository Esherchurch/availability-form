/* ===================================================================
   Mix Player — playing the finished mix on the night
   ===================================================================

   This exists because of a measurement rather than a wish. Martin's mix
   measures clean by every test that can be run on it: nothing clipping,
   nothing over full scale between the samples, dynamics and top end the
   same as the source records. It still sounded, on his headphones, "almost
   like it is mega compressed" — and both Realtek outputs on that laptop
   have Dolby DAX3 attached as an audio processing object, which is a
   multiband compressor and volume leveller sitting between any player and
   the speakers. The AudioBox USB 96 has no such thing on it.

   So the one job here is to hand the file to a chosen output with nothing
   done to it on the way:

     - a plain <audio> element, streaming off disk. Not Web Audio: routing
       through a graph to draw a level meter would put the mix through
       Chromium's mixer for the sake of a decoration, and two hours of
       stereo float is 2.6 GB in memory besides.
     - setSinkId, so the interface is chosen here rather than inherited
       from whatever Windows last defaulted to.
     - volume pinned to 1, no gain, no filters, no fades, no crossfade,
       no normalisation. There is nothing in this file that touches a
       sample.

   Everything else is for the room: big type, the running order, where in
   the set it is, and a laptop that does not go to sleep at 11pm.
   =================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var audio = new Audio();
  audio.preload = 'auto';
  audio.volume = 1;                    // and it is never assigned again
  audio.defaultPlaybackRate = 1;
  audio.playbackRate = 1;

  var state = { wav: null, tracks: [], total: 0, sinkId: '', lastPos: 0 };
  var api = window.api || null;

  /* ------------------------------------------------------- helpers --- */
  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = Math.floor(s % 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
  }
  function clock(atSec) {
    var d = new Date(Date.now() + atSec * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function note(msg, bad) {
    var n = $('note');
    n.textContent = msg || '';
    n.style.color = bad ? 'var(--bad)' : 'var(--warn)';
  }

  /* ------------------------------------------------------ outputs ---- */
  /* Labels for output devices only appear once the page has been granted
     media permission; main.js grants it, and without that this list is a row
     of blank entries that cannot be told apart. */
  function loadSinks() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      note('This build cannot choose the output device. Set it in Windows instead.');
      return Promise.resolve();
    }
    return navigator.mediaDevices.enumerateDevices().then(function (devs) {
      var outs = devs.filter(function (d) { return d.kind === 'audiooutput'; });
      var sel = $('sink');
      sel.innerHTML = '';
      outs.forEach(function (d) {
        var o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || ('Output ' + d.deviceId.slice(0, 8));
        sel.appendChild(o);
      });
      if (state.sinkId && outs.some(function (d) { return d.deviceId === state.sinkId; })) {
        sel.value = state.sinkId;
      }
      applySink();
      /* Say so when the chosen output is one of the ones known to carry
         processing. This is a name match and nothing more, so it is worded as
         something to check rather than something measured. */
      flagProcessing(sel.options[sel.selectedIndex]);
    });
  }

  function flagProcessing(opt) {
    var txt = opt ? (opt.textContent || '') : '';
    if (/realtek|dolby|speakers|internal/i.test(txt)) {
      note('"' + txt.trim() + '" is the kind of output that usually has Dolby or ' +
           'Realtek effects on it, which compress the mix before you hear it. If it ' +
           'sounds squashed, pick the interface the PA is on, or turn off Audio ' +
           'enhancements for this device in Windows sound settings.');
    } else {
      note('');
    }
  }

  function applySink() {
    var id = $('sink').value;
    state.sinkId = id;
    save();
    if (!audio.setSinkId) return;
    audio.setSinkId(id).catch(function (e) {
      note('Could not switch output: ' + e.message + '. Set it in Windows instead.');
    });
  }

  /* The rate Windows is running the default output at. If it is not 48k the
     mix is being resampled on its way out, which is not a disaster but is
     worth knowing about — and it is free to check, because this AudioContext
     is never connected to anything. */
  function showRate() {
    var chip = $('rateChip');
    try {
      var ctx = new AudioContext();
      var r = ctx.sampleRate;
      ctx.close();
      chip.textContent = (r / 1000) + ' kHz out';
      chip.className = 'chip ' + (r === 48000 ? 'ok' : 'warn');
      chip.title = r === 48000
        ? 'Windows is running at 48 kHz, which is what the mix is. No resampling.'
        : 'Windows is running this output at ' + r + ' Hz but the mix is 48000 Hz, ' +
          'so it is being resampled on the way out. Set the device to 48000 Hz, ' +
          '24 bit in Windows sound settings for the cleanest path.';
    } catch (e) { chip.textContent = '–'; }
  }

  /* ------------------------------------------------- running order --- */
  /* The plan gives where each record starts in the finished file. It is the
     same buildPlan the render used, so the times match the audio exactly
     rather than being guessed from track lengths. */
  function loadOrder(json) {
    try {
      var p = JSON.parse(json);
      if (!p || !p.tracks || !p.tracks.length) return;
      var plan = window.MixRender.buildPlan(p);
      state.tracks = plan.tracks.map(function (t, i) {
        var src = p.tracks[i] || {};
        return { i: i + 1, at: t.startSec || 0, title: src.title || ('Track ' + (i + 1)),
                 artist: src.artist || '' };
      });
      renderList();
    } catch (e) { /* no running order is not an error; the mix still plays */ }
  }

  function renderList() {
    var el = $('list');
    el.innerHTML = '';
    state.tracks.forEach(function (t, k) {
      var row = document.createElement('div');
      row.className = 'row';
      row.dataset.k = k;
      row.innerHTML = '<div class="n">' + t.i + '</div>' +
                      '<div class="t"></div>' +
                      '<div class="at">' + fmt(t.at) + '</div>';
      row.querySelector('.t').textContent = t.title;
      if (t.artist) {
        var s = document.createElement('small');
        s.textContent = t.artist;
        row.querySelector('.t').appendChild(s);
      }
      row.onclick = function () { seekTo(t.at + 0.05); };
      el.appendChild(row);
    });
    drawTicks();
  }

  function drawTicks() {
    var el = $('ticks');
    if (!el || !state.total) return;
    el.innerHTML = '';
    state.tracks.forEach(function (t) {
      if (t.at <= 0) return;
      var d = document.createElement('div');
      d.className = 'tick';
      d.style.left = (100 * t.at / state.total) + '%';
      el.appendChild(d);
    });
  }

  function currentIndex(at) {
    var k = -1;
    for (var i = 0; i < state.tracks.length; i++) if (state.tracks[i].at <= at + 0.001) k = i;
    return k;
  }

  /* ---------------------------------------------------- transport ---- */
  function seekTo(sec) {
    if (!state.wav) return;
    audio.currentTime = Math.max(0, Math.min(sec, (audio.duration || 1e9) - 0.2));
    tick();
  }

  function toggle() {
    if (!state.wav) { pick(); return; }
    if (audio.paused) audio.play().catch(function (e) { note('Could not start: ' + e.message, true); });
    else audio.pause();
  }

  function tick() {
    if (!state.wav) return;
    var at = audio.currentTime || 0;
    var dur = isFinite(audio.duration) ? audio.duration : state.total;
    if (dur && dur !== state.total) { state.total = dur; drawTicks(); }

    $('elapsed').textContent = fmt(at);
    $('remain').textContent = dur ? '/ ' + fmt(dur) + '   ·   ' + fmt(dur - at) + ' left' : '';
    $('ends').textContent = dur ? 'finishes about ' + clock(dur - at) : '';
    var pct = dur ? (100 * at / dur) : 0;
    $('fill').style.width = pct + '%';
    $('head').style.left = pct + '%';
    $('play').textContent = audio.paused ? 'Play' : 'Pause';
    $('play').className = 'play' + (audio.paused ? '' : ' playing');

    var k = currentIndex(at);
    var rows = $('list').children;
    for (var i = 0; i < rows.length; i++) {
      rows[i].className = 'row' + (i === k ? ' on' : (i < k ? ' done' : ''));
    }
    if (k >= 0) {
      var t = state.tracks[k];
      $('curTitle').textContent = t.title;
      $('curArtist').textContent = t.artist;
      var nx = state.tracks[k + 1];
      $('nextUp').innerHTML = nx
        ? 'Next: <b></b> in ' + fmt(nx.at - at)
        : 'Last record of the night.';
      if (nx) $('nextUp').querySelector('b').textContent = nx.title + (nx.artist ? ' — ' + nx.artist : '');
      if (k !== tick.lastK) {
        rows[k] && rows[k].scrollIntoView({ block: 'center', behavior: 'smooth' });
        tick.lastK = k;
      }
    } else if (!state.tracks.length) {
      $('curTitle').textContent = 'The mix';
      $('curArtist').textContent = '';
      $('nextUp').textContent = '';
    }

    /* remember where it got to, so a crash at 1am does not mean finding the
       place again by ear */
    if (Math.abs(at - state.lastPos) > 4) { state.lastPos = at; save(); }
  }

  /* ------------------------------------------------------- loading --- */
  function openWav(filePath, resumeAt) {
    state.wav = filePath;
    /* file:// straight off disk. The page is file:// too, so the media element
       reads it without a custom protocol, and it streams rather than loading
       1.4 GB into memory. */
    audio.src = 'file:///' + String(filePath).replace(/\\/g, '/').replace(/^\/+/, '');
    audio.load();
    $('stage').hidden = false;
    $('empty').hidden = true;
    document.title = 'Mix Player — ' + String(filePath).split(/[\\/]/).pop();
    audio.addEventListener('loadedmetadata', function once() {
      audio.removeEventListener('loadedmetadata', once);
      state.total = audio.duration || 0;
      drawTicks();
      if (resumeAt && resumeAt > 5 && resumeAt < state.total - 5) {
        audio.currentTime = resumeAt;
        note('Picked up where it left off, at ' + fmt(resumeAt) + '. Drag the bar back to the start if you want it from the top.');
      }
      tick();
    });
    save();
  }

  function pick() {
    if (!api || !api.playerPickWav) { note('Open this from Mix Builder so it can reach the file.', true); return; }
    api.playerPickWav().then(function (p) { if (p) openWav(p, 0); });
  }

  function save() {
    if (!api || !api.playerSaveState) return;
    api.playerSaveState(JSON.stringify({ wav: state.wav, sinkId: state.sinkId, pos: state.lastPos }));
  }

  /* ---------------------------------------------------------- wire --- */
  $('play').onclick = toggle;
  $('pickWav').onclick = pick;
  $('back30').onclick = function () { seekTo((audio.currentTime || 0) - 30); };
  $('fwd30').onclick = function () { seekTo((audio.currentTime || 0) + 30); };
  $('prevTrk').onclick = function () {
    var at = audio.currentTime || 0, k = currentIndex(at);
    if (k < 0) return;
    /* the start of this record, unless we only just got here */
    var target = (at - state.tracks[k].at < 4 && k > 0) ? state.tracks[k - 1] : state.tracks[k];
    seekTo(target.at + 0.05);
  };
  $('nextTrk').onclick = function () {
    var k = currentIndex(audio.currentTime || 0);
    var nx = state.tracks[k + 1];
    if (nx) seekTo(nx.at + 0.05);
  };
  $('bar').onclick = function (e) {
    var r = this.getBoundingClientRect();
    var dur = isFinite(audio.duration) ? audio.duration : state.total;
    seekTo(dur * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };
  $('sink').onchange = function () { applySink(); flagProcessing(this.options[this.selectedIndex]); };
  $('refreshSinks').onclick = function () { loadSinks(); showRate(); };

  document.addEventListener('keydown', function (e) {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); seekTo((audio.currentTime || 0) + (e.shiftKey ? 300 : 30)); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); seekTo((audio.currentTime || 0) - (e.shiftKey ? 300 : 30)); }
  });

  audio.addEventListener('timeupdate', tick);
  audio.addEventListener('play', tick);
  audio.addEventListener('pause', tick);
  audio.addEventListener('error', function () {
    note('Could not read that file. ' + (audio.error ? 'Code ' + audio.error.code : ''), true);
  });
  setInterval(tick, 500);          // timeupdate is lazy; the clock should not be

  /* Do not let the laptop sleep, or dim, in the middle of the party. */
  if (api && api.playerKeepAwake) api.playerKeepAwake(true);
  if (navigator.wakeLock) {
    var relock = function () {
      navigator.wakeLock.request('screen').catch(function () {});
    };
    relock();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') relock();
    });
  }

  window.addEventListener('beforeunload', function (e) {
    save();
    if (!audio.paused) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------------------------------------------------------- boot --- */
  showRate();
  loadSinks();
  if (api && api.projectAutoLoad) {
    api.projectAutoLoad().then(function (json) { if (json) loadOrder(json); });
  }
  if (api && api.playerLoadState) {
    api.playerLoadState().then(function (json) {
      if (!json) return;
      try {
        var s = JSON.parse(json);
        if (s.sinkId) { state.sinkId = s.sinkId; loadSinks(); }
        if (s.wav && api.audioExists) {
          api.audioExists(s.wav).then(function (ok) { if (ok) openWav(s.wav, s.pos || 0); });
        }
      } catch (err) {}
    });
  }

  /* for the tests */
  window.__player = function () { return { state: state, audio: audio, tick: tick, openWav: openWav }; };
})();
