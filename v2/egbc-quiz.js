/* ===================================================================
   EGBC Quiz, inside Present (F-255; plan and mock-ups approved 21 Oct)
   ===================================================================
   A session's quiz step is one item in Present. When the presenter reaches
   it they choose how to play:

   TEAMS ON THE TV (younger groups, no phones): the question and A-D on the
   TV, a countdown, the teams' scores along the bottom. The leader's phone
   has the right answer marked, "Show the answer on the TV", a button per
   team ("who got it right?"), and Next. 1 point a team per right answer;
   the leader may turn on a bonus point for the first team. All of it lives
   in presentNow.quiz (the presenter alone writes it - the rules), so it
   needs nothing stored and nothing deleted.

   EVERYONE ON THEIR PHONES (older groups): a 6-digit code, a QR code and
   the short address on the TV; players answer on quiz.html with a nickname,
   no account (functions/quiz.js: anonymous sign-in stays off). The TV and
   the leader follow the run (quizRuns/{runId}: never the right answer before
   it is shown). The leader can remove a name, and "End" deletes everything.

     EGBCQuiz.attach({ el, items, ref, getS, at, isPresenter, tv, sessionId })
       -> { stage(i, stageId), panel(i), wire(i), update(), destroy() }
   =================================================================== */
(function (global) {
  'use strict';
  /* Where players join: the church's own address (its slug; a church's first
     slug is its id), so the server finds the church's quiz from it. EGBC's
     short address is sent on to quiz.html by Cloudflare. */
  var CID = (global.EGBCAuth && EGBCAuth.addressSlug && EGBCAuth.addressSlug()) || (global.EGBCAuth && EGBCAuth.churchId && EGBCAuth.churchId()) || '';
  /* Until the server's answer (run.join, the church's own address) is there */
  var SHORT = (CID ? CID + '.' : '') + 'churchhq.co.uk/quiz';
  var TEAM_COLOURS = ['#7f1d1d', '#1e3a8a', '#14532d', '#713f12', '#581c87', '#155e75'];
  var TEAM_NAMES = ['Lions', 'Eagles', 'Bears', 'Wolves', 'Foxes', 'Owls'];
  var CSS = '' +
    '.qz{position:absolute;inset:0;display:flex;flex-direction:column;gap:2.4%;padding:3.4% 4%;background:linear-gradient(160deg,#122428,#0b1116);color:#e2e8f0;font-size:clamp(9px,1.6vw,26px)}' +
    '.qz h2{margin:0;color:#fff;font-size:2.1em;line-height:1.15;font-weight:800}.qz .tag{align-self:flex-start;padding:.25em .8em;border-radius:999px;background:#1d3b3c;color:#a7d4d4;font-weight:600;font-size:.62em}' +
    '.qz .row{display:flex;align-items:center;gap:1em}.qz .sp{flex:1}.qz .clock{width:3.6em;height:3.6em;border-radius:50%;border:.3em solid #a7d4d4;display:grid;place-items:center;font-weight:800;color:#fff;font-size:1.3em}' +
    '.qz .grid{display:grid;grid-template-columns:1fr 1fr;gap:.7em;flex:1}.qz .ans{border-radius:.6em;color:#fff;font-weight:700;display:flex;align-items:center;gap:.6em;padding:0 .9em;font-size:1.15em;transition:opacity .2s}' +
    '.qz .k{width:1.7em;height:1.7em;border-radius:.4em;background:rgba(255,255,255,.18);display:grid;place-items:center;font-weight:800;flex:0 0 1.7em}' +
    '.qz .a0{background:#3d6b6c}.qz .a1{background:#7a5a3c}.qz .a2{background:#4b5a8a}.qz .a3{background:#6b4a6e}.qz .dim{opacity:.35}.qz .ok{outline:.18em solid #a7f3d0}' +
    '.qz .teams{display:flex;gap:.5em}.qz .team{flex:1;border-radius:.5em;padding:.35em .7em;color:#fff;font-weight:700;display:flex;justify-content:space-between;font-size:.8em}' +
    '.qz .big{font-size:3.6em;font-weight:800;letter-spacing:.06em;color:#fff}.qz .muted{color:#94a3b8}.qz .pill{display:inline-block;padding:.25em .7em;margin:.2em;border-radius:999px;background:#1d3b3c;color:#fff;font-weight:600;font-size:.8em}' +
    '.qz .board{display:flex;flex-direction:column;gap:.45em}.qz .board div{display:flex;justify-content:space-between;background:#1d3b3c;border-radius:.5em;padding:.45em .9em;color:#fff;font-weight:700;font-size:1.05em}' +
    '.qz .qr{background:#fff;padding:.4em;border-radius:.4em;width:7.5em;height:7.5em}.qz .qr img,.qz .qr canvas{width:100%!important;height:100%!important}' +
    '.qz-p{display:flex;flex-direction:column;gap:10px}.qz-p .pz-card{display:flex;flex-direction:column;gap:8px}.qz-p .opt{display:flex;flex-direction:column;gap:6px;border:1px solid #2c3c48;border-radius:14px;padding:12px}' +
    '.qz-p .ans{border-radius:12px;color:#fff;font-weight:700;display:flex;align-items:center;gap:10px;padding:8px 12px;min-height:44px}.qz-p .a0{background:#3d6b6c}.qz-p .a1{background:#7a5a3c}.qz-p .a2{background:#4b5a8a}.qz-p .a3{background:#6b4a6e}.qz-p .ok{outline:3px solid #a7f3d0}.qz-p .dim{opacity:.55}' +
    '.qz-p .teamb{color:#fff;border:3px solid transparent}.qz-p .teamb.on{border-color:#fde68a}.qz-p .names{display:flex;flex-wrap:wrap;gap:6px}.qz-p .names button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid #2c4b4c;background:#1d3b3c;color:#fff;font:600 13.5px Inter,sans-serif;cursor:pointer}' +
    '@media (max-width:760px){.pz-side [data-qpanel]{order:-2}}' +
    '.qz-p input[type=text]{min-height:40px;border-radius:10px;border:1px solid #2c3c48;background:#0b1116;color:#fff;padding:0 10px;font:500 15px Inter,sans-serif;flex:1;min-width:0}';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css() { if (document.getElementById('qz-css')) return; var s = document.createElement('style'); s.id = 'qz-css'; s.textContent = CSS; document.head.appendChild(s); }
  /* the same mixed order on every screen: a seeded shuffle */
  function order(n, seed, q) {
    var a = []; for (var i = 0; i < n; i++) a.push(i);
    var x = (seed * 31 + q * 7919 + 17) >>> 0;
    var rnd = function () { x = (x + 0x6D2B79F5) >>> 0; var t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (var j = n - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)), tmp = a[j]; a[j] = a[k]; a[k] = tmp; }
    return a;
  }
  var L = ['A', 'B', 'C', 'D'];
  var qrLib = null;
  function loadQr() {
    if (global.QRCode) return Promise.resolve();
    if (!qrLib) qrLib = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return qrLib;
  }

  function attach(api) {
    css();
    var run = null, runId = '', unsubRun = null, tick = null, alive = true, seen = {}, confirmPid = '';
    var S = function () { return api.getS() || {}; };
    var Q = function (i) { var q = S().quiz; return q && q.step === i ? q : null; };
    var item = function (i) { return api.items[i] || {}; };
    var call = function (n, d) { return EGBCAuth.call(n, d).then(function (r) { return r && r.data !== undefined ? r.data : r; }); };
    var write = function (q) { return api.ref.update({ quiz: q }).catch(function (e) { alert('Could not update the quiz: ' + (e.message || e)); }); };
    /* a countdown that starts when this screen first sees the question */
    function left(key, seconds, openedAt) {
      if (!seen[key]) { var lag = Math.min(3000, Math.max(0, Date.now() - (openedAt || Date.now()))); seen[key] = Date.now() - lag; }
      return Math.max(0, Math.ceil(seconds - (Date.now() - seen[key]) / 1000));
    }
    function teamsHtml(q) { return '<div class="teams">' + (q.teams || []).map(function (t, k) { return '<div class="team" style="background:' + esc(t.colour) + '">' + esc(t.name) + ((q.phase === 'answer' && (q.got || []).indexOf(k) >= 0) ? ' ✓' : '') + '<span>' + (t.score || 0) + '</span></div>'; }).join('') + '</div>'; }
    function questionHtml(text, answers, clockKey, seconds, openedAt, right, counts, foot, total, n) {
      return '<div class="qz" data-quiz><div class="row"><span class="tag">Question ' + (n + 1) + ' of ' + total + '</span><span class="sp"></span>' +
        (right == null ? '<div class="clock" data-qclock="' + esc(clockKey) + '" data-qsec="' + seconds + '" data-qopen="' + (openedAt || 0) + '">' + left(clockKey, seconds, openedAt) + '</div>' : '') + '</div>' +
        '<h2>' + esc(text) + '</h2><div class="grid">' + answers.map(function (a, k) {
          return '<div class="ans a' + k + (right != null ? (k === right ? ' ok' : ' dim') : '') + '" data-qans="' + k + '"><span class="k">' + L[k] + '</span>' + esc(a) + (counts ? '<span class="sp"></span>' + (counts[k] || 0) + (k === right ? ' ✓' : '') : '') + '</div>';
        }).join('') + '</div>' + (foot || '') + '</div>';
    }
    function boardHtml(title, rows, sub) {
      return '<div class="qz" data-quiz><div class="row"><h2>' + esc(title) + '</h2><span class="sp"></span><span class="muted">' + esc(sub || '') + '</span></div><div class="board">' +
        rows.map(function (r, k) { return '<div' + (r.colour ? ' style="background:' + esc(r.colour) + '"' : '') + '><span>' + (k + 1) + ' · ' + esc(r.name) + '</span><span>' + r.score.toLocaleString('en-GB') + '</span></div>'; }).join('') + '</div></div>';
    }
    function titleCard(it) { return '<div class="qz" data-quiz style="justify-content:center;align-items:center;text-align:center"><p class="muted" style="letter-spacing:.14em;font-weight:700;margin:0">QUIZ</p><h2 style="font-size:2.6em">' + esc(it.title || 'Quiz') + '</h2><p class="muted" style="margin:0">' + (it.questions || []).length + ' questions</p></div>'; }
    function ranked() { if (!run) return []; return Object.keys(run.players || {}).map(function (p) { return { pid: p, name: run.players[p].name, score: (run.scores || {})[p] || 0 }; }).sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); }); }

    /* ---- the stage: the TV, and everyone following ---- */
    function stage(i, stageId) {
      var it = item(i), q = Q(i);
      if (!q || stageId === 'pzNext') return titleCard(it);
      if (q.mode === 'tv') {
        var x = (it.questions || [])[q.q] || null;
        if (q.phase === 'setup' || !x && q.phase !== 'end') return '<div class="qz" data-quiz style="justify-content:center;text-align:center"><h2>' + esc(it.title || 'Quiz') + '</h2><p class="muted">Get into your teams</p>' + teamsHtml(q) + '</div>';
        if (q.phase === 'scores' || q.phase === 'end') {
          var rows = (q.teams || []).map(function (t) { return { name: t.name, score: t.score || 0, colour: t.colour }; }).sort(function (a, b) { return b.score - a.score; });
          return boardHtml(q.phase === 'end' ? 'Final scores' : 'After question ' + (q.q + 1), rows, q.phase === 'end' ? 'Well done, everyone!' : '');
        }
        var ord = order(x.answers.length, q.seed || 1, q.q), shown = ord.map(function (k) { return x.answers[k]; });
        return questionHtml(x.q, shown, 'tv' + q.seed + '_' + q.q, q.seconds || x.seconds || 20, q.openedAt, q.phase === 'answer' ? ord.indexOf(0) : null, null, teamsHtml(q), (it.questions || []).length, q.q);
      }
      /* phones mode */
      if (!run || runId !== q.runId) return '<div class="qz" data-quiz style="justify-content:center;text-align:center"><p class="muted">Starting the quiz…</p></div>';
      var url = 'https://' + (run.join || SHORT) + '?c=' + run.code;
      if (run.phase === 'join') return '<div class="qz" data-quiz style="display:grid;grid-template-columns:1fr 1fr;gap:4%;align-items:center"><div><p class="muted" style="letter-spacing:.14em;font-weight:700;margin:0 0 .4em">JOIN THE QUIZ</p><p style="margin:0">On your phone go to</p><p style="margin:.2em 0;font-size:1.6em;font-weight:800;color:#fff" data-qshort>' + esc(run.join || SHORT) + '</p><p style="margin:0">and type</p><div class="big" data-qcode>' + esc(run.code.slice(0, 3) + ' ' + run.code.slice(3)) + '</div><div class="qr" data-qr="' + esc(url) + '"></div></div>' +
        '<div><p class="muted" style="font-weight:700;margin:0 0 .4em">Here so far · <span data-qcount>' + (run.count || 0) + '</span></p><div>' + ranked().map(function (p) { return '<span class="pill">' + esc(p.name) + '</span>'; }).join('') + '</div><p class="muted" style="margin-top:1em;font-size:.7em">Nicknames only. Nothing is kept after the quiz.</p></div></div>';
      if ((run.phase === 'question' || run.phase === 'answer') && run.question) {
        var ans = run.phase === 'answer' && run.reveal;
        return questionHtml(run.question.text, run.question.answers, 'ph' + runId + '_' + run.q, run.question.seconds, run.question.openedAt, ans ? run.reveal.right : null, ans ? run.reveal.counts : null,
          '<p class="muted" style="margin:0">' + (run.answered || 0) + ' of ' + (run.count || 0) + ' answered</p>', run.total, run.q);
      }
      if (run.phase === 'board' || run.phase === 'final') return boardHtml(run.phase === 'final' ? 'Final scores' : 'After question ' + (run.q + 1), ranked().slice(0, run.phase === 'final' ? 3 : 5), (run.count || 0) + ' playing');
      return titleCard(it);
    }
    function drawQr() {
      var boxes = document.querySelectorAll('[data-qr]'); if (!boxes.length) return;
      loadQr().then(function () { boxes.forEach(function (b) { if (b.getAttribute('data-done') === b.getAttribute('data-qr')) return; b.innerHTML = ''; new global.QRCode(b, { text: b.getAttribute('data-qr'), width: 256, height: 256, correctLevel: global.QRCode.CorrectLevel.M }); b.setAttribute('data-done', b.getAttribute('data-qr')); }); }, function () {});
    }
    /* the same quiz screen redrawn in place (the stage does not move) */
    function refresh() {
      if (!alive) return;
      var i = api.at(), it = item(i), lay = api.el.querySelector('#pzStage .layer.on');
      if (it.kind === 'quiz' && lay) lay.innerHTML = stage(i, 'pzStage');
      drawQr();
    }
    function clocks() {
      document.querySelectorAll('[data-qclock]').forEach(function (c) { c.textContent = left(c.getAttribute('data-qclock'), +c.getAttribute('data-qsec'), +c.getAttribute('data-qopen')); });
    }
    function follow(id) {
      if (id === runId) return;
      if (unsubRun) { unsubRun(); unsubRun = null; } run = null; runId = id || '';
      if (!id) return;
      unsubRun = EGBCAuth.db.collection('quizRuns').doc(id).onSnapshot(function (d) { run = d.exists ? d.data() : null; refresh(); if (api.isPresenter()) api.redraw(); }, function () { run = null; });
    }
    function update() {
      var s = S(), q = s.quiz;
      follow(q && q.mode === 'phones' ? q.runId : '');
      refresh();
      if (!tick) tick = setInterval(clocks, 300);
    }

    /* ---- the presenter's controls ---- */
    function panel(i) {
      var it = item(i), q = Q(i), qs = it.questions || [];
      var head = '<div class="pz-card qz-p" data-qpanel>';
      if (!q) return head + '<p class="pz-lbl">How shall we play?</p><div class="opt"><b>Teams on the TV</b><span class="pz-cap">No phones. The question on the TV; you tap which teams got it right.</span><button class="pz-btn main" data-qtv>Play in teams</button></div>' +
        '<div class="opt"><b>Everyone on their phones</b><span class="pz-cap">A code on the TV; each person answers on their phone with a nickname. Nothing is kept after.</span><button class="pz-btn" data-qphones>Play on phones</button></div><p class="pz-cap" data-qerr></p></div>';
      if (q.mode === 'tv') {
        if (q.phase === 'setup') return head + '<p class="pz-lbl">The teams</p>' + (q.teams || []).map(function (t, k) { return '<div style="display:flex;gap:8px;align-items:center"><span style="width:16px;height:16px;border-radius:4px;background:' + esc(t.colour) + '"></span><input type="text" data-qtname="' + k + '" value="' + esc(t.name) + '" maxlength="20" aria-label="Team ' + (k + 1) + '">' + ((q.teams || []).length > 2 ? '<button class="pz-btn" data-qtdel="' + k + '" aria-label="Remove ' + esc(t.name) + '">×</button>' : '') + '</div>'; }).join('') +
          ((q.teams || []).length < 6 ? '<button class="pz-btn" data-qtadd>+ Add a team</button>' : '') +
          '<label style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" data-qbonus' + (q.bonus ? ' checked' : '') + '> A bonus point for the first team to get it right</label><button class="pz-btn go" data-qgo>Start: question 1 ▶</button></div>';
        if (q.phase === 'end') return head + '<p class="pz-lbl">Final scores</p>' + (q.teams || []).slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); }).map(function (t) { return '<div class="ans teamb" style="background:' + esc(t.colour) + '">' + esc(t.name) + '<span style="flex:1"></span>' + (t.score || 0) + '</div>'; }).join('') + '<button class="pz-btn" data-qclose>Finish the quiz</button></div>';
        var x = qs[q.q] || { answers: [] }, ord = order(x.answers.length, q.seed || 1, q.q);
        return head + '<p class="pz-lbl">Question ' + (q.q + 1) + ' of ' + qs.length + ' · <span data-qclock="tv' + q.seed + '_' + q.q + '" data-qsec="' + (q.seconds || 20) + '" data-qopen="' + (q.openedAt || 0) + '">' + left('tv' + q.seed + '_' + q.q, q.seconds || 20, q.openedAt) + '</span>s</p><b style="color:#fff;font-size:17px">' + esc(x.q) + '</b>' +
          ord.map(function (k, pos) { return '<div class="ans a' + pos + (k === 0 ? ' ok' : ' dim') + '">' + L[pos] + ' · ' + esc(x.answers[k]) + (k === 0 ? '<span style="flex:1"></span>✓ right' : '') + '</div>'; }).join('') +
          (q.phase === 'question' ? '<button class="pz-btn main" data-qshow>Show the answer on the TV</button>' : (q.phase === 'scores' ? '<span class="pz-cap">The scores are on the TV.</span>' : '<span class="pz-cap">The answer is on the TV.</span>')) +
          (q.phase !== 'scores' ? '<p class="pz-lbl" style="margin-top:6px">Who got it right? Tap each team</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">' + (q.teams || []).map(function (t, k) { return '<button class="pz-btn teamb' + ((q.got || []).indexOf(k) >= 0 ? ' on' : '') + '" style="background:' + esc(t.colour) + '" data-qgot="' + k + '" aria-pressed="' + ((q.got || []).indexOf(k) >= 0) + '">' + esc(t.name) + ((q.got || []).indexOf(k) >= 0 ? ' ✓' : '') + '</button>'; }).join('') + '</div>' +
            (q.bonus ? '<p class="pz-lbl">Bonus: who was first?</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">' + (q.teams || []).map(function (t, k) { return '<button class="pz-btn teamb' + (q.first === k ? ' on' : '') + '" style="background:' + esc(t.colour) + '" data-qfirst="' + k + '">' + esc(t.name) + (q.first === k ? ' ★' : '') + '</button>'; }).join('') + '</div>' : '') : '') +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pz-btn" data-qscores>' + (q.phase === 'scores' ? 'Back to the question' : 'Show the scores') + '</button></div>' +
          '<button class="pz-btn go" data-qnext>' + (q.q + 1 < qs.length ? 'Next question ▶' : 'Final scores ▶') + '</button></div>';
      }
      /* phones mode, from the run */
      if (!run || runId !== q.runId) return head + '<p class="pz-cap">Starting…</p></div>';
      var names = ranked(), rm = confirmPid && run.players[confirmPid];
      var who = '<p class="pz-lbl">Who’s playing · ' + (run.count || 0) + ' · tap a name to remove it</p><div class="names">' + names.map(function (p) { return '<button data-qkick="' + esc(p.pid) + '">' + esc(p.name) + '</button>'; }).join('') + '</div>' +
        (rm ? '<div style="padding:10px;border-radius:12px;background:#2a1414"><b style="color:#fecaca">Remove “' + esc(rm.name) + '”?</b><p class="pz-cap" style="margin:4px 0 8px">Their phone is told to join again with another name.</p><button class="pz-btn stop" data-qkickyes>Remove</button> <button class="pz-btn" data-qkickno>Keep</button></div>' : '');
      var end = '<button class="pz-btn" data-qend>End the quiz and delete everything</button><p class="pz-cap" data-qerr></p></div>';
      var code = '<p class="pz-lbl">Code ' + esc(run.code.slice(0, 3) + ' ' + run.code.slice(3)) + ' · ' + esc(run.join || SHORT) + '</p>';
      if (run.phase === 'join') return head + code + who + '<button class="pz-btn go" data-qopen="0">Start: question 1 ▶</button>' + end;
      var x2 = qs[run.q] || { q: (run.question || {}).text || '', answers: [] };
      if (run.phase === 'question') return head + code + '<p class="pz-lbl">Question ' + (run.q + 1) + ' of ' + run.total + ' · <span data-qclock="ph' + runId + '_' + run.q + '" data-qsec="' + run.question.seconds + '" data-qopen="' + run.question.openedAt + '">' + left('ph' + runId + '_' + run.q, run.question.seconds, run.question.openedAt) + '</span>s left</p>' +
        '<b style="color:#fff">' + esc(x2.q) + '</b><p class="pz-cap">The right answer: <b style="color:#a7f3d0">' + esc((x2.answers || [])[0] || '') + '</b></p><div style="font:800 34px Inter,sans-serif;color:#fff">' + (run.answered || 0) + ' <span class="pz-cap">of ' + (run.count || 0) + ' answered</span></div>' +
        '<button class="pz-btn main" data-qreveal>Show the answer now</button>' + who + end;
      if (run.phase === 'answer') return head + code + '<p class="pz-lbl">Question ' + (run.q + 1) + ' · the answer is showing</p><button class="pz-btn main" data-qboard>Show the leaderboard</button>' +
        (run.q + 1 < run.total ? '<button class="pz-btn go" data-qopen="' + (run.q + 1) + '">Next question ▶</button>' : '<button class="pz-btn go" data-qfinal>Final results ▶</button>') + who + end;
      if (run.phase === 'board') return head + code + '<p class="pz-lbl">The leaderboard is showing</p>' + (run.q + 1 < run.total ? '<button class="pz-btn go" data-qopen="' + (run.q + 1) + '">Next question ▶</button>' : '<button class="pz-btn go" data-qfinal>Final results ▶</button>') + who + end;
      return head + '<p class="pz-lbl">Final results are showing</p>' + end;
    }

    function wire(i) {
      var el = api.el, it = item(i), qs = it.questions || [], q = Q(i);
      var on = function (sel, fn) { el.querySelectorAll(sel).forEach(function (b) { b.onclick = function () { fn(b); }; }); };
      var err = function (e) { var p = el.querySelector('[data-qerr]'); if (p) p.textContent = (e && e.message) || String(e); };
      on('[data-qtv]', function () {
        write({ step: i, mode: 'tv', phase: 'setup', q: 0, teams: [0, 1, 2].map(function (k) { return { name: TEAM_NAMES[k], colour: TEAM_COLOURS[k], score: 0 }; }), bonus: false, first: -1, got: [], seed: 1 + Math.floor(Math.random() * 1e6) });
      });
      on('[data-qphones]', function (b) {
        b.disabled = true; b.textContent = 'Starting…';
        call('quizStart', { sessionId: api.sessionId, step: it.key }).then(function (r) { return write({ step: i, mode: 'phones', runId: r.runId, code: r.code }); }, function (e) { b.disabled = false; b.textContent = 'Play on phones'; err(e); });
      });
      if (!q) return;
      var save = function (patch) { return write(Object.assign({}, q, patch)); };
      el.querySelectorAll('[data-qtname]').forEach(function (inp) { inp.onchange = function () { var t = (q.teams || []).slice(); t[+inp.getAttribute('data-qtname')] = Object.assign({}, t[+inp.getAttribute('data-qtname')], { name: inp.value.trim().slice(0, 20) || 'Team' }); save({ teams: t }); }; });
      on('[data-qtadd]', function () { var t = (q.teams || []).slice(), k = t.length; t.push({ name: TEAM_NAMES[k] || 'Team ' + (k + 1), colour: TEAM_COLOURS[k] || '#334155', score: 0 }); save({ teams: t }); });
      on('[data-qtdel]', function (b) { var t = (q.teams || []).slice(); t.splice(+b.getAttribute('data-qtdel'), 1); save({ teams: t }); });
      var bon = el.querySelector('[data-qbonus]'); if (bon) bon.onchange = function () { save({ bonus: !!bon.checked }); };
      on('[data-qgo]', function () { var x = qs[0] || {}; save({ phase: 'question', q: 0, got: [], first: -1, openedAt: Date.now(), seconds: x.seconds || 20 }); });
      on('[data-qshow]', function () { save({ phase: 'answer' }); });
      on('[data-qgot]', function (b) { var k = +b.getAttribute('data-qgot'), g = (q.got || []).slice(), at = g.indexOf(k); if (at >= 0) g.splice(at, 1); else g.push(k); save({ got: g }); });
      on('[data-qfirst]', function (b) { var k = +b.getAttribute('data-qfirst'); save({ first: q.first === k ? -1 : k }); });
      on('[data-qscores]', function () { save({ phase: q.phase === 'scores' ? 'answer' : 'scores' }); });
      on('[data-qnext]', function () {
        /* the points: 1 a team per right answer, and the bonus for the first */
        var t = (q.teams || []).map(function (x, k) { var s = (x.score || 0) + ((q.got || []).indexOf(k) >= 0 ? 1 : 0) + (q.bonus && q.first === k && (q.got || []).indexOf(k) >= 0 ? 1 : 0); return Object.assign({}, x, { score: s }); });
        if (q.q + 1 < qs.length) save({ teams: t, q: q.q + 1, phase: 'question', got: [], first: -1, openedAt: Date.now(), seconds: (qs[q.q + 1] || {}).seconds || 20 });
        else save({ teams: t, phase: 'end', got: [], first: -1 });
      });
      on('[data-qclose]', function () { write(null); });
      /* phones mode */
      on('[data-qopen]', function (b) { b.disabled = true; call('quizOpen', { runId: q.runId, q: +b.getAttribute('data-qopen') }).catch(err); });
      on('[data-qreveal]', function (b) { b.disabled = true; call('quizReveal', { runId: q.runId }).catch(err); });
      on('[data-qboard]', function () { call('quizPhase', { runId: q.runId, phase: 'board' }).catch(err); });
      on('[data-qfinal]', function () { call('quizPhase', { runId: q.runId, phase: 'final' }).catch(err); });
      on('[data-qkick]', function (b) { confirmPid = b.getAttribute('data-qkick'); api.redraw(); });
      on('[data-qkickno]', function () { confirmPid = ''; api.redraw(); });
      on('[data-qkickyes]', function () { var p = confirmPid; confirmPid = ''; call('quizKick', { runId: q.runId, pid: p }).catch(err); });
      on('[data-qend]', function (b) { b.disabled = true; call('quizEnd', { runId: q.runId }).then(function () { return write(null); }, err); });
    }
    return {
      stage: function (i, stageId) { setTimeout(drawQr, 0); return stage(i, stageId); },
      panel: panel, wire: wire, update: update, refresh: refresh,
      destroy: function () { alive = false; clearInterval(tick); if (unsubRun) unsubRun(); }
    };
  }
  global.EGBCQuiz = { attach: attach, order: order, SHORT: SHORT };
})(window);
