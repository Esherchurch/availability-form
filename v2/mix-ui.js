/* ===================================================================
   Mix Builder — UI
   ===================================================================

   Four areas: the track library, the timeline, the junction editor and
   (session 4) the sample library. The timeline is drawn from
   MixProject.layout(), which is a pure function of the project, so any
   edit redraws by recomputing rather than by mutating positions.

   Editing junction 12 renders junction 12. Nothing else is touched —
   that is what makes a 47-track project workable.
   =================================================================== */

(function (global) {
  'use strict';

  var DSP = global.MixDSP, MP = global.MixProject;
  var AC = global.AudioContext || global.webkitAudioContext;

  var ctx = null;                 // AudioContext, created on first user gesture
  var project = null;
  var lay = null;                 // last layout()
  var buffers = new Map();        // trackId -> AudioBuffer (never persisted)
  var monos = new Map();          // trackId -> Float32Array
  /* Rendered junction audio, keyed by CONTENT (MixProject.junctionCacheKey) and
     never by position. That one choice is what makes moving a track cheap: a
     junction whose two tracks and settings are untouched keeps its render even
     though its index changed, and a junction whose inputs did change misses the
     cache automatically. There is no invalidation logic to get wrong. */
  var segments = new Map();       // cacheKey -> { buffer, info }
  var playing = null;
  var openJunction = null;
  var openTrack = null;
  var dragFrom = null;
  var importTab = 'order';
  var tlZoom = 100;                // timeline width, percent

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var fmt = function (s) {
    if (!isFinite(s)) return '—';
    var m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  };
  var fmtLong = function (s) {
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + 'h ' + m + 'm' : m + 'm ' + Math.floor(s % 60) + 's';
  };

  function audioCtx() { if (!ctx) ctx = new AC(); return ctx; }

  /* --------------------------------------------------------- state --- */

  /* Octave choice runs before the layout, because whether a junction can be
     beat-matched at all depends on it. It only moves tracks the user has not
     decided by hand, and settling on a choice is idempotent — a second pass
     over the same order changes nothing. */
  function recompute() {
    MP.autoOctave(project);
    lay = MP.layout(project);
  }

  function segKey(i) {
    try { return MP.junctionCacheKey(project, i); } catch (e) { return null; }
  }
  function segFor(i) { var k = segKey(i); return k ? segments.get(k) : null; }
  function setSeg(i, v) { var k = segKey(i); if (k) segments.set(k, v); }

  /* Renders that no junction refers to any more. Dropping them costs only the
     time to render again if that exact arrangement comes back. */
  function pruneSegments() {
    var live = {};
    for (var i = 0; i < (project.junctions || []).length; i++) {
      var k = segKey(i);
      if (k) live[k] = true;
    }
    segments.forEach(function (v, k) { if (!live[k]) segments.delete(k); });
  }

  function renderedCount() {
    var n = 0;
    for (var i = 0; i < (project.junctions || []).length; i++) if (segFor(i)) n++;
    return n;
  }

  var savedTimer = null;
  function save() {
    MP.saveProject(project).then(function () {
      var el = $('saved');
      if (!el) return;
      el.textContent = 'Saved';
      el.classList.add('on');
      clearTimeout(savedTimer);
      savedTimer = setTimeout(function () { el.classList.remove('on'); }, 1400);
    });
  }

  function touch() { recompute(); pruneSegments(); save(); renderAll(); }

  /* ------------------------------------------------------- intake --- */

  function acceptedAudio(f) {
    return (f.type && f.type.indexOf('audio') === 0) ||
           /\.(mp3|wav|m4a|flac|ogg|aac|aiff?)$/i.test(f.name);
  }

  /* Decode, then analyse — but only if this exact file has not been analysed
     before. The cache is keyed by name + size + duration, so a folder is
     analysed once ever, across projects and sessions. */
  async function ingestFiles(files) {
    var list = Array.from(files).filter(acceptedAudio);
    if (!list.length) { setStatus('No audio files in that drop.', true); return; }
    audioCtx();
    rememberFolderFrom(list);

    // If the project already has tracks, this is a re-link, not a fresh import.
    if (project.tracks.length) return relinkFiles(list);

    setStatus('Decoding ' + list.length + ' files…');
    project.tracks = [];
    for (var i = 0; i < list.length; i++) {
      var t = await ingestOne(list[i], i, list.length);
      if (t) project.tracks.push(t);
    }
    project.junctions = [];
    for (var k = 0; k < project.tracks.length - 1; k++) {
      project.junctions.push(MP.defaultJunction('blend'));
    }
    setStatus(project.tracks.length + ' tracks ready.');
    touch();
  }

  async function ingestOne(file, i, total) {
    var id = 'trk_' + MP.hash(file.name + file.size) + '_' + i;
    var buf;
    try {
      buf = await decode(file);
    } catch (err) {
      setStatus('Could not decode ' + file.name + ' — ' + (err.message || err), true);
      return null;
    }
    var mono = DSP.toMono(buf);
    var key = MP.analysisKey(file, buf.duration);
    var cached = await MP.getAnalysis(key);
    var res;
    if (cached) {
      res = cached;
      setStatus('(' + (i + 1) + '/' + total + ') ' + file.name + ' — cached analysis');
    } else {
      setStatus('(' + (i + 1) + '/' + total + ') Analysing ' + file.name + '…');
      var a = await DSP.analyseBeat(mono, buf.sampleRate, function (v) {
        setStatus('(' + (i + 1) + '/' + total + ') Analysing ' + file.name + '… ' + Math.round(v * 100) + '%');
      });
      res = {
        bpm: Math.round(a.bpm * 100) / 100,
        confidence: a.confidence,
        downbeatSec: a.downbeatSec,
        durationSec: buf.duration,
        contentEndSec: DSP.contentEndSec(mono, buf.sampleRate),
        peaks: Array.from(DSP.peaks(mono, 1400))
      };
      await MP.putAnalysis(key, res);
    }
    buffers.set(id, buf);
    monos.set(id, mono);
    var t = {
      id: id,
      title: file.name.replace(/\.[^.]+$/, ''),
      file: file.name, fileSize: file.size,
      sourceBpm: res.bpm, bpmMultiplier: 1, bpmLocked: false,
      confidence: res.confidence,
      downbeatSec: res.downbeatSec,
      entrySec: res.downbeatSec,
      exitSec: 0,
      durationSec: res.durationSec,
      peaks: res.peaks,
      linked: true, regions: null
    };
    t.exitSec = defaultMixOut(t, mono, buf.sampleRate, res.contentEndSec);
    // Catch a bad detection at ingest, not only on a later re-link.
    repairRange(t, mono, buf.sampleRate, res.contentEndSec);
    return t;
  }

  function decode(file) {
    return file.arrayBuffer().then(function (ab) {
      return audioCtx().decodeAudioData(ab);
    }).catch(function (err) {
      // Some m4a and mp3 files decodeAudioData rejects outright, and a folder of
      // 47 purchased tracks will contain one. The <audio> element's media
      // pipeline plays many formats the bare decoder cannot, so route it through
      // a realtime context into a MediaRecorder, capture WebM/Opus and decode
      // that. Lifted from Videoeditor.html, which needed the same escape hatch.
      return fallbackDecode(file);
    });
  }

  /* Ported from Videoeditor.html's decodeViaElement(), including the guards it
     has and an earlier version of this did not. Each one is a way the realtime
     route hangs rather than fails, and a hang during a 47-file ingest looks
     like the tool is broken:

       - `settled` — oncanplaythrough can fire more than once, which would start
         a second recorder on the same element.
       - try/catch around the graph and the recorder — an exception thrown in an
         event handler never reaches the Promise, so it hangs instead of
         rejecting.
       - el.play() returns a promise — autoplay policy rejects it silently.
       - a hard ceiling, because a stuck element never fires `onended` at all. */
  function fallbackDecode(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var el = new Audio();
      el.src = url; el.preload = 'auto'; el.crossOrigin = 'anonymous';
      var settled = false;
      var fail = function (msg) {
        if (settled) return;
        settled = true;
        try { URL.revokeObjectURL(url); } catch (e) {}
        reject(new Error(msg));
      };
      el.onerror = function () { fail('the browser could not load this file either'); };
      el.oncanplaythrough = function () {
        if (settled) return;
        var rt, src, dest, rec;
        try {
          rt = new AC();
          src = rt.createMediaElementSource(el);
          dest = rt.createMediaStreamDestination();
          src.connect(dest);
        } catch (e) { fail('realtime route failed: ' + (e.message || e)); return; }
        try {
          rec = new MediaRecorder(dest.stream);
        } catch (e) { fail('MediaRecorder unavailable: ' + (e.message || e)); return; }

        var chunks = [];
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
        rec.onstop = function () {
          new Blob(chunks, { type: 'audio/webm' }).arrayBuffer()
            .then(function (ab) { return new AC().decodeAudioData(ab); })
            .then(function (decoded) {
              if (settled) return;
              settled = true;
              try { rt.close(); } catch (e) {}
              try { URL.revokeObjectURL(url); } catch (e) {}
              resolve(decoded);
            })
            .catch(function (e) { fail('recorded-audio decode failed: ' + (e.message || e)); });
        };
        el.onended = function () { try { rec.stop(); } catch (e) {} };
        rec.start();
        var p = el.play();
        if (p && p.catch) p.catch(function (e) { fail('playback failed: ' + (e.message || e)); });

        // Hard ceiling so one stuck file cannot hang the whole folder.
        var dur = isFinite(el.duration) && el.duration > 0 ? el.duration : 600;
        setTimeout(function () {
          try { rec.stop(); } catch (e) {}
          try { el.pause(); } catch (e) {}
        }, (dur + 2) * 1000);
      };
    });
  }

  /* Re-link: the project reopened with every setting intact but no audio. */
  async function relinkFiles(list) {
    rememberFolderFrom(list);
    var repaired = [];
    var r = MP.relink(project, list);
    setStatus('Re-linking ' + r.matched.length + ' of ' + project.tracks.length + '…');
    for (var i = 0; i < r.matched.length; i++) {
      var m = r.matched[i];
      try {
        var buf = await decode(m.file);
        buffers.set(m.track.id, buf);
        monos.set(m.track.id, DSP.toMono(buf));
        m.track.linked = true;
        if (!m.track.peaks) m.track.peaks = Array.from(DSP.peaks(monos.get(m.track.id), 1400));
        if (!m.track.durationSec) m.track.durationSec = buf.duration;
        // A track seeded from the running order has the sheet's BPM and no
        // grid; analyse it now that its audio is finally here.
        if (!m.track.downbeatSec) {
          setStatus('Analysing ' + m.track.title + '…');
          var key = MP.analysisKey(m.file, buf.duration);
          var cached = await MP.getAnalysis(key);
          var a = cached || await DSP.analyseBeat(monos.get(m.track.id), buf.sampleRate);
          if (!cached) {
            await MP.putAnalysis(key, {
              bpm: Math.round(a.bpm * 100) / 100, confidence: a.confidence,
              downbeatSec: a.downbeatSec, durationSec: buf.duration,
              contentEndSec: DSP.contentEndSec(monos.get(m.track.id), buf.sampleRate),
              peaks: m.track.peaks
            });
          }
          if (!m.track.bpmLocked) m.track.sourceBpm = Math.round(a.bpm * 100) / 100;
          m.track.downbeatSec = a.downbeatSec;
          m.track.entrySec = m.track.entrySec || a.downbeatSec;
          m.track.confidence = a.confidence;
        }

        /* Re-linking does NOT overwrite a mix-out you set — but it does repair
           one that cannot work. This whole block used to sit behind
           `if (!downbeatSec)`, so once a track had been analysed once a broken
           mix-out could never heal: reopening the project re-linked the audio
           and left the bad value in place forever.

           A value with room between entry and mix-out is yours and is left
           alone. One that is missing, NaN, or at/before the entry point is not
           a setting, it is a track that will not play, and it gets re-derived. */
        var key2 = MP.analysisKey(m.file, buf.duration);
        var cached2 = await MP.getAnalysis(key2);
        var fixed = repairRange(m.track, monos.get(m.track.id), buf.sampleRate,
                                cached2 ? cached2.contentEndSec : null);
        if (fixed) {
          repaired.push('"' + m.track.title + '": ' + fixed.join(', '));
        }
      } catch (err) {
        setStatus('Could not decode ' + m.file.name, true);
      }
      setStatus('Re-linked ' + (i + 1) + '/' + r.matched.length);
    }
    if (r.missing.length) {
      setStatus(r.matched.length + ' re-linked. Still missing: ' +
        r.missing.map(function (t) { return t.file || t.title; }).join(', '), true);
    } else {
      setStatus('All ' + r.matched.length + ' tracks re-linked.' +
        (repaired.length ? ' Repaired ' + repaired.length + ' track' +
          (repaired.length === 1 ? '' : 's') + ' that could not have played — ' +
          repaired.join('; ') + '.' : ''));
    }
    touch();
  }

  /* The fill's length in beats. Older projects stored bars; four to the bar. */
  function fillBeatsOfUI(s) {
    if (!s) return 64;
    if (s.beatBeats != null) return s.beatBeats;
    if (s.beatBars != null) return s.beatBars * 4;
    return 64;
  }

  /* How long that actually is, in seconds — the number that matters and the
     one nobody can work out in their head from a beat count and two tempos. */
  function fillSecsOfUI(j, s) {
    var a = j && (j.bpmA || j.targetBpm), b = j && (j.bpmB || j.targetBpm);
    if (!a || !b) return '';
    var sec = DSP.beatFillSec(fillBeatsOfUI(s), a, b);
    if (!sec) return '';
    var m = Math.floor(sec / 60), ss = Math.round(sec % 60);
    return m ? m + ':' + String(ss).padStart(2, '0') : ss + 's';
  }

  function snapToBar(t, sec) {
    if (!isFinite(sec)) return sec;          // never turn a bad input into NaN
    var bpm = (t.sourceBpm || 0) * (t.bpmMultiplier || 1);
    if (!bpm) return sec;
    var db = isFinite(t.downbeatSec) ? t.downbeatSec : 0;
    var bar = 60 / bpm * 4;
    var k = Math.round((sec - db) / bar);
    if (!isFinite(k)) return sec;
    return Math.max(0, db + k * bar);
  }

  /* THE MIX-OUT DEFAULT — the last audible bar, never the end of the file.
     ------------------------------------------------------------------
     §9 of the brief: the very first bridge sounded like a straight cut because
     it had worked perfectly — into the fade-out and trailing silence at the end
     of the MP3, where there was nothing left to hear. Every transition works
     backwards from this value.

     It has now been lost three times, so it lives in exactly one function with
     a floor under it. A mix-out at or before the entry point means the track
     has no playable range and will not render at all — which is how three songs
     ended up with entry and mix-out identical. Rather than hand that on, fall
     back in order: snapped last audible bar, raw content end, file length. A
     default that is slightly wrong is recoverable by moving a marker; a
     zero-length track is not. */
  function defaultMixOut(t, mono, sr, cachedContentEnd) {
    /* Mix out where the record is still PLAYING, not where it stops making a
       noise. contentEndSec finds the last thing above -34 dBFS, which on a
       record with a long fade is inside the fade — and a beat bridge anchored
       there takes its "beat" from a fade-out. Measured on a real mix: the
       bridge ran "16 bars from 3:02" on a 3:45 record, and produced a full
       second of digital silence at -93 dBFS. A DJ mixes out before the fade,
       and so does this. */
    var contentEnd = mono ? DSP.lastStrongSec(mono, sr) : 0;
    if (!isFinite(contentEnd) || contentEnd <= 0) {
      contentEnd = (cachedContentEnd != null && isFinite(cachedContentEnd))
        ? cachedContentEnd
        : (mono ? DSP.contentEndSec(mono, sr) : 0);
    }
    if (!isFinite(contentEnd) || contentEnd <= 0) contentEnd = t.durationSec || 0;

    var entry = isFinite(t.entrySec) ? t.entrySec : 0;
    var out = snapToBar(t, contentEnd);
    if (!isFinite(out) || out <= entry + 1) out = contentEnd;
    if (!isFinite(out) || out <= entry + 1) out = t.durationSec || (entry + 1);
    return out;
  }

  /** A track with no room between entry and mix-out cannot render. */
  function hasNoRange(t) {
    var entry = isFinite(t.entrySec) ? t.entrySec : 0;
    return !isFinite(t.exitSec) || t.exitSec <= entry + 0.5;
  }

  /* The shortest stretch of a track worth calling playable. Below this there is
     nothing to mix with and nothing to hear. */
  var MIN_PLAYABLE_SEC = 5;

  /* Repair BOTH markers, not just the mix-out.
     ------------------------------------------------------------------
     The earlier repair mended only the mix-out, and derived it using the entry
     as its floor — so a track whose ENTRY was wrong could never heal. Despacito
     sat at entry 220.288 and mix-out 220.288 on a 3:45 record, five seconds from
     the end, and re-linking dutifully produced entry + 1 second.

     An entry past the last audible bar is not a decision anyone made; it is a
     detection that went wrong or a value that got corrupted. So it is re-derived
     from the downbeat, and only then is the mix-out worked out from it.

     A track whose markers are sane is never touched — this fires only on one
     that cannot play. Returns a list of what it changed, or null. */
  function repairRange(t, mono, sr, cachedContentEnd) {

    var contentEnd = (cachedContentEnd != null && isFinite(cachedContentEnd))
      ? cachedContentEnd
      : (mono ? DSP.contentEndSec(mono, sr) : 0);
    if (!isFinite(contentEnd) || contentEnd <= 0) contentEnd = t.durationSec || 0;
    if (!contentEnd) return null;

    var before = { entry: t.entrySec, exit: t.exitSec };
    var notes = [];
    var latestUsableEntry = contentEnd - MIN_PLAYABLE_SEC;

    // 1. The entry, if it is not a number or leaves nothing playable after it.
    var entry = t.entrySec;
    if (!isFinite(entry) || entry < 0 || entry > latestUsableEntry) {
      var db = isFinite(t.downbeatSec) ? t.downbeatSec : 0;
      // The downbeat can be just as wrong as the entry was; fall back to the top.
      entry = (db >= 0 && db <= latestUsableEntry) ? db : 0;
      t.entrySec = entry;
      notes.push('entry ' + (isFinite(before.entry) ? before.entry.toFixed(2) + 's' : 'unset') +
                 ' → ' + entry.toFixed(2) + 's');
    }

    // 2. The mix-out, now that the entry underneath it can be trusted.
    if (hasNoRange(t)) {
      t.exitSec = defaultMixOut(t, mono, sr, contentEnd);
      notes.push('mix-out ' + (isFinite(before.exit) ? before.exit.toFixed(2) + 's' : 'unset') +
                 ' → ' + t.exitSec.toFixed(2) + 's');
    } else if (mono) {
      /* Where the mix-out may sit.
         ----------------------------------------------------------------
         Two separate limits, because they answer to different things.

         The first is absolute: past contentEndSec there is nothing above
         -34 dBFS, so a mix-out beyond it is anchored in silence. Measured on
         the real set, "Despacito" ends at 227.3s and the project had its
         mix-out at 228.35s — the last second of the bridge was digital black,
         which is the hard stop it sounded like. No judgement is involved in
         this one and no deliberate choice is being overruled: there is
         nothing there to choose.

         The second applies only when the junction after this track is a
         BRIDGE. A bridge keeps the outgoing beat running after the music
         cuts, so it takes its beat from the bars immediately before the
         mix-out. Those bars have to contain a beat. lastStrongSec is the last
         point still within 5 dB of the record's own strong level, which is
         where the beat is still the beat rather than the tail of a fade.

         This used to be a single rule with an 8-second tolerance, meant to
         leave a deliberate choice alone. It left both junctions of the real
         set broken: they were 1.9s and 2.9s out, comfortably inside the
         tolerance and both squarely in the silence. A blend does not care —
         it is already fading — so the tighter limit is not applied to one. */
      var floor = (t.entrySec || 0) + MIN_PLAYABLE_SEC;

      var limit = null, why = '';
      if (isFinite(contentEnd) && t.exitSec > contentEnd && contentEnd > floor) {
        limit = contentEnd;
        why = 'it was ' + (t.exitSec - contentEnd).toFixed(1) + 's past the end of the music';
      }
      /* There used to be a second limit here for bridges: the mix-out was
         pulled back to lastStrongSec because the bridge took its beat from the
         record's last bars, and a fade has no beat in it. The fill plays a
         drum kit now, so it needs nothing from the record — and moving a
         mix-out somebody placed deliberately, to serve a mechanism that no
         longer exists, is just overruling them. The only limit left is the
         absolute one above: never past the end of the music. */

      if (limit != null) {
        var wasExit = t.exitSec;
        var snapped = snapToBar(t, limit);
        // snapToBar rounds to the nearest bar, which can push it back out past
        // the limit it was brought in to respect.
        t.exitSec = (isFinite(snapped) && snapped > (t.entrySec || 0) && snapped <= limit)
          ? snapped : limit;
        notes.push('mix-out ' + wasExit.toFixed(2) + 's → ' + t.exitSec.toFixed(2) +
                   's — ' + why);
      }
    }

    return notes.length ? notes : null;
  }

  function setStatus(msg, isErr) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
  }

  /* --------------------------------------------- running order import --- */

  function importRunningOrder(text) {
    var rows;
    try { rows = MP.parseRunningOrder(text); }
    catch (e) { setStatus('Could not read that running order: ' + e.message, true); return; }
    if (!rows.length) { setStatus('No rows found. Paste the header line too.', true); return; }
    var known = [];
    buffers.forEach(function (b, id) {
      var t = project.tracks.find(function (x) { return x.id === id; });
      if (t && t.file) known.push({ name: t.file, size: t.fileSize, id: id });
    });
    var seeded = MP.seedProject(rows, known, project);
    // Carry the audio across for anything that matched a file we already hold.
    seeded.tracks.forEach(function (t) {
      var src = known.find(function (k) { return k.name === t.file; });
      if (src) {
        var old = project.tracks.find(function (x) { return x.id === src.id; });
        if (old) {
          buffers.set(t.id, buffers.get(src.id));
          monos.set(t.id, monos.get(src.id));
          t.peaks = old.peaks; t.downbeatSec = old.downbeatSec;
          t.entrySec = old.entrySec; t.exitSec = old.exitSec;
          t.durationSec = old.durationSec; t.confidence = old.confidence;
          if (old.sourceBpm) t.sourceBpm = old.sourceBpm;
          t.linked = true;
        }
      }
    });
    project = seeded;
    segments.clear();
    var missing = project.tracks.filter(function (t) { return !t.file; });
    // Close the panel on success, as the bench import already does — it sits
    // over the track list, which is the thing you want to look at afterwards.
    $('importPanel').classList.add('hidden');
    setStatus(rows.length + ' rows imported' +
      (missing.length ? ' — ' + missing.length + ' still need audio: ' +
        missing.slice(0, 4).map(function (t) { return t.title; }).join(', ') +
        (missing.length > 4 ? '…' : '') : ' and all matched to audio.'), missing.length > 0);
    closePanels();
    touch();
  }

  /* ------------------------------------------------------ timeline --- */

  function renderTimeline() {
    var el = $('timeline');
    if (!lay || !lay.tracks.length) {
      el.innerHTML = '<div class="empty">Drop a folder of audio, or import a running order, ' +
                     'and the whole set appears here.</div>';
      return;
    }
    var total = lay.totalSec || 1;
    var html = '<div class="tl-scroll"><div style="width:' + tlZoom + '%">' +
               '<div class="tl-ruler">' + rulerHtml(total) + '</div><div class="tl-body">';

    lay.tracks.forEach(function (lt, i) {
      var t = project.tracks[i];
      var left = lt.startSec / total * 100;
      var width = Math.max(0.35, lt.bodySec / total * 100);
      var cls = 'tl-track' + (t.linked ? '' : ' unlinked') +
                (openTrack === i ? ' open' : '') +
                (t.section ? ' sec-' + t.section.toLowerCase().replace(/[^a-z]/g, '') : '');
      html += '<div class="' + cls + '" style="left:' + left + '%;width:' + width + '%" ' +
              'data-track="' + i + '" title="' + esc(t.title) + '">' +
              '<span class="tl-num">' + (i + 1) + '</span>' +
              '<span class="tl-name">' + esc(t.title) + '</span>' +
              '<span class="tl-bpm">' + (lt.effectiveBpm ? lt.effectiveBpm.toFixed(0) : '?') +
              (lt.halfTime ? '<sup>½</sup>' : '') + '</span></div>';
    });

    lay.junctions.forEach(function (j, i) {
      var at = lay.tracks[i + 1].startSec / total * 100;
      var bad = !j.renderable;
      var cls = 'tl-junction j-' + j.type + (bad ? ' bad' : '') + (openJunction === i ? ' open' : '') +
                (segFor(i) ? ' cached' : '');
      html += '<div class="' + cls + '" style="left:' + at + '%" data-junction="' + i + '" ' +
              'title="' + esc(junctionLabel(j)) + '"></div>';
    });

    html += '</div></div></div>';
    el.innerHTML = html;
  }

  function rulerHtml(total) {
    var out = '', step = total > 3600 ? 600 : total > 900 ? 300 : 60;
    for (var s = 0; s <= total; s += step) {
      out += '<span class="tick" style="left:' + (s / total * 100) + '%">' + fmt(s) + '</span>';
    }
    return out;
  }

  function junctionLabel(j) {
    var s = j.settings || {};
    if (j.type === 'hard-cut') return 'Hard cut' + (s.gapMs ? ' · ' + s.gapMs + ' ms gap' : '');
    if (j.type === 'blend') return 'Blend · ' + (s.bars || 16) + ' bars @ ' + (j.targetBpm || '?') + ' BPM';
    return 'Bridge · ' + fillBeatsOfUI(s) + ' beats of drums between them';
  }

  /* ---------------------------------------------------- track list --- */

  function renderTracks() {
    var el = $('tracks');

    /* Rescue the junction panel before rebuilding. It gets MOVED into a row
       below, so it is a child of #tracks by the time this runs again — and
       setting innerHTML would destroy the element, along with every handler
       delegated to it. The controls then render into a node that is no longer
       in the document, which looks exactly like a dead panel. */
    var panel = $('junction');
    var home = $('junctionHome');
    if (panel && home && el.contains(panel)) home.appendChild(panel);

    if (!project.tracks.length) { el.innerHTML = ''; return; }
    el.innerHTML = project.tracks.map(function (t, i) {
      var lt = lay.tracks[i];
      var conf = t.confidence == null ? null :
        t.confidence >= 0.6 ? 'hi' : t.confidence >= 0.3 ? 'mid' : 'lo';
      var last = project.tracks.length - 1;
      return '<div class="trk' + (openTrack === i ? ' open' : '') + '" data-track="' + i + '"' +
             ' draggable="true">' +
        '<div class="trk-head">' +
          /* The row opens to a waveform, the beat grid and the entry/mix-out
             markers — but nothing said so, so it read as a dead list and the
             waveform looked absent rather than collapsed. */
          '<span class="trk-caret">' + (openTrack === i ? '▾' : '▸') + '</span>' +
          '<span class="trk-num">' + (i + 1) + '</span>' +
          '<button class="pin' + (t.pinned ? ' on' : '') + '" data-act="pin" data-track="' + i + '"' +
            ' title="' + (t.pinned ? 'Pinned — the sequencer will not move this'
                                   : 'Pin so the sequencer leaves it here') + '">' +
            (t.pinned ? '◉' : '○') + '</button>' +
          '<span class="trk-title">' + esc(t.title) + '</span>' +
          (t.artist ? '<span class="trk-artist">' + esc(t.artist) + '</span>' : '') +
          (t.linked ? '' : '<span class="pill lo">no audio</span>') +
          (conf ? '<span class="pill ' + conf + '">' + Math.round(t.confidence * 100) + '%</span>' : '') +
          '<span class="pill">' + (lt.effectiveBpm ? lt.effectiveBpm.toFixed(1) : '?') + ' BPM' +
            (lt.halfTime ? ' (half-time)' : '') + '</span>' +
          '<span class="pill quiet">' + fmt(lt.bodySec) + '</span>' +
          '<span class="trk-hint">' + (openTrack === i ? 'Close' : 'Waveform &amp; markers') + '</span>' +
          '<span class="trk-tools">' +
            '<button data-act="up" data-track="' + i + '"' + (i === 0 ? ' disabled' : '') +
              ' title="Move up">↑</button>' +
            '<button data-act="down" data-track="' + i + '"' + (i === last ? ' disabled' : '') +
              ' title="Move down">↓</button>' +
            '<button data-act="swap" data-track="' + i + '" title="Replace from the bench">Swap</button>' +
            '<button data-act="bench" data-track="' + i + '" title="Take out (goes to the bench)">' +
              'Remove</button>' +
          '</span>' +
        '</div>' +
        (openTrack === i ? trackEditorHtml(t, i) : '') +
      '</div>' +
      junctionRowHtml(i);
    }).join('');

    /* The junction editor is not rebuilt here — the existing #junction element
       is physically MOVED into the open row, so renderJunctionEditor() and every
       handler delegated to it carry on working untouched. Only its parent
       changes. */
    if (openJunction != null && panel) {
      var slot = document.querySelector('.jrow[data-jrow="' + openJunction + '"] .jrow-slot');
      if (slot) slot.appendChild(panel);
    }

    project.tracks.forEach(function (t, i) {
      if (openTrack !== i) return;
      var cv = document.querySelector('.trk[data-track="' + i + '"] canvas');
      if (cv) drawWave(cv, t);
    });
  }

  /* A transition row between every pair of tracks. This is where anyone
     actually looks for it — the timeline markers are 3 px wide and were the
     only way in. */
  function junctionRowHtml(i) {
    if (i >= project.tracks.length - 1) return '';
    var j = lay.junctions[i];
    if (!j) return '';
    var open = openJunction === i;
    var name = { 'blend': 'Blend', 'throw-bridge': 'Beat bridge', 'hard-cut': 'Hard cut' }[j.type] || j.type;
    var s = j.settings || {};
    var detail;
    if (j.type === 'hard-cut') detail = s.gapMs ? s.gapMs + ' ms gap' : 'straight cut';
    else if (j.type === 'blend') detail = (s.bars || 16) + ' bars';
    else detail = fillBeatsOfUI(s) + ' beats of drums between them' +
                  (fillSecsOfUI(j, s) ? ' · ' + fillSecsOfUI(j, s) : '');

    return '<div class="jrow' + (open ? ' open' : '') + '" data-jrow="' + i + '">' +
      '<button class="jrow-btn" data-act="open-jrow" data-junction="' + i + '">' +
        '<span class="jrow-caret">' + (open ? '▾' : '▸') + '</span>' +
        '<span class="jrow-kind j-' + j.type + '">' + name + '</span>' +
        '<span class="jrow-detail">' + esc(detail) +
          (j.targetBpm ? ' · ' + j.targetBpm + ' BPM' : '') + '</span>' +
        (j.renderable ? '' : '<span class="pill lo">no tempo match</span>') +
        '<span class="jrow-hint">' + (open ? 'Close' : 'Edit transition') + '</span>' +
      '</button>' +
      '<div class="jrow-slot"></div>' +
    '</div>';
  }

  function trackEditorHtml(t, i) {
    return '<div class="trk-body">' +
      '<canvas class="wave"></canvas>' +
      '<div class="row" style="margin-top:8px">' +
        '<button data-act="play-here" data-track="' + i + '"' + (t.linked ? '' : ' disabled') +
          ' title="Or double-click anywhere on the waveform">▶ Play from entry</button>' +
        '<button class="ghost" data-act="play-exit" data-track="' + i + '"' + (t.linked ? '' : ' disabled') +
          '>▶ Play from mix-out</button>' +
        '<button class="ghost" id="stopAllBtn" data-act="stop-all" disabled>■ Stop</button>' +
        '<span class="hint" style="margin:0;flex:1;min-width:220px">' +
          '<strong>Double-click the waveform to hear from that point.</strong> ' +
          'Click sets the entry (gold), shift-click sets the mix-out (red). Both snap to the bar.' +
        '</span>' +
      '</div>' +
      '<div class="grid">' +
        field('BPM', 'number', t.sourceBpm, 'sourceBpm', i, '0.01') +
        field('Downbeat (s)', 'number', num(t.downbeatSec), 'downbeatSec', i, '0.001') +
        field('Entry (s)', 'number', num(t.entrySec), 'entrySec', i, '0.001') +
        field('Mix-out (s)', 'number', num(t.exitSec), 'exitSec', i, '0.001') +
        '<div><label class="lbl">&nbsp;</label>' +
          '<button class="ghost" data-act="half" data-track="' + i + '">Halve</button></div>' +
        '<div><label class="lbl">&nbsp;</label>' +
          '<button class="ghost" data-act="double" data-track="' + i + '">Double</button></div>' +
        '<div><label class="lbl">&nbsp;</label>' +
          '<button data-act="checkgrid" data-track="' + i + '"' + (t.linked ? '' : ' disabled') +
          '>Check grid</button></div>' +

      '</div>' +
      sampleCutHtml(t, i) +
      regionEditorHtml(t, i) +
      (t.note ? '<div class="note-row">' + esc(t.note) + '</div>' : '') +
    '</div>';
  }

  /* Cutting a sample out of this track. The selection comes from dragging on
     the waveform above, so what you take is the passage you actually chose. */
  function sampleCutHtml(t, i) {
    var sel = selectionFor(i);
    var bs = barSecOf(t);
    var startBar = sel && bs ? Math.round((sel.fromSec - (t.downbeatSec || 0)) / bs) + 1 : null;

    if (!sel) {
      return '<div class="samplecut">' +
        '<span class="lbl" style="margin:0 0 4px">Cut a sample</span>' +
        '<span class="region-hint">Drag across the waveform above to choose a hook, a stab or a ' +
        'riser. The selection snaps to whole bars.</span></div>';
    }

    return '<div class="samplecut on">' +
      '<div class="samplecut-head">' +
        '<span class="lbl" style="margin:0">Cut a sample</span>' +
        '<span class="samplecut-range">' + sel.bars + ' bar' + (sel.bars === 1 ? '' : 's') +
          ' · from bar ' + startBar + ' · ' + fmtSec(sel.fromSec) + ' to ' + fmtSec(sel.toSec) +
        '</span>' +
      '</div>' +
      '<div class="row" style="margin-top:8px">' +
        '<input type="text" id="sampleName' + i + '" style="max-width:280px" ' +
          'placeholder="Name it — e.g. Sir Duke horns" value="' +
          esc(t.title + ' ' + sel.bars + ' bars') + '">' +
        '<label class="samplecut-check"><input type="checkbox" id="sampleDrums' + i + '"> ' +
          'Take the drums out</label>' +
        '<button data-act="cut-sample" data-track="' + i + '">Save to library</button>' +
        '<button class="ghost" data-act="play-sel" data-track="' + i + '">▶ Hear it</button>' +
        '<button class="ghost" data-act="clear-sel" data-track="' + i + '">Clear</button>' +
      '</div>' +
      '<span class="region-hint">Drums out uses separation, which is right for lifting a melodic ' +
      'hook out of a full mix — the opposite job to a beat bridge, where EQ is right and ' +
      'separation deletes the kick.</span>' +
    '</div>';
  }

  /* §6.4 edit list. Regions play back to back at the source tempo and are then
     stretched once, so what is edited here is bars of the original record. */
  function regionEditorHtml(t, i) {
    var bpm = (t.sourceBpm || 0) * (t.bpmMultiplier || 1);
    var barSec = bpm ? 60 / bpm * 4 : 0;
    var has = !!(t.regions && t.regions.length);
    var totalBars = has ? t.regions.reduce(function (a, r) { return a + (r.bars || 0); }, 0) : 0;

    if (!has) {
      return '<div class="regions">' +
        '<button class="ghost" data-act="regions-on" data-track="' + i + '"' +
          (bpm ? '' : ' disabled') + '>Build from parts…</button>' +
        '<span class="region-hint">Plays entry to mix-out as one piece. Use an edit list to ' +
        'come in on the hook and drop back to the verse.</span></div>';
    }

    return '<div class="regions">' +
      '<div class="region-head">' +
        '<span class="lbl" style="margin:0">Edit list — ' + totalBars + ' bars, ' +
          fmt(totalBars * barSec) + '</span>' +
        '<button class="ghost" data-act="region-add" data-track="' + i + '">Add part</button>' +
        '<button class="ghost" data-act="regions-off" data-track="' + i + '">Use whole track</button>' +
      '</div>' +
      t.regions.map(function (r, ri) {
        var startBar = barSec ? Math.round((r.startSec - t.downbeatSec) / barSec) + 1 : 0;
        return '<div class="region-row">' +
          '<span class="n">' + (ri + 1) + '</span>' +
          '<label class="lbl" style="margin:0">from bar</label>' +
          '<input type="number" step="1" value="' + startBar + '" style="width:74px"' +
            ' data-rf="startBar" data-track="' + i + '" data-region="' + ri + '">' +
          '<label class="lbl" style="margin:0">for</label>' +
          '<input type="number" step="1" min="1" value="' + (r.bars || 0) + '" style="width:64px"' +
            ' data-rf="bars" data-track="' + i + '" data-region="' + ri + '">' +
          '<span class="m">bars · ' + fmt((r.bars || 0) * barSec) + '</span>' +
          '<button class="ghost" data-act="region-up" data-track="' + i + '" data-region="' + ri + '"' +
            (ri === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="ghost" data-act="region-del" data-track="' + i + '" data-region="' + ri + '"' +
            (t.regions.length < 2 ? ' disabled' : '') + '>✕</button>' +
        '</div>';
      }).join('') +
      '<span class="region-hint">Joins are butt-joined on the bar line with a 10 ms crossfade, ' +
      'in untouched material — the same thing a DJ does with a hot cue.</span>' +
    '</div>';
  }

  var num = function (v) { return v == null ? '' : (+v).toFixed(3); };

  function field(label, type, value, f, i, step) {
    return '<div><label class="lbl">' + label + '</label>' +
      '<input type="' + type + '" step="' + (step || 'any') + '" value="' + esc(value) +
      '" data-f="' + f + '" data-track="' + i + '"></div>';
  }

  function drawWave(cv, t) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = 88;
    cv.width = w * dpr; cv.height = h * dpr;
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    /* Peaks are written during ingest, but a project reaches here without them
       easily enough — seeded from a running order, or saved before they were
       stored. This used to `return` on that, leaving a blank white rectangle
       that looks exactly like a missing feature rather than missing data.
       If the audio is in memory, derive them now: a few milliseconds, and the
       waveform then appears whenever the audio is actually there. */
    if (!t.peaks && monos.has(t.id)) {
      t.peaks = Array.from(DSP.peaks(monos.get(t.id), 1400));
    }
    if (!t.peaks) {
      g.fillStyle = '#f7fbfa'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#93a8a6';
      g.font = '600 12px Montserrat, -apple-system, sans-serif';
      g.textAlign = 'center';
      g.fillText(t.linked ? 'Waveform loading…'
                          : 'Load this track’s audio to see its waveform',
                 w / 2, h / 2 + 4);
      g.textAlign = 'left';
      return;
    }

    g.fillStyle = '#c3d6d4';
    var n = t.peaks.length;
    for (var i = 0; i < w; i++) {
      var p = t.peaks[Math.floor(i / w * n)] || 0;
      var bh = Math.max(1, p * h * 0.92);
      g.fillRect(i, (h - bh) / 2, 1, bh);
    }
    var bpm = (t.sourceBpm || 0) * (t.bpmMultiplier || 1);
    var dur = t.durationSec;
    if (bpm > 0 && dur) {
      var spb = 60 / bpm, beat = 0;
      for (var s = t.downbeatSec; s < dur; s += spb, beat++) {
        var x = s / dur * w, bar = beat % 4 === 0;
        // Past a few thousand beats the grid is a solid wash; draw bars only.
        if (!bar && spb / dur * w < 3) continue;
        g.fillStyle = bar ? 'rgba(61,98,99,.45)' : 'rgba(61,98,99,.14)';
        g.fillRect(x, bar ? 0 : h * 0.35, 1, bar ? h : h * 0.3);
      }
      g.fillStyle = '#b07d2e'; g.fillRect(t.entrySec / dur * w - 1, 0, 3, h);
      g.fillStyle = '#b0392c'; g.fillRect(t.exitSec / dur * w - 1, 0, 3, h);
    }

    // The selected passage, if this track has one.
    var selIdx = project.tracks.indexOf(t);
    var selNow = selectionFor(selIdx);
    if (selNow && dur) {
      var sx = selNow.fromSec / dur * w, sw = (selNow.toSec - selNow.fromSec) / dur * w;
      g.fillStyle = 'rgba(61,98,99,.18)';
      g.fillRect(sx, 0, Math.max(2, sw), h);
      g.fillStyle = 'rgba(61,98,99,.9)';
      g.fillRect(sx, 0, 2, h);
      g.fillRect(sx + Math.max(2, sw) - 2, 0, 2, h);
    }

    // The playhead, so you can see as well as hear where you are.
    var idx = project.tracks.indexOf(t);
    var ph = playheadSecFor(idx);
    if (ph != null && dur && ph <= dur) {
      var x = ph / dur * w;
      g.fillStyle = 'rgba(20,32,31,.85)';
      g.fillRect(x - 1, 0, 2, h);
      g.beginPath();
      g.moveTo(x - 5, 0); g.lineTo(x + 5, 0); g.lineTo(x, 7);
      g.closePath(); g.fill();
    }
  }

  /* ----------------------------------------------- junction editor --- */

  function renderJunctionEditor() {
    var el = $('junction');
    if (openJunction == null || !lay.junctions[openJunction]) { el.innerHTML = ''; el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    var i = openJunction, j = lay.junctions[i], s = j.settings;
    var a = project.tracks[i], b = project.tracks[i + 1];
    var seg = segFor(i);

    var warn = '';
    if (!j.renderable) {
      // Reads apartPct straight off the junction — the same value the timeline
      // warning prints, so the two cannot say different things.
      warn = '<div class="warn"><strong>These two records are too far apart in tempo to play ' +
        'over each other.</strong> ' + esc(a.title) + ' runs at ' + Math.round(j.bpmA || 0) +
        ' BPM and ' + esc(b.title) + ' at ' + Math.round(j.bpmB || 0) + ' BPM. Pulling them ' +
        'together would mean stretching one by ' +
        (j.apartPct == null ? '?' : j.apartPct.toFixed(0)) + '%, and past about ' +
        (project.maxStretch * 100).toFixed(0) + '% a record starts to sound processed — so a ' +
        'blend will not work here.<br><br>Left as it is, the music will cut and the beat will ' +
        'carry on alone into ' + esc(b.title) + '. That works without the two ever having to ' +
        'match. You can also stop dead between them instead.' +
        ' <button class="ghost" data-act="accept-hardcut">Stop dead instead</button></div>';
    }

    el.innerHTML =
      '<div class="jx-head">' +
        '<div><span class="lbl">Junction ' + (i + 1) + '</span>' +
        '<h3>' + esc(a.title) + ' <span class="arrow">→</span> ' + esc(b.title) + '</h3>' +
        '<div class="jx-sub">' +
          (j.targetBpm ? 'Target ' + j.targetBpm + ' BPM · A ' + ((j.stretchA || 0) * 100).toFixed(1) +
            '% · B ' + ((j.stretchB || 0) * 100).toFixed(1) + '%' : 'No common tempo — nothing is stretched') +
        '</div></div>' +
        '<button class="ghost" data-act="close-junction">Close</button>' +
      '</div>' +
      warn +
      '<div class="seg">' + ['blend', 'throw-bridge', 'hard-cut'].map(function (ty) {
        return '<button class="' + (j.type === ty ? 'on' : '') + '" data-act="jtype" data-type="' + ty + '">' +
          ({ 'blend': 'Blend', 'throw-bridge': 'Bridge', 'hard-cut': 'Hard cut' })[ty] + '</button>';
      }).join('') + '</div>' +
      '<div class="grid">' + junctionFields(j, s) + '</div>' +
      '<div class="row">' +
        '<button data-act="render-junction"' + (canRender(i) ? '' : ' disabled') + '>' +
          (seg ? 'Re-render' : 'Render') + '</button>' +
        '<button class="ghost" data-act="play-junction"' + (seg ? '' : ' disabled') + '>Play</button>' +
        '<button class="ghost" data-act="hear-drums">Hear the drums</button>' +
        '<button class="ghost" data-act="stop">Stop</button>' +
        '<button class="ghost" data-act="dl-junction"' + (seg ? '' : ' disabled') + '>Download WAV</button>' +
      '</div>' +
      '<div class="status" id="jxStatus">' + (seg ? segSummary(seg) : '') + '</div>';
  }

  /* Sixteen beats of the fill on its own, at this junction's own tempo, with
     whatever the pattern, tone and volume are set to right now.

     Setting a kit by numbers does not work — nobody can hear a shelf at 140 Hz
     by reading "+4 dB". Rendering the whole junction to hear it is thirty
     seconds of waiting for a decision that takes two. This synthesises only
     the drums, which is arithmetic and an EQ pass, so it comes back at once.

     It uses the outgoing record's audio when it is loaded, because that is what
     the pattern is matched against and what the volume is set relative to, but
     it works without it: a pattern chosen by hand needs nothing from the
     record at all. */
  async function hearDrums(i) {
    var j = project.junctions[i];
    var s = j || {};
    var a = project.tracks[i], b = project.tracks[i + 1];
    var say = function (m, bad) {
      var el = $('jxStatus');
      if (el) { el.textContent = m; el.classList.toggle('err', !!bad); }
    };
    var fromBpm = MP.effectiveBpm(a) || 120;
    var toBpm = MP.effectiveBpm(b) || fromBpm;
    var src = buffers.get(a && a.id);

    if (!src && (!s.drumPattern || s.drumPattern === 'auto')) {
      say('Load this track\'s audio, or pick a drum pattern by name, and I can play it.', true);
      return;
    }

    say('Building the drums…');
    try {
      var fill = await DSP.buildBeatFill({
        source: src || null,
        atSec: a ? (a.exitSec || 0) : 0,
        downbeatSec: (a && a.downbeatSec) || 0,
        beats: 16, preBeats: 0, overBeats: 0,
        patternId: s.drumPattern || 'auto',
        fromBpm: fromBpm, toBpm: fromBpm,     // one tempo: this is the kit, not the walk
        gainDb: s.fillGainDb == null ? -1.5 : s.fillGainDb,
        lowDb: s.fillLowDb, midDb: s.fillMidDb, highDb: s.fillHighDb,
        reverbPct: s.fillReverb, reverbBeats: s.fillReverbBeats,
        sampleRate: (src && src.sampleRate) || audioCtx().sampleRate
      });
      if (!fill) { say('Could not build the drums for this junction.', true); return; }
      play(fill);
      say((fill.matchedName || 'Drums') + ' at ' + Math.round(fromBpm) + ' BPM, 16 beats' +
          (fill.matchScore != null ? ' — matched to this record at ' + fill.matchScore : '') +
          '. Press Stop to cut it short.');
    } catch (err) {
      say(err.message || String(err), true);
    }
  }

  function canRender(i) {
    var a = project.tracks[i], b = project.tracks[i + 1];
    return a && b && a.linked && b.linked && buffers.has(a.id) && buffers.has(b.id) &&
           lay.junctions[i] && lay.junctions[i].renderable;
  }

  function jf(label, f, value, step, min, max) {
    return '<div><label class="lbl">' + label + '</label>' +
      '<input type="number" step="' + (step || 1) + '"' +
      (min != null ? ' min="' + min + '"' : '') + (max != null ? ' max="' + max + '"' : '') +
      ' value="' + esc(value) + '" data-jf="' + f + '"></div>';
  }
  function jsel(label, f, value, opts) {
    return '<div><label class="lbl">' + label + '</label><select data-jf="' + f + '">' +
      opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (value === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>';
  }

  function junctionFields(j, s) {
    if (j.type === 'hard-cut') {
      return jf('Gap (ms)', 'gapMs', s.gapMs || 0, 50, 0, 8000) +
        '<div class="span2 hint">A gap of 0 puts B on the next bar line. The cake wants a real ' +
        'stop — nothing is matched across it.</div>';
    }
    if (j.type === 'blend') {
      return jf('Length (bars)', 'bars', s.bars || 16, 2, 2, 64) +
        jf('Bass swap (dB)', 'bassCutDb', s.bassCutDb == null ? 20 : s.bassCutDb, 1, 0, 36) +
        '<div class="span2 hint">Equal-power crossfade with the bass handed over halfway. ' +
        'Keep it to 8–16 bars: over that length a human drummer\'s tempo drift is a few ' +
        'milliseconds, which is why none of this needs variable-rate warping.</div>';
    }
    return jsel('Music out', 'cutStyle', s.cutStyle || 'throw',
        [['throw', 'Cut + reverb throw'], ['fade', 'Filter fade']]) +
      jf('Reverb tail (bars)', 'reverbBars', s.reverbBars == null ? 2 : s.reverbBars, 0.5, 0.5, 8) +
      jf('Drums between (beats)', 'beatBeats', fillBeatsOfUI(s), 4, 4, 256) +
      jsel('Drum pattern', 'drumPattern', s.drumPattern || 'auto',
           [['auto', 'Match the song']].concat(DSP.drumPatterns().map(function (p) {
             return [p.id, p.name];
           }))) +
      jf('Start before the join (beats)', 'preBeats',
         s.preBeats == null ? 8 : s.preBeats, 1, 0, 64) +
      jsel('Carry into the next track', 'carryMode', s.carryMode || 'auto',
        [['auto', 'Until its own drums start'], ['fixed', 'A set number of beats']]) +
      jf('…that many beats', 'overBeats', s.overBeats == null ? 8 : s.overBeats, 1, 0, 64) +
      '<div class="span2 hint">The drums come up under the outgoing record for the beats before ' +
      'the join, while it fades out, so the two cross rather than one stopping and the other ' +
      'starting. At the far end they carry on under the next record — by default until that ' +
      'record\'s own drums arrive, which is measured from the audio, so a track that opens on a ' +
      'pad or a fade is covered.</div>' +
      jf('Drum volume (dB)', 'fillGainDb',
         s.fillGainDb == null ? -1.5 : s.fillGainDb, 1, -24, 6) +
      jf('Reverb (%)', 'fillReverb', s.fillReverb == null ? 0 : s.fillReverb, 5, 0, 80) +
      jf('Reverb length (beats)', 'fillReverbBeats',
         s.fillReverbBeats == null ? 1 : s.fillReverbBeats, 0.5, 0.25, 8) +
      jf('Bass (dB)', 'fillLowDb', s.fillLowDb == null ? 0 : s.fillLowDb, 1, -18, 12) +
      jf('Mids (dB)', 'fillMidDb', s.fillMidDb == null ? 0 : s.fillMidDb, 1, -18, 12) +
      jf('Highs (dB)', 'fillHighDb', s.fillHighDb == null ? 0 : s.fillHighDb, 1, -18, 12) +
      '<div class="span2 hint">Volume is set against the record the drums follow, so 0 dB ' +
      'is as loud as that record and −6 sits them well under it. EQ and reverb apply to the ' +
      'drums only, not to either record. ' +
      'The kit is synthesised so it arrives dry and flat, which is right for control and wrong ' +
      'for sitting next to a mastered record — a shelf on the bottom for weight, a dip in the ' +
      'middle to make room for what is playing, and a short tail so it is not stuck to the ' +
      'speaker. All of it is off unless you turn it on.</div>';
  }

  function segSummary(seg) {
    var n = seg.info;
    var out = 'Rendered ' + fmt(seg.buffer.duration) + '.';
    if (n.targetBpm) out += ' ' + n.targetBpm + ' BPM, A stretched ' +
      ((n.ratioA - 1) * 100).toFixed(1) + '%, B ' + ((n.ratioB - 1) * 100).toFixed(1) + '%.';
    if (n.reducedDb) out += ' Peak was ' + n.peak.toFixed(2) + ', pulled down ' +
      (-n.reducedDb).toFixed(1) + ' dB.';
    if (n.quiet) out = 'Rendered, but the beat-only stretch is nearly silent (' +
      n.beatDb.toFixed(0) + ' dBFS) — it is landing in a fade-out. Move track A\'s mix-out marker ' +
      'somewhere the drums are still going.';
    return out;
  }

  /* ------------------------------------------------- junction render --- */

  async function renderJunction(i) {
    if (!canRender(i)) return;
    var j = lay.junctions[i];
    var a = project.tracks[i], b = project.tracks[i + 1];
    var key = MP.junctionCacheKey(project, i);
    var st = $('jxStatus');
    var say = function (m) { if (st) st.textContent = m; };

    var cached = segments.get(key);
    if (cached) { say(segSummary(cached)); return; }

    var deckA = {
      buffer: buffers.get(a.id),
      bpm: (a.sourceBpm || 0) * (a.bpmMultiplier || 1),
      downbeatSec: a.downbeatSec, entrySec: a.entrySec, exitSec: a.exitSec
    };
    var deckB = {
      buffer: buffers.get(b.id),
      bpm: (b.sourceBpm || 0) * (b.bpmMultiplier || 1),
      downbeatSec: b.downbeatSec, entrySec: b.entrySec, exitSec: b.exitSec
    };

    var opts = Object.assign({}, j.settings, {
      ctx: audioCtx(), a: deckA, b: deckB, targetBpm: j.targetBpm, onStatus: say
    });

    try {
      var res = await DSP.renderJunction(j.type, opts);
      segments.set(key, { buffer: res.buffer, info: res.info });
      renderJunctionEditor();
      renderTimeline();
    } catch (err) {
      say(err.message || String(err));
      if (st) st.classList.add('err');
    }
  }

  /* --------------------------------------------------- grid audition --- */

  async function checkGrid(i) {
    var t = project.tracks[i];
    var buf = buffers.get(t.id);
    if (!buf) return;
    var bpm = (t.sourceBpm || 0) * (t.bpmMultiplier || 1);
    if (!bpm) return;
    setStatus('Rendering 8 bars with clicks…');
    var spb = 60 / bpm, bars = 8, dur = spb * 4 * bars;
    var start = Math.min(t.downbeatSec, Math.max(0, buf.duration - dur));
    var sr = buf.sampleRate;
    var off = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
    var src = off.createBufferSource(); src.buffer = buf;
    var g = off.createGain(); g.gain.value = 0.7;
    src.connect(g).connect(off.destination);
    src.start(0, start, dur);
    for (var b = 0; b < bars * 4; b++) {
      var at = b * spb;
      if (at >= dur) break;
      var o = off.createOscillator(), cg = off.createGain();
      o.frequency.value = (b % 4 === 0) ? 1600 : 900;
      cg.gain.setValueAtTime(0.0001, at);
      cg.gain.exponentialRampToValueAtTime(0.35, at + 0.002);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
      o.connect(cg).connect(off.destination);
      o.start(at); o.stop(at + 0.06);
    }
    play(await off.startRendering());
    setStatus('Playing 8 bars from ' + start.toFixed(2) + 's. The clicks should land on the beat; ' +
              'if they drift off the snare, correct the BPM or downbeat by hand.');
  }

  function play(buffer) {
    stop();
    playing = audioCtx().createBufferSource();
    playing.buffer = buffer;
    playing.connect(audioCtx().destination);
    playing.start();
    playing.onended = function () { if (!playhead.raf) return; stopPlayhead(); };
  }

  function stop() {
    if (playing) { try { playing.stop(); } catch (e) {} playing = null; }
    stopPlayhead();
    var b = $('stopAllBtn');
    if (b) b.disabled = true;
  }

  /* ------------------------------------------------- audition --- */
  /* Hearing where the cursor is, which is the only way to find the point you
     actually want to trim on. Auto-detected entry and mix-out markers are a
     starting guess — on a real record they land in an intro, a fade or the
     wrong bar, and the only way to know is to listen from there. */

  var waveClickTimer = null;
  var suppressWaveClick = false;
  var playhead = { track: null, startCtxTime: 0, offsetSec: 0, raf: 0 };

  function stopPlayhead() {
    if (playhead.raf) cancelAnimationFrame(playhead.raf);
    playhead.raf = 0;
    var i = playhead.track;
    playhead.track = null;
    if (i != null && openTrack === i) {
      var cv = document.querySelector('.trk[data-track="' + i + '"] canvas.wave');
      if (cv) drawWave(cv, project.tracks[i]);
    }
  }

  /** Play one track from an arbitrary point, with a moving playhead. */
  function playFrom(i, sec) {
    var t = project.tracks[i];
    var buf = buffers.get(t.id);
    if (!buf) { setStatus('No audio loaded for "' + t.title + '".', true); return; }
    var from = Math.max(0, Math.min(buf.duration - 0.05, sec || 0));
    stop();
    var ctxx = audioCtx();
    playing = ctxx.createBufferSource();
    playing.buffer = buf;
    playing.connect(ctxx.destination);
    playing.start(0, from);
    playing.onended = function () { stopPlayhead(); var b = $('stopAllBtn'); if (b) b.disabled = true; };

    playhead.track = i;
    playhead.startCtxTime = ctxx.currentTime;
    playhead.offsetSec = from;

    var btn = $('stopAllBtn');
    if (btn) btn.disabled = false;
    setStatus('Playing "' + t.title + '" from ' + fmtSec(from) + '. Stop when you have heard enough.');

    var tick = function () {
      if (playhead.track !== i) return;
      var cv = document.querySelector('.trk[data-track="' + i + '"] canvas.wave');
      if (cv) drawWave(cv, t);
      playhead.raf = requestAnimationFrame(tick);
    };
    playhead.raf = requestAnimationFrame(tick);
  }

  function playheadSecFor(i) {
    if (playhead.track !== i || !ctx) return null;
    return playhead.offsetSec + (ctx.currentTime - playhead.startCtxTime);
  }

  var fmtSec = function (s) {
    var m = Math.floor(s / 60), ss = (s % 60);
    return m + ':' + (ss < 10 ? '0' : '') + ss.toFixed(1);
  };

  function download(buffer, name) {
    var url = URL.createObjectURL(DSP.encodeWav(buffer));
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  /* -------------------------------------------------------- events --- */

  function closePanels() { openJunction = null; openTrack = null; }

  function wire() {
    var drop = $('drop'), fileInput = $('file');
    drop.onclick = function () { fileInput.click(); };
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = function () { drop.classList.remove('over'); };
    drop.ondrop = function (e) {
      e.preventDefault(); drop.classList.remove('over');
      ingestFiles(e.dataTransfer.files);
    };
    fileInput.onchange = function () { ingestFiles(fileInput.files); };

    $('importBtn').onclick = function () { $('importPanel').classList.toggle('hidden'); };
    $('cancelImport').onclick = function () { $('importPanel').classList.add('hidden'); };

    /* The running order comes straight from the .xlsx. It is read here rather
       than converted outside first, because the point is to point the program
       at the sheet and the folder and have a project. */
    $('pickOrderFile').onclick = function () { $('orderFile').click(); };
    $('orderFile').onchange = function (ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = '';                       // so the same file can be re-chosen
      if (!f) return;
      $('orderFileName').textContent = 'reading ' + f.name + '…';
      f.arrayBuffer().then(function (ab) {
        return MP.readWorkbook(ab);
      }).then(function (wb) {
        if (!wb.tracks.length) {
          $('orderFileName').textContent = '';
          setStatus('No track list found in ' + f.name + '. Sheets in that file: ' +
                    (wb.sheets.join(', ') || 'none') + '. It needs a column headed ' +
                    'Track, Title or Song.', true);
          return;
        }
        $('orderFileName').textContent = f.name + ' — ' + wb.sheets.length +
          (wb.sheets.length === 1 ? ' sheet' : ' sheets') + ', read "' + wb.sheetUsed + '"';
        if (importTab === 'bench') importBench(wb);
        else importRunningOrder(wb);
      }).catch(function (e) {
        $('orderFileName').textContent = '';
        setStatus('Could not read ' + f.name + ': ' + e.message, true);
      });
    };
    $('doImport').onclick = function () {
      if (importTab === 'bench') importBench($('importText').value);
      else importRunningOrder($('importText').value);
    };
    ['tabOrder', 'tabBench'].forEach(function (id) {
      $(id).onclick = function () {
        importTab = $(id).dataset.tab;
        $('tabOrder').classList.toggle('on', importTab === 'order');
        $('tabBench').classList.toggle('on', importTab === 'bench');
        $('importLabel').textContent = importTab === 'bench' ? 'Swap-ins / bench' : 'Running order';
        $('importText').placeholder = importTab === 'bench'
          ? 'Track\tArtist\tYear\tBPM\tFits section\nMaster Blaster (Jammin\')\tStevie Wonder\t1980\t96\tWarm-up'
          : '#\tTrack\tArtist\tBPM\tSection\tMix\tNote\n1\tGroove Thang\tZhane\t104\tWarm-up\tOPENER\tYour opener';
      };
    });

    $('suggestBtn').onclick = showSuggestion;

    /* Timeline zoom as a control, not a keystroke. At 100% a 47-track set puts
       each junction marker 3 px wide; widening the strip makes them clickable
       without anyone having to know about Ctrl and the plus key. */
    var zoomEl = $('tlZoom');
    if (zoomEl) {
      zoomEl.oninput = function () {
        tlZoom = parseInt(zoomEl.value, 10) || 100;
        var out = $('tlZoomVal');
        if (out) out.textContent = tlZoom + '%';
        renderTimeline();
      };
    }

    // Offline badge: the tool is fully usable without a connection, so this is
    // information rather than a warning.
    var setOnline = function () {
      var el = $('offline');
      if (el) el.hidden = navigator.onLine;
    };
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOnline);
    setOnline();

    $('resetBtn').onclick = function () {
      if (!confirm('Discard this project and start again? Analysis stays cached, so re-importing is quick.')) return;
      project = MP.emptyProject();
      buffers.clear(); monos.clear(); segments.clear();
      closePanels();
      MP.clearSegments();
      touch();
      setStatus('Project cleared.');
    };

    $('exportBtn').onclick = function () {
      var blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = (project.name || 'mix').replace(/\s+/g, '-') + '.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    };

    $('nameInput').oninput = function () { project.name = $('nameInput').value; save(); };

    // Timeline clicks.
    $('timeline').addEventListener('click', function (e) {
      var j = e.target.closest('[data-junction]');
      if (j) {
        openJunction = +j.dataset.junction; openTrack = null;
        renderAll();
        $('junction').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      var t = e.target.closest('[data-track]');
      if (t) {
        openTrack = openTrack === +t.dataset.track ? null : +t.dataset.track;
        openJunction = null;
        renderAll();
      }
    });

    // Track list: open/close, field edits, waveform clicks, buttons.
    var tracksEl = $('tracks');
    tracksEl.addEventListener('click', function (e) {
      /* Resolve the action from the nearest element that carries one, not from
         whichever pixel was hit. A button with a label and a caret inside it
         reports the span as e.target, and reading dataset.act off that does
         nothing at all — indistinguishable from a dead control. */
      var actEl = e.target.closest ? e.target.closest('[data-act]') : null;
      var act = actEl ? actEl.dataset.act : null;
      if (act) {
        var i = +actEl.dataset.track;
        if (act === 'half') { setMultiplier(i, 0.5); }
        if (act === 'double') { setMultiplier(i, 2); }
        if (act === 'checkgrid') { checkGrid(i); }
        if (act === 'up' && i > 0) { moveTo(i, i - 1); }
        if (act === 'down' && i < project.tracks.length - 1) { moveTo(i, i + 1); }
        if (act === 'pin') {
          project.tracks[i].pinned = !project.tracks[i].pinned;
          touch();
        }
        if (act === 'bench') {
          MP.benchTrack(project, i);
          if (openTrack === i) openTrack = null;
          openJunction = null;
          setStatus('"' + project.bench[project.bench.length - 1].title +
                    '" moved to the bench. Swap it back in any time.');
          touch();
        }
        if (act === 'swap') { openSwap(i); }
        if (act === 'open-jrow') {
          var jn = +actEl.dataset.junction;
          openJunction = (openJunction === jn) ? null : jn;
          openTrack = null;
          renderAll();
          var row = document.querySelector('.jrow[data-jrow="' + jn + '"]');
          if (row && openJunction != null) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
        if (act === 'regions-on') { startRegions(i); }
        if (act === 'regions-off') { project.tracks[i].regions = null; touch(); }
        if (act === 'region-add') { addRegion(i); }
        if (act === 'region-del') { delRegion(i, +actEl.dataset.region); }
        if (act === 'region-up') { moveRegion(i, +actEl.dataset.region); }
        if (act === 'play-here') { playFrom(i, project.tracks[i].entrySec || 0); return; }
        if (act === 'play-exit') {
          var xt = project.tracks[i];
          playFrom(i, Math.max(0, (xt.exitSec || 0) - 8));
          return;
        }
        if (act === 'stop-all') { stop(); setStatus('Stopped.'); return; }
        if (act === 'cut-sample') { cutSample(i); return; }
        if (act === 'clear-sel') { clearSelection(i); renderAll(); setStatus(''); return; }
        if (act === 'play-sel') {
          var ps = selectionFor(i);
          if (ps) playFrom(i, ps.fromSec); else setStatus('Nothing selected yet.', true);
          return;
        }
        return;
      }
      if (e.target.matches('canvas.wave')) return;    // handled below
      if (e.target.closest('input, select, button')) return;
      var head = e.target.closest('.trk-head');
      if (head) {
        var idx = +head.parentElement.dataset.track;
        openTrack = openTrack === idx ? null : idx;
        openJunction = null;
        renderAll();
      }
    });

    tracksEl.addEventListener('click', function (e) {
      if (!e.target.matches('canvas.wave')) return;
      if (suppressWaveClick) { suppressWaveClick = false; return; }   // this was a drag
      var i = +e.target.closest('[data-track]').dataset.track;
      var t = project.tracks[i];
      if (!t.durationSec) return;
      var r = e.target.getBoundingClientRect();
      var sec = (e.clientX - r.left) / r.width * t.durationSec;
      var shift = e.shiftKey;

      /* Setting the marker is DEFERRED so a double-click can cancel it.
         Without the delay, the first click of a pair sets a marker and calls
         touch(), which re-renders the list and destroys this very canvas — so
         the second click lands on a detached element and the audition never
         fires at all. */
      if (waveClickTimer) clearTimeout(waveClickTimer);
      waveClickTimer = setTimeout(function () {
        waveClickTimer = null;
        var snapped = snapToBar(t, sec);
        if (shift) t.exitSec = snapped; else t.entrySec = snapped;
        touch();
      }, 220);
    });

    /* Drag across the waveform to select a passage for a sample. A drag is
       distinguished from a click by distance, and a real drag suppresses the
       pending marker-set so the two gestures never fight. */
    tracksEl.addEventListener('mousedown', function (e) {
      if (!e.target.matches('canvas.wave')) return;
      var i = +e.target.closest('[data-track]').dataset.track;
      var t = project.tracks[i];
      if (!t.durationSec) return;
      var r = e.target.getBoundingClientRect();
      dragSel = { track: i, startX: e.clientX, rect: r, moved: false, canvas: e.target };
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragSel) return;
      if (Math.abs(e.clientX - dragSel.startX) < 5) return;
      dragSel.moved = true;
      var t = project.tracks[dragSel.track];
      var r = dragSel.rect;
      var at = function (x) {
        return Math.max(0, Math.min(t.durationSec, (x - r.left) / r.width * t.durationSec));
      };
      selection = { track: dragSel.track,
                    fromSec: snapToBar(t, at(dragSel.startX)),
                    toSec: snapToBar(t, at(e.clientX)) };
      drawWave(dragSel.canvas, t);
    });

    window.addEventListener('mouseup', function () {
      if (!dragSel) return;
      var moved = dragSel.moved, i = dragSel.track;
      dragSel = null;
      if (!moved) return;
      /* A drag is not a click. The click event arrives AFTER this, so clearing
         the timer here is not enough — it would just be set again and quietly
         move the entry marker to wherever the drag ended. Suppress the next one
         outright. */
      if (waveClickTimer) { clearTimeout(waveClickTimer); waveClickTimer = null; }
      suppressWaveClick = true;
      var sel = selectionFor(i);
      if (sel) {
        renderAll();
        setStatus('Selected ' + sel.bars + ' bar' + (sel.bars === 1 ? '' : 's') +
                  ' from ' + fmtSec(sel.fromSec) + '. Name it and press "Save to library".');
      }
    });

    /* Double-click plays from exactly where you clicked, NOT snapped to the bar
       — you are listening for the moment, not for the grid. */
    tracksEl.addEventListener('dblclick', function (e) {
      if (!e.target.matches('canvas.wave')) return;
      if (waveClickTimer) { clearTimeout(waveClickTimer); waveClickTimer = null; }
      var i = +e.target.closest('[data-track]').dataset.track;
      var t = project.tracks[i];
      if (!t.durationSec) return;
      var r = e.target.getBoundingClientRect();
      playFrom(i, (e.clientX - r.left) / r.width * t.durationSec);
    });

    tracksEl.addEventListener('change', function (e) {
      var rf = e.target.dataset.rf;
      if (rf) {
        var ti = +e.target.dataset.track, ri = +e.target.dataset.region;
        var tr = project.tracks[ti], reg = tr.regions && tr.regions[ri];
        if (!reg) return;
        var val = parseFloat(e.target.value);
        if (!isFinite(val)) return;
        var bpm2 = (tr.sourceBpm || 0) * (tr.bpmMultiplier || 1);
        var bs = bpm2 ? 60 / bpm2 * 4 : 2;
        if (rf === 'startBar') reg.startSec = Math.max(0, tr.downbeatSec + (val - 1) * bs);
        if (rf === 'bars') reg.bars = Math.max(1, Math.round(val));
        touch();
        return;
      }
      var f = e.target.dataset.f;
      if (!f) return;
      var i = +e.target.dataset.track, t = project.tracks[i];
      var v = parseFloat(e.target.value);
      if (!isFinite(v)) return;
      t[f] = v;
      if (f === 'sourceBpm') t.bpmLocked = true;      // corrected by hand; never re-detect
      touch();
    });

    // Junction editor.
    $('junction').addEventListener('click', function (e) {
      var act = e.target.dataset.act;
      if (!act) return;
      if (act === 'close-junction') { openJunction = null; renderAll(); }
      if (act === 'jtype') {
        project.junctions[openJunction] = MP.defaultJunction(e.target.dataset.type);
        touch();
      }
      if (act === 'accept-hardcut') {
        project.junctions[openJunction] = MP.defaultJunction('hard-cut');
        touch();
      }
      if (act === 'render-junction') renderJunction(openJunction);
      // fire and forget, exactly as render-junction above: hearDrums reports
      // its own errors to the status line rather than throwing into a listener.
      if (act === 'hear-drums') { hearDrums(openJunction); return; }
      if (act === 'play-junction') { var s = segFor(openJunction); if (s) play(s.buffer); }
      if (act === 'stop') stop();
      if (act === 'dl-junction') {
        var sg = segFor(openJunction);
        if (sg) download(sg.buffer, 'junction-' + (openJunction + 1) + '.wav');
      }
    });

    $('junction').addEventListener('change', function (e) {
      var f = e.target.dataset.jf;
      if (f == null) return;
      var s = project.junctions[openJunction];
      s[f] = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
      touch();
    });

    /* Drag a track row to reorder. The drop target is decided by which half of
       the row the pointer is over, so dropping "between" two rows is
       unambiguous rather than a guess. */
    tracksEl.addEventListener('dragstart', function (e) {
      /* The row is draggable so it can be reordered, which means a drag that
         starts ANYWHERE inside it — including across the waveform — becomes a
         native HTML5 drag. That swallows mouseup and click completely, so a
         selection drag would set a selection and then never finish: no panel,
         no status, and the entry marker left wherever the pointer stopped.
         A drag beginning on the waveform is a selection, not a reorder. */
      /* NOTE: dragstart's target is the draggable ROW, never the inner element
         the pointer is actually over — so testing e.target for the canvas does
         not work. dragSel is set on mousedown and is the only thing that knows
         where the gesture began. */
      if (dragSel) {
        e.preventDefault();
        return;
      }
      var row = e.target.closest('.trk');
      if (!row) return;
      dragFrom = +row.dataset.track;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (err) {}
    });
    tracksEl.addEventListener('dragend', function () {
      dragFrom = null;
      Array.prototype.forEach.call(tracksEl.querySelectorAll('.trk'), function (r) {
        r.classList.remove('dragging', 'drop-above', 'drop-below');
      });
    });
    tracksEl.addEventListener('dragover', function (e) {
      if (dragFrom == null) return;
      e.preventDefault();
      var row = e.target.closest('.trk');
      Array.prototype.forEach.call(tracksEl.querySelectorAll('.trk'), function (r) {
        r.classList.remove('drop-above', 'drop-below');
      });
      if (!row) return;
      var r = row.getBoundingClientRect();
      row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-above' : 'drop-below');
    });
    tracksEl.addEventListener('drop', function (e) {
      if (dragFrom == null) return;
      e.preventDefault();
      var row = e.target.closest('.trk');
      if (!row) return;
      var to = +row.dataset.track;
      var rect = row.getBoundingClientRect();
      var below = e.clientY >= rect.top + rect.height / 2;
      if (below && to < dragFrom) to += 1;
      if (!below && to > dragFrom) to -= 1;
      var from = dragFrom;
      dragFrom = null;
      if (from !== to) moveTo(from, to);
      else renderAll();
    });

    wireBench();
    wireSuggest();
    wireRender();
    wireSamples();
    wireDesktop();

    window.addEventListener('resize', function () {
      if (openTrack == null) return;
      var cv = document.querySelector('.trk[data-track="' + openTrack + '"] canvas');
      if (cv) drawWave(cv, project.tracks[openTrack]);
    });
  }

  function importBench(text) {
    var items;
    try { items = MP.parseBench(text); }
    catch (e) { setStatus('Could not read that: ' + e.message, true); return; }
    if (!items.length) { setStatus('No rows found. Include the header line.', true); return; }
    project.bench = (project.bench || []).concat(items);
    $('importPanel').classList.add('hidden');
    setStatus(items.length + ' alternates added to the bench.');
    touch();
  }

  /* Halve / Double pins the track: autoOctave then fits the rest of the set
     around that choice instead of overruling it. Pressing the same button again
     releases the pin and hands the track back to automatic choice. */
  function setMultiplier(i, m) {
    var t = project.tracks[i];
    var pinned = (t.bpmMultiplier || 1) === m && t.bpmLocked;
    t.bpmMultiplier = pinned ? 1 : m;
    t.bpmLocked = !pinned;
    touch();
  }

  /* ------------------------------------------------------ regions --- */

  function barSecOf(t) {
    var bpm = (t.sourceBpm || 0) * (t.bpmMultiplier || 1);
    return bpm ? 60 / bpm * 4 : 2;
  }

  /* Seed an edit list from what the track already plays, so turning it on
     changes nothing until a part is actually edited. */
  function startRegions(i) {
    var t = project.tracks[i];
    var bs = barSecOf(t);
    var bars = Math.max(1, Math.round(((t.exitSec || t.durationSec) - (t.entrySec || 0)) / bs));
    t.regions = [{ startSec: t.entrySec || 0, bars: bars }];
    setStatus('"' + t.title + '" is now an edit list of one part. Add another to cut between them.');
    touch();
  }

  function addRegion(i) {
    var t = project.tracks[i];
    if (!t.regions) return startRegions(i);
    var last = t.regions[t.regions.length - 1];
    t.regions.push({ startSec: last.startSec, bars: Math.min(8, last.bars) });
    touch();
  }

  function delRegion(i, ri) {
    var t = project.tracks[i];
    if (!t.regions || t.regions.length < 2) return;
    t.regions.splice(ri, 1);
    touch();
  }

  function moveRegion(i, ri) {
    var t = project.tracks[i];
    if (!t.regions || ri < 1) return;
    var r = t.regions.splice(ri, 1)[0];
    t.regions.splice(ri - 1, 0, r);
    touch();
  }

  /* ------------------------------------------ reorder and replace --- */

  function moveTo(from, to) {
    var title = project.tracks[from].title;
    MP.moveTrack(project, from, to);
    // Keep whatever the user had open pointing at the same track, not the same
    // slot — the slot now holds something else.
    if (openTrack === from) openTrack = to;
    else if (openTrack != null) openTrack = project.tracks.findIndex(function (t, i) { return i === openTrack; });
    openJunction = null;
    recompute();
    var kept = renderedCount();
    setStatus('Moved "' + title + '" to position ' + (to + 1) + '. ' +
              kept + ' junction render' + (kept === 1 ? '' : 's') + ' still valid.');
    touch();
  }

  function openSwap(i) {
    if (!(project.bench || []).length) {
      setStatus('The bench is empty. Import the Swap-ins sheet, or remove a track to put it there.', true);
      return;
    }
    openTrack = null; openJunction = null;
    swapTarget = i;
    renderAll();
    $('benchCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setStatus('Choose a track from the bench to replace "' + project.tracks[i].title + '".');
  }
  var swapTarget = null;

  /* ------------------------------------------------------- bench --- */

  function renderBench() {
    var el = $('bench');
    var count = $('benchCount');
    var bench = project.bench || [];
    if (count) count.textContent = bench.length ? bench.length : '';
    if (!el) return;
    if (!bench.length) {
      el.innerHTML = '<div class="bench-empty">Nothing on the bench. Import the Swap-ins sheet, ' +
        'or use Remove on any track to put it here.</div>';
      return;
    }
    var target = swapTarget != null && project.tracks[swapTarget];
    el.innerHTML =
      (target ? '<div class="warn">Replacing <strong>' + esc(target.title) + '</strong> — ' +
                'pick its replacement below. ' +
                '<button class="ghost" data-act="cancel-swap">Cancel</button></div>' : '') +
      bench.map(function (b, i) {
        return '<div class="bench-item" data-bench="' + i + '">' +
          '<span class="bench-title">' + esc(b.title) + '</span>' +
          (b.artist ? '<span class="trk-artist">' + esc(b.artist) + '</span>' : '') +
          (b.section ? '<span class="pill quiet">' + esc(b.section) + '</span>' : '') +
          '<span class="pill">' + (b.sourceBpm ? Math.round(b.sourceBpm) : '?') + ' BPM</span>' +
          '<span class="trk-tools">' +
            (target
              ? '<button data-act="do-swap" data-bench="' + i + '">Use this</button>'
              : '<button data-act="add-bench" data-bench="' + i + '" title="Add to the end of the set">Add</button>') +
            '<button data-act="drop-bench" data-bench="' + i + '" title="Delete permanently">✕</button>' +
          '</span>' +
        '</div>';
      }).join('');
  }

  function wireBench() {
    $('bench').addEventListener('click', function (e) {
      var act = e.target.dataset.act;
      if (!act) return;
      var bi = +e.target.dataset.bench;
      if (act === 'cancel-swap') { swapTarget = null; renderAll(); setStatus(''); return; }
      if (act === 'do-swap' && swapTarget != null) {
        var was = project.tracks[swapTarget].title;
        var now = project.bench[bi].title;
        MP.replaceTrack(project, swapTarget, bi);
        swapTarget = null;
        setStatus('Swapped "' + was + '" for "' + now + '". ' + was +
                  ' is on the bench if you want it back.');
        touch();
        return;
      }
      if (act === 'add-bench') {
        var t = project.bench.splice(bi, 1)[0];
        MP.insertTrack(project, project.tracks.length, Object.assign({}, t, { linked: false }));
        setStatus('Added "' + t.title + '" to the end. Drop its audio in to link it.');
        touch();
        return;
      }
      if (act === 'drop-bench') {
        var name = project.bench[bi].title;
        if (!confirm('Delete "' + name + '" from the bench for good?')) return;
        project.bench.splice(bi, 1);
        touch();
      }
    });
  }

  /* ------------------------------------------------- desktop app --- */
  /* Only active inside Electron. Everything below delegates to the existing
     ingest and re-link code — the audio just arrives from a path on disk
     instead of a drop, and the folder is remembered with the project so
     reopening restores the set without importing anything again. */

  function desktop() { return global.MixDesktop; }

  /* Remember where dropped files came from, so a drag-and-drop is as durable as
     a picked folder. Without this, dropping the folder in worked for the
     session and was forgotten on reload — which is the re-linking the desktop
     build exists to remove. Browser-only: a dropped File there has no path,
     and gigabytes of audio cannot be stored, so the web version still asks. */
  function rememberFolderFrom(files) {
    var D = desktop();
    if (!D || !D.pathForFile || project.audioFolder) return;
    for (var i = 0; i < files.length; i++) {
      var p = D.pathForFile(files[i]);
      var folder = D.folderOf(p);
      if (folder) { project.audioFolder = folder; save(); return; }
    }
  }

  async function chooseAudioFolder() {
    var D = desktop();
    if (!D) return;
    var folder = await D.pickFolder();
    if (!folder) return;
    project.audioFolder = folder;
    save();
    await loadFromFolder(folder, true);
  }

  /** Read the folder and hand the files to the same ingest path a drop uses. */
  async function loadFromFolder(folder, announce) {
    var D = desktop();
    if (!D || !folder) return;
    setStatus('Reading ' + folder + '…');
    var entries = await D.scanFolder(folder);
    if (!entries.length) {
      setStatus('No audio files in ' + folder, true);
      return;
    }
    setStatus('Found ' + entries.length + ' audio files. Loading…');
    var files = [];
    for (var i = 0; i < entries.length; i++) {
      try { files.push(await D.fileFor(entries[i])); }
      catch (err) { setStatus('Could not read ' + entries[i].name, true); }
    }
    if (!files.length) return;
    await ingestFiles(files);
    if (announce) {
      setStatus(files.length + ' tracks loaded from ' + folder +
                '. The folder is saved with the project — reopening will not ask again.');
    }
  }

  /* On launch, if the project remembers a folder, put the audio back without
     asking. This is the whole point of being a desktop app: no re-linking. */
  async function restoreAudioOnLaunch() {
    var D = desktop();
    if (!D || !project.audioFolder || !project.tracks.length) return;
    setStatus('Restoring audio from ' + project.audioFolder + '…');
    var entries = await D.scanFolder(project.audioFolder);
    if (!entries.length) {
      setStatus('The folder ' + project.audioFolder + ' is not there any more. ' +
                'Use "Audio folder" to point at it again.', true);
      return;
    }
    var files = [];
    for (var i = 0; i < entries.length; i++) {
      try { files.push(await D.fileFor(entries[i])); } catch (err) {}
    }
    if (files.length) await relinkFiles(files);
  }

  function wireDesktop() {
    var D = desktop();
    var bar = $('desktopBar');
    if (!D || !bar) return;
    bar.classList.remove('hidden');
    $('folderBtn').onclick = chooseAudioFolder;
    $('saveAsBtn').onclick = async function () {
      var p = await D.saveProjectAs(project);
      if (p) setStatus('Project saved to ' + p);
    };
    $('openProjBtn').onclick = async function () {
      var p = await D.openProjectFile();
      if (!p) return;
      project = p;
      buffers.clear(); monos.clear(); segments.clear();
      closePanels();
      recompute(); renderAll();
      $('nameInput').value = project.name || '';
      await restoreAudioOnLaunch();
      touch();
    };
  }

  /* --------------------------------------------------- samples --- */
  /* Samples are assets; placements are uses. Stored unstretched at their source
     tempo, because the same hook at a 108 BPM junction and a 124 BPM one needs
     two different stretches — the render works that out per placement from the
     tempo ramp. */

  var placingSample = null;
  var sampleList = [];
  var sampleBuffers = new Map();      // id -> decoded AudioBuffer
  var sampleMeta = new Map();         // id -> metadata, for the renderer

  async function loadSamples() {
    sampleList = await MP.listSamples();
    sampleMeta = new Map();
    for (var i = 0; i < sampleList.length; i++) {
      sampleMeta.set(sampleList[i].id, sampleList[i]);
    }
    renderSamples();
  }

  async function sampleAudioFor(id) {
    if (sampleBuffers.has(id)) return sampleBuffers.get(id);
    var blob = await MP.getSampleAudio(id);
    if (!blob) return null;
    var buf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
    sampleBuffers.set(id, buf);
    return buf;
  }

  /* Cut from the currently open track, starting at its entry point, bar-snapped.
     The processing baked in here is the part that does not vary per use. */
  /* Cut whatever is selected on the waveform.
     ------------------------------------------------------------------
     This used to take a bar count from a dropdown, always starting at the entry
     point, and ask for the name with window.prompt(). Two things wrong with
     that. You could not choose the passage you actually wanted — and prompt()
     THROWS in Electron ("prompt() is not supported"), so the drums question got
     answered and then the sample vanished without a word. Name and options are
     ordinary fields now, and nothing here opens a dialog. */
  async function cutSample(trackIndex) {
    var t = project.tracks[trackIndex];
    var buf = buffers.get(t.id);
    if (!buf) { setStatus('That track has no audio loaded.', true); return; }
    var sel = selectionFor(trackIndex);
    if (!sel) { setStatus('Drag across the waveform to choose the part you want first.', true); return; }

    var nameEl = $('sampleName' + trackIndex);
    var drumsEl = $('sampleDrums' + trackIndex);
    var name = (nameEl && nameEl.value.trim()) || (t.title + ' ' + sel.bars + ' bars');
    var removeDrums = !!(drumsEl && drumsEl.checked);
    var opts = { removeDrums: removeDrums, removalAmount: 2, highPassHz: removeDrums ? 120 : 0 };

    setStatus('Cutting ' + sel.bars + ' bars from "' + t.title + '"' +
              (removeDrums ? ', taking the drums out' : '') + '…');
    var raw = DSP.slice(audioCtx(), buf, sel.fromSec, sel.toSec - sel.fromSec);
    var prepared = await DSP.prepareSample(audioCtx(), raw, opts);

    var meta = {
      name: name, tags: [],
      sourceFile: t.file, sourceTrackId: t.id,
      sourceStartSec: sel.fromSec, bars: sel.bars,
      sourceBpm: (t.sourceBpm || 0) * (t.bpmMultiplier || 1),
      processing: opts
    };
    var saved = await MP.saveSample(meta, DSP.encodeWav(prepared));
    sampleBuffers.set(saved.id, prepared);
    clearSelection(trackIndex);
    await loadSamples();
    renderAll();
    setStatus('Saved "' + name + '" to the sample library — ' + sel.bars + ' bars at ' +
              meta.sourceBpm.toFixed(1) + ' BPM, ready to place at any junction.');
    var card = $('sampleCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ------------------------------------------- waveform selection --- */
  /* Drag across the waveform to choose a passage, bar-snapped — a sample that
     does not start on a bar line cannot be dropped in time. */

  var selection = null;      // { track, fromSec, toSec }
  var dragSel = null;        // drag in progress

  function selectionFor(i) {
    if (!selection || selection.track !== i) return null;
    var t = project.tracks[i];
    var bs = barSecOf(t);
    var from = Math.min(selection.fromSec, selection.toSec);
    var to = Math.max(selection.fromSec, selection.toSec);
    var bars = Math.max(1, Math.round((to - from) / bs));
    return { fromSec: from, toSec: from + bars * bs, bars: bars };
  }

  function clearSelection(i) {
    if (selection && (i == null || selection.track === i)) selection = null;
  }

  function renderSamples() {
    var el = $('samples');
    var count = $('sampleCount');
    if (count) count.textContent = sampleList.length ? sampleList.length : '';
    if (!el) return;
    if (!sampleList.length) {
      el.innerHTML = '<div class="bench-empty">No samples yet. Open a track and use ' +
        '<strong>Cut sample</strong> to take a hook, a stab or a riser out of it.</div>';
      return;
    }
    el.innerHTML = sampleList.map(function (s) {
      var uses = MP.sampleUsage(project, s.id);
      return '<div class="bench-item" data-sample="' + esc(s.id) + '">' +
        '<span class="bench-title">' + esc(s.name) + '</span>' +
        '<span class="pill quiet">' + (s.bars || '?') + ' bars</span>' +
        '<span class="pill">' + (s.sourceBpm ? Math.round(s.sourceBpm) + ' BPM' : 'one-shot') + '</span>' +
        (uses ? '<span class="pill hi">used ' + uses + '×</span>' : '') +
        '<span class="trk-tools">' +
          '<button data-act="sample-play" data-sample="' + esc(s.id) + '">Audition</button>' +
          '<button data-act="sample-place" data-sample="' + esc(s.id) + '">' +
            (placingSample === s.id ? 'Cancel' : 'Place…') + '</button>' +
          '<button data-act="sample-del" data-sample="' + esc(s.id) + '">✕</button>' +
        '</span>' +
        (placingSample === s.id ? placerHtml(s) : '') +
      '</div>';
    }).join('') + renderPlacementList();

    // The strip only exists while a sample is being placed, and it has to be
    // measured after it is in the document to know how wide a bar is.
    if (placingSample) { wirePlaceStrip(); drawPlaceStrip(); }
  }

  /* Where a sample goes, how far in, and how loud. */
  function placerHtml(s) {
    var opts = lay.junctions.map(function (j, i) {
      var a = project.tracks[i], b = project.tracks[i + 1];
      return '<option value="' + i + '">' + (i + 1) + '. ' + esc(a.title) +
             ' → ' + esc(b.title) + '</option>';
    }).join('');
    var bars = Math.max(1, Math.round(s.bars || 1));
    return '<div class="placer">' +
      '<canvas id="placeStrip" class="place-strip"></canvas>' +
      '<div class="region-hint" style="margin:6px 0 12px">' +
        'Drag the <strong>' + bars + '-bar</strong> block to where you want it. It snaps to the bar. ' +
        'The join is the line down the middle: to the left is the track going out, ' +
        'to the right is the one coming in.</div>' +
      '<div class="grid">' +
        '<div style="grid-column:1/-1"><label class="lbl">At which junction</label>' +
          '<select id="placeJunction">' + opts + '</select></div>' +
        '<div><label class="lbl">Over or between</label>' +
          '<select id="placeMode">' +
            '<option value="over">Over the music</option>' +
            '<option value="between">In the gap between</option>' +
          '</select></div>' +
        '<div><label class="lbl">Bars before the next track</label>' +
          '<input type="number" id="placeBars" min="0" max="64" step="1" value="8"></div>' +
        '<div><label class="lbl">Volume (dB)</label>' +
          '<input type="number" id="placeGain" min="-40" max="6" step="1" value="-8"></div>' +
      '</div>' +
      '<div class="row">' +
        '<button data-act="do-place">Place it</button>' +
        '<button class="ghost" data-act="cancel-place">Cancel</button>' +
        '<span class="region-hint" style="flex:1;min-width:220px;margin:0">' +
          '0 dB is as loud as the sample was cut. −8 dB sits it under the music; ' +
          'lower still for something that should only be felt.</span>' +
      '</div>' +
    '</div>';
  }

  /* ------------------------------------------- placing a sample by eye ---
     The junction as a strip of time, with the sample drawn on it as a block
     you drag. Everything is measured in bars either side of the point where
     the next track comes in, because that is the one landmark both tracks
     share and it is what the placement is stored against.

     Peaks come from the tracks themselves (t.peaks, the same array the track
     waveforms use), sampled at the time each bar position corresponds to.
     Nothing is decoded here — this draws from what is already in memory, so
     it costs nothing to redraw on every pointer move. */

  var STRIP_H = 104;

  function placeState() {
    var jSel = $('placeJunction'), bSel = $('placeBars');
    if (!jSel || !bSel) return null;
    var j = parseInt(jSel.value, 10);
    var a = project.tracks[j], b = project.tracks[j + 1];
    if (!a || !b) return null;
    var s = sampleMeta.get(placingSample);
    var bars = Math.max(1, Math.round((s && s.bars) || 1));
    // The tempo the junction actually runs at, so a bar on screen is the bar
    // the sample will be stretched to when it is rendered.
    var lj = lay.junctions[j];
    var bpm = (lj && lj.targetBpm) || MP.effectiveBpm(b) || MP.effectiveBpm(a) || 120;
    return {
      j: j, a: a, b: b, bars: bars, barSec: 60 / bpm * 4,
      before: Math.max(0, Math.min(64, parseFloat(bSel.value) || 0))
    };
  }

  /* How many bars of run-up to show. Enough that the sample can always be
     dragged to its furthest allowed position and still be seen whole. */
  function stripWindow(st) {
    var pre = Math.max(24, st.before + st.bars + 4);
    return { pre: Math.min(72, pre), post: 8 };
  }

  /* Peak value of a track at a given time, from the array the waveform uses. */
  function peakAt(t, sec) {
    if (!t.peaks || !t.durationSec) return null;
    if (sec < 0 || sec > t.durationSec) return null;
    var i = Math.floor(sec / t.durationSec * t.peaks.length);
    return t.peaks[Math.max(0, Math.min(t.peaks.length - 1, i))] || 0;
  }

  function drawPlaceStrip() {
    var cv = $('placeStrip');
    if (!cv) return;
    var st = placeState();
    if (!st) return;
    var win = stripWindow(st);
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || 900, h = STRIP_H;
    cv.width = w * dpr; cv.height = h * dpr;
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    var total = win.pre + win.post;                 // bars across the whole strip
    var pxPerBar = w / total;
    var xOfBar = function (barsBefore) {             // 0 = the incoming entry
      return (win.pre + barsBefore) * pxPerBar;
    };

    g.fillStyle = '#f7fbfa'; g.fillRect(0, 0, w, h);

    // --- the two tracks' audio, each sampled at the time that bar lands on
    var drawSide = function (t, fromBar, toBar, anchorSec, colour) {
      g.fillStyle = colour;
      for (var x = Math.max(0, xOfBar(fromBar)); x < Math.min(w, xOfBar(toBar)); x++) {
        var barPos = x / pxPerBar - win.pre;          // bars relative to entry
        var p = peakAt(t, anchorSec + barPos * st.barSec);
        if (p == null) continue;
        var bh = Math.max(1, p * (h - 26) * 0.9);
        g.fillRect(x, 20 + (h - 26 - bh) / 2, 1, bh);
      }
    };
    // The two sides need to be told apart at a glance, so the incoming track
    // sits on a tinted ground in a darker ink. Drawn in nearly the same grey,
    // the strip reads as one continuous waveform and the join means nothing.
    g.fillStyle = '#eef5f3';
    g.fillRect(xOfBar(0), 0, w - xOfBar(0), h);
    // Outgoing track: its music runs out at exitSec, which is the join.
    drawSide(st.a, -win.pre, 0, st.a.exitSec || st.a.durationSec || 0, '#cfdedc');
    // Incoming track: its entry is the join.
    drawSide(st.b, 0, win.post, st.b.entrySec || 0, '#7fa3a0');

    // --- bar lines
    for (var bIdx = -Math.floor(win.pre); bIdx <= win.post; bIdx++) {
      var bx = xOfBar(bIdx);
      var four = bIdx % 4 === 0;
      g.fillStyle = four ? 'rgba(61,98,99,.30)' : 'rgba(61,98,99,.10)';
      g.fillRect(bx, four ? 16 : h * 0.4, 1, four ? h - 16 : h * 0.22);
    }

    // --- the join itself
    g.fillStyle = '#b0392c';
    g.fillRect(xOfBar(0) - 1, 12, 2, h - 12);
    g.font = '600 10px Montserrat, -apple-system, sans-serif';
    g.fillStyle = '#b0392c';
    g.textAlign = 'left';
    g.fillText(truncateLabel(st.b.title, 34) + ' comes in', xOfBar(0) + 5, 10);
    g.textAlign = 'right';
    g.fillStyle = '#6b7f7e';
    g.fillText(truncateLabel(st.a.title, 34), xOfBar(0) - 5, 10);
    g.textAlign = 'left';

    // --- the sample block
    var x0 = xOfBar(-st.before), bw = Math.max(6, st.bars * pxPerBar);
    g.fillStyle = 'rgba(176,125,46,.26)';
    g.fillRect(x0, 18, bw, h - 24);
    g.fillStyle = '#b07d2e';
    g.fillRect(x0, 18, 2, h - 24);
    g.fillRect(x0 + bw - 2, 18, 2, h - 24);
    g.fillStyle = '#7a5518';
    g.font = '600 11px Montserrat, -apple-system, sans-serif';
    var s = sampleMeta.get(placingSample);
    var label = (s ? s.name : 'sample') + '  ·  ' + st.bars + (st.bars === 1 ? ' bar' : ' bars');
    if (bw > 70) g.fillText(truncateLabel(label, Math.floor(bw / 6)), x0 + 6, h - 10);
  }

  function truncateLabel(str, n) {
    str = String(str || '');
    return str.length > n ? str.slice(0, Math.max(1, n - 1)) + '…' : str;
  }

  /* Dragging. The canvas is redrawn directly and the number field is written
     to as we go — deliberately NOT through touch(), which re-renders the panel
     and would destroy the canvas mid-drag. The project is only written when
     Place it is pressed, exactly as before. */
  var placeDrag = null;

  function barsFromPointer(ev, cv, st) {
    var r = cv.getBoundingClientRect();
    var win = stripWindow(st);
    var pxPerBar = r.width / (win.pre + win.post);
    var barPos = (ev.clientX - r.left) / pxPerBar - win.pre;   // left edge, in bars
    return Math.max(0, Math.min(64, Math.round(-barPos)));
  }

  function wirePlaceStrip() {
    var cv = $('placeStrip');
    if (!cv || cv.dataset.wired) return;
    cv.dataset.wired = '1';

    cv.addEventListener('pointerdown', function (ev) {
      var st = placeState();
      if (!st) return;
      ev.preventDefault();
      cv.setPointerCapture(ev.pointerId);
      // Grab the block wherever it is clicked, so it does not jump under the
      // pointer; clicking the empty strip moves it there directly.
      var r = cv.getBoundingClientRect();
      var win = stripWindow(st);
      var pxPerBar = r.width / (win.pre + win.post);
      var x0 = (win.pre - st.before) * pxPerBar, bw = st.bars * pxPerBar;
      var px = ev.clientX - r.left;
      var grabBars = (px >= x0 && px <= x0 + bw) ? (px - x0) / pxPerBar : st.bars / 2;
      placeDrag = { grabBars: grabBars };
      applyPointer(ev, cv, st);
    });

    cv.addEventListener('pointermove', function (ev) {
      if (!placeDrag) return;
      var st = placeState();
      if (st) applyPointer(ev, cv, st);
    });

    var end = function (ev) {
      if (!placeDrag) return;
      placeDrag = null;
      try { cv.releasePointerCapture(ev.pointerId); } catch (e) {}
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    // Typing in the field still works, and moves the block.
    var bSel = $('placeBars');
    if (bSel) bSel.addEventListener('input', function () { drawPlaceStrip(); });
    var jSel = $('placeJunction');
    if (jSel) jSel.addEventListener('change', function () { drawPlaceStrip(); });
  }

  function applyPointer(ev, cv, st) {
    var r = cv.getBoundingClientRect();
    var win = stripWindow(st);
    var pxPerBar = r.width / (win.pre + win.post);
    var leftBars = (ev.clientX - r.left) / pxPerBar - win.pre - (placeDrag ? placeDrag.grabBars : 0);
    var before = Math.max(0, Math.min(64, Math.round(-leftBars)));
    var bSel = $('placeBars');
    if (bSel) bSel.value = before;
    drawPlaceStrip();
  }

  function renderPlacementList() {
    var ps = project.placements || [];
    if (!ps.length) return '';
    return '<div class="rep" style="margin-top:14px">' +
      '<div class="rep-head">Placements — ' + ps.length + '</div>' +
      ps.map(function (p, i) {
        var s = sampleMeta.get(p.sampleId);
        var a = project.tracks[p.atJunction], b = project.tracks[p.atJunction + 1];
        return '<div class="rep-row">' +
          '<span class="n">' + (i + 1) + '</span>' +
          '<span class="t">' + esc(s ? s.name : p.sampleId) + '</span>' +
          '<span class="m">' + (b ? 'before "' + esc(b.title) + '"' : 'junction ' + (p.atJunction + 1)) +
            ', ' + (p.barsBeforeEntry || 0) + ' bars early</span>' +
          '<span class="m">' + (p.gainDb || 0) + ' dB</span>' +
          '<button class="ghost" data-act="placement-del" data-index="' + i + '"' +
            ' style="padding:2px 8px;font-size:11px">✕</button>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function wireSamples() {
    $('samples').addEventListener('click', async function (e) {
      var act = e.target.dataset.act;
      if (!act) return;
      var id = e.target.dataset.sample;
      if (act === 'sample-play') {
        var buf = await sampleAudioFor(id);
        if (buf) play(buf); else setStatus('That sample has no audio stored.', true);
      }
      /* Opening the placer, not placing yet. This used to be a window.prompt()
         asking for a junction number — which throws outright in Electron, so
         placing a sample never worked at all in the app. Everything is fields
         now: which junction, over or between, how far in, and how loud. */
      if (act === 'sample-place') {
        if (!project.junctions.length) { setStatus('No junctions to place it at yet.', true); return; }
        placingSample = (placingSample === id) ? null : id;
        await sampleAudioFor(id);
        renderSamples();
        return;
      }
      if (act === 'do-place') {
        var jn = parseInt(($('placeJunction') || {}).value, 10);
        var bars = parseFloat(($('placeBars') || {}).value);
        var gain = parseFloat(($('placeGain') || {}).value);
        var mode = ($('placeMode') || {}).value || 'over';
        if (!isFinite(jn)) { setStatus('Choose which junction to place it at.', true); return; }
        MP.addPlacement(project, {
          sampleId: placingSample,
          atJunction: jn,
          barsBeforeEntry: isFinite(bars) ? bars : 8,
          gainDb: isFinite(gain) ? gain : -8,
          // "Between" drops it in the gap the two records leave; "over" rides it
          // on top of the music that is already playing.
          mode: mode
        });
        var s2 = sampleMeta.get(placingSample);
        placingSample = null;
        setStatus('Placed "' + (s2 ? s2.name : 'sample') + '" ' +
                  (mode === 'between' ? 'between' : 'over') + ' the music at junction ' +
                  (jn + 1) + ', ' + (isFinite(bars) ? bars : 8) + ' bars before the next track, at ' +
                  (isFinite(gain) ? gain : -8) + ' dB. It will be stretched to whatever tempo is ' +
                  'playing there.');
        touch();
        return;
      }
      if (act === 'cancel-place') { placingSample = null; renderSamples(); return; }
      if (act === 'sample-del') {
        var s = sampleMeta.get(id);
        var uses = MP.sampleUsage(project, id);
        if (!confirm('Delete "' + (s ? s.name : id) + '"?' +
            (uses ? ' It is used in ' + uses + ' place' + (uses === 1 ? '' : 's') +
                    ', which will be removed too.' : ''))) return;
        project.placements = (project.placements || []).filter(function (p) { return p.sampleId !== id; });
        await MP.deleteSample(id);
        sampleBuffers.delete(id);
        await loadSamples();
        touch();
      }
      if (act === 'placement-del') {
        MP.removePlacement(project, +e.target.dataset.index);
        touch();
      }
    });
  }

  /* -------------------------------------------------- full render --- */

  var lastMix = null, cancelRender = false, rendering = false;

  function fmtEta(s) {
    if (s == null || !isFinite(s)) return '';
    if (s < 60) return Math.round(s) + 's';
    return Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's';
  }

  async function doRender(fromTrack, toTrack) {
    if (rendering) return;
    if (!project.tracks.length) { renderSay('Nothing to render yet.', true); return; }
    var MR = global.MixRender;
    if (!MR) { renderSay('mix-render.js did not load.', true); return; }

    rendering = true; cancelRender = false; lastMix = null;
    $('renderBtn').disabled = true;
    $('renderRangeBtn').disabled = true;
    $('cancelRenderBtn').disabled = false;
    $('downloadMixBtn').disabled = true;
    $('playMixBtn').disabled = true;
    $('renderProgress').classList.remove('hidden');
    $('renderReport').innerHTML = '';
    $('renderBar').style.width = '0%';

    try {
      var res = await MR.render(project, buffers, {
        ctx: audioCtx(),
        fromTrack: fromTrack, toTrack: toTrack,
        sampleBuffers: sampleBuffers, sampleMeta: sampleMeta,
        measureAlignment: true,
        shouldCancel: function () { return cancelRender; },
        onProgress: function (p) {
          var pct = Math.min(100, Math.round(p.sec / Math.max(1, p.totalSec) * 100));
          $('renderBar').style.width = pct + '%';
          renderSay(p.message + ' · ' + fmt(p.sec) + ' of ' + fmt(p.totalSec) +
            (p.etaSec ? ' · about ' + fmtEta(p.etaSec) + ' left' : ''));
        }
      });
      lastMix = res;
      $('renderBar').style.width = '100%';
      $('downloadMixBtn').disabled = false;
      $('playMixBtn').disabled = false;
      renderSay('Rendered ' + fmt(res.report.durationSec) + ' — ' +
        (res.blob.size / 1048576).toFixed(0) + ' MB. ' +
        (res.report.gainDb ? 'Peak was ' + res.report.peak.toFixed(2) + ', pulled down ' +
          (-res.report.gainDb).toFixed(1) + ' dB across the whole mix. ' : 'No peak reduction needed. ') +
        'Listen to the first few junctions before you trust it.');
      showReport(res.report);
    } catch (err) {
      if (err && err.cancelled) renderSay('Render cancelled.');
      else {
        renderSay(err.message || String(err), true);
        $('renderReport').innerHTML = '';
      }
    }
    rendering = false;
    $('renderBtn').disabled = false;
    $('renderRangeBtn').disabled = false;
    $('cancelRenderBtn').disabled = true;
  }

  function renderSay(msg, isErr) {
    var el = $('renderStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
  }

  function showReport(rep) {
    var el = $('renderReport');
    if (!el) return;
    var stretched = rep.tracks.filter(function (t) { return t.ramped; }).length;
    var al = rep.alignment || [];
    var flams = rep.flams || 0;
    el.innerHTML =
      (al.length
        ? '<div class="' + (flams ? 'warn' : 'hint') + '" style="margin-top:12px">' +
          (flams
            ? '<strong>' + flams + ' overlap' + (flams === 1 ? '' : 's') + ' may flam.</strong> ' +
              'Worst lag ' + rep.worstLagMs + ' ms. The two tracks are not landing their kicks ' +
              'together there — check the downbeat on both.'
            : '<strong>Overlaps are tight.</strong> Worst lag across ' + al.length +
              ' junctions is ' + rep.worstLagMs + ' ms; under about 10 ms is inaudible. ' +
              'This is the check a click test cannot do — a misaligned overlap flams without ' +
              'ever producing a discontinuity.') +
          '</div>'
        : '') +
      (rep.placements && rep.placements.length
        ? '<div class="rep">' +
            '<div class="rep-head">Samples placed — ' + rep.placements.length + '</div>' +
            rep.placements.map(function (p) {
              return '<div class="rep-row">' +
                '<span class="t">' + esc(p.name) + '</span>' +
                '<span class="m">junction ' + (p.atJunction + 1) + ' at ' + fmt(p.atSec) + '</span>' +
                '<span class="m">' + p.tempoThere.toFixed(1) + ' BPM, ×' + p.ratio.toFixed(3) + '</span>' +
                (p.clamped ? '<span class="pill lo">clamped</span>' : '') +
              '</div>';
            }).join('') +
          '</div>'
        : '') +
      (function () {
        var bridged = (rep.tracks || []).filter(function (t) { return t.bridge; });
        if (!bridged.length) return '';
        return '<div class="rep">' +
          '<div class="rep-head">Beat bridges — ' + bridged.length + '</div>' +
          '<div class="rep-scroll">' +
          bridged.map(function (t) {
            var b = t.bridge;
            return '<div class="rep-row">' +
              '<span class="n">' + (t.index + 1) + '</span>' +
              '<span class="t">' + esc(t.title) + '</span>' +
              '<span class="m">' + (b.fill ? b.fill.beats + ' beats of drums between the records' +
                                                    (b.fill.patternName ? ' · ' + b.fill.patternName : '')
                                                  : b.beatBars + ' bars of beat from ' + fmt(b.brAtSec)) + '</span>' +
              '<span class="m">' + esc(b.note) + '</span>' +
              (b.zeroOverlap ? '<span class="pill">no overlap</span>' : '') +
              (b.shortened ? '<span class="pill lo">cut to fit, was ' + b.wantedBeatBars + '</span>' : '') +
            '</div>';
          }).join('') +
          '</div></div>';
      })() +
      '<div class="rep">' +
        '<div class="rep-head">Seams — ' + rep.seams.length + ' junctions, ' +
          'none spliced</div>' +
        '<div class="rep-scroll">' +
        rep.seams.map(function (s) {
          return '<div class="rep-row">' +
            '<span class="n">' + s.junction + '</span>' +
            '<span class="t">' + esc(s.type) + '</span>' +
            '<span class="m">' + (s.kind === 'overlap'
                ? s.overlapSec.toFixed(1) + 's overlap'
                : s.kind === 'gap' ? s.gapSec.toFixed(2) + 's gap' : 'butt join') + '</span>' +
            '<span class="good">no splice</span>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</div>' +
      '<div class="rep">' +
        '<div class="rep-head">Tempo — ' + stretched + ' of ' + rep.tracks.length +
          ' tracks ease between two tempos</div>' +
        '<div class="rep-scroll">' +
        rep.tracks.map(function (t) {
          return '<div class="rep-row">' +
            '<span class="n">' + (t.index + 1) + '</span>' +
            '<span class="t">' + esc(t.title) + '</span>' +
            '<span class="m">' + t.tempoIn.toFixed(1) +
              (t.ramped ? ' → ' + t.tempoOut.toFixed(1) : '') + ' BPM</span>' +
            '<span class="m">' + (t.stretchOutPct >= 0 ? '+' : '') + t.stretchOutPct + '%</span>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</div>' +
      (rep.warnings.length
        ? '<div class="warn" style="margin-top:12px">' +
          rep.warnings.slice(0, 5).map(function (w) { return esc(w.message); }).join('<br>') +
          '</div>'
        : '') +
      '<div class="hint">Measurements will not tell you it sounds right. Play the ninety seconds ' +
      'around the first few junctions, and one track middle to confirm the untouched material really ' +
      'is untouched.</div>';
  }

  function wireRender() {
    $('renderBtn').onclick = function () { doRender(null, null); };
    $('cancelRenderBtn').onclick = function () { cancelRender = true; renderSay('Cancelling…'); };
    $('renderRangeBtn').onclick = function () {
      var f = parseInt($('renderFrom').value, 10);
      var t = parseInt($('renderTo').value, 10);
      doRender(isFinite(f) ? f - 1 : null, isFinite(t) ? t - 1 : null);
    };
    $('downloadMixBtn').onclick = function () {
      if (!lastMix) return;
      var url = URL.createObjectURL(lastMix.blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (project.name || 'mix').replace(/\s+/g, '-') + '.wav';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    };
    /* An 80-minute buffer is far too big to decode for playback, so auditioning
       the finished mix means re-rendering a short range — which is what the
       range export is for. */
    $('playMixBtn').onclick = function () {
      if (!lastMix) return;
      renderSay('An 80-minute mix is too large to decode for preview. ' +
        'Use "Render range" for the tracks around a junction, then Download, ' +
        'or audition the junction itself from the timeline.');
    };
  }

  /* --------------------------------------------- suggested order --- */

  function showSuggestion() {
    var el = $('suggestPanel');
    var missing = project.tracks.filter(function (t) { return !t.linked || !t.sourceBpm; }).length;
    var s = MP.suggestOrder(project);
    if (!s) {
      setStatus('Not enough tracks to sequence yet.', true);
      return;
    }
    el.classList.remove('hidden');

    var stat = function (label, before, after, better) {
      return '<div class="sug-stat' + (better ? ' better' : '') + '">' +
        '<b>' + after + '</b><span>' + esc(label) + '</span>' +
        '<span style="color:var(--faint)">was ' + before + '</span></div>';
    };

    var before = s.before, after = s.after;
    var idxBefore = {};
    project.tracks.forEach(function (t, i) { idxBefore[t.id] = i; });

    el.innerHTML =
      '<div class="jx-head"><div>' +
        '<span class="lbl">Suggested order</span>' +
        '<h3>' + (s.moved ? s.moved + ' of ' + project.tracks.length + ' tracks would move'
                          : 'Nothing to change — this order is already optimal') + '</h3>' +
      '</div><button class="ghost" data-act="close-suggest">Close</button></div>' +

      (missing ? '<div class="warn">' + missing + ' track' + (missing === 1 ? ' has' : 's have') +
        ' no analysed tempo yet, so ' + (missing === 1 ? 'it is' : 'they are') +
        ' being sequenced on the spreadsheet BPM. Drop the audio in first for a result you can trust.' +
        '</div>' : '') +

      '<div class="sug-stats">' +
        stat('joins you can blend', before.blendable, after.blendable, after.blendable > before.blendable) +
        stat('forced hard cuts', before.hardCuts, after.hardCuts, after.hardCuts < before.hardCuts) +
        stat('total tempo jump (BPM)', before.totalJump, after.totalJump, after.totalJump < before.totalJump) +
        stat('biggest single jump', before.maxJumpPct + '%', after.maxJumpPct + '%',
             after.maxJumpPct < before.maxJumpPct) +
      '</div>' +

      '<div class="hint">Tracks are sorted by tempo within each section, because for points on a ' +
      'line the sorted order provably minimises the total distance between neighbours — there is ' +
      'nothing to tune. Section order is kept, and each section\'s direction is read from how you ' +
      'have it now: ' +
      s.sections.map(function (x) { return esc(x.name) + ' ' + x.direction; }).join(', ') + '. ' +
      'Pinned tracks (◉) never move.</div>' +

      '<div class="sug-list">' + s.tracks.map(function (t, i) {
        var from = idxBefore[t.id];
        var moved = from !== i;
        return '<div class="sug-row' + (moved ? ' moved' : '') + '">' +
          '<span class="n">' + (i + 1) + '</span>' +
          '<span class="t">' + (t.pinned ? '◉ ' : '') + esc(t.title) + '</span>' +
          '<span class="b">' + (MP.effectiveBpm(t) ? MP.effectiveBpm(t).toFixed(0) : '?') + '</span>' +
          (moved ? '<span class="from">was ' + (from + 1) + '</span>' : '') +
        '</div>';
      }).join('') + '</div>' +

      '<div class="row">' +
        '<button data-act="apply-suggest"' + (s.moved ? '' : ' disabled') + '>Apply this order</button>' +
        '<button class="ghost" data-act="close-suggest">Keep what I have</button>' +
      '</div>';

    el._suggestion = s;
  }

  function wireSuggest() {
    $('suggestPanel').addEventListener('click', function (e) {
      var act = e.target.dataset.act;
      if (!act) return;
      if (act === 'close-suggest') { $('suggestPanel').classList.add('hidden'); return; }
      if (act === 'apply-suggest') {
        var s = $('suggestPanel')._suggestion;
        if (!s) return;
        MP.applyOrder(project, s.order);
        $('suggestPanel').classList.add('hidden');
        openTrack = null; openJunction = null;
        recompute();
        setStatus('Order applied — ' + s.moved + ' tracks moved, ' +
                  renderedCount() + ' junction renders still valid. ' +
                  'Export the project first if you want a way back.');
        touch();
      }
    });
  }

  /* ---------------------------------------------------------- boot --- */

  function renderAll() {
    renderTimeline();
    renderTracks();
    renderJunctionEditor();
    renderBench();
    renderSamples();
    renderSummary();
  }

  function renderSummary() {
    var el = $('summary');
    if (!lay || !lay.tracks.length) { el.textContent = ''; return; }
    var unlinked = project.tracks.filter(function (t) { return !t.linked; }).length;
    var cuts = lay.junctions.filter(function (j) { return j.type === 'hard-cut'; }).length;
    var bits = [
      lay.tracks.length + ' tracks',
      fmtLong(lay.totalSec),
      cuts + ' hard cut' + (cuts === 1 ? '' : 's'),
      renderedCount() + ' junction' + (renderedCount() === 1 ? '' : 's') + ' rendered'
    ];
    if (unlinked) bits.push(unlinked + ' waiting for audio');
    el.innerHTML = bits.map(function (b) { return '<span>' + esc(b) + '</span>'; }).join('');
    var w = $('warnings');
    w.innerHTML = lay.warnings.length
      ? lay.warnings.map(function (x) {
          return '<div class="warn-row" data-junction="' + x.junction + '">' + esc(x.message) + '</div>';
        }).join('')
      : '';
  }

  function init() {
    MP.loadProject().then(function (p) {
      project = p;
      project.tracks.forEach(function (t) { t.linked = false; });   // audio is never stored
      $('nameInput').value = project.name || '';
      recompute();
      wire();
      renderAll();
      loadSamples();
      restoreAudioOnLaunch();
      if (project.tracks.length) {
        var n = project.tracks.length;
        setStatus('Project reopened — ' + n + ' tracks, every setting intact. ' +
                  'Drop the audio folder to re-link and it is playable again.');
      }
      $('warnings').addEventListener('click', function (e) {
        var row = e.target.closest('[data-junction]');
        if (!row) return;
        openJunction = +row.dataset.junction; openTrack = null;
        renderAll();
      });
    });
  }

  global.MixUI = { init: init, get project() { return project; }, layout: function () { return lay; } };

})(typeof window !== 'undefined' ? window : globalThis);
