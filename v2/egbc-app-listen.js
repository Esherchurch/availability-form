/* ===================================================================
   EGBC — the phone app's "Listen" tab (Me and my family): sermons
   (events window; APP-DESIGN-BRIEF §6, FINDINGS-events F-124, F-132,
   the shell contract in FINDINGS-app A-050)
   ===================================================================

   THE CONTRACT (A-050), as for Kids Church Today. The shell calls, once:

     EGBCAppListen.register(V, { row, sec, next, ic, esc, redraw })

   which sets V.me_listen. EVERYTHING FROM THE DATABASE IS ESCAPED HERE.
   Buttons that do something carry data-lact and are handled here;
   navigation stays the shell's data-act.

   THE PLAYER OUTLIVES THE SCREEN. The shell redraws a screen from scratch
   on every navigation, so the <audio> element is NOT in the screen: it is
   made once, hidden, on <body>, and keeps playing while the person goes
   to Home or their rota. The screen only shows it. The phone's lock
   screen gets play, pause and skip (the Media Session API).

   IT REMEMBERS YOUR PLACE: on this phone at once (localStorage, every few
   seconds and on pause), and for anyone signed in also in
   listenProgress/<uid>/sermons/<id> (every 30 seconds, on pause and when
   the app is put away), so "Carry on listening" works on another phone.
   Only the person themselves can read it (the rules).

   WHAT IT SHOWS: the sermons that are shown (the rules let nobody else see
   the rest): those from Val's podcast (Martin's option 3, F-138), which
   play from the podcast's own addresses, and any uploaded in the hub.
   Search by speaker, Bible book, title, series or date.

   Needs (loaded before it): egbc-auth.js (with Storage), egbc-events.js.
   =================================================================== */

