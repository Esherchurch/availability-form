/* ===================================================================
   THE SAFEGUARDING RISK REGISTER, step 4 (F-265 part B and part 4):
   the dashboard's dials, the church-wide annual review, the trustees'
   snapshots. Used by safeguarding-risk.html.
   ===================================================================
   The dials are in the style of Martin's Calla Compliance pictures
   (design-mocks/sg-dials/): a half-circle of 14 rounded blocks, coloured
   by meaning, with the number and its line as real text.
   COUNTS ONLY: the server writes sgDashboard/{siteId}; nothing here shows
   a child, a leader's checks, an incident's words or a concern. Where the
   names are, a dial takes the lead or deputy to the page that has them,
   and shows anyone else the counts.
   =================================================================== */
(function (global) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var N = 14;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function longDate(iso) { if (!iso) return ''; var d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var CSS = '.sgd-dw{position:relative;max-width:240px;margin:0 auto}.sgd-big .sgd-dw{max-width:340px}' +
    '.sgd-dial{display:block;width:100%;height:auto}' +
    '.sgd-mid{position:absolute;left:0;right:0;bottom:0;text-align:center}' +
    '.sgd-n{font:300 38px/1 Inter,sans-serif;color:var(--ink)}.sgd-big .sgd-n{font-size:58px}' +
    '.sgd-n span{font-size:.45em;color:var(--muted);margin-left:2px}' +
    '.sgd-of{font:400 12.5px Inter,sans-serif;color:var(--muted);margin-top:6px}.sgd-big .sgd-of{font:500 15px Inter,sans-serif;color:#4b6a7d}' +
    '.sgd-dash{display:inline-block;width:26px;height:3px;border-radius:2px;background:var(--red);margin:20px 0 4px}' +
    '.sgd-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 0 14px}' +
    '.sgd-head h2{font:700 19px Inter,sans-serif;color:var(--ink);margin:0}.sgd-asat{color:var(--muted);font-size:13px}' +
    '.sgd-main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;margin:0 0 26px}' +
    '.sgd-card{background:#fff;border:1px solid var(--line);border-radius:18px}' +
    '.sgd-big{padding:28px 22px 22px;text-align:center}.sgd-big .sgd-note{max-width:380px;margin:16px auto 0;color:var(--muted);font-size:13px}' +
    '.sgd-eye{font:600 11px Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#6b6457;margin:6px 0 12px}' +
    '.sgd-step{display:block;width:100%;text-align:left;padding:14px 16px;margin:0 0 10px;cursor:pointer;font:inherit;color:inherit}' +
    '.sgd-step b{display:block;font:500 15px Inter,sans-serif;color:var(--ink)}.sgd-step span{color:var(--muted);font-size:13px}' +
    '.sgd-soft{background:#f6ebdc;color:#6b4a26;border-radius:14px;padding:12px 14px;font-size:13px;margin-top:14px}' +
    '.sgd-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}' +
    '.sgd-small{display:block;width:100%;padding:20px 12px 16px;text-align:center;cursor:pointer;font:inherit;color:inherit}' +
    '.sgd-small:hover,.sgd-step:hover{border-color:#c9c3b8}' +
    '.sgd-t{font:500 14px Inter,sans-serif;color:var(--ink);margin-top:10px}.sgd-l{color:var(--muted);font-size:12.5px;margin-top:2px}.sgd-l.why{color:var(--red)}' +
    '.sgd-legend{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0 0;color:var(--muted);font-size:12.5px}' +
    '.sgd-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:-1px}' +
    '.sgd-tbl{width:100%;border-collapse:collapse;font-size:13px}.sgd-tbl th,.sgd-tbl td{text-align:left;padding:7px 6px;border-top:1px solid var(--line);vertical-align:top}' +
    '.sgd-tbl th{font-weight:600;color:var(--ink);border-top:0}.sgd-tbl td.n{text-align:right}.sgd-tbl tr.short td{color:var(--red)}' +
    '.sgd-item{border-top:1px solid var(--line);padding:12px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:start}.sgd-item:first-of-type{border-top:0}' +
    '.sgd-banner{background:#f6ebdc;color:#6b4a26;border-radius:10px;padding:10px 12px;font-weight:600;margin:0 0 10px}' +
    '@media (max-width:980px){.sgd-row{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
    '@media (max-width:760px){.sgd-main{grid-template-columns:1fr}.sgd-row{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '@media (max-width:420px){.sgd-row{gap:10px}.sgd-small{padding:14px 6px 12px}.sgd-n{font-size:32px}.sgd-of{font-size:12px}.sgd-small .sgd-dw{margin-bottom:20px}.sgd-small .sgd-mid .sgd-of{position:absolute;left:0;right:0;top:100%;margin-top:4px}.sgd-item{grid-template-columns:1fr}}' +
    '@media print{.tabs,.bar,#egbc-shell,.sgd-noprint{display:none!important}}';
  function css() { if (document.getElementById('sgd-css')) return; var s = document.createElement('style'); s.id = 'sgd-css'; s.textContent = CSS; document.head.appendChild(s); }

  var COLOUR = { progress: '#4b6a7d', green: '#15803d', amber: '#b07d2e', red: '#b0392c', empty: '#e4ded3', faded: '#efebe4' };
  /* o: { blocks: [[colour, n]], num, pc, sub, faded, dash } - the blocks are a picture; the number and its line are text */
  function dial(o) {
    var cx = 130, cy = 132, r = 98, out = [], colours = [];
    (o.blocks || []).forEach(function (b) { for (var k = 0; k < b[1]; k++) colours.push(b[0]); });
    for (var i = 0; i < N; i++) {
      var a = Math.PI - (i + 0.5) * Math.PI / N, x = cx + r * Math.cos(a), y = cy - r * Math.sin(a), deg = 90 - a * 180 / Math.PI;
      var fill = o.faded ? COLOUR.faded : COLOUR[colours[i] || 'empty'];
      out.push('<rect x="-10.5" y="-9" width="21" height="18" rx="3.5" fill="' + fill + '" data-b="' + (o.faded ? 'faded' : colours[i] || 'empty') + '" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + deg.toFixed(1) + ')"/>');
    }
    var num = o.dash ? '<span class="sgd-dash" aria-hidden="true"></span><span style="position:absolute;left:-9999px">No figure</span>'
      : '<div class="sgd-n">' + esc(o.num) + (o.pc ? '<span>%</span>' : '') + '</div>';
    return '<div class="sgd-dw"><svg class="sgd-dial" viewBox="0 0 260 140" aria-hidden="true">' + out.join('') + '</svg><div class="sgd-mid">' + num + '<div class="sgd-of">' + esc(o.sub) + '</div></div></div>';
  }
  /* parts [[colour, count]] out of `of`, as whole blocks: each part with any count gets at least one */
  function split(parts, of) {
    if (!of) return [];
    var left = N, out = [];
    parts.forEach(function (p, i) {
      if (!p[1]) return;
      var n = Math.max(1, Math.round(p[1] / of * N));
      var later = parts.slice(i + 1).filter(function (q) { return q[1]; }).length;
      n = Math.min(n, left - later); if (n < 1) return;
      out.push([p[0], n]); left -= n;
    });
    return out;
  }

  /* the five dials of the row, and the big one */
  var DIALS = [
    { key: 'checks', title: 'Leaders with in-date checks', unit: ['leader', 'leaders'] },
    { key: 'sessions', title: 'Sessions with enough leaders', unit: ['session', 'sessions'] },
    { key: 'consent', title: 'Children with current consent', unit: ['child', 'children'] },
    { key: 'assess', title: 'Event assessments signed', unit: null },
    { key: 'incidents', title: 'Incident follow-ups open', unit: null }
  ];
  function dialFor(key, x, weeks) {
    x = x || { rag: 'unread', why: 'Not worked out yet.' };
    if (x.rag === 'unread') return { o: { faded: true, dash: true, sub: 'no figure' }, line: x.why || 'Not a zero: this could not be read.', why: true };
    var p = x.parts || {}, all = x.rag === 'green';
    if (key === 'incidents') {
      if (!x.of) return { o: { blocks: [], num: '0', sub: 'none this year' }, line: 'No incident recorded this year' };
      return { o: { blocks: x.value ? split([['red', x.value]], x.of) : [['green', N]], num: String(x.value), sub: 'of ' + x.of + ' this year' },
        line: x.value ? 'Counts only; the oldest is ' + plural(x.oldestDays, 'day', 'days') : 'Every one followed up' };
    }
    if (key === 'assess') {
      if (!x.of) return { o: { blocks: [], num: '0', sub: 'none needed' }, line: 'Nothing on file yet: no coming event needs one' };
      return { o: { blocks: all ? [['green', N]] : split([['progress', p.ok], [x.rag === 'red' ? 'red' : 'amber', p.waiting]], x.of), num: String(x.value), sub: 'of ' + x.of + ' needing one' },
        line: p.waiting ? p.waiting + (p.waiting === 1 ? ' is' : ' are') + ' waiting: bookings stay closed' : 'All signed before bookings opened' };
    }
    var d = DIALS.filter(function (y) { return y.key === key; })[0], unit = d.unit;
    if (!x.of) {
      var none = { checks: 'Nothing on file yet: no leader is named on an under-18s group or event', sessions: 'Nothing on file yet: no session in the last 8 weeks', consent: 'Nothing on file yet: no child is registered' };
      return { o: { blocks: [], num: '0', pc: true, sub: '0 of 0 ' + unit[1] }, line: none[key] };
    }
    var sub = x.value + ' of ' + x.of + ' ' + (x.of === 1 ? unit[0] : unit[1]), blocks, line;
    if (key === 'sessions') {
      blocks = all && !p.short ? [['green', N]] : split([['progress', p.ok], ['red', p.short]], x.of);
      line = 'And two adults; last 8 weeks' + (p.short ? '. ' + p.short + (p.short === 1 ? ' was' : ' were') + ' short' : '');
    } else {
      blocks = all && !p.soon && !p.out ? [['green', N]] : split([['progress', p.ok], ['amber', p.soon], ['red', p.out]], x.of);
      var bits = [];
      if (p.soon) bits.push(p.soon + ' run' + (p.soon === 1 ? 's' : '') + ' out within ' + weeks + ' weeks');
      if (p.out) bits.push(p.out + (key !== 'checks' ? ' missing or run out' : p.out === 1 ? ' has run out or is missing' : ' have run out or are missing'));
      line = bits.length ? bits.join('; ') : 'All in date';
    }
    return { o: { blocks: blocks, num: String(x.pct), pc: true, sub: sub }, line: line };
  }

  /* ---- THE DASHBOARD ---- ctx: { D, W, lead, trustee, master, weeks, reviewItems } */
  function dashboardHtml(ctx) {
    css();
    var D = ctx.D;
    if (!D || !D.dials) return '<div class="card" id="noDash"><p style="margin:0">The dials have not been worked out yet. The hub works them out every 15 minutes.</p>' +
      '<div class="row sgd-noprint"><button class="btn sec sm" data-dashnow>Work them out now</button><span class="hint" data-dashmsg role="status"></span></div></div>';
    var r = D.dials.review || { value: 0, of: 0 }, rv = D.review || { items: [] }, ITEMS = ctx.reviewItems || [];
    var bigBlocks = r.of && r.value === r.of ? [['green', N]] : split([['progress', r.value]], r.of);
    var left = ITEMS.filter(function (i) { var x = (rv.items || []).filter(function (y) { return y.id === i.id; })[0] || {}; return !x.done && !x.na; });
    var na = ITEMS.filter(function (i) { return ((rv.items || []).filter(function (y) { return y.id === i.id; })[0] || {}).na; });
    var pastReview = ((ctx.W && ctx.W.items) || []).filter(function (w) { return w.kind === 'review'; })[0];
    var big = '<div class="sgd-card sgd-big" data-dialkey="review">' + dial({ blocks: bigBlocks, num: String(r.of ? r.pct : 0), pc: true, sub: r.value + ' of ' + r.of + ' items' }) +
      (rv.status === 'overdue' ? '<p class="sgd-l why" style="margin-top:10px" id="reviewOverdue">Overdue: it was due by ' + esc(longDate(rv.due)) + ', a year after last year’s.</p>' : '') +
      '<p class="sgd-note">This counts what is on file for this year’s review. It is not a score for the church, and it says nothing about any child or any concern.</p></div>';
    var next = '<div class="sgd-next"><p class="sgd-eye">Next, cheapest first</p>' +
      (left.length ? left.slice(0, 3).map(function (i) {
        var line = i.id === 'register' && pastReview ? pastReview.label.replace(/\.$/, '') + '. Looking at them closes this item.' : i.line;
        return '<button class="sgd-card sgd-step" data-next="' + esc(i.id) + '"><b>' + esc(i.label) + '</b><span>' + esc(line) + '</span></button>';
      }).join('') : '<div class="sgd-card sgd-step" id="reviewDone"><b>Everything for this year’s review is on file</b><span>Take a snapshot for the trustees’ records.</span></div>') +
      (na.length ? '<div class="sgd-soft">' + esc(na.map(function (i) { return i.label; }).join(' and ')) + (na.length === 1 ? ' does' : ' do') + ' not apply to this church, so ' + (na.length === 1 ? 'it is' : 'they are') + ' not counted and not shown.</div>' : '') + '</div>';
    var row = '<p class="sgd-eye">Where safeguarding stands</p><div class="sgd-row">' + DIALS.map(function (d) {
      var f = dialFor(d.key, D.dials[d.key], ctx.weeks);
      return '<button class="sgd-card sgd-small" data-dialkey="' + d.key + '" data-rag="' + esc((D.dials[d.key] || {}).rag || 'unread') + '">' + dial(f.o) +
        '<div class="sgd-t">' + esc(d.title) + '</div><div class="sgd-l' + (f.why ? ' why' : '') + '">' + esc(f.line) + '</div></button>';
    }).join('') + '</div>' +
      '<div class="sgd-legend"><span><i style="background:#b0392c"></i>High, or blocked</span><span><i style="background:#b07d2e"></i>Medium, or due</span><span><i style="background:#15803d"></i>Low, or complete</span><span><i style="background:#4b6a7d"></i>On file, towards complete</span><span><i style="background:#e4ded3"></i>Nothing recorded</span></div>';
    return '<div id="dash"><div class="sgd-head"><h2>Ready for the annual review</h2><span class="sgd-asat">as at ' + esc(longDate(D.at)) + ', ' + esc(new Date(D.at).toTimeString().slice(0, 5)) + '</span></div>' +
      '<div class="sgd-main">' + big + next + '</div>' + row + '</div>';
  }

  /* where a dial goes: the lead or deputy to the page that has the names;
     anyone else to the counts. ctx: { lead, setTab(tab), open(html) } */
  var LEAD_PAGES = { checks: 'safeguarding.html', consent: 'kids-admin.html', incidents: 'safeguarding.html' };
  function wireDash(root, ctx) {
    var D = ctx.D || {};
    root.querySelectorAll('[data-next]').forEach(function (b) { b.onclick = function () { ctx.setTab('review'); }; });
    root.querySelectorAll('[data-dialkey]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-dialkey');
        if (k === 'review') return ctx.setTab('review');
        if (k === 'assess') return ctx.setTab('events');
        if (k === 'sessions') return ctx.setTab('warnings');
        if (ctx.lead && LEAD_PAGES[k]) { location.href = LEAD_PAGES[k]; return; }
        ctx.open(countsHtml(k, D, ctx.weeks) + '<div class="row"><button class="btn sec" data-close>Close</button></div>');
      };
    });
  }
  /* the counts-only view of a dial, for those who can't see the names */
  function countsHtml(k, D, weeks) {
    var x = (D.dials || {})[k] || {}, p = x.parts || {}, foot = '<p class="hint" style="margin:12px 0 0">Counts only. The safeguarding lead can see who.</p>';
    if (k === 'checks') return '<h3 data-counts="checks">Leaders with in-date checks</h3><table class="sgd-tbl"><tr><th>In date</th><td class="n">' + (p.ok || 0) + '</td></tr><tr><th>Running out within ' + weeks + ' weeks</th><td class="n">' + (p.soon || 0) + '</td></tr><tr><th>Run out or missing</th><td class="n">' + (p.out || 0) + '</td></tr></table>' + foot;
    if (k === 'consent') return '<h3 data-counts="consent">Children with current consent</h3><table class="sgd-tbl"><tr><th>Group</th><th class="n">In date</th><th class="n">Running out</th><th class="n">Missing or run out</th></tr>' +
      (D.consentByGroup || []).map(function (g) { return '<tr><td>' + esc(g.group) + '</td><td class="n">' + g.ok + '</td><td class="n">' + g.soon + '</td><td class="n">' + g.out + '</td></tr>'; }).join('') + '</table>' + foot;
    if (k === 'incidents') return '<h3 data-counts="incidents">Incident follow-ups open</h3><table class="sgd-tbl"><tr><th>This year</th><td class="n">' + (x.of || 0) + '</td></tr><tr><th>Followed up</th><td class="n">' + (p.followed || 0) + '</td></tr><tr><th>No follow-up after 7 days</th><td class="n">' + (p.open || 0) + '</td></tr>' +
      (p.open ? '<tr><th>The oldest</th><td class="n">' + plural(x.oldestDays || 0, 'day', 'days') + '</td></tr>' : '') + '</table>' + foot;
    return '';
  }
  /* the last 8 weeks' sessions, numbers only (on the Warnings tab) */
  function sessionsHtml(D) {
    var list = (D && D.sessions) || [];
    if (!D) return '';
    return '<div class="card" id="sessList"><h2>Sessions, the last 8 weeks</h2>' + (list.length
      ? '<div style="overflow-x:auto"><table class="sgd-tbl" style="margin-top:8px"><tr><th>Group</th><th>Date</th><th class="n">Children</th><th class="n">Leaders</th><th class="n">Needed</th></tr>' +
        list.map(function (s) { return '<tr class="' + (s.ok ? '' : 'short') + '" data-sess="' + (s.ok ? 'ok' : 'short') + '"><td>' + esc(s.group) + '</td><td>' + esc(s.day) + '</td><td class="n">' + s.children + '</td><td class="n">' + s.leaders + '</td><td class="n">' + s.need + (s.ok ? '' : ' (short)') + '</td></tr>'; }).join('') + '</table></div>'
      : '<p class="hint" style="margin:8px 0 0">No session in the last 8 weeks.</p>') +
      '<p class="hint" style="margin:8px 0 0">Two adults at least, and enough for the group’s ratio. Numbers only.</p></div>';
  }

  /* ---- THE ANNUAL REVIEW (church-wide) ----
     ctx: { db, year, items, siteId, lead, trustee, me, open, close, after } */
  function loadReview(ctx) {
    return Promise.all(ctx.items.map(function (i) {
      return ctx.db().collection('sgReviews').doc(ctx.year + '_' + i.id).get()
        .then(function (d) { return d.exists ? Object.assign({ state: d.data().na ? 'na' : 'done' }, d.data()) : { state: 'open' }; },
          /* refused means it is there, recorded by another site's lead */
          function (e) { return { state: /permission/i.test(e.code || e.message || '') ? 'elsewhere' : 'open' }; });
    }));
  }
  function mayRecord(i, ctx) { return i.who === 'lead' ? ctx.lead : i.who === 'trustee' ? ctx.trustee : (ctx.lead || ctx.trustee); }
  function reviewHtml(ctx, got, status) {
    css();
    var WHO = { lead: 'For a safeguarding lead or deputy to record', trustee: 'For a trustee to record', either: 'For a safeguarding lead, deputy or trustee to record' };
    var done = got.filter(function (g) { return g.state === 'done' || g.state === 'elsewhere'; }).length, na = got.filter(function (g) { return g.state === 'na'; }).length, of = got.length - na;
    var st = done === of ? ['Done for ' + ctx.year, 'green'] : status === 'overdue' ? ['Overdue', 'red'] : done ? ['Under way', 'amber'] : ['Not started', 'amber'];
    return '<div class="card" id="reviewHead"><h2>The annual review, ' + ctx.year + ' <span class="rag ' + st[1] + '" data-reviewstatus="' + esc(st[0]) + '"><i aria-hidden="true"></i>' + esc(st[0]) + '</span></h2>' +
      '<p class="hint" style="margin:6px 0 0">One for the whole church. ' + done + ' of ' + of + ' items on file. Each is recorded once, with who and when, and never changed.</p></div>' +
      '<div class="card" id="reviewItems">' + ctx.items.map(function (i, n) {
        var g = got[n], right;
        if (g.state === 'done') right = '<span class="rag green" data-item-state="done"><i aria-hidden="true"></i>Done ' + esc(longDate(g.at && g.at.toDate ? g.at.toDate().toISOString() : g.at)) + '</span>';
        else if (g.state === 'na') right = '<span class="rag green" data-item-state="na"><i aria-hidden="true"></i>Does not apply</span>';
        else if (g.state === 'elsewhere') right = '<span class="rag green" data-item-state="elsewhere"><i aria-hidden="true"></i>Done (recorded at another site)</span>';
        else right = mayRecord(i, ctx) ? '<button class="btn sec sm" data-record="' + esc(i.id) + '">Record it</button>' : '<span class="hint" data-item-state="open">' + WHO[i.who] + '</span>';
        return '<div class="sgd-item" data-item="' + esc(i.id) + '"><div><b>' + esc(i.label) + '</b>' + (i.optional ? ' <span class="hint">(if it applies)</span>' : '') +
          '<div class="hint">' + esc(i.line) + '</div>' +
          ((g.state === 'done' || g.state === 'na') ? '<div class="hint" style="margin-top:4px">Recorded by ' + esc(g.byName || '') + (g.note ? ': “' + esc(g.note) + '”' : '') + '</div>' : '') +
          '</div><div>' + right + '</div></div>';
      }).join('') + '</div>';
  }
  function wireReview(root, ctx) {
    root.querySelectorAll('[data-record]').forEach(function (b) {
      b.onclick = function () {
        var i = ctx.items.filter(function (x) { return x.id === b.getAttribute('data-record'); })[0];
        ctx.open('<h3>' + esc(i.label) + '</h3><p class="hint">' + esc(i.line) + '</p>' +
          '<p class="warnwords">General words only: never name a child, a family or a concern.</p>' +
          '<div class="f"><label for="rvNote">A note (optional)</label><textarea id="rvNote" maxlength="300" placeholder="e.g. Agreed at the trustees’ meeting in March"></textarea></div>' +
          (i.optional ? '<div class="f"><label class="ctl" style="font-weight:400"><input type="checkbox" id="rvNa"> This does not apply to this church</label></div>' : '') +
          '<p class="hint">Recorded once, with your name and today’s date. It can’t be changed afterwards.</p>' +
          '<p class="hint" id="rvMsg" role="status"></p><div class="row"><button class="btn" id="rvGo">Record it</button><button class="btn sec" data-close>Cancel</button></div>');
        document.getElementById('rvGo').onclick = function () {
          var go = this; go.disabled = true;
          var naBox = document.getElementById('rvNa'), lead = i.who === 'lead' || (i.who === 'either' && ctx.lead);
          ctx.db().collection('sgReviews').doc(ctx.year + '_' + i.id).set({
            year: ctx.year, itemId: i.id, siteId: lead ? ctx.siteId : '', at: firebase.firestore.FieldValue.serverTimestamp(),
            by: ctx.me.uid, byName: String(ctx.me.name || '').slice(0, 120), note: document.getElementById('rvNote').value.trim().slice(0, 300), na: !!(naBox && naBox.checked)
          }).then(function () { ctx.close(); return ctx.after(); }, function (e) { go.disabled = false; document.getElementById('rvMsg').textContent = 'It could not be recorded: ' + (e.message || e); });
        };
      };
    });
  }

  /* ---- SNAPSHOTS ----
     ctx: { db, siteId, siteName, may (trustee or master), me, W, D, risks, acts, T, open, close, after } */
  function snapshotsHtml(ctx, list) {
    return (ctx.may ? '<div class="card sgd-noprint" id="snapTake"><h2>Take a dated snapshot</h2><p class="hint" style="margin:6px 0 0">A copy of the register as it stands today: the risks and their ratings, the warnings and dials as counts, and the review. Kept for the trustees’ records and never changed.</p><div class="row"><button class="btn" id="snapGo">Take a snapshot</button></div></div>' : '') +
      (list.length ? list.map(function (s) {
        return '<div class="card" data-snap="' + esc(s.id) + '"><h2>' + esc(s.banner) + '</h2><p class="hint" style="margin:6px 0 0">Taken ' + esc(longDate(s.at)) + ' by ' + esc(s.byName || '') + (s.note ? ': “' + esc(s.note) + '”' : '') + '</p>' +
          '<div class="row"><button class="btn sec sm" data-opensnap="' + esc(s.id) + '">Open it</button><a class="btn sec sm" data-printsnap="' + esc(s.id) + '" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="sg-print.html?snapshot=' + encodeURIComponent(s.id) + '">Print / save as PDF</a></div></div>';
      }).join('') : '<div class="card" id="noSnaps"><p style="margin:0">No snapshot yet.' + (ctx.may ? '' : ' The trustees take them.') + '</p></div>');
  }
  function snapshotFrom(ctx, note) {
    var T = ctx.T, actName = {};
    (ctx.acts || []).forEach(function (a) { actName[a.id] = a.name; });
    var risks = (ctx.risks || []).slice(0, 200).map(function (r) {
      return { activity: String(actName[r.activityId] || '').slice(0, 80), risk: r.risk, who: r.who || '', before: T.rating(r.l, r.i), beforeScore: T.score(r.l, r.i),
        after: T.rating(r.rl, r.ri), afterScore: T.score(r.rl, r.ri), controls: (r.controls || []).slice(0, 20).map(T.controlLabel), owner: r.ownerName || '', reviewDue: r.reviewDue || '', status: r.status };
    });
    var w = (ctx.W && ctx.W.items) || [], dials = {};
    Object.keys((ctx.D && ctx.D.dials) || {}).forEach(function (k) { var x = ctx.D.dials[k]; dials[k] = { value: x.value, of: x.of, pct: x.pct, rag: x.rag }; });
    var rv = (ctx.D && ctx.D.review) || {};
    return { siteId: ctx.siteId, banner: ('Safeguarding risk register: ' + ctx.siteName + ', ' + longDate(new Date().toISOString())).slice(0, 200),
      by: ctx.me.uid, byName: String(ctx.me.name || '').slice(0, 120), at: firebase.firestore.FieldValue.serverTimestamp(), note: String(note || '').slice(0, 300),
      risks: risks, warnings: { red: w.filter(function (x) { return x.level === 'red'; }).length, amber: w.filter(function (x) { return x.level === 'amber'; }).length },
      dials: dials, review: { done: rv.done || 0, of: rv.of || 0, status: rv.status || '' } };
  }
  var DIAL_WORDS = { checks: 'Leaders with in-date checks', sessions: 'Sessions with enough leaders', consent: 'Children with current consent', assess: 'Event assessments signed', review: 'The annual review', incidents: 'Incident follow-ups open' };
  var RAG_WORDS = { red: 'High', amber: 'Medium', green: 'Low' };
  function snapshotView(s) {
    return '<div id="snapView"><p class="sgd-banner">' + esc(s.banner) + '</p><p class="hint">Taken ' + esc(longDate(s.at)) + ' by ' + esc(s.byName || '') + (s.note ? ': “' + esc(s.note) + '”' : '') + '</p>' +
      '<h3 style="margin-top:14px">Where safeguarding stood</h3><table class="sgd-tbl">' + Object.keys(DIAL_WORDS).filter(function (k) { return (s.dials || {})[k]; }).map(function (k) {
        var x = s.dials[k]; return '<tr><td>' + DIAL_WORDS[k] + '</td><td class="n">' + (x.rag === 'unread' ? 'no figure' : x.pct != null ? x.pct + '% (' + x.value + ' of ' + x.of + ')' : x.value + ' of ' + x.of) + '</td></tr>';
      }).join('') + '<tr><td>Warnings</td><td class="n">' + ((s.warnings || {}).red || 0) + ' act now, ' + ((s.warnings || {}).amber || 0) + ' soon</td></tr>' +
      '<tr><td>The annual review</td><td class="n">' + ((s.review || {}).done || 0) + ' of ' + ((s.review || {}).of || 0) + ' items</td></tr></table>' +
      '<h3 style="margin-top:14px">The standing risks</h3><div style="overflow-x:auto"><table class="sgd-tbl"><tr><th>Activity</th><th>Risk</th><th>Before</th><th>After</th><th>Review by</th></tr>' +
      (s.risks || []).map(function (r) { return '<tr' + (r.status === 'closed' ? ' style="opacity:.6"' : '') + '><td>' + esc(r.activity) + '</td><td>' + esc(r.risk) + (r.status === 'closed' ? ' (closed)' : '') + '<div class="hint">' + esc((r.controls || []).join('; ')) + '</div></td><td>' + RAG_WORDS[r.before] + ' ' + r.beforeScore + '</td><td>' + RAG_WORDS[r.after] + ' ' + r.afterScore + '</td><td>' + esc(r.reviewDue) + '</td></tr>'; }).join('') +
      '</table></div></div>';
  }
  function wireSnapshots(root, ctx, list) {
    var go = root.querySelector('#snapGo');
    if (go) go.onclick = function () {
      ctx.open('<h3>Take a dated snapshot</h3><p class="sgd-banner" id="snapBanner">Safeguarding risk register: ' + esc(ctx.siteName) + ', ' + esc(longDate(new Date().toISOString())) + '</p>' +
        '<div class="f"><label for="snNote">A note (optional)</label><textarea id="snNote" maxlength="300" placeholder="e.g. For the trustees’ October meeting"></textarea></div>' +
        '<p class="warnwords">General words only: never name a child, a family or a concern.</p>' +
        '<p class="hint" id="snMsg" role="status"></p><div class="row"><button class="btn" id="snGo">Take it</button><button class="btn sec" data-close>Cancel</button></div>');
      document.getElementById('snGo').onclick = function () {
        var b = this; b.disabled = true;
        ctx.db().collection('sgSnapshots').add(snapshotFrom(ctx, document.getElementById('snNote').value.trim()))
          .then(function () { ctx.close(); return ctx.after(); }, function (e) { b.disabled = false; document.getElementById('snMsg').textContent = 'It could not be taken: ' + (e.message || e); });
      };
    };
    root.querySelectorAll('[data-opensnap]').forEach(function (b) {
      b.onclick = function () {
        var s = list.filter(function (x) { return x.id === b.getAttribute('data-opensnap'); })[0];
        ctx.open(snapshotView(s) + '<div class="row sgd-noprint"><button class="btn sec" onclick="window.print()">Print</button><button class="btn sec" data-close>Close</button></div>');
      };
    });
  }

  global.EGBCSgDash = { dial: dial, split: split, dialFor: dialFor, dashboardHtml: dashboardHtml, wireDash: wireDash, countsHtml: countsHtml, sessionsHtml: sessionsHtml,
    loadReview: loadReview, reviewHtml: reviewHtml, wireReview: wireReview, snapshotsHtml: snapshotsHtml, snapshotFrom: snapshotFrom, snapshotView: snapshotView, wireSnapshots: wireSnapshots, longDate: longDate };
})(typeof window !== 'undefined' ? window : this);
