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
   its slide and catches up when it is back. No screen share, no video.

     EGBCPresent.mount(el, {
       key,          'ps_<session>' | 'mtg_<room>_<event or day>'
       context,      { type: 'session', groupId, sessionId } | { type: 'meeting', room, eventId, day }
       items,        [{ kind: 'image', full, thumb, deckId, n } | { kind: 'html', html }]
                     (the same list, in the same order, on every screen)
       notesFor,     function (i) -> Promise of the presenter's notes for item i ('' if none)
       title,        what is being shown ("Building fund update")
       mayPresent,   true if this person may present (the rules say the same)
       faces,        optional element: the people (Daily's tiles), shown beside
                     the slides for everyone and in the presenter's view
       tv,           true: a screen that only shows (present.html on the TV)
       onEnd         called when the presenter stops
     }) -> { stop(), destroy() }

   Who sees: the viewer (follows; "Browse on my own" then "Back to
   presenter"), the presenter (now, next, notes, timer, thumbnails, Next /
   Back / Blank / Stop, the faces with raised hands), and anyone who may
   present gets "Take over" (the presenter sees who took it).
   Keys and clickers: arrows, space, PageUp / PageDown; B blanks.
   =================================================================== */
(function (global) {
  'use strict';

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
    '.pz-next .pz-stage{box-shadow:none}' +
    '.pz-ctl{display:flex;gap:12px;margin-top:12px}' +
    '.pz-wait{flex:1;display:grid;place-items:center;padding:24px;text-align:center;color:var(--pz-mute)}' +
    '.pz-tv .pz-top{display:none}.pz-tv .pz-view{grid-template-columns:1fr;padding:0}.pz-tv .pz-stage{border-radius:0;box-shadow:none;aspect-ratio:auto;height:100vh}.pz-tv .pz-prog,.pz-tv .pz-cap{display:none}' +
    '.pz-film .txt{position:absolute;inset:0;padding:14px 6px 4px;font:600 9px/1.2 Inter,sans-serif;color:#e2e8f0;text-align:left;overflow:hidden}' +
    '@media (max-width:760px){.pz-view,.pz-pres{grid-template-columns:1fr;padding:12px;gap:12px}.pz-view .main{justify-content:flex-start}' +
    '.pz-ctl{position:sticky;bottom:0;z-index:2;margin:0 -12px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(11,17,22,0),#0b1116 35%)}' +
    '.pz-side{display:flex;flex-direction:column}.pz-side .pz-notescard{order:-1}.pz-faces{flex-direction:row;overflow-x:auto}.pz-faces>*{flex:0 0 112px}' +
    '.pz-top{padding:8px 12px}.pz-btn.back{flex-basis:76px}}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css() { if (document.getElementById('pz-css')) return; var s = document.createElement('style'); s.id = 'pz-css'; s.textContent = CSS; document.head.appendChild(s); }
  function mmss(ms) { ms = Math.max(0, ms | 0); var s = Math.floor(ms / 1000), m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); }
  function now() { return Date.now(); }

  function mount(el, o) {
    css();
    var db = EGBCAuth.db, me = EGBCAuth.user() || {}, myName = (EGBCAuth.profile && EGBCAuth.profile() || {}).name || 'Someone';
    var ref = db.collection('presentNow').doc(o.key), items = o.items || [], N = items.length;
    var S = null, browsing = null, cache = {}, notes = {}, unsub = null, tick = null, alive = true;

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
      } else ls[nxt].innerHTML = '<div class="html">' + (it.html || '') + '</div>';
      ls[nxt].classList.add('on'); ls[cur].classList.remove('on');
      st._on = nxt; st._i = i;
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
      el.className = 'pz' + (o.tv ? ' pz-tv' : '');
      if (o.tv && !live) { el.className = 'pz pz-tv'; el.innerHTML = '<div class="pz-wait" style="min-height:100vh"><div><p style="font-size:clamp(20px,3vw,40px);color:#fff;margin:0 0 8px;font-weight:700">' + esc(o.title || '') + '</p><p style="margin:0">The slides appear here when the leader presents.</p></div></div>'; return; }
      el.innerHTML = top + (live || o.tv ? '<div class="pz-view"><div class="main">' + stageHtml('pzStage') +
        '<div class="pz-prog"><i style="width:' + Math.round((at() + 1) / Math.max(1, N) * 100) + '%"></i></div><div class="pz-cap">' +
        (browsing !== null ? '<button class="pz-btn" data-prev>◀</button> <button class="pz-btn" data-nextb>▶</button> ' : '') + 'Slide ' + (at() + 1) + ' of ' + N + '</div></div>' +
        (o.faces && !o.tv ? '<div class="pz-faces" data-faces></div>' : '') + '</div>'
        : '<div class="pz-wait"><div><p style="font-size:18px;color:#fff;margin:0 0 6px">' + esc(o.title || 'Slides') + '</p><p style="margin:0">' + N + ' slides. ' + (o.mayPresent ? 'Press Present when you’re ready.' : 'They show here when someone presents.') + '</p></div></div>');
      if (live || o.tv) show('pzStage', at(), S && S.blank && browsing === null);
      placeFaces(); wire();
    }
    function drawPresenter() {
      var i = S.slide;
      el.className = 'pz';
      el.innerHTML = '<div class="pz-top"><div><div class="t">' + esc(o.title || 'Present') + '</div><div class="s">Everyone sees slide ' + (i + 1) + ' of ' + N + '</div></div><span class="pz-sp"></span>' +
        '<span class="pz-timer" data-timer>0:00<small data-slidetime>on this slide 0:00</small></span><button class="pz-btn stop" data-stop>Stop presenting</button></div>' +
        '<div class="pz-pres"><div style="display:flex;flex-direction:column;gap:12px;min-width:0"><p class="pz-lbl"><span class="pz-live"><i></i>Everyone sees this</span>Slide ' + (i + 1) + ' of ' + N + (S.blank ? ' · <span style="color:#fde68a">blanked</span>' : '') + '</p>' +
        stageHtml('pzStage') +
        '<div class="pz-film" data-film>' + items.map(function (it, k) { return '<button data-jump="' + k + '" class="' + (k === i ? 'on' : '') + '" aria-label="Slide ' + (k + 1) + '">' + (it.kind === 'image' ? '<img alt="" src="' + esc(src(k, 'thumb')) + '">' : '<span class="txt">' + esc(String(it.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)) + '</span>') + '<span>' + (k + 1) + '</span></button>'; }).join('') + '</div>' +
        '<div class="pz-ctl"><button class="pz-btn back" data-backs aria-label="Back">◀</button><button class="pz-btn go" data-go>' + (i + 1 < N ? 'Next slide ▶' : 'That’s the last slide') + '</button></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pz-btn" data-blank>' + (S.blank ? 'Show the slide again' : 'Blank the screen') + '</button></div></div>' +
        '<div class="pz-side" style="display:flex;flex-direction:column;gap:14px;min-width:0"><div class="pz-card pz-next"><p class="pz-lbl">Up next</p>' + (i + 1 < N ? stageHtml('pzNext') : '<p class="pz-cap">The end.</p>') + '</div>' +
        '<div class="pz-card pz-notescard"><p class="pz-lbl">Your notes</p><div class="pz-notes" data-notes>…</div></div>' +
        (o.faces ? '<div class="pz-card"><p class="pz-lbl" data-faceslbl>In the meeting</p><div class="pz-faces" data-faces></div></div>' : '') + '</div></div>';
      show('pzStage', i, S.blank);
      if (i + 1 < N) show('pzNext', i + 1, false);
      var k = i; Promise.resolve(notes[k] !== undefined ? notes[k] : (o.notesFor ? o.notesFor(k) : '')).then(function (t) { notes[k] = t || ''; var n = el.querySelector('[data-notes]'); if (n && S && S.slide === k) n.textContent = notes[k] || 'No notes for this slide.'; });
      placeFaces(); wire(); timer();
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
      S.slide = i; S.slideAt = new Date().toISOString(); draw();
      ref.update({ slide: i, slideAt: S.slideAt, blank: false }).catch(function () {});
    }
    function start() {
      var t = new Date().toISOString();
      return ref.set({ context: o.context, slide: S && S.presenterUid ? S.slide : 0, presenterUid: me.uid, presenterName: myName,
        startedAt: (S && S.startedAt) || t, slideAt: t, blank: false, updatedBy: me.uid }).catch(function (e) { alert('Could not present: ' + (e.message || e)); });
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
      if (q('[data-take]')) q('[data-take]').onclick = start;
    }
    function onKey(e) {
      if (/input|textarea|select/i.test((e.target || {}).tagName || '')) return;
      var fwd = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].indexOf(e.key) >= 0, back = ['ArrowLeft', 'ArrowUp', 'PageUp'].indexOf(e.key) >= 0;
      if (amPresenter()) {
        if (fwd) { e.preventDefault(); go(S.slide + 1); } else if (back) { e.preventDefault(); go(S.slide - 1); }
        else if (e.key === 'b' || e.key === 'B') ref.update({ blank: !S.blank }).catch(function () {});
      } else if (browsing !== null) {
        if (fwd) { browsing = Math.min(N - 1, browsing + 1); draw(); } else if (back) { browsing = Math.max(0, browsing - 1); draw(); }
      }
    }
    document.addEventListener('keydown', onKey);

    /* ---- following: one listener ---- */
    unsub = ref.onSnapshot(function (d) {
      var was = S && S.presenterUid, prev = S;
      S = d.exists ? d.data() : null;
      if (S && !S.presenterUid) S = Object.assign({}, S, { presenterUid: '' });
      if (S && prev && prev.presenterUid === me.uid && S.presenterUid !== me.uid) { var w = document.createElement('div'); w.setAttribute('role', 'status'); w.className = 'pz-handed'; w.textContent = (S.presenterName || 'Someone') + ' is presenting now'; el.dataset.handed = w.textContent; }
      if (!S || !S.presenterUid) browsing = null;
      if (was && S && !S.presenterUid && o.onEnd) o.onEnd();
      /* only redraw the whole view when who presents changes; otherwise the stage moves */
      if (!prev || (prev.presenterUid || '') !== (S && S.presenterUid || '') || amPresenter()) draw();
      else if (browsing === null) { show('pzStage', S.slide, S.blank); var p = el.querySelector('.pz-prog i'); if (p) p.style.width = Math.round((S.slide + 1) / Math.max(1, N) * 100) + '%';
        var c = el.querySelector('.pz-cap'); if (c) c.textContent = 'Slide ' + (S.slide + 1) + ' of ' + N; var s = el.querySelector('.pz-top .s'); if (s) s.textContent = (S.presenterName || '') + ' presenting · ' + (S.slide + 1) + ' of ' + N; }
      else draw();
    }, function () { S = null; draw(); });
    preload();
    draw();

    return {
      stop: stop,
      destroy: function () { alive = false; clearInterval(tick); if (unsub) unsub(); document.removeEventListener('keydown', onKey); el.innerHTML = ''; },
      state: function () { return S; }
    };
  }

  /* A deck's slides as items: the pictures through Storage (its rules decide). */
  function deckItems(deckId, count) {
    var st = EGBCAuth.storage(), list = [];
    for (var n = 1; n <= count; n++) list.push(n);
    return Promise.all(list.map(function (n) {
      return Promise.all([st.ref('present/' + deckId + '/s' + n + '.jpg').getDownloadURL(), st.ref('present/' + deckId + '/t' + n + '.jpg').getDownloadURL()])
        .then(function (u) { return { kind: 'image', full: u[0], thumb: u[1], deckId: deckId, n: n }; });
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

  global.EGBCPresent = { mount: mount, deckItems: deckItems, notesReader: notesReader };
})(window);
