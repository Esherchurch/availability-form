/* ===================================================================
   VOTES INSIDE A MEETING
   ===================================================================
   One voting system (functions/meetings.js), used where the meeting
   happens. meeting.html loads this the way it loads egbc-present.js:

     EGBCVote.attachMeeting({ eventId, host, mount })  in the call
     EGBCVote.voteOnly({ eventId, mount })             in the room: no video,
                                                       opened from the QR code
     EGBCVote.link(eventId)                            that view's address

   A MEMBERS' MEETING (event id "cm-<id>", functions/members-meeting.js):
   its votes are churchMeetings/<id>/votes, prepared beforehand on
   church-meeting.html. Whoever runs members' meetings (master admins, the
   teams doing the office and trustees jobs) opens and closes them here;
   church members vote, and a proxy holder casts the proxy's vote too.

   ANY OTHER VIDEO MEETING: a "Quick vote" its host types in; the people
   invited vote (meetings/<id>/quickVotes).

   When a vote opens it pops up for everyone with the page open; when it
   closes, the result pops up. A secret vote stays secret: the page never
   sends a name with a choice, and the hub keeps the choice only in the
   count. The hub decides who may vote; this page only hides what it would
   refuse.
   =================================================================== */
(function (global) {
  'use strict';
  if (global.EGBCVote) return;
  var A = function () { return global.EGBCAuth; };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function errText(e, fallback) { return (e && e.message) || fallback; }

  function css() {
    if (document.getElementById('egbc-vote-css')) return;
    var el = document.createElement('style');
    el.id = 'egbc-vote-css';
    el.textContent = [
      '.ev-btn{position:fixed;left:16px;bottom:16px;z-index:1200;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:10px;',
      'background:#3d6263;color:#fff;border:0;font:600 14px Inter,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.18);cursor:pointer}',
      '.ev-btn.chip{left:auto;right:16px;background:#166534}',
      '.ev-scrim{position:fixed;inset:0;z-index:1300;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}',
      '.ev-box{background:#fff;color:#374151;border-radius:14px;max-width:460px;width:100%;max-height:calc(100% - 32px);overflow:auto;padding:18px;box-sizing:border-box;',
      'font:400 15px/1.5 Inter,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25)}',
      '.ev-side{position:fixed;top:0;bottom:0;left:0;width:min(400px,100%);z-index:1250;background:#fff;color:#374151;overflow:auto;padding:16px;box-sizing:border-box;',
      'font:400 14px/1.5 Inter,system-ui,sans-serif;box-shadow:4px 0 24px rgba(0,0,0,.18)}',
      '.ev-box h3,.ev-side h3{margin:0 0 6px;font-size:17px;color:#111827}',
      '.ev-side h4{margin:18px 0 6px;font-size:14px;color:#111827}',
      '.ev-q{font-weight:600;color:#111827;font-size:16px;margin:4px 0 10px;overflow-wrap:anywhere}',
      '.ev-hint{font-size:13px;color:#6b7280;margin:6px 0}',
      '.ev-choice{display:block;width:100%;min-height:52px;margin:8px 0;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#111827;',
      'font:600 15px Inter,sans-serif;text-align:left;padding:0 14px;cursor:pointer}',
      '.ev-choice:hover{border-color:#3d6263}',
      '.ev-b{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #3d6263;background:#3d6263;',
      'color:#fff;font:600 14px Inter,sans-serif;cursor:pointer}',
      '.ev-b.sec{background:#fff;color:#111827;border-color:#d1d5db}',
      '.ev-b[disabled]{opacity:.55;cursor:wait}',
      '.ev-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
      '.ev-done{background:#eef5f4;border:1px solid #cfe1df;color:#2a4a4b;border-radius:10px;padding:10px 12px;margin:8px 0}',
      '.ev-for{border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px}',
      '.ev-card{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:8px 0}',
      '.ev-res{display:grid;grid-template-columns:minmax(60px,auto) 1fr 36px;gap:8px;align-items:center;color:#111827;margin:6px 0}',
      '.ev-bar{height:10px;border-radius:999px;background:#e5e7eb;overflow:hidden}.ev-bar i{display:block;height:100%;background:#3d6263}',
      '.ev-inp{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font:400 14px Inter,sans-serif;color:#111827}',
      '.ev-tog{display:flex;border:1px solid #d1d5db;border-radius:10px;overflow:hidden;margin-top:8px}',
      '.ev-tog button{flex:1;min-height:44px;border:0;background:#fff;font:600 14px Inter,sans-serif;color:#111827;cursor:pointer}',
      '.ev-tog button[aria-pressed="true"]{background:#3d6263;color:#fff}',
      '.ev-qr{display:flex;justify-content:center;margin:14px 0}.ev-qr img,.ev-qr canvas{width:min(280px,70vw)!important;height:auto!important}',
      '.ev-only{position:absolute;inset:0;overflow:auto;padding:24px 16px;box-sizing:border-box;font:400 15px/1.5 Inter,system-ui,sans-serif;color:#374151;background:#fff}',
      '.ev-only .ev-wrap{max-width:560px;margin:0 auto}'
    ].join('');
    document.head.appendChild(el);
  }

  /* Overlays sit inside whatever fills the screen, or they would vanish
     behind a full-screen call. */
  function host() { return document.fullscreenElement || document.body; }
  function put(el) { host().appendChild(el); return el; }
  document.addEventListener('fullscreenchange', function () {
    ['.ev-btn', '.ev-scrim', '.ev-side'].forEach(function (s) {
      document.querySelectorAll(s).forEach(function (el) { host().appendChild(el); });
    });
  });

  var qrLib = null;
  function loadQr() {
    if (global.QRCode) return Promise.resolve();
    if (!qrLib) qrLib = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = ok; s.onerror = no; document.head.appendChild(s);
    });
    return qrLib;
  }

  /**
   * The vote-only view's address for a meeting.
   * @param {string} eventId the meeting's event id
   * @returns {string}
   */
  function link(eventId) {
    return new URL('meeting.html?event=' + encodeURIComponent(eventId) + '&vote=1', location.href).href;
  }

  /* ---- one meeting's votes ---- */
  function Session(eventId, opts) {
    var S = this;
    S.eventId = eventId;
    S.members = /^cm-/.test(eventId);
    S.mid = S.members ? eventId.slice(3) : '';
    S.opts = opts || {};
    S.votes = [];
    S.done = {};         /* vote id, or vote id|giver id: that ballot is in */
    S.given = null;      /* my own proxy, if I gave my vote away */
    S.held = [];         /* the proxies I hold */
    S.closedAtStart = null;
    S.shownResult = {};
    S.later = {};
    S.runner = false;
    S.title = '';
  }
  Session.prototype.col = function () {
    var db = A().db;
    return this.members ? db.collection('churchMeetings').doc(this.mid).collection('votes')
      : db.collection('meetings').doc(this.eventId).collection('quickVotes');
  };
  Session.prototype.ask = function (extra) {
    var o = { meeting: this.members ? this.mid : this.eventId };
    if (!this.members) o.quick = true;
    return Object.assign(o, extra);
  };
  Session.prototype.me = function () {
    var p = A().profile ? A().profile() : null, u = A().user ? A().user() : null;
    return { memberId: (p && p.memberId) || '', uid: (u && u.uid) || '' };
  };
  Session.prototype.ballotId = function () { var m = this.me(); return this.members ? m.memberId : m.uid; };
  Session.prototype.mayVote = function () {
    if (!this.members) return !!this.me().uid;
    return !!(A().isChurchMember && A().isChurchMember() && this.me().memberId);
  };

  Session.prototype.start = function () {
    var S = this, Au = A();
    css();
    var perms = Au.loadPerms ? Au.loadPerms().catch(function () {}) : Promise.resolve();
    return perms.then(function () {
      if (S.members) {
        var jobs = Au.myJobs ? Au.myJobs() : [];
        S.runner = Au.isMaster() || jobs.indexOf('office') !== -1 || jobs.indexOf('trustees') !== -1;
        return Au.db.collection('churchMeetings').doc(S.mid).get().then(function (d) {
          S.title = (d.exists && d.data().title) || 'Members’ meeting';
        }, function () { S.title = 'Members’ meeting'; }).then(function () { return S.proxies(); });
      }
      return Au.db.collection('meetings').doc(S.eventId).get().then(function (d) {
        var part = d.exists ? d.data() : {};
        S.title = (part.type || 'Meeting') + (part.description ? ' · ' + part.description : '');
        S.runner = !!S.opts.host || (Au.mayManageMeeting && Au.mayManageMeeting(Object.assign({ id: S.eventId }, part)));
      }, function () { S.runner = !!S.opts.host; });
    }).then(function () {
      if (S.runner) S.hostButton();
      S.stop = S.col().onSnapshot(function (s) {
        S.votes = s.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
        if (!S.closedAtStart) {
          S.closedAtStart = {};
          S.votes.forEach(function (v) { if (v.status === 'closed') S.closedAtStart[v.id] = true; });
        }
        S.checkBallots().then(function () { S.draw(); });
      }, function () { S.draw(); });
    });
  };

  Session.prototype.proxies = function () {
    var S = this, m = S.me();
    if (!m.memberId) return Promise.resolve();
    var P = A().db.collection('churchMeetings').doc(S.mid).collection('proxies');
    return Promise.all([
      P.doc(m.memberId).get().then(function (d) { S.given = d.exists ? d.data() : null; }, function () {}),
      P.where('holderId', '==', m.memberId).get().then(function (s) {
        S.held = s.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
      }, function () {})
    ]);
  };

  /* Which ballots of mine (and the proxies I hold) are in, for open votes. */
  Session.prototype.checkBallots = function () {
    var S = this, mine = S.ballotId();
    return Promise.all(S.votes.filter(function (v) { return v.status === 'open'; }).map(function (v) {
      var B = S.col().doc(v.id).collection('ballots');
      var ids = (mine && S.mayVote() && !S.given && !S.done[v.id] ? [[v.id, mine]] : [])
        .concat(S.held.filter(function (h) { return !S.done[v.id + '|' + h.id]; }).map(function (h) { return [v.id + '|' + h.id, h.id]; }));
      return Promise.all(ids.map(function (p) {
        return B.doc(p[1]).get().then(function (b) { if (b.exists) S.done[p[0]] = true; }, function () {});
      }));
    }));
  };

  /* Still to do on this vote: my own ballot, and each proxy I hold. */
  Session.prototype.todo = function (v) {
    var S = this, out = [];
    if (S.mayVote() && !S.given && !S.done[v.id]) out.push({ key: v.id, forId: '', label: '' });
    S.held.forEach(function (h) {
      if (!S.done[v.id + '|' + h.id]) out.push({ key: v.id + '|' + h.id, forId: h.id, label: 'Voting for ' + (h.giverName || 'a member') });
    });
    return out;
  };

  Session.prototype.draw = function () {
    var S = this;
    var open = S.votes.filter(function (v) { return v.status === 'open'; });
    var due = open.filter(function (v) { return S.todo(v).length; });
    var now = due.filter(function (v) { return !S.later[v.id]; })[0];
    if (now) S.popVote(now); else if (!S.resultShowing) S.closePop();
    S.chip(due.filter(function (v) { return S.later[v.id]; })[0]);
    S.votes.forEach(function (v) {
      if (v.status === 'closed' && !S.closedAtStart[v.id] && !S.shownResult[v.id]) { S.shownResult[v.id] = true; S.popResult(v); }
    });
    if (S.side) S.drawSide();
    if (S.onlyEl) S.drawOnly();
  };

  /* ---- the pop-ups ---- */
  Session.prototype.scrim = function () {
    if (!this.pop) { this.pop = put(document.createElement('div')); this.pop.className = 'ev-scrim'; this.pop.setAttribute('role', 'dialog'); this.pop.setAttribute('aria-modal', 'true'); }
    return this.pop;
  };
  Session.prototype.closePop = function () { if (this.pop) { this.pop.remove(); this.pop = null; } this.resultShowing = false; };

  Session.prototype.popVote = function (v) {
    var S = this, el = S.scrim();
    S.resultShowing = false;
    if (el.dataset.vote === v.id && el.dataset.todo === S.todo(v).map(function (t) { return t.key; }).join()) return;
    el.dataset.vote = v.id;
    el.dataset.todo = S.todo(v).map(function (t) { return t.key; }).join();
    var choices = function (t) {
      return (v.choices || []).map(function (c) {
        return '<button type="button" class="ev-choice" data-c="' + esc(c) + '" data-for="' + esc(t.forId) + '" data-key="' + esc(t.key) + '">' + esc(c) + '</button>';
      }).join('');
    };
    el.innerHTML = '<div class="ev-box"><h3>Vote now</h3><div class="ev-q">' + esc(v.question) + '</div>'
      + '<p class="ev-hint">' + (v.secret ? 'A secret vote: who has voted is kept, how anyone voted is never shown.'
        : 'An open vote: once it closes, the meeting can see who voted which way.') + ' One vote each; it can’t be changed.</p>'
      + S.todo(v).map(function (t) { return t.forId ? '<div class="ev-for"><b>' + esc(t.label) + '</b>' + choices(t) + '</div>' : choices(t); }).join('')
      + '<div class="ev-row"><button type="button" class="ev-b sec" data-later="1">Later</button></div><p class="ev-hint" data-msg></p></div>';
    el.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.later) { S.later[v.id] = true; S.closePop(); S.draw(); return; }
      if (b.dataset.c === undefined) return;
      el.querySelectorAll('button[data-key="' + b.dataset.key + '"]').forEach(function (x) { x.disabled = true; });
      var ask = S.ask({ vote: v.id, choice: b.dataset.c });
      if (b.dataset.for) ask.for = b.dataset.for;
      A().call('castVote', ask).then(function () {
        S.done[b.dataset.key] = true;
        el.dataset.todo = '';
        if (!S.todo(v).length) {
          el.innerHTML = '<div class="ev-box"><h3>Your vote is in</h3><p class="ev-hint">' + (v.secret ? 'Nobody can see how you voted. ' : '')
            + 'The result shows when the chair closes the vote.</p><div class="ev-row"><button type="button" class="ev-b" data-ok="1">OK</button></div></div>';
          el.onclick = function (e2) { if (e2.target.closest('[data-ok]')) S.closePop(); };
          S.resultShowing = true;
        } else S.popVote(v);
      }, function (err) {
        var m = el.querySelector('[data-msg]');
        if (m) m.textContent = errText(err, 'Could not vote.');
        if (err && err.code && /already-exists/.test(err.code)) { S.done[b.dataset.key] = true; }
        el.querySelectorAll('button[data-key="' + b.dataset.key + '"]').forEach(function (x) { x.disabled = !!S.done[b.dataset.key]; });
      });
    };
  };

  function results(v) {
    var r = v.results || {}, total = Object.keys(r).reduce(function (n, k) { return n + (r[k] || 0); }, 0);
    return (v.choices || []).map(function (c) {
      var n = r[c] || 0, pc = total ? Math.round(n * 100 / total) : 0;
      return '<div class="ev-res"><span>' + esc(c) + '</span><div class="ev-bar"><i style="width:' + pc + '%"></i></div><b>' + n + '</b></div>';
    }).join('') + '<p class="ev-hint">' + total + (total === 1 ? ' vote' : ' votes') + (v.byProxy ? ', ' + v.byProxy + ' by proxy' : '') + (v.secret ? ' · secret vote' : '') + '</p>';
  }
  Session.prototype.popResult = function (v) {
    var S = this, el = S.scrim();
    S.resultShowing = true;
    el.dataset.vote = ''; el.dataset.todo = '';
    el.innerHTML = '<div class="ev-box"><h3>The result</h3><div class="ev-q">' + esc(v.question) + '</div>' + results(v)
      + '<div class="ev-row"><button type="button" class="ev-b" data-ok="1">Close</button></div></div>';
    el.onclick = function (e) { if (e.target.closest('[data-ok]')) { S.closePop(); S.draw(); } };
  };

  /* A vote put off with "Later" waits on a button. */
  Session.prototype.chip = function (v) {
    var S = this;
    if (!v) { if (S.chipEl) { S.chipEl.remove(); S.chipEl = null; } return; }
    if (!S.chipEl) { S.chipEl = put(document.createElement('button')); S.chipEl.type = 'button'; S.chipEl.className = 'ev-btn chip'; }
    S.chipEl.textContent = 'A vote is open: vote now';
    S.chipEl.onclick = function () { delete S.later[v.id]; S.draw(); };
  };

  /* ---- the chair's panel ---- */
  Session.prototype.hostButton = function () {
    var S = this, b = put(document.createElement('button'));
    b.type = 'button'; b.className = 'ev-btn'; b.textContent = 'Votes';
    b.setAttribute('aria-label', 'Votes: open, close and start a vote');
    b.onclick = function () { if (S.side) { S.side.remove(); S.side = null; } else { S.side = put(document.createElement('div')); S.side.className = 'ev-side'; S.drawSide(); } };
  };

  Session.prototype.drawSide = function () {
    var S = this, el = S.side;
    if (!el) return;
    var keep = el.querySelector('#ev-new-q') ? { q: el.querySelector('#ev-new-q').value, c: el.querySelector('#ev-new-c').value } : null;
    var list = S.votes.map(function (v) {
      var h = '<div class="ev-card"><div class="ev-q" style="font-size:14px">' + esc(v.question) + '</div><p class="ev-hint">' + (v.secret ? 'Secret' : 'Open vote') + ' · '
        + (v.status === 'draft' ? 'ready to open' : v.status === 'open' ? 'open now' : 'closed') + '</p>';
      if (v.status === 'draft') h += '<button type="button" class="ev-b" data-open="' + esc(v.id) + '">Open the vote</button>';
      if (v.status === 'open') h += '<p style="margin:4px 0;font-size:22px;font-weight:700;color:#111827">' + (v.voters || 0) + ' <span class="ev-hint">voted' + (v.byProxy ? ', ' + v.byProxy + ' by proxy' : '') + '</span></p>'
        + '<button type="button" class="ev-b" data-close="' + esc(v.id) + '">Close it and show the result</button>';
      if (v.status === 'closed') h += results(v);
      return h + '</div>';
    }).join('');
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>Votes</h3><button type="button" class="ev-b sec" data-x="1" aria-label="Close">Close</button></div>'
      + '<p class="ev-hint">' + esc(S.title) + '</p>'
      + '<div class="ev-row"><button type="button" class="ev-b sec" data-qr="1">People in the room: show the QR code</button></div>'
      + '<h4>' + (S.members ? 'This meeting’s votes' : 'Votes so far') + '</h4>'
      + (list || '<p class="ev-hint">' + (S.members ? 'No votes prepared. Prepare them on the members’ meeting page, or start one below.' : 'None yet.') + '</p>')
      + '<h4>' + (S.members ? 'A vote not prepared beforehand' : 'Quick vote') + '</h4>'
      + '<label class="ev-hint" for="ev-new-q">The question</label><textarea class="ev-inp" id="ev-new-q" maxlength="300" rows="2"></textarea>'
      + '<label class="ev-hint" for="ev-new-c">Choices, separated by commas</label><input class="ev-inp" id="ev-new-c" value="Yes, No, Abstain">'
      + '<div class="ev-tog" role="group" aria-label="Secret or open"><button type="button" data-secret="1" aria-pressed="' + (S.secret !== false) + '">Secret</button>'
      + '<button type="button" data-secret="0" aria-pressed="' + (S.secret === false) + '">Open</button></div>'
      + '<p class="ev-hint">Secret: who voted is kept, how they voted never shown. Open: everyone sees each vote once it closes.</p>'
      + '<button type="button" class="ev-b" data-start="1">Start the vote</button><p class="ev-hint" data-msg></p>';
    if (keep) { el.querySelector('#ev-new-q').value = keep.q; el.querySelector('#ev-new-c').value = keep.c; }
    el.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var msg = el.querySelector('[data-msg]');
      var fail = function (err) { b.disabled = false; if (msg) msg.textContent = errText(err, 'That did not work.'); };
      if (b.dataset.x) { el.remove(); S.side = null; return; }
      if (b.dataset.qr) { S.showQr(); return; }
      if (b.dataset.secret) { S.secret = b.dataset.secret === '1'; S.drawSide(); return; }
      if (b.dataset.open) { b.disabled = true; A().call('voteOpen', S.ask({ vote: b.dataset.open })).catch(fail); return; }
      if (b.dataset.close) { b.disabled = true; A().call('voteClose', S.ask({ vote: b.dataset.close })).catch(fail); return; }
      if (b.dataset.start) {
        var q = el.querySelector('#ev-new-q').value.trim();
        var cs = el.querySelector('#ev-new-c').value.split(',').map(function (c) { return c.trim(); }).filter(Boolean).slice(0, 6);
        if (!q) { msg.textContent = 'Type the question first.'; return; }
        if (cs.length < 2) { msg.textContent = 'At least two choices.'; return; }
        b.disabled = true;
        var done = function () { el.querySelector('#ev-new-q').value = ''; b.disabled = false; msg.textContent = 'Open now.'; };
        if (!S.members) { A().call('voteQuick', { meeting: S.eventId, question: q, choices: cs, secret: S.secret !== false }).then(done, fail); return; }
        /* A members' vote is prepared as a draft (the rules let whoever runs
           the meeting write one), then opened by the hub like any other. */
        var u = A().user() || {};
        S.col().add({ question: q.slice(0, 300), choices: cs, secret: S.secret !== false, status: 'draft', order: S.votes.length,
          createdAt: new Date().toISOString(), createdBy: u.uid || '' })
          .then(function (ref) { return A().call('voteOpen', S.ask({ vote: ref.id })); }).then(done, fail);
      }
    };
  };

  Session.prototype.showQr = function () {
    var S = this, el = S.scrim(), url = link(S.eventId);
    S.resultShowing = true;
    el.dataset.vote = ''; el.dataset.todo = '';
    el.innerHTML = '<div class="ev-box" style="text-align:center"><h3>Voting from the room</h3>'
      + '<p class="ev-hint">People who are here in person scan this with their phone camera, sign in, and vote there. No video.</p>'
      + '<div class="ev-qr" data-qr></div><p class="ev-hint" style="word-break:break-all">' + esc(url) + '</p>'
      + '<div class="ev-row" style="justify-content:center"><button type="button" class="ev-b" data-ok="1">Close</button></div></div>';
    el.onclick = function (e) { if (e.target.closest('[data-ok]')) { S.closePop(); S.draw(); } };
    loadQr().then(function () {
      var box = el.querySelector('[data-qr]');
      if (box) new global.QRCode(box, { text: url, width: 280, height: 280, correctLevel: global.QRCode.CorrectLevel.M });
    }, function () {});
  };

  /* ---- vote only, for people in the room ---- */
  Session.prototype.drawOnly = function () {
    var S = this, el = S.onlyEl;
    var open = S.votes.filter(function (v) { return v.status === 'open'; });
    var closed = S.votes.filter(function (v) { return v.status === 'closed'; });
    el.innerHTML = '<div class="ev-wrap"><h3 style="margin:0 0 4px;font-size:20px;color:#111827">' + esc(S.title) + '</h3>'
      + '<p class="ev-hint">Voting only, no video. Keep this page open: when the chair opens a vote it appears here.</p>'
      + (!S.mayVote() && !S.held.length ? '<div class="ev-done">' + (S.members ? 'Only church members vote. If you have joined the church and this is wrong, ask the church office.' : 'You are not able to vote in this meeting.') + '</div>' : '')
      + (S.given ? '<div class="ev-done">You asked ' + esc(S.given.holderName || 'someone') + ' to vote for you at this meeting.</div>' : '')
      + (open.length ? open.map(function (v) {
          return '<div class="ev-card"><div class="ev-q">' + esc(v.question) + '</div>'
            + (S.todo(v).length ? '<button type="button" class="ev-b" data-again="' + esc(v.id) + '">Vote</button>' : '<div class="ev-done">✓ Done. The result shows when the chair closes the vote.</div>') + '</div>';
        }).join('') : '<p class="ev-hint">No vote is open just now.</p>')
      + (closed.length ? '<h4 style="margin:18px 0 6px">Results</h4>' + closed.map(function (v) {
          return '<div class="ev-card"><div class="ev-q" style="font-size:14px">' + esc(v.question) + '</div>' + results(v) + '</div>';
        }).join('') : '')
      + '</div>';
    el.onclick = function (e) {
      var b = e.target.closest('[data-again]');
      if (b) { delete S.later[b.dataset.again]; S.draw(); }
    };
  };

  /**
   * Votes in a video call: the pop-ups for everyone, and the chair's
   * "Votes" button for whoever may run them.
   * @param {{eventId:string, host?:boolean}} opts
   * @returns {Promise<void>}
   */
  function attachMeeting(opts) {
    if (!opts || !opts.eventId || !A()) return Promise.resolve();
    var S = new Session(String(opts.eventId), opts);
    return S.start().catch(function (e) { console.warn('EGBCVote:', e); });
  }

  /**
   * The vote-only view: drawn into `mount` (the call's place on the page).
   * @param {{eventId:string, mount:HTMLElement}} opts
   * @returns {Promise<void>}
   */
  function voteOnly(opts) {
    if (!opts || !opts.eventId || !opts.mount || !A()) return Promise.resolve();
    css();
    var S = new Session(String(opts.eventId), opts);
    opts.mount.innerHTML = '';
    S.onlyEl = document.createElement('div');
    S.onlyEl.className = 'ev-only';
    S.onlyEl.innerHTML = '<p class="ev-hint">Loading…</p>';
    opts.mount.appendChild(S.onlyEl);
    return S.start().catch(function (e) {
      S.onlyEl.innerHTML = '<div class="ev-wrap"><div class="ev-done">' + esc(errText(e, 'Could not load the votes.')) + '</div></div>';
    });
  }

  global.EGBCVote = { attachMeeting: attachMeeting, voteOnly: voteOnly, link: link };
})(window);
