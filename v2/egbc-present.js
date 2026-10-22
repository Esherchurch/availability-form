/* ===================================================================
   EGBC Present - ONE engine for the session planner and video meetings
   (F-242; Martin, 20 Oct: "a selling point on its own")
   ===================================================================

   Everyone sees the presenter's slide, large, the moment they move on.
   One tiny shared state - presentNow/{key}: { slide, presenterUid,
   presenterName, startedAt, slideAt, blank, context } - and every screen
   crossfades (0.2 s) to a picture it ALREADY HAS: the whole deck is fetched
   in the background when it opens, small previews first, so a slide change
   downloads nothing (weak church Wi-Fi). If the Wi-Fi drops, a screen keeps
   its slide and catches up when it is back. No screen share.

   VIDEO AND SOUND IN THE SLIDES (F-251): a slide's own video plays over its
   picture, where it sits on the slide, IN STEP ON EVERY SCREEN. The shared
   state adds media: { i, k, state 'playing'|'paused', at (seconds), since }
   and each screen works out where the video should be and corrects itself
   (more than 1.5 s out: it jumps). Only the presenter plays, pauses or
   starts again; viewers have no controls, so nobody skips ahead. Videos
   stream from Storage (only the start is fetched first); phones and weak
   Wi-Fi get the light copy when there is one, the TV the full one. Sound:
   on for the TV, off on phones and the presenter's own screen ("Sound here"
   turns it on) - a room full of phones would echo. YouTube links play in
   step too (YouTube's player); other links: the presenter can open them.

     EGBCPresent.mount(el, {
       key,          'ps_<session>' | 'mtg_<room>_<event or day>'
       context,      { type: 'session', groupId, sessionId } | { type: 'meeting', room, eventId, day }
       items,        [{ kind: 'quiz', key, title, questions } (egbc-quiz.js, F-255) |
                     { kind: 'image', full, thumb, deckId, n, ratio, media: [{ kind, src, light, link,
                       youtube, rect: [x, y, w, h], start: 'click'|'auto', loop, volume, seconds,
                       playable }] } | { kind: 'html', html }]
                     (the same list, in the same order, on every screen)
       notesFor,     function (i) -> Promise of the presenter's notes for item i ('' if none)
       title,        what is being shown ("Building fund update")
       mayPresent,   true if this person may present (the rules say the same)
       faces,        optional element: the people (Daily's tiles), shown beside
                     the slides for everyone and in the presenter's view
       tv,           true: a screen that only shows (present.html on the TV)
       onEnd         called when the presenter stops
       nowExtra,     fields written with "Present" (a meeting's { deckId })
       autoStart     true: present at once (a meeting's host chose the deck)
     }) -> { stop(), destroy(), state() }

     EGBCPresent.attachMeeting({ room, eventId, el, call, host, button })
       -> { open(), destroy() }    "Present slides" in a video meeting (F-242
       section 6, F-247; below)

   Who sees: the viewer (follows; "Browse on my own" then "Back to
   presenter"), the presenter (now, next, notes, timer, thumbnails, Next /
   Back / Blank / Stop, the faces with raised hands), and anyone who may
   present gets "Take over" (the presenter sees who took it).
   Keys and clickers: arrows, space, PageUp / PageDown; B blanks; K plays or pauses the video.
   =================================================================== */
