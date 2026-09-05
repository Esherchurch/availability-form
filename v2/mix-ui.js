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

  function recompute() { lay = MP.layout(project); }

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
    t.exitSec = snapToBar(t, res.contentEndSec);
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
          if (!m.track.exitSec) {
            m.track.exitSec = snapToBar(m.track,
              cached ? cached.contentEndSec : DSP.contentEndSec(monos.get(m.track.id), buf.sampleRate));
          }
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
      setStatus('All ' + r.matched.length + ' tracks re-linked.');
    }
    touch();
  }

  function snapToBar(t, sec) {
    var bpm = (t.sourceBpm || 0) * (t.bpmMultiplier || 1);
    if (!bpm) return sec;
    var bar = 60 / bpm * 4;
    var k = Math.round((sec - t.downbeatSec) / bar);
    return Math.max(0, t.downbeatSec + k * bar);
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
    var html = '<div class="tl-ruler">' + rulerHtml(total) + '</div><div class="tl-body">';

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

    html += '</div>';
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
    return 'Bridge · ' + (s.beatBars || 16) + ' bars of beat @ ' + (j.targetBpm || '?') + ' BPM';
  }

  /* ---------------------------------------------------- track list --- */

  function renderTracks() {
    var el = $('tracks');
    if (!project.tracks.length) { el.innerHTML = ''; return; }
    el.innerHTML = project.tracks.map(function (t, i) {
      var lt = lay.tracks[i];
      var conf = t.confidence == null ? null :
        t.confidence >= 0.6 ? 'hi' : t.confidence >= 0.3 ? 'mid' : 'lo';
      var last = project.tracks.length - 1;
      return '<div class="trk' + (openTrack === i ? ' open' : '') + '" data-track="' + i + '"' +
             ' draggable="true">' +
        '<div class="trk-head">' +
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
      '</div>';
    }).join('');
    project.tracks.forEach(function (t, i) {
      if (openTrack !== i) return;
      var cv = document.querySelector('.trk[data-track="' + i + '"] canvas');
      if (cv) drawWave(cv, t);
    });
  }

  function trackEditorHtml(t, i) {
    return '<div class="trk-body">' +
      '<canvas class="wave"></canvas>' +
      '<div class="hint">Click to set the entry point (gold). Shift-click to set the mix-out ' +
        'point (red) — that is where a transition works backwards from. Both snap to the bar.</div>' +
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
        '<div><label class="lbl">Cut from entry</label>' +
          '<select data-act="cut-bars" data-track="' + i + '">' +
            [2,4,8,16].map(function (b) { return '<option value="' + b + '">' + b + ' bars</option>'; }).join('') +
          '</select></div>' +
        '<div><label class="lbl">&nbsp;</label>' +
          '<button data-act="cut-sample" data-track="' + i + '"' + (t.linked ? '' : ' disabled') +
          '>Cut sample</button></div>' +
      '</div>' +
      regionEditorHtml(t, i) +
      (t.note ? '<div class="note-row">' + esc(t.note) + '</div>' : '') +
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
    if (!t.peaks) return;
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = 88;
    cv.width = w * dpr; cv.height = h * dpr;
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

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
      warn = '<div class="warn">These two are ' +
        (Math.max(j.stretchA || 0, j.stretchB || 0) * 100).toFixed(1) +
        '% apart after clamping — past the ' + (project.maxStretch * 100).toFixed(0) +
        '% budget, so there is no common tempo to beat-match at. A hard cut is the honest answer here.' +
        ' <button class="ghost" data-act="accept-hardcut">Make it a hard cut</button></div>';
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
        '<button class="ghost" data-act="stop">Stop</button>' +
        '<button class="ghost" data-act="dl-junction"' + (seg ? '' : ' disabled') + '>Download WAV</button>' +
      '</div>' +
      '<div class="status" id="jxStatus">' + (seg ? segSummary(seg) : '') + '</div>';
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
      jf('Beat alone (bars)', 'beatBars', s.beatBars == null ? 16 : s.beatBars, 1, 1, 32) +
      jsel('Beat isolation', 'isolation', s.isolation || 'eq',
        [['eq', 'EQ filter — clean'], ['sep', 'Separation — aggressive']]) +
      jf('Mids cut (dB)', 'midCutDb', s.midCutDb == null ? 24 : s.midCutDb, 1, 6, 40) +
      jf('Highs cut (dB)', 'highCutDb', s.highCutDb == null ? 0 : s.highCutDb, 1, 0, 24) +
      jf('B overlaps by (bars)', 'overlapBars', s.overlapBars == null ? 1 : s.overlapBars, 1, 0, 8) +
      '<div class="span2 hint">EQ is what a DJ actually does: pull the mids down, leave everything ' +
      'below 300 Hz and above 6 kHz alone, so the kick, bass, hats and the crack of the snare all ' +
      'survive. Separation is available but it deletes the kick unless its low end is protected, ' +
      'and it sounds reconstructed.</div>';
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
  }
  function stop() { if (playing) { try { playing.stop(); } catch (e) {} playing = null; } }

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
      var act = e.target.dataset.act;
      if (act) {
        var i = +e.target.dataset.track;
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
        if (act === 'regions-on') { startRegions(i); }
        if (act === 'regions-off') { project.tracks[i].regions = null; touch(); }
        if (act === 'region-add') { addRegion(i); }
        if (act === 'region-del') { delRegion(i, +e.target.dataset.region); }
        if (act === 'region-up') { moveRegion(i, +e.target.dataset.region); }
        if (act === 'cut-sample') {
          var sel = document.querySelector('[data-act="cut-bars"][data-track="' + i + '"]');
          var bars = sel ? parseInt(sel.value, 10) : 4;
          // Drum removal is the one job HPSS is genuinely right for — taking a
          // melodic hook out of a full mix. It is the opposite of the bridge,
          // where separation is wrong and EQ is right.
          var drums = confirm('Strip the drums out of this sample?\n\n' +
                              'OK for a melodic hook, Cancel to keep it as it is.');
          cutSample(i, bars, { removeDrums: drums, removalAmount: 2, highPassHz: drums ? 120 : 0 });
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
      var i = +e.target.closest('[data-track]').dataset.track;
      var t = project.tracks[i];
      if (!t.durationSec) return;
      var r = e.target.getBoundingClientRect();
      var sec = (e.clientX - r.left) / r.width * t.durationSec;
      var snapped = snapToBar(t, sec);
      if (e.shiftKey) t.exitSec = snapped; else t.entrySec = snapped;
      touch();
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

  function setMultiplier(i, m) {
    var t = project.tracks[i];
    t.bpmMultiplier = (t.bpmMultiplier || 1) === m ? 1 : m;
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

  /* --------------------------------------------------- samples --- */
  /* Samples are assets; placements are uses. Stored unstretched at their source
     tempo, because the same hook at a 108 BPM junction and a 124 BPM one needs
     two different stretches — the render works that out per placement from the
     tempo ramp. */

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
  async function cutSample(trackIndex, bars, opts) {
    var t = project.tracks[trackIndex];
    var buf = buffers.get(t.id);
    if (!buf) { setStatus('That track has no audio linked.', true); return; }
    var bs = barSecOf(t);
    var from = t.entrySec || 0;
    var len = bars * bs;
    if (from + len > buf.duration) { setStatus('Not enough track after the entry point.', true); return; }

    setStatus('Cutting ' + bars + ' bars from "' + t.title + '"…');
    var raw = DSP.slice(audioCtx(), buf, from, len);
    var prepared = await DSP.prepareSample(audioCtx(), raw, opts || {});
    var name = prompt('Name this sample', t.title + ' ' + bars + ' bars');
    if (!name) { setStatus(''); return; }

    var meta = {
      name: name, tags: [],
      sourceFile: t.file, sourceTrackId: t.id,
      sourceStartSec: from, bars: bars,
      sourceBpm: (t.sourceBpm || 0) * (t.bpmMultiplier || 1),
      processing: opts || {}
    };
    var saved = await MP.saveSample(meta, DSP.encodeWav(prepared));
    sampleBuffers.set(saved.id, prepared);
    await loadSamples();
    setStatus('Saved "' + name + '" — ' + bars + ' bars at ' +
              meta.sourceBpm.toFixed(1) + ' BPM. Drop it at any junction.');
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
          '<button data-act="sample-place" data-sample="' + esc(s.id) + '">Place…</button>' +
          '<button data-act="sample-del" data-sample="' + esc(s.id) + '">✕</button>' +
        '</span>' +
      '</div>';
    }).join('') + renderPlacementList();
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
      if (act === 'sample-place') {
        if (!project.junctions.length) { setStatus('No junctions to place it at yet.', true); return; }
        var which = prompt('Place at which junction? 1–' + project.junctions.length, '1');
        var jn = parseInt(which, 10);
        if (!isFinite(jn) || jn < 1 || jn > project.junctions.length) return;
        MP.addPlacement(project, { sampleId: id, atJunction: jn - 1 });
        await sampleAudioFor(id);
        setStatus('Placed 8 bars before track ' + (jn + 1) + ' comes in. ' +
                  'It will be stretched to whatever tempo is playing there.');
        touch();
      }
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