(function (global) {
  'use strict';

  var E = global.EGBCEvents;
  var H = null, STARTED = false, LOADED = false, FAILED = false;
  var D = { sermons: [], series: {}, show: null };
  var PROG = {};                         /* sermonId -> { pos, dur, done, at (ms) } */
  var VIEW = { mode: 'home', seriesId: '', q: '' };
  var A = null, NOW = '', lastLocal = 0, lastCloud = 0, URLS = {};
  var KEY = 'egbc.listen.v1';

  function db() { return EGBCAuth.db; }
  function uid() { return (EGBCAuth.user && EGBCAuth.user() || {}).uid || ''; }
  function esc(s) { return H ? H.esc(s) : String(s == null ? '' : s); }
  function all(s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  var redrawTimer = null;
  function redraw() { clearTimeout(redrawTimer); redrawTimer = setTimeout(function () { if (H && H.redraw) H.redraw(); }, 30); }
  function sermon(id) { return D.sermons.filter(function (s) { return s.id === id; })[0] || null; }
  function seriesOf(s) { return s && s.seriesId ? D.series[s.seriesId] || null : null; }
  function clock(sec) {
    sec = Math.max(0, Math.floor(+sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function minsLeft(p) { var l = Math.max(0, (p.dur || 0) - (p.pos || 0)); return l < 60 ? 'less than a minute left' : Math.round(l / 60) + ' min left'; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function dayMon(date) { var p = String(date || '').split('-'); return [String(+p[2] || ''), MON[(+p[1] || 1) - 1]]; }
  function said(date) { var p = dayMon(date); return p[0] + ' ' + p[1] + ' ' + String(date).slice(0, 4); }
  function passage(s) { return s.book ? s.book + (s.passage ? ' ' + s.passage : '') : ''; }
  function subOf(s) { var ser = seriesOf(s); return [ser ? ser.name : passage(s), s.speaker, s.durationSec ? Math.round(s.durationSec / 60) + ' min' : ''].filter(Boolean).join(' · '); }

  /* ---------------- remembering the place ---------------- */

  function readLocal() {
    try { return JSON.parse(global.localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeLocal() {
    try { global.localStorage.setItem(KEY, JSON.stringify(PROG)); } catch (e) { /* private window: this phone only forgets */ }
  }
  function note(id, pos, dur, done) {
    PROG[id] = { pos: Math.max(0, Math.round(pos * 10) / 10), dur: Math.max(0, Math.round(dur || 0)), done: !!done, at: Date.now() };
  }
  function saveCloud(id) {
    var u = uid(), p = PROG[id];
    if (!u || !p) return Promise.resolve();
    lastCloud = Date.now();
    return db().collection('listenProgress').doc(u).collection('sermons').doc(id)
      .set({ pos: p.pos, dur: p.dur, done: p.done, at: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(function () { /* kept on this phone; the next save tries again */ });
  }
  function saveNow(cloud) {
    if (!NOW || !A) return;
    var done = A.ended || (A.duration && A.currentTime >= A.duration - 1);
    note(NOW, done ? 0 : A.currentTime, A.duration || (PROG[NOW] || {}).dur || 0, done);
    writeLocal(); lastLocal = Date.now();
    if (cloud) saveCloud(NOW);
  }
  /* The newer of this phone's and the cloud's, sermon by sermon. */
  function mergeCloud(list) {
    list.forEach(function (c) {
      var at = c.at && c.at.toMillis ? c.at.toMillis() : 0, mine = PROG[c.id];
      if (!mine || at > (mine.at || 0)) PROG[c.id] = { pos: c.pos || 0, dur: c.dur || 0, done: !!c.done, at: at };
    });
    writeLocal();
  }

  /* ---------------- the player ---------------- */

  function audio() {
    if (A) return A;
    A = global.document.createElement('audio');
    A.id = 'egbc-listen-audio'; A.preload = 'metadata'; A.style.display = 'none';
    global.document.body.appendChild(A);
    A.addEventListener('timeupdate', function () {
      live();
      if (Date.now() - lastLocal > 5000) saveNow(false);
      if (Date.now() - lastCloud > 30000) saveNow(true);
    });
    A.addEventListener('pause', function () { saveNow(true); live(); });
    A.addEventListener('play', live);
    A.addEventListener('ended', function () { saveNow(true); redraw(); });
    A.addEventListener('loadedmetadata', live);
    global.addEventListener('pagehide', function () { saveNow(true); });
    global.document.addEventListener('visibilitychange', function () { if (global.document.visibilityState === 'hidden') saveNow(true); });
    return A;
  }
  /* A sermon from Val's podcast plays from the feed's own address; one
     uploaded in the hub, from Storage. */
  function urlOf(s) {
    if (s.audioUrl) return Promise.resolve(s.audioUrl);
    if (URLS[s.id]) return Promise.resolve(URLS[s.id]);
    return EGBCAuth.storage().ref(s.audioPath).getDownloadURL().then(function (u) { URLS[s.id] = u; return u; });
  }
  function play(id) {
    var s = sermon(id); if (!s) return;
    var a = audio();
    if (NOW === id && a.src) { a.play().catch(function () {}); return; }
    if (NOW) saveNow(true);
    NOW = id;
    redraw();
    urlOf(s).then(function (u) {
      var p = PROG[id];
      a.src = u;
      /* Carry on where they stopped, unless they had all but finished. */
      a.addEventListener('loadedmetadata', function once() {
        a.removeEventListener('loadedmetadata', once);
        if (p && !p.done && p.pos > 5 && (!a.duration || p.pos < a.duration - 15)) a.currentTime = p.pos;
      });
      session(s);
      return a.play();
    }).catch(function () { if (H && H.toast) H.toast('That sermon could not be played. Try again in a moment.'); });
  }
  function toggle() { var a = audio(); if (!NOW) return; if (a.paused) a.play().catch(function () {}); else a.pause(); }
  function skip(n) { var a = audio(); if (!NOW || !a.duration) return; a.currentTime = Math.max(0, Math.min(a.duration - 0.5, a.currentTime + n)); live(); }

  /* The lock screen and the headphones' buttons. */
  function session(s) {
    var ms = global.navigator && global.navigator.mediaSession;
    if (!ms || !global.MediaMetadata) return;
    var ser = seriesOf(s), art = [];
    ms.metadata = new global.MediaMetadata({ title: s.title, artist: s.speaker || '', album: ser ? ser.name : (D.show && D.show.showTitle) || 'Sermons', artwork: art });
    var set = function (k, f) { try { ms.setActionHandler(k, f); } catch (e) { /* not on this phone */ } };
    set('play', function () { audio().play(); });
    set('pause', function () { audio().pause(); });
    set('seekbackward', function () { skip(-15); });
    set('seekforward', function () { skip(30); });
    set('seekto', function (d) { if (d && d.seekTime != null) { audio().currentTime = d.seekTime; live(); } });
  }

  /* Keep the "now playing" card moving without redrawing the screen
     (a redraw would take the focus out of the search box). */
  function live() {
    var a = A, doc = global.document;
    if (!a) return;
    var t = doc.getElementById('lis-time'), r = doc.getElementById('lis-seek'), pp = doc.getElementById('lis-pp');
    if (t) t.textContent = clock(a.currentTime) + ' of ' + clock(a.duration || (PROG[NOW] || {}).dur || 0);
    if (r && doc.activeElement !== r) { r.max = String(Math.floor(a.duration || 0) || 1); r.value = String(Math.floor(a.currentTime)); }
    if (pp) { pp.setAttribute('aria-label', a.paused ? 'Play' : 'Pause'); pp.innerHTML = (H ? H.ic(a.paused ? 'play' : 'pause', 15) : '') + ' ' + (a.paused ? 'Play' : 'Pause'); }
    tell();
  }

  /* The shell's "Now playing" bar (F-137): it asks onChange() to hear when
     the sermon, its place or play/pause changes, and draws itself from
     nowPlaying(). At most four times a second. */
  var WATCHERS = [], lastTell = 0, tellTimer = null;
  function tell() {
    var gap = Date.now() - lastTell;
    if (gap < 250) { if (!tellTimer) tellTimer = setTimeout(function () { tellTimer = null; tell(); }, 250 - gap); return; }
    lastTell = Date.now();
    var n = nowPlaying();
    WATCHERS.forEach(function (fn) { try { fn(n); } catch (e) { /* a watcher's mistake is its own */ } });
  }
  function nowPlaying() {
    var s = NOW ? sermon(NOW) : null;
    if (!s) return null;
    var ser = seriesOf(s);
    return { id: NOW, title: s.title, speaker: s.speaker || '', series: ser ? ser.name : '', pos: A ? A.currentTime : 0,
             dur: (A && A.duration) || s.durationSec || 0, paused: A ? A.paused : true };
  }

  /* ---------------- loading ---------------- */

  function start() {
    if (STARTED) return; STARTED = true;
    PROG = readLocal();
    Promise.all([
      db().collection('sermons').where('published', '==', true).get(),
      db().collection('sermonSeries').get().catch(function () { return { docs: [] }; }),
      db().collection('sermonShow').doc('feedStatus').get().catch(function () { return null; }),
      uid() ? db().collection('listenProgress').doc(uid()).collection('sermons').get().catch(function () { return { docs: [] }; }) : Promise.resolve({ docs: [] })
    ]).then(function (r) {
      D.sermons = all(r[0]).filter(function (s) { return s.audioUrl || (s.audioPath && s.durationSec > 0); })
        .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title)); });
      D.series = {}; all(r[1]).forEach(function (s) { D.series[s.id] = s; });
      D.show = r[2] && r[2].exists ? r[2].data() : null;
      mergeCloud(all(r[3]));
      LOADED = true; redraw();
    }).catch(function () { FAILED = true; LOADED = true; redraw(); });
  }

  /* ---------------- drawing ---------------- */

  function act(lact, label, primary, icon) {
    return '<button class="btn' + (primary ? ' primary' : '') + '" data-lact="' + esc(lact) + '" style="min-height:44px">' + (icon && H ? H.ic(icon, 15) + ' ' : '') + label + '</button>';
  }
  /* A list row that acts: the shell's row(), inside our own data-lact. */
  function rowAct(lact, icon, title, sub) {
    return '<div data-lact="' + esc(lact) + '">' + H.row(icon, esc(title), esc(sub)) + '</div>';
  }
  var STYLE = '<style>.lis-list>[data-lact]+[data-lact]{border-top:1px solid var(--line)}.lis-q{width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:0 12px;font:inherit;background:var(--surface,#fff);color:var(--ink)}' +
    '.lis-seek{width:100%;accent-color:var(--brand)}.lis-time{font-size:12.5px;color:var(--muted)}</style>';

  function nowCard() {
    var s = sermon(NOW); if (!s) return '';
    var a = A || {}, p = PROG[NOW] || {}, dur = a.duration || p.dur || s.durationSec || 0, cur = a.currentTime || p.pos || 0;
    return '<div class="card next" data-l="now" style="--c:var(--brand)"><div><p class="sub" style="margin:0">Now playing</p><h4 style="margin:2px 0 0">' + esc(s.title) + '</h4><p>' + esc(subOf(s)) + '</p></div>' +
      '<input class="lis-seek" id="lis-seek" type="range" min="0" max="' + Math.floor(dur || 1) + '" value="' + Math.floor(cur) + '" aria-label="Where in the sermon">' +
      '<span class="lis-time" id="lis-time">' + clock(cur) + ' of ' + clock(dur) + '</span>' +
      '<div class="actions">' + act('back', 'Back 15s', false, 'rotate-ccw') +
      '<button class="btn primary" id="lis-pp" data-lact="toggle" style="min-height:44px" aria-label="' + (a.paused === false ? 'Pause' : 'Play') + '">' + (H.ic(a.paused === false ? 'pause' : 'play', 15)) + ' ' + (a.paused === false ? 'Pause' : 'Play') + '</button>' +
      act('fwd', 'On 30s', false, 'rotate-cw') + '</div></div>';
  }

  function carryOn() {
    var list = D.sermons.filter(function (s) { var p = PROG[s.id]; return p && !p.done && p.pos > 30 && s.id !== NOW; })
      .sort(function (a, b) { return (PROG[b.id].at || 0) - (PROG[a.id].at || 0); }).slice(0, 3);
    if (!list.length) return '';
    return H.sec('Carry on listening', null, '<div class="card list lis-list" data-l="carry">' + list.map(function (s) {
      return rowAct('play:' + s.id, 'circle-play', s.title, [s.speaker, minsLeft(PROG[s.id])].filter(Boolean).join(' · '));
    }).join('') + '</div>');
  }

  /* Speaker, Bible book, title, series, or a date said any usual way
     ("2026-10", "October", "4 Oct"). */
  function matches(q) {
    q = q.toLowerCase().trim(); if (!q) return [];
    var words = q.split(/\s+/);
    return D.sermons.filter(function (s) {
      var ser = seriesOf(s), p = String(s.date || '').split('-');
      var hay = [s.title, s.speaker, s.book, passage(s), ser ? ser.name : '', s.date, said(s.date), MONTH[(+p[1] || 1) - 1] + ' ' + p[0], +p[2] + ' ' + MONTH[(+p[1] || 1) - 1]].join(' | ').toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).slice(0, 30);
  }
  function results() {
    if (!VIEW.q.trim()) return '';
    var m = matches(VIEW.q);
    return m.length ? '<div class="card list lis-list">' + m.map(function (s) { return rowAct('play:' + s.id, 'circle-play', s.title, said(s.date) + ' · ' + subOf(s)); }).join('') + '</div>'
      : '<p class="sub" style="text-align:center">Nothing found for “' + esc(VIEW.q) + '”.</p>';
  }

  function seriesView() {
    var ser = D.series[VIEW.seriesId];
    var list = D.sermons.filter(function (s) { return s.seriesId === VIEW.seriesId; }).slice().reverse();
    return '<div>' + act('home', 'All sermons', false, 'arrow-left') + '<p class="hello" style="margin-top:10px">' + esc(ser ? ser.name : 'Series') + '</p>' +
      (ser && ser.description ? '<p class="sub">' + esc(ser.description) + '</p>' : '') + '</div>' + nowCard() +
      '<div class="card list lis-list" data-l="series-list">' + list.map(function (s, i) {
        var p = PROG[s.id];
        return rowAct('play:' + s.id, p && p.done ? 'circle-check' : 'circle-play', (i + 1) + '. ' + s.title, said(s.date) + ' · ' + [passage(s), s.speaker].filter(Boolean).join(' · ') + (p && !p.done && p.pos > 30 ? ' · ' + minsLeft(p) : ''));
      }).join('') + '</div>';
  }

  function screen() {
    start();
    var head = '<div><p class="hello">Listen</p><p class="sub">Sunday\'s sermons, here and on Spotify</p></div>';
    if (!LOADED) return STYLE + head + '<div class="card" style="padding:14px"><p class="sub" style="margin:0">Loading the sermons…</p></div>';
    if (FAILED) return STYLE + head + '<div class="card" style="padding:14px"><p style="margin:0">The sermons could not be loaded. Check the signal and try again.</p></div>';
    if (!D.sermons.length) return STYLE + head + '<div class="card" style="padding:14px" data-l="none"><p style="margin:0">No sermons yet. Sunday\'s will be here after it is put up.</p></div>';
    if (VIEW.mode === 'series' && D.series[VIEW.seriesId]) return STYLE + seriesView();
    var latest = D.sermons[0], ser = seriesOf(latest), dm = dayMon(latest.date);
    var latestCard = latest.id === NOW ? '' : H.next(esc(dm[0]), esc(dm[1]), esc(latest.title), esc(subOf(latest)), 'var(--brand)', 'var(--brand-tint)',
      act('play:' + latest.id, PROG[latest.id] && !PROG[latest.id].done && PROG[latest.id].pos > 30 ? 'Carry on' : 'Play', true, 'play') + (ser ? act('series:' + ser.id, 'Whole series', false, 'list') : ''));
    var counts = {}; D.sermons.forEach(function (s) { if (s.seriesId) counts[s.seriesId] = (counts[s.seriesId] || 0) + 1; });
    var series = Object.keys(D.series).filter(function (k) { return counts[k]; }).map(function (k) { return D.series[k]; })
      .sort(function (a, b) { return (b.order || 0) - (a.order || 0); });
    var recent = D.sermons.slice(latest.id === NOW ? 0 : 1, 6);
    return STYLE + head + nowCard() + latestCard + carryOn() +
      '<input class="lis-q" id="lis-q" type="search" placeholder="Search by speaker, Bible book or date" aria-label="Search the sermons" value="' + esc(VIEW.q) + '">' +
      '<div id="lis-res">' + results() + '</div>' +
      (series.length ? H.sec('Series', null, '<div class="card list lis-list" data-l="series">' + series.map(function (x) {
        return rowAct('series:' + x.id, 'layers', x.name, counts[x.id] + ' sermon' + (counts[x.id] === 1 ? '' : 's'));
      }).join('') + '</div>') : '') +
      (recent.length ? H.sec('Recent', null, '<div class="card list lis-list" data-l="recent">' + recent.map(function (s) {
        return rowAct('play:' + s.id, 'circle-play', s.title, said(s.date) + ' · ' + subOf(s));
      }).join('') + '</div>') : '') +
      (D.show && D.show.showTitle ? '<p class="example">Also on Spotify and other podcast apps: search for “' + esc(D.show.showTitle) + '”.</p>' : '');
  }

  /* ---------------- actions (data-lact) ---------------- */

  function doAct(a) {
    if (a.indexOf('play:') === 0) { play(a.slice(5)); return; }
    if (a.indexOf('series:') === 0) { VIEW.mode = 'series'; VIEW.seriesId = a.slice(7); redraw(); return; }
    if (a === 'home') { VIEW.mode = 'home'; redraw(); return; }
    if (a === 'toggle') { toggle(); return; }
    if (a === 'back') { skip(-15); return; }
    if (a === 'fwd') { skip(30); return; }
  }

  global.EGBCAppListen = {
    register: function (V, helpers) {
      H = helpers;
      V.me_listen = screen;
      var doc = global.document;
      doc.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-lact]');
        if (b) { e.preventDefault(); doAct(b.getAttribute('data-lact')); }
      });
      doc.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'lis-q') { VIEW.q = e.target.value; var r = doc.getElementById('lis-res'); if (r) r.innerHTML = results(); }
        if (e.target && e.target.id === 'lis-seek' && A && NOW) { A.currentTime = +e.target.value; live(); }
      });
    },
    /* For tests and the shell: what is loaded in the player now. */
    /* For the shell's "Now playing" bar (F-137): what is playing, or null;
       play or pause it; and hear when either changes. */
    nowPlaying: nowPlaying,
    toggle: function () { toggle(); },
    onChange: function (fn) { if (typeof fn === 'function') WATCHERS.push(fn); },
    _saveNow: function () { saveNow(true); }
  };
})(typeof window !== 'undefined' ? window : this);