(function (global) {
  'use strict';
  /* where this file was loaded from: the hub's other scripts sit beside it */
  var BASE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');

  var CSS = '' +
    '.pz{--pz-bg:#0b1116;--pz-panel:#121a21;--pz-line:#22303b;--pz-mute:#94a3b8;color:#e2e8f0;background:var(--pz-bg);font:400 15px/1.45 Inter,system-ui,sans-serif;min-height:100%;display:flex;flex-direction:column}' +
    '.pz *{box-sizing:border-box}' +
    '.pz-top{display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--pz-panel);border-bottom:1px solid var(--pz-line);min-height:56px;flex-wrap:wrap}' +
    '.pz-top .t{font-weight:700;color:#fff}.pz-top .s{font-size:12.5px;color:var(--pz-mute)}.pz-sp{flex:1}' +
    '.pz-live{display:inline-flex;align-items:center;gap:6px;font:600 12.5px Inter,sans-serif;color:#a7f3d0;background:#064e3b;padding:4px 10px;border-radius:999px}' +
    '.pz-live i{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.25)}' +
    '.pz-live.off{color:#fde68a;background:#422006}.pz-live.off i{background:#f59e0b;box-shadow:none}' +
    '.pz-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:12px;font:600 14.5px Inter,sans-serif;border:1px solid #2c3c48;background:transparent;color:#e2e8f0;cursor:pointer}' +
    '.pz-btn.main{background:#5c8a8b;border-color:#5c8a8b;color:#fff}.pz-btn.stop{background:#3b1414;color:#fecaca;border-color:#5b1d1d}' +
    '.pz-btn.go{background:linear-gradient(180deg,#6aa3a4,#4d7f80);border:0;color:#fff;min-height:64px;font-size:20px;border-radius:16px;flex:1;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
    '.pz-btn.back{min-height:64px;font-size:20px;border-radius:16px;flex:0 0 88px;background:#18232c}' +
    '.pz-stage{position:relative;aspect-ratio:16/9;width:100%;border-radius:14px;overflow:hidden;background:#05080b;box-shadow:0 20px 50px rgba(0,0,0,.5)}' +
    '.pz-stage .layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s ease}' +
    '.pz-stage .layer.on{opacity:1}.pz-stage img{width:100%;height:100%;object-fit:contain;display:block}' +
    '.pz-stage .html{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;padding:6% 7%;color:#fff;font-size:clamp(14px,2.4vw,40px);line-height:1.3}' +
    '.pz-stage .blank{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .2s}.pz-stage .blank.on{opacity:1}' +
    '.pz-prog{height:4px;background:#1e2a33;border-radius:4px;overflow:hidden;margin:10px 0 6px}.pz-prog i{display:block;height:100%;background:linear-gradient(90deg,#6aa3a4,#a7d4d4);transition:width .2s}' +
    '.pz-cap{font-size:13px;color:var(--pz-mute)}' +
    '.pz-view{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;padding:18px;flex:1}' +
    '.pz-view .main{display:flex;flex-direction:column;justify-content:center;min-width:0}' +
    '.pz-faces{display:flex;flex-direction:column;gap:10px;min-width:0}' +
    '.pz-pres{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:18px;padding:18px;flex:1}' +
    '.pz-card{background:var(--pz-panel);border:1px solid var(--pz-line);border-radius:16px;padding:14px;min-width:0}' +
    '.pz-lbl{font:700 11px Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--pz-mute);margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.pz-notes{font-size:16px;line-height:1.55;white-space:pre-wrap}' +
    '.pz-timer{font:800 24px Inter,sans-serif;color:#fff;font-variant-numeric:tabular-nums}.pz-timer small{font:600 12px Inter,sans-serif;color:var(--pz-mute);margin-left:6px}' +
    '.pz-film{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.pz-film button{flex:0 0 112px;aspect-ratio:16/9;border-radius:8px;border:2px solid transparent;padding:0;overflow:hidden;background:#05080b;cursor:pointer;position:relative}' +
    '.pz-film button img{width:100%;height:100%;object-fit:cover;display:block}.pz-film button.on{border-color:#a7d4d4}.pz-film button span{position:absolute;left:4px;top:2px;font:700 11px Inter,sans-serif;color:#fff;text-shadow:0 1px 2px #000}' +
    /* The thumbnails' sideways scrollbar (the reviewing window, 21 Oct: a white bar on a phone): thin and dark where there is a mouse, none on a touch screen, where the row is swiped */
    '.pz-film,.pz-faces{scrollbar-width:thin;scrollbar-color:#3a4a52 transparent}.pz-film::-webkit-scrollbar,.pz-faces::-webkit-scrollbar{height:6px;background:transparent}.pz-film::-webkit-scrollbar-thumb,.pz-faces::-webkit-scrollbar-thumb{background:#3a4a52;border-radius:3px}' +
    '@media (pointer:coarse){.pz-film,.pz-faces{scrollbar-width:none}.pz-film::-webkit-scrollbar,.pz-faces::-webkit-scrollbar{display:none}}' +
    '.pz-next .pz-stage{box-shadow:none}' +
    '.pz-ctl{display:flex;gap:12px;margin-top:12px}' +
    '.pz-wait{flex:1;display:grid;place-items:center;padding:24px;text-align:center;color:var(--pz-mute)}' +
    '.pz-tv .pz-top{display:none}.pz-tv .pz-view{grid-template-columns:1fr;padding:0}.pz-tv .pz-stage{border-radius:0;box-shadow:none;aspect-ratio:auto;height:100vh}.pz-tv .pz-prog,.pz-tv .pz-cap{display:none}' +
    '.pz-film .txt{position:absolute;inset:0;padding:14px 6px 4px;font:600 9px/1.2 Inter,sans-serif;color:#e2e8f0;text-align:left;overflow:hidden}' +
    '@media (max-width:760px){.pz-view,.pz-pres{grid-template-columns:1fr;padding:12px;gap:12px}.pz-view .main{justify-content:flex-start}' +
    '.pz-ctl{position:sticky;bottom:0;z-index:2;margin:0 -12px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(11,17,22,0),#0b1116 35%)}' +
    '.pz-side{display:flex;flex-direction:column}.pz-side .pz-notescard{order:-1}.pz-faces{flex-direction:row;overflow-x:auto}.pz-faces>*{flex:0 0 112px}' +
    '.pz-top{padding:8px 12px}.pz-btn.back{flex-basis:76px}}' +
    '.pz-mhost{position:absolute;z-index:5;pointer-events:none;overflow:hidden}.pz-mhost .pz-m{position:absolute}.pz-mhost video,.pz-mhost iframe{width:100%;height:100%;object-fit:contain;display:block;border:0;background:transparent;opacity:0;transition:opacity .25s}.pz-mhost .on{opacity:1}' +
    '.pz-mbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#0f1d24;border:1px solid #23414a;border-radius:12px;padding:8px 10px}.pz-mbar .lbl{font:600 13.5px Inter,sans-serif;color:#a7d4d4;margin-right:4px}.pz-mbar .tm{font:600 13px Inter,sans-serif;color:var(--pz-mute);font-variant-numeric:tabular-nums}' +
    '.pz-tap{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9;background:#5c8a8b;color:#fff;border:0;border-radius:999px;min-height:48px;padding:0 22px;font:700 16px Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);cursor:pointer}' +
    '.pz-film button .vid{position:absolute;right:4px;bottom:3px;font:700 10px Inter,sans-serif;color:#fff;background:rgba(0,0,0,.6);border-radius:4px;padding:0 4px}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css() { if (document.getElementById('pz-css')) return; var s = document.createElement('style'); s.id = 'pz-css'; s.textContent = CSS; document.head.appendChild(s); }
  function mmss(ms) { ms = Math.max(0, ms | 0); var s = Math.floor(ms / 1000), m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); }
  function now() { return Date.now(); }

  function mount(el, o) {
    css();
    var db = EGBCAuth.db, me = EGBCAuth.user() || {}, myName = (EGBCAuth.profile && EGBCAuth.profile() || {}).name || 'Someone';
    var ref = db.collection('presentNow').doc(o.key), items = o.items || [], N = items.length, MEET = !!(o.context && o.context.type === 'meeting');
    var S = null, browsing = null, cache = {}, notes = {}, unsub = null, tick = null, alive = true;
    /* video: a layer of its own over the slide picture, outside the part that redraws */
    var quiz = null;   /* egbc-quiz.js, when the page loads it (F-255) */
    var host = document.createElement('div'), mels = {}, mshown = '', sound = !!o.tv || (o.context && o.context.type === 'meeting'), soundBlocked = false, mtick = null, ytReady = {};
    host.className = 'pz-mhost'; host.style.display = 'none'; document.body.appendChild(host);

    /* ---- the pictures: previews first, then the full ones, all in the background ---- */
    function preload() {
      var order = [];
      items.forEach(function (it, i) { if (it.kind === 'image') order.push([i, 'thumb']); });
      items.forEach(function (it, i) { if (it.kind === 'image') order.push([i, 'full']); });
      (function next() {
        if (!alive || !order.length) return;
        var x = order.shift(), it = items[x[0]], url = it[x[1]];
        if (!url) return next();
        var im = new Image(); im.decoding = 'async';
        im.onload = im.onerror = function () { (cache[x[0]] = cache[x[0]] || {})[x[1]] = im.naturalWidth ? url : null; next(); };
        im.src = url;
      })();
    }
    function src(i, want) {
      var it = items[i]; if (!it || it.kind !== 'image') return '';
      var c = cache[i] || {};
      return want === 'thumb' ? (c.thumb || it.thumb) : (c.full || c.thumb || it.full);
    }

    /* ---- the stage: two layers, crossfading ---- */
    function stageHtml(id) { return '<div class="pz-stage" id="' + id + '"><div class="layer"></div><div class="layer"></div><div class="blank"></div></div>'; }
    function show(stageId, i, blank) {
      var st = el.querySelector('#' + stageId); if (!st) return;
      st.querySelector('.blank').classList.toggle('on', !!blank);
      if (st._i === i) return;
      var ls = st.querySelectorAll('.layer'), cur = st._on || 0, nxt = 1 - cur, it = items[i];
      if (!it) { ls[nxt].innerHTML = ''; }
      else if (it.kind === 'image') {
        var full = src(i, 'full'), thumb = src(i, 'thumb');
        ls[nxt].innerHTML = '<img alt="Slide ' + (i + 1) + '" src="' + esc(full || thumb) + '">';
        /* not here yet: the preview now, sharpened when the full picture comes */
        if (!(cache[i] || {}).full && full) { var im = new Image(); im.onload = function () { var g = ls[nxt].querySelector('img'); if (g && st._i === i) g.src = full; }; im.src = full; }
      } else if (it.kind === 'quiz') ls[nxt].innerHTML = quiz ? quiz.stage(i, stageId) : '';
      else ls[nxt].innerHTML = '<div class="html">' + (it.html || '') + '</div>';
      ls[nxt].classList.add('on'); ls[cur].classList.remove('on');
      st._on = nxt; st._i = i;
      if (stageId === 'pzStage') syncMedia();
    }

    /* ---- video and sound (F-251) ---- */
    function mediaOf(i) { var it = items[i]; return (it && it.media) || []; }
    function hasMedia(i) { return mediaOf(i).some(function (m) { return m.src || m.youtube; }); }
    function light() { var c = navigator.connection || {}; return !o.tv && (window.innerWidth < 900 || c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '')); }
    function ytSend(f, a, m) { try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: m, args: a || [] }), '*'); } catch (e) {} }
    function mel(i, k) {
      var key = i + '-' + k, m = mediaOf(i)[k]; if (!m) return null;
      if (mels[key]) return mels[key];
      var box = document.createElement('div'); box.className = 'pz-m';
      var r = m.rect || [0, 0, 1, 1];
      box.style.cssText = 'left:' + r[0] * 100 + '%;top:' + r[1] * 100 + '%;width:' + r[2] * 100 + '%;height:' + r[3] * 100 + '%';
      var v;
      if (m.youtube) {
        v = document.createElement('iframe'); v.setAttribute('allow', 'autoplay; encrypted-media'); v.setAttribute('title', 'Video');
        v.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(m.youtube) + '?enablejsapi=1&playsinline=1&controls=0&disablekb=1&rel=0&modestbranding=1&mute=' + (sound ? 0 : 1);
        v.onload = function () { ytReady[key] = true; try { v.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*'); } catch (e) {} };
      } else if (m.src) {
        v = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
        v.preload = 'metadata'; v.playsInline = true; v.setAttribute('playsinline', ''); v.disablePictureInPicture = true; v.controls = false;
        v.muted = !sound; v.volume = Math.max(0, Math.min(1, m.volume == null ? 1 : m.volume)); v.loop = !!m.loop;
        v.src = (light() && m.light) || m.src;
        v.addEventListener('playing', function () { v.classList.add('on'); });
        v.addEventListener('seeked', function () { if (v.currentTime > 0.05) v.classList.add('on'); });
      } else return null;
      box.appendChild(v); mels[key] = { box: box, v: v, m: m, yt: !!m.youtube };
      return mels[key];
    }
    /* where the slide picture is on the screen (the picture is "contained" in the stage) */
    function placeHost() {
      var st = el.querySelector('#pzStage'), on = st && mshown && !(S && S.blank && browsing === null);
      if (!on) { host.style.display = 'none'; return; }
      var r = st.getBoundingClientRect(), it = items[+mshown] || {}, ratio = it.ratio || 16 / 9, w = r.width, h = r.height;
      if (w / h > ratio) w = h * ratio; else h = w / ratio;
      host.style.display = 'block';
      host.style.left = (r.left + window.scrollX + (r.width - w) / 2) + 'px'; host.style.top = (r.top + window.scrollY + (r.height - h) / 2) + 'px';
      host.style.width = w + 'px'; host.style.height = h + 'px';
    }
    /* Where should video k of slide i be now? (seconds), and is it playing? */
    function target(i, k) {
      var x = S && S.media, m = mediaOf(i)[k];
      if (!x || x.i !== i || x.k !== k || browsing !== null) return { play: false, t: 0, live: false };
      var t = +x.at || 0;
      if (x.state === 'playing') t += Math.max(0, (now() - Date.parse(x.since || new Date().toISOString())) / 1000);
      var len = (m && m.seconds) || 0, ended = false;
      if (len && t >= len) { if (m.loop) t = t % len; else { t = len; ended = true; } }
      return { play: x.state === 'playing' && !ended, t: t, live: true };
    }
    function syncMedia() {
      if (!alive) return;
      var i = (S && S.presenterUid) ? at() : -1, want = i >= 0 && hasMedia(i) ? String(i) : '';
      if (want !== mshown) {
        Object.keys(mels).forEach(function (key) { var e = mels[key]; if (e.box.parentNode) { if (!e.yt) e.v.pause(); e.box.remove(); } });
        mshown = want;
        if (want) mediaOf(i).forEach(function (m, k) { var e = mel(i, k); if (e) { host.appendChild(e.box); if (!e.yt) { e.v.preload = 'auto'; } } });
      }
      placeHost();
      if (!want) { clearInterval(mtick); mtick = null; return; }
      var playing = false;
      mediaOf(i).forEach(function (m, k) {
        var e = mels[i + '-' + k]; if (!e) return;
        var g = target(i, k); playing = playing || g.play;
        if (e.yt) {
          if (!ytReady[i + '-' + k]) return;
          if (g.live) { ytSend(e.v, [g.t, true], 'seekTo'); ytSend(e.v, [], g.play ? 'playVideo' : 'pauseVideo'); e.v.classList.add('on'); }
          else { ytSend(e.v, [], 'pauseVideo'); e.v.classList.remove('on'); }
          ytSend(e.v, [], sound ? 'unMute' : 'mute');
          return;
        }
        var v = e.v; v.muted = !sound;
        if (!g.live) { if (!v.paused) v.pause(); if (v.currentTime > 0.05) { try { v.currentTime = 0; } catch (x) {} } v.classList.remove('on'); return; }
        /* its own length when the file did not say: a finished video stays
           finished (play() on an ended video would start it again) */
        var dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        if (dur && g.t >= dur - 0.15) { if (m.loop) g.t = g.t % dur; else { g.t = dur; g.play = false; } }
        if (Math.abs((v.currentTime || 0) - g.t) > (g.play ? 1.5 : 0.3)) { try { v.currentTime = g.t; } catch (x) {} }
        if (g.play && v.paused) {
          var p = v.play();
          if (p && p.catch) p.catch(function () { if (!v.muted) { soundBlocked = true; v.muted = true; v.play().catch(function () {}); tapForSound(); } });
        } else if (!g.play && !v.paused) v.pause();
        if (g.t > 0.05 || g.play) v.classList.add('on');
      });
      if (playing && !mtick) mtick = setInterval(syncMedia, 1000);
      if (!playing && mtick) { clearInterval(mtick); mtick = null; }
      mediaBar();
    }
    /* A TV or phone that will not play sound until someone taps it */
    function tapForSound() {
      if (document.querySelector('.pz-tap')) return;
      var b = document.createElement('button'); b.className = 'pz-tap'; b.type = 'button';
      b.textContent = o.tv ? 'Click once to let this screen play sound' : 'Tap for sound';
      b.onclick = function () { sound = true; soundBlocked = false; b.remove(); Object.keys(mels).forEach(function (k) { if (!mels[k].yt) mels[k].v.muted = false; }); syncMedia(); };
      document.body.appendChild(b);
    }
    /* the presenter: play, pause, start again (one video at a time) */
    function mediaWrite(k, state, at0) {
      if (!amPresenter()) return;
      var t = at0 != null ? at0 : target(S.slide, k).t;
      S.media = { i: S.slide, k: k, state: state, at: Math.round(t * 100) / 100, since: new Date().toISOString() };
      syncMedia();
      ref.update({ media: S.media }).catch(function () {});
    }
    function mediaBar() {
      var bar = el.querySelector('[data-mbar]'); if (!bar || !S) return;
      var i = amPresenter() ? S.slide : at(), list = mediaOf(i);
      bar.querySelectorAll('[data-mtime]').forEach(function (t) {
        var k = +t.getAttribute('data-mtime'), g = target(i, k), len = (list[k] || {}).seconds || 0;
        t.textContent = mmss(g.t * 1000) + (len ? ' / ' + mmss(len * 1000) : '') + (g.play ? ' · playing' : g.live ? ' · paused' : '');
        var pb = bar.querySelector('[data-mplay="' + k + '"]'); if (pb) pb.textContent = g.play ? '\u275a\u275a Pause' : '\u25b6 Play';
      });
      var sb = bar.querySelector('[data-sound]'); if (sb) sb.textContent = sound ? '\ud83d\udd0a Sound on here' : '\ud83d\udd07 Sound off here';
    }
    function mediaBarHtml(i, presenter) {
      var list = mediaOf(i).map(function (m, k) { return [m, k]; }).filter(function (x) { return x[0].src || x[0].youtube || x[0].link; });
      if (!list.length) return '';
      return '<div class="pz-mbar" data-mbar>' + list.map(function (x) {
        var m = x[0], k = x[1], name = (m.kind === 'audio' ? 'Sound' : 'Video') + (list.length > 1 ? ' ' + (k + 1) : '');
        if (!m.src && !m.youtube) return presenter ? '<span class="lbl">' + name + ' is a link</span><a class="pz-btn" href="' + esc(m.link) + '" target="_blank" rel="noopener" style="text-decoration:none">Open the video</a>' : '';
        if (m.playable === false) return '<span class="lbl">' + name + ': ' + esc(m.why || 'cannot play in a browser') + '</span>';
        return '<span class="lbl">' + name + '</span>' + (presenter ? '<button class="pz-btn" data-mplay="' + k + '">\u25b6 Play</button><button class="pz-btn" data-mrestart="' + k + '">\u21ba Start again</button>' : '') + '<span class="tm" data-mtime="' + k + '"></span>';
      }).join('') + '<span class="pz-sp"></span><button class="pz-btn" data-sound></button></div>';
    }

    function amPresenter() { return S && S.presenterUid && S.presenterUid === me.uid; }
    function at() { return browsing !== null ? browsing : (S ? S.slide : 0); }

    /* ---- drawing ---- */
    function draw() {
      if (!alive) return;
      var live = S && S.presenterUid;
      if (amPresenter() && !o.tv) return drawPresenter();
      var top = o.tv ? '' : '<div class="pz-top"><div><div class="t">' + esc(o.title || 'Present') + '</div><div class="s">' +
        (live ? esc(S.presenterName || 'Someone') + ' presenting · ' + (at() + 1) + ' of ' + N : 'Nobody is presenting yet') + '</div></div><span class="pz-sp"></span>' +
        (live ? (browsing === null ? '<span class="pz-live" data-follow><i></i>Following ' + esc(S.presenterName || '') + '</span><button class="pz-btn" data-browse>Browse on my own</button>'
          : '<span class="pz-live off" data-browsing><i></i>You’re on ' + (browsing + 1) + ' · ' + esc(S.presenterName || '') + ' is on ' + (S.slide + 1) + '</span><button class="pz-btn main" data-back>Back to presenter</button>') : '') +
        (o.mayPresent ? (live ? '<button class="pz-btn" data-take>Take over presenting</button>' : '<a class="pz-btn" data-guide href="present-guide.html" style="text-decoration:none">How to present</a><button class="pz-btn main" data-start>Present</button>') : '') + '</div>';
      el.className = 'pz' + (o.tv ? ' pz-tv' : '') + (MEET ? ' pz-meet' : '');
      if (o.tv && !live) { el.className = 'pz pz-tv'; el.innerHTML = '<div class="pz-wait" style="min-height:100vh"><div><p style="font-size:clamp(20px,3vw,40px);color:#fff;margin:0 0 8px;font-weight:700">' + esc(o.title || '') + '</p><p style="margin:0">The slides appear here when the leader presents.</p></div></div>'; return; }
      el.innerHTML = top + (live || o.tv ? '<div class="pz-view"><div class="main">' + stageHtml('pzStage') +
        '<div class="pz-prog"><i style="width:' + Math.round((at() + 1) / Math.max(1, N) * 100) + '%"></i></div><div class="pz-cap">' +
        (browsing !== null ? '<button class="pz-btn" data-prev>◀</button> <button class="pz-btn" data-nextb>▶</button> ' : '') + 'Slide ' + (at() + 1) + ' of ' + N + '</div>' +
        (live && !o.tv && browsing === null ? '<div style="margin-top:10px">' + mediaBarHtml(at(), false) + '</div>' : '') + '</div>' +
        (o.faces && !o.tv ? '<div class="pz-faces" data-faces></div>' : '') + '</div>'
        : '<div class="pz-wait"><div><p style="font-size:18px;color:#fff;margin:0 0 6px">' + esc(o.title || 'Slides') + '</p><p style="margin:0">' + N + ' slides. ' + (o.mayPresent ? 'Press Present when you’re ready.' : 'They show here when someone presents.') + '</p></div></div>');
      if (live || o.tv) show('pzStage', at(), S && S.blank && browsing === null);
      placeFaces(); wire(); syncMedia();
    }
    function drawPresenter() {
      var i = S.slide;
      el.className = 'pz' + (MEET ? ' pz-meet' : '');
      el.innerHTML = '<div class="pz-top"><div><div class="t">' + esc(o.title || 'Present') + '</div><div class="s">Everyone sees slide ' + (i + 1) + ' of ' + N + '</div></div><span class="pz-sp"></span>' +
        '<span class="pz-timer" data-timer>0:00<small data-slidetime>on this slide 0:00</small></span><button class="pz-btn stop" data-stop>Stop presenting</button></div>' +
        '<div class="pz-pres"><div style="display:flex;flex-direction:column;gap:12px;min-width:0"><p class="pz-lbl"><span class="pz-live"><i></i>Everyone sees this</span>Slide ' + (i + 1) + ' of ' + N + (S.blank ? ' · <span style="color:#fde68a">blanked</span>' : '') + '</p>' +
        stageHtml('pzStage') +
        '<div class="pz-film" data-film>' + items.map(function (it, k) { return '<button data-jump="' + k + '" class="' + (k === i ? 'on' : '') + '" aria-label="Slide ' + (k + 1) + '">' + (it.kind === 'image' ? '<img alt="" src="' + esc(src(k, 'thumb')) + '">' : '<span class="txt">' + esc(String(it.kind === 'quiz' ? 'Quiz: ' + (it.title || '') : (it.html || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)) + '</span>') + '<span>' + (k + 1) + '</span>' + (hasMedia(k) ? '<span class="vid">\u25b6 video</span>' : '') + '</button>'; }).join('') + '</div>' +
        (items[i] && items[i].kind === 'quiz' ? '' : mediaBarHtml(i, true)) +
        '<div class="pz-ctl"><button class="pz-btn back" data-backs aria-label="Back">◀</button><button class="pz-btn go" data-go>' + (i + 1 < N ? 'Next slide ▶' : 'That’s the last slide') + '</button></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pz-btn" data-blank>' + (S.blank ? 'Show the slide again' : 'Blank the screen') + '</button></div></div>' +
        '<div class="pz-side" style="display:flex;flex-direction:column;gap:14px;min-width:0">' + (items[i] && items[i].kind === 'quiz' && quiz ? quiz.panel(i) : '') + '<div class="pz-card pz-next"><p class="pz-lbl">Up next</p>' + (i + 1 < N ? stageHtml('pzNext') : '<p class="pz-cap">The end.</p>') + '</div>' +
        '<div class="pz-card pz-notescard"><p class="pz-lbl">Your notes</p><div class="pz-notes" data-notes>…</div></div>' +
        (o.faces ? '<div class="pz-card"><p class="pz-lbl" data-faceslbl>In the meeting</p><div class="pz-faces" data-faces></div></div>' : '') + '</div></div>';
      show('pzStage', i, S.blank);
      if (i + 1 < N) show('pzNext', i + 1, false);
      syncMedia();
      var k = i; Promise.resolve(notes[k] !== undefined ? notes[k] : (o.notesFor ? o.notesFor(k) : '')).then(function (t) { notes[k] = t || ''; var n = el.querySelector('[data-notes]'); if (n && S && S.slide === k) n.textContent = notes[k] || 'No notes for this slide.'; });
      placeFaces(); wire(); timer();
      if (quiz && items[i] && items[i].kind === 'quiz') quiz.wire(i);
    }
    function placeFaces() { var f = el.querySelector('[data-faces]'); if (f && o.faces) f.appendChild(o.faces); }
    function timer() {
      clearInterval(tick);
      tick = setInterval(function () {
        var t = el.querySelector('[data-timer]'); if (!t || !S) return;
        t.firstChild.nodeValue = mmss(now() - Date.parse(S.startedAt || new Date().toISOString()));
        var s = el.querySelector('[data-slidetime]'); if (s) s.textContent = 'on this slide ' + mmss(now() - Date.parse(S.slideAt || S.startedAt));
      }, 500);
    }

    /* ---- moving: the presenter writes one number ---- */
    function go(i) {
      if (!amPresenter()) return;
      i = Math.max(0, Math.min(N - 1, i));
      if (i === S.slide) return;
      S.slide = i; S.slideAt = new Date().toISOString();
      var auto = -1; mediaOf(i).forEach(function (m, k) { if (auto < 0 && m.start === 'auto' && (m.src || m.youtube) && m.playable !== false) auto = k; });
      S.media = auto >= 0 ? { i: i, k: auto, state: 'playing', at: 0, since: S.slideAt } : null;
      draw();
      ref.update({ slide: i, slideAt: S.slideAt, blank: false, media: S.media }).catch(function () {});
    }
    function start() {
      var t = new Date().toISOString();
      /* the same deck carries on from its slide; another deck starts at the beginning */
      var same = S && S.presenterUid && (S.deckId || '') === ((o.nowExtra || {}).deckId || '');
      return ref.set(Object.assign({ context: o.context, slide: same ? S.slide : 0, presenterUid: me.uid, presenterName: myName,
        startedAt: (same && S.startedAt) || t, slideAt: t, blank: false, updatedBy: me.uid }, o.nowExtra || {})).catch(function (e) { alert('Could not present: ' + (e.message || e)); });
    }
    function stop() { return ref.update({ presenterUid: '', presenterName: '', blank: false }).then(function () { if (o.onEnd) o.onEnd(); }, function () {}); }

    function wire() {
      var q = function (s) { return el.querySelector(s); };
      if (q('[data-go]')) q('[data-go]').onclick = function () { go(S.slide + 1); };
      if (q('[data-backs]')) q('[data-backs]').onclick = function () { go(S.slide - 1); };
      if (q('[data-stop]')) q('[data-stop]').onclick = stop;
      if (q('[data-blank]')) q('[data-blank]').onclick = function () { ref.update({ blank: !S.blank }).catch(function () {}); };
      el.querySelectorAll('[data-jump]').forEach(function (b) { b.onclick = function () { go(+b.getAttribute('data-jump')); }; });
      if (q('[data-browse]')) q('[data-browse]').onclick = function () { browsing = S.slide; draw(); };
      if (q('[data-back]')) q('[data-back]').onclick = function () { browsing = null; draw(); };
      if (q('[data-prev]')) q('[data-prev]').onclick = function () { browsing = Math.max(0, browsing - 1); draw(); };
      if (q('[data-nextb]')) q('[data-nextb]').onclick = function () { browsing = Math.min(N - 1, browsing + 1); draw(); };
      if (q('[data-start]')) q('[data-start]').onclick = start;
      el.querySelectorAll('[data-mplay]').forEach(function (b) { b.onclick = function () { var k = +b.getAttribute('data-mplay'), g = target(S.slide, k); mediaWrite(k, g.play ? 'paused' : 'playing', g.live ? g.t : 0); }; });
      el.querySelectorAll('[data-mrestart]').forEach(function (b) { b.onclick = function () { mediaWrite(+b.getAttribute('data-mrestart'), 'playing', 0); }; });
      if (q('[data-sound]')) q('[data-sound]').onclick = function () { sound = !sound; soundBlocked = false; var t = document.querySelector('.pz-tap'); if (t) t.remove(); syncMedia(); };
      if (q('[data-take]')) q('[data-take]').onclick = start;
    }
    function onKey(e) {
      if (/input|textarea|select/i.test((e.target || {}).tagName || '')) return;
      var fwd = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].indexOf(e.key) >= 0, back = ['ArrowLeft', 'ArrowUp', 'PageUp'].indexOf(e.key) >= 0;
      if (amPresenter()) {
        if (fwd) { e.preventDefault(); go(S.slide + 1); } else if (back) { e.preventDefault(); go(S.slide - 1); }
        else if (e.key === 'b' || e.key === 'B') ref.update({ blank: !S.blank }).catch(function () {});
        else if ((e.key === 'k' || e.key === 'K') && hasMedia(S.slide)) { var k0 = S.media && S.media.i === S.slide ? S.media.k : 0, g0 = target(S.slide, k0); mediaWrite(k0, g0.play ? 'paused' : 'playing', g0.live ? g0.t : 0); }
      } else if (browsing !== null) {
        if (fwd) { browsing = Math.min(N - 1, browsing + 1); draw(); } else if (back) { browsing = Math.max(0, browsing - 1); draw(); }
      }
    }
    document.addEventListener('keydown', onKey);

    /* ---- following: one listener ---- */
    var first = true;
    unsub = ref.onSnapshot(function (d) {
      var was = S && S.presenterUid, prev = S;
      S = d.exists ? d.data() : null;
      /* a meeting's host chose this deck: present it now, unless already presenting it */
      if (first) { first = false; if (o.autoStart && !(S && S.presenterUid === me.uid && (S.deckId || '') === ((o.nowExtra || {}).deckId || ''))) start(); }
      if (S && !S.presenterUid) S = Object.assign({}, S, { presenterUid: '' });
      if (S && prev && prev.presenterUid === me.uid && S.presenterUid !== me.uid) { var w = document.createElement('div'); w.setAttribute('role', 'status'); w.className = 'pz-handed'; w.textContent = (S.presenterName || 'Someone') + ' is presenting now'; el.dataset.handed = w.textContent; }
      if (!S || !S.presenterUid) browsing = null;
      if (was && S && !S.presenterUid && o.onEnd) o.onEnd();
      /* only redraw the whole view when who presents changes; otherwise the stage moves */
      if (!prev || (prev.presenterUid || '') !== (S && S.presenterUid || '') || amPresenter()) draw();
      else if (browsing === null && prev && prev.slide !== S.slide && (hasMedia(prev.slide) || hasMedia(S.slide))) draw();
      else if (browsing === null) { show('pzStage', S.slide, S.blank); syncMedia(); var p = el.querySelector('.pz-prog i'); if (p) p.style.width = Math.round((S.slide + 1) / Math.max(1, N) * 100) + '%';
        var c = el.querySelector('.pz-cap'); if (c) c.textContent = 'Slide ' + (S.slide + 1) + ' of ' + N; var s = el.querySelector('.pz-top .s'); if (s) s.textContent = (S.presenterName || '') + ' presenting · ' + (S.slide + 1) + ' of ' + N; }
      else draw();
      if (quiz) quiz.update();
    }, function () { S = null; draw(); });
    if (global.EGBCQuiz) quiz = EGBCQuiz.attach({ el: el, items: items, ref: ref, getS: function () { return S; },
      at: function () { return amPresenter() && !o.tv ? (S ? S.slide : 0) : at(); }, isPresenter: function () { return amPresenter() && !o.tv; },
      tv: !!o.tv, sessionId: (o.context || {}).sessionId || '', redraw: function () { draw(); } });
    preload();
    draw();
    var onPlace = function () { placeHost(); };
    window.addEventListener('resize', onPlace); window.addEventListener('scroll', onPlace, true);

    return {
      stop: stop,
      start: start,
      destroy: function () { alive = false; clearInterval(tick); clearInterval(mtick); if (unsub) unsub(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onPlace); window.removeEventListener('scroll', onPlace, true); Object.keys(mels).forEach(function (k) { if (!mels[k].yt) mels[k].v.pause(); }); host.remove(); if (quiz) quiz.destroy(); el.innerHTML = ''; },
      state: function () { return S; }
    };
  }

  /* A deck's slides as items: the pictures through Storage (its rules decide). */
  function deckItems(deckId, count, media, ratio) {
    var st = EGBCAuth.storage(), list = [];
    for (var n = 1; n <= count; n++) list.push(n);
    var url = function (f) { return f ? st.ref('present/' + deckId + '/' + f).getDownloadURL().catch(function () { return ''; }) : Promise.resolve(''); };
    return Promise.all(list.map(function (n) {
      var mine = (media || []).filter(function (m) { return m.shown === n - 1; }).sort(function (a, b) { return a.k - b.k; });
      return Promise.all([st.ref('present/' + deckId + '/s' + n + '.jpg').getDownloadURL(), st.ref('present/' + deckId + '/t' + n + '.jpg').getDownloadURL(),
        Promise.all(mine.map(function (m) { return Promise.all([url(m.src), url(m.light)]).then(function (u) { return Object.assign({}, m, { src: u[0], light: u[1] }); }); }))])
        .then(function (u) { return { kind: 'image', full: u[0], thumb: u[1], deckId: deckId, n: n, ratio: ratio || 16 / 9, media: u[2] }; });
    }));
  }
  /* Speaker notes: presenters only (presentNotes; the rules). */
  function notesReader(deckId) {
    var got = null;
    return function (i) {
      if (!got) got = EGBCAuth.db.collection('presentNotes').doc(deckId).get().then(function (d) { return d.exists ? (d.data().notes || []) : []; }, function () { return []; });
      return got.then(function (a) { return a[i] || ''; });
    };
  }

  /* ===================================================================
     "PRESENT SLIDES" IN A VIDEO MEETING (F-242 section 6, F-247)
     ===================================================================
     meeting.html (the main window's page) loads firebase-storage-compat.js
     BEFORE egbc-auth.js (so the hub connects Storage, as every page with
     slides does) and egbc-present.js, adds a div beside the call, and:
       EGBCPresent.attachMeeting({ room, eventId, el: <that div>,
         call: document.getElementById('stage'), host: !!hostToken })
     Everyone in the meeting follows presentNow/mtg_<room>_<event or day>.
     While someone presents, body.presenting turns the page into the slides
     with the call (Daily's own tiles, Step 1) as a strip beside them on a
     computer, below them on a phone; when they stop it goes back. No screen
     share: every screen shows the slide picture it already has.
     The HOST (whoever started as host) gets "Present slides" (or the page's
     own `button`): a deck made for this meeting before, or a new one - a
     PowerPoint file or a OneDrive link, made into slides by the converter,
     exactly as in the session planner. A meeting's deck goes 30 days after
     the meeting unless kept (runPresentSweep). Another host may take over.
     Until the hub goes live nothing is uploaded (as F-235). The rules decide
     who sees a meeting's slides: master admins until the main window adds
     meetingHost()/meetingInvitee() - anyone else simply sees the call. */
  var MCSS = '[data-pzmeet]{display:none}' +
    'body.presenting [data-pzmeet]{display:flex;flex-direction:column;flex:1;min-height:0;border-radius:12px;overflow:auto;margin:0 0 8px}' +
    '.pz-meet .pz-view{grid-template-columns:minmax(0,1fr)}' +
    '@media (min-width:761px){body.presenting [data-pzmeet]{margin-right:312px}body.presenting .pz-mcall{position:fixed!important;right:12px;top:var(--pz-calltop,72px);bottom:12px;width:300px;flex:none!important;min-height:0!important;z-index:3}}' +
    '@media (max-width:760px){body.presenting .pz-mcall{flex:0 0 190px!important;height:190px;min-height:0!important}}' +
    '.pz-mbtn{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:4;min-height:44px;padding:0 18px;border-radius:999px;border:0;background:#3d6263;color:#fff;font:700 14.5px Inter,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer}' +
    'body.presenting .pz-mbtn{display:none}' +
    '.pz-msheet,.pz-msheet *{box-sizing:border-box}' +
    '.pz-msheet{position:fixed;inset:0;z-index:20;background:rgba(5,8,11,.6);display:flex;align-items:flex-end;justify-content:center}' +
    '.pz-msheet .pz-sin{background:#121a21;color:#e2e8f0;border:1px solid #22303b;border-radius:16px 16px 0 0;width:100%;max-width:560px;max-height:88vh;overflow:auto;padding:18px 16px calc(18px + env(safe-area-inset-bottom));font:400 15px/1.45 Inter,sans-serif}' +
    '@media (min-width:600px){.pz-msheet{align-items:center}.pz-msheet .pz-sin{border-radius:16px}}' +
    '.pz-msheet h3{margin:0 0 4px;color:#fff;font:800 19px Inter,sans-serif}.pz-msheet .pz-ss{color:#94a3b8;font-size:13.5px;margin:0 0 12px}' +
    '.pz-msheet .pz-deck{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;margin:0 0 8px;padding:10px 12px;border:1px solid #2c3c48;border-radius:12px;background:#0b1116;color:#e2e8f0;font:600 15px Inter,sans-serif;text-align:left;cursor:pointer}' +
    '.pz-msheet label{display:block;font:600 13px Inter,sans-serif;color:#cbd5e1;margin:12px 0 4px}' +
    '.pz-msheet input[type=text],.pz-msheet input[type=url]{width:100%;min-height:44px;border-radius:10px;border:1px solid #2c3c48;background:#0b1116;color:#e2e8f0;padding:0 12px;font:400 15px Inter,sans-serif}' +
    '.pz-msheet input[type=file]{color:#cbd5e1;max-width:100%}.pz-msheet .pz-srow{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.pz-msheet .pz-smsg{min-height:20px;margin:10px 0 0;color:#fde68a;font-size:14px}';

  function need(srcUrl, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = srcUrl; sc.onload = function () { res(); }; sc.onerror = function () { rej(new Error('Could not load ' + srcUrl)); }; document.head.appendChild(sc); });
  }
  function londonDay() { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  /* The host's say-so lasts while the host is here: the host's page renews it each minute; the rules and the server end it 3 minutes after the last (a host whose connection is lost). The page itself stops a little sooner, while still allowed. */
  var ALLOW_UI_MS = 150000;

  function attachMeeting(m) {
    css();
    if (!document.getElementById('pz-mcss')) { var st = document.createElement('style'); st.id = 'pz-mcss'; st.textContent = MCSS; document.head.appendChild(st); }
    var db = EGBCAuth.db, me = EGBCAuth.user() || {}, myName = String(((EGBCAuth.profile && EGBCAuth.profile()) || {}).name || 'Someone').slice(0, 120);
    var el = m.el, call = m.call, alive = true;
    var day = m.day || londonDay(), room = String(m.room || ''), eventId = String(m.eventId || '');
    /* the same key the rules build (meetingKey()): room and event ids never hold "/" */
    var key = 'mtg_' + room + '_' + (eventId || day);
    var ctx = { type: 'meeting', room: room, eventId: eventId, day: day };
    var ref = db.collection('presentNow').doc(key), cur = null, loading = '', btn = null, sheet = null, S = null;
    var allow = null, allowed = [], here = [], timers = [], unsubs = [];
    /* an attribute, not a class: the engine sets the div's own classes */
    el.setAttribute('data-pzmeet', ''); if (call) call.classList.add('pz-mcall');

    /* ---- may I present? the host; or the one person the host has let present, while the host is still here ---- */
    function ms(t) { return t && t.toMillis ? t.toMillis() : (t ? Date.parse(t) : 0); }
    function fresh(a) { return !!a && a.uid === me.uid && Date.now() - ms(a.aliveAt) < ALLOW_UI_MS; }
    function mayNow() { return !!m.host || fresh(allow); }

    function layout(on) {
      document.body.classList.toggle('presenting', !!on);
      if (on) { var r = el.getBoundingClientRect(); document.body.style.setProperty('--pz-calltop', Math.max(8, Math.round(r.top)) + 'px'); }
    }
    function teardown() { if (cur) { cur.ctl.destroy(); cur = null; } loading = ''; el.className = ''; layout(false); }
    /* this deck, on this screen: the same pictures in the same order as everyone */
    var startWhenLoaded = '';
    function showDeck(deckId, autoStart) {
      /* "present this deck" when it is already on this screen (as a viewer): present it, don't drop the ask */
      if (cur && cur.deckId === deckId && cur.may === mayNow()) { if (autoStart && mayNow()) cur.ctl.start(); return Promise.resolve(); }
      /* ... or when it is still loading as a viewer: start it when it lands */
      if (loading === deckId) { if (autoStart) startWhenLoaded = deckId; return Promise.resolve(); }
      loading = deckId;
      return need('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js', function () { return !!(global.firebase && firebase.storage); })
        .then(function () { return db.collection('presentDecks').doc(deckId).get(); })
        .then(function (d) {
          var x = d.exists ? d.data() : null;
          if (!x || x.status !== 'ready') throw new Error('Those slides are not ready.');
          return deckItems(deckId, x.count, x.media, x.ratio).then(function (items) { return { x: x, items: items }; });
        })
        .then(function (r) {
          if (!alive || loading !== deckId) return;
          if (startWhenLoaded === deckId) { autoStart = true; startWhenLoaded = ''; }
          /* a viewer's slides came after the presenting had stopped (the say-so and the stop can arrive apart): nothing to show */
          if (!autoStart && !(S && S.presenterUid && S.deckId === deckId)) { loading = ''; if (!cur) teardown(); return; }
          if (cur) cur.ctl.destroy();
          layout(true);
          var may = mayNow();
          cur = { deckId: deckId, may: may, ctl: mount(el, { key: key, context: ctx, items: r.items, notesFor: notesReader(deckId), title: r.x.name || 'Slides',
            mayPresent: may, nowExtra: { deckId: deckId }, autoStart: !!autoStart, onEnd: function () { setTimeout(teardown, 0); } }) };
          loading = '';
        })
        .catch(function (e) { loading = ''; if (autoStart) alert('The slides could not be shown: ' + ((e && e.message) || e)); });
    }

    /* everyone: follow whoever is presenting (a screen the rules do not let see the slides just keeps the call) */
    function follow() {
      if (S && S.presenterUid && S.deckId) showDeck(S.deckId, false);
      else if (cur && !(S && S.presenterUid)) teardown();
    }
    unsubs.push(ref.onSnapshot(function (d) { S = d.exists ? d.data() : null; follow(); }, function () { S = null; teardown(); }));

    /* ---- the button: for whoever may present now ---- */
    function drawButton() {
      if (!btn) {
        btn = m.button || null;
        if (!btn) { btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pz-mbtn'; btn.textContent = 'Present slides'; (call || document.body).appendChild(btn); }
        btn.setAttribute('data-mpresent', '');
        btn.onclick = open;
      }
      var may = mayNow();
      btn.hidden = !may; btn.style.display = may ? '' : 'none';
      if (!may) close();
      /* what I may do changed: the slides on show redraw with the right buttons ("Take over") */
      if (cur && cur.may !== may) { var d0 = cur.deckId; cur.ctl.destroy(); cur = null; loading = ''; if (S && S.presenterUid && S.deckId === d0) showDeck(d0, false); else teardown(); }
    }

    /* ---- I am here (the host's people list): my own small record, kept fresh, gone when I leave ---- */
    var hereRef = db.collection('presentHere').doc(key + '_' + me.uid);
    function beHere() { return hereRef.set({ context: ctx, key: key, uid: me.uid, name: myName, at: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {}); }
    if (me.uid) { beHere(); timers.push(setInterval(beHere, 60000)); }

    /* ---- an allowance for me? ---- */
    if (me.uid && !m.host) {
      unsubs.push(db.collection('presentAllow').doc(key + '_' + me.uid).onSnapshot(function (d) {
        var was = fresh(allow);
        allow = d.exists ? d.data() : null;
        if (was && !fresh(allow)) stopIfMine();
        drawButton();
      }, function () { allow = null; drawButton(); }));
      /* the host's say-so goes stale if the host has gone without saying (a lost connection): stop first, while still allowed */
      timers.push(setInterval(function () { if (allow && !fresh(allow)) { stopIfMine(); allow = null; drawButton(); } }, 15000));
    }
    function stopIfMine() { if (S && S.presenterUid === me.uid) ref.update({ presenterUid: '', presenterName: '', blank: false, updatedBy: me.uid }).catch(function () {}); }

    /* ---- the host: who is here, and who may present ---- */
    if (m.host && me.uid) {
      unsubs.push(db.collection('presentHere').where('key', '==', key).onSnapshot(function (s) {
        here = s.docs.map(function (d) { return d.data(); }).filter(function (p) { return p.uid !== me.uid && Date.now() - ms(p.at) < 3 * 60000; });
        drawPeople();
      }, function () {}));
      unsubs.push(db.collection('presentAllow').where('key', '==', key).onSnapshot(function (s) {
        allowed = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        drawPeople();
      }, function () {}));
      /* my say-so stays alive while I am here */
      timers.push(setInterval(function () {
        allowed.filter(function (a) { return a.by === me.uid; }).forEach(function (a) { grant(a.uid, a.name); });
      }, 60000));
    }
    function grant(uid, name) {
      return db.collection('presentAllow').doc(key + '_' + uid).set({ context: ctx, key: key, uid: uid, name: String(name || '').slice(0, 120), by: me.uid,
        at: firebase.firestore.FieldValue.serverTimestamp(), aliveAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    /* one person at a time: letting someone present takes it from anyone else */
    function letPresent(uid, name) {
      return Promise.all(allowed.filter(function (a) { return a.uid !== uid; }).map(function (a) { return takeBack(a.uid); })).then(function () { return grant(uid, name); })
        .catch(function (e) { alert('Could not let them present: ' + ((e && e.message) || e)); });
    }
    /* taking it back: and if they are presenting, they stop */
    function takeBack(uid) {
      /* one commit: when the host is leaving, the page may be gone before a second write goes */
      var b = db.batch();
      if (S && S.presenterUid === uid) b.update(ref, { presenterUid: '', presenterName: '', blank: false, updatedBy: me.uid });
      b.delete(db.collection('presentAllow').doc(key + '_' + uid));
      return b.commit();
    }
    function drawPeople() {
      var box = sheet && sheet.querySelector('[data-mpeople]'); if (!box) return;
      var a = allowed[0];
      box.innerHTML = '<p class="pz-ss" style="margin:14px 0 8px">Let someone else present</p>' +
        (a ? '<div class="pz-deck" data-mallowed="' + esc(a.uid) + '" style="cursor:default"><span style="flex:1">' + esc(a.name || 'Someone') + ' may present</span><button class="pz-btn" data-mtakeback="' + esc(a.uid) + '">Take it back</button></div>' : '') +
        (here.filter(function (p) { return !a || p.uid !== a.uid; }).map(function (p) {
          return '<button class="pz-deck" data-mlet="' + esc(p.uid) + '" data-name="' + esc(p.name) + '"><span style="flex:1">Let ' + esc(p.name || 'them') + ' present</span></button>';
        }).join('') || (a ? '' : '<p class="pz-ss">Nobody else here yet.</p>'));
      box.querySelectorAll('[data-mlet]').forEach(function (b) { b.onclick = function () { b.disabled = true; letPresent(b.getAttribute('data-mlet'), b.getAttribute('data-name')); }; });
      box.querySelectorAll('[data-mtakeback]').forEach(function (b) { b.onclick = function () { b.disabled = true; takeBack(b.getAttribute('data-mtakeback')).catch(function () {}); }; });
    }

    /* ---- choose this meeting's slides, or add some ---- */
    function close() { if (sheet) { sheet.remove(); sheet = null; } }
    function open() {
      if (!mayNow()) return;
      close();
      sheet = document.createElement('div'); sheet.className = 'pz-msheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Present slides');
      sheet.innerHTML = '<div class="pz-sin"><h3>Present slides</h3><p class="pz-ss">' + (m.host ? 'Everyone in the meeting sees your slides, large, with the faces beside them. You get your notes and what’s next.' : 'The host has let you present. Everyone sees your slides; the host can take it back at any time.') + '</p><div data-mlist><p class="pz-ss">Loading…</p></div>' +
        '<div data-madd></div>' + (m.host ? '<div data-mpeople></div>' : '') + '<div class="pz-srow"><button class="pz-btn" data-mclose>Close</button></div></div>';
      document.body.appendChild(sheet);
      sheet.querySelector('[data-mclose]').onclick = close;
      sheet.onclick = function (e) { if (e.target === sheet) close(); };
      drawPeople();
      var list = sheet.querySelector('[data-mlist]'), add = sheet.querySelector('[data-madd]');
      /* this meeting only - pinned in the query, so the rules can answer for every deck it could return */
      var dq = db.collection('presentDecks').where('context.type', '==', 'meeting').where('context.room', '==', room);
      dq = eventId ? dq.where('context.eventId', '==', eventId) : dq.where('context.eventId', '==', '').where('context.day', '==', day);
      dq.get().then(function (s) {
        var mine = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
          .filter(function (x) { return x.status === 'ready'; });
        if (!sheet) return;
        list.innerHTML = mine.length ? '<p class="pz-ss" style="margin:0 0 8px">This meeting’s slides</p>' + mine.map(function (x) {
          return '<button class="pz-deck" data-mdeck="' + esc(x.id) + '"><span style="flex:1">' + esc(x.name || 'Slides') + '</span><span style="color:#94a3b8;font-weight:500">' + (+x.count || 0) + ' slides ▶</span></button>'; }).join('') : '';
        list.querySelectorAll('[data-mdeck]').forEach(function (b) { b.onclick = function () { close(); showDeck(b.getAttribute('data-mdeck'), true); }; });
      }, function () { if (list) list.innerHTML = ''; });
      /* Until the hub goes live nothing is uploaded (its storage is not yet private) */
      need(BASE + 'egbc-launch.js?v=202610141700', function () { return !!global.EGBCLaunch; }).then(function () { return EGBCLaunch.check(); }).then(function (x) { return !!(x && x.locked); }, function () { return false; }).then(function (ok) {
        if (!sheet) return;
        if (!ok) { add.innerHTML = '<p class="pz-ss" data-mheld>You can add slides when the hub goes live.</p>'; return; }
        add.innerHTML = '<label for="mName">Add slides: a name</label><input type="text" id="mName" maxlength="120" placeholder="Building fund update">' +
          '<label for="mFile">A PowerPoint file (.pptx, up to 100 MB)</label><input type="file" id="mFile" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation">' +
          '<label for="mLink">or its OneDrive link (up to 1 GB)</label><input type="url" id="mLink" placeholder="https://…sharepoint.com/…">' +
          '<div class="pz-srow"><button class="pz-btn main" data-mgo>Add and present</button></div><p class="pz-smsg" data-mmsg role="status"></p>';
        add.querySelector('[data-mgo]').onclick = addDeck;
      });
    }
    function addDeck() {
      var q = function (s) { return sheet && sheet.querySelector(s); }, say = function (t) { var p = q('[data-mmsg]'); if (p) p.textContent = t; };
      var f = q('#mFile').files[0], link = (q('#mLink').value || '').trim(), name = (q('#mName').value || '').trim();
      if (!f && !link) return say('Choose the PowerPoint file, or paste its OneDrive link.');
      if (f && !/\.pptx$/i.test(f.name)) return say('That is not a PowerPoint (.pptx) file. Keynote or Google Slides: save it as PowerPoint first.');
      if (f && f.size > 100 * 1024 * 1024) return say('This file is ' + Math.round(f.size / 1048576) + ' MB. From this device the most is 100 MB. For a bigger one, put it in OneDrive, choose Share, “Anyone with the link can view”, and paste the link: up to 1 GB.');
      var dref = db.collection('presentDecks').doc(), go = q('[data-mgo]'), stopWatch = null, ended = false;
      go.disabled = true; say(f ? 'Sending the file…' : 'Fetching it from OneDrive…');
      var finish = function (ok, why) {
        if (ended) return; ended = true; if (stopWatch) stopWatch();
        if (ok) { close(); showDeck(dref.id, true); } else { if (go) go.disabled = false; say('The slides could not be made: ' + why); }
      };
      need('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js', function () { return !!(global.firebase && firebase.storage); }).then(function () {
        return dref.set({ context: ctx, name: (name || (f ? f.name.replace(/\.pptx$/i, '') : 'Slides')).slice(0, 120), status: 'uploaded', source: f ? 'upload' : 'onedrive',
          by: me.uid, byName: myName.slice(0, 80), at: new Date().toISOString() });
      }).then(function () {
        /* the deck says how far it has got; a long one outlasts the call's wait */
        stopWatch = dref.onSnapshot(function (d) {
          var x = d.data() || {};
          if (x.status === 'fetching') say('Fetching it from OneDrive…'); else if (x.status === 'converting') say('Making the slides…');
          else if (x.status === 'video') say('Getting the video ready… a long video takes a few minutes.');
          else if (x.status === 'ready') finish(true); else if (x.status === 'failed') finish(false, x.why || 'please try again.');
        }, function () {});
        if (f) return EGBCAuth.storage().ref('present/' + dref.id + '/source.pptx').put(f, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
          .then(function () { return EGBCAuth.call('presentConvert', { deckId: dref.id }); });
        return EGBCAuth.call('presentFromLink', { deckId: dref.id, url: link });
      }).catch(function (e) { if (!/deadline|timeout/i.test(String((e && (e.code || e.message)) || ''))) finish(false, (e && e.message) || e); });
    }

    drawButton();
    /* leaving the meeting (the page closes, or Daily's "left-meeting"): stop presenting, and the host's say-so ends with them */
    /* LEAVING (22 Oct): a closing page is gone before the database library
       sends its writes (they go a moment later), and a request carrying a
       sign-in header can't leave a closing page either. A BEACON can
       (navigator.sendBeacon: plain text, no preflight): it goes to the hub's
       presentLeave, which checks the sign-in and does only what this person
       may do (stop their presenting, take back the say-so they gave, remove
       their "who is here"). The library's own write stays as a second try.
       The sign-in is kept fresh beforehand: there's no time to fetch one then. */
    var tok = '';
    function freshToken() { var u = EGBCAuth.user(); if (u && u.getIdToken) u.getIdToken().then(function (t) { tok = t; }, function () {}); }
    freshToken(); timers.push(setInterval(freshToken, 20 * 60000));
    function leaveUrl() {
      var st = (db._delegate && db._delegate._settings) || {}, pid = db.app.options.projectId;
      /* the same choice egbc-auth.js makes for its functions */
      return /^(localhost|127\.0\.0\.1)(:|$)/.test(st.host || '') ? 'http://localhost:' + (location.port === '5601' ? 5102 : 5101) + '/' + pid + '/europe-west2/presentLeave'
        : 'https://europe-west2-' + pid + '.cloudfunctions.net/presentLeave';
    }
    var left = false;
    var onLeave = function () {
      if (left) return; left = true;
      if (tok && navigator.sendBeacon) { try { navigator.sendBeacon(leaveUrl(), new Blob([JSON.stringify({ idToken: tok, key: key })], { type: 'text/plain' })); } catch (e) {} }
      var b = db.batch(), stopping = S && S.presenterUid === me.uid;
      /* the host's say-so ends with them, and so does that person's presenting */
      if (m.host) allowed.filter(function (a) { return a.by === me.uid; }).forEach(function (a) {
        if (S && S.presenterUid === a.uid) stopping = true;
        b.delete(db.collection('presentAllow').doc(key + '_' + a.uid));
      });
      if (stopping) b.update(ref, { presenterUid: '', presenterName: '', blank: false, updatedBy: me.uid });
      b.commit().catch(function () {});
      hereRef.delete().catch(function () {});
    };
    window.addEventListener('pagehide', onLeave);
    if (m.frame && m.frame.on) m.frame.on('left-meeting', onLeave);

    return {
      open: open,
      key: key,
      letPresent: letPresent,
      takeBack: takeBack,
      destroy: function () { alive = false; close(); unsubs.forEach(function (u) { try { u(); } catch (e) {} }); timers.forEach(clearInterval); window.removeEventListener('pagehide', onLeave); teardown(); if (btn && !m.button) btn.remove(); el.removeAttribute('data-pzmeet'); if (call) call.classList.remove('pz-mcall'); }
    };
  }

  global.EGBCPresent = { mount: mount, deckItems: deckItems, notesReader: notesReader, css: css, attachMeeting: attachMeeting };
})(window);
