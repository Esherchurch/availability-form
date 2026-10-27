/* ===================================================================
   HEALTH, SAFETY AND FIRE: THE DIALS (H&S step 6; F-280 section 7)
   ===================================================================
   In the style of the safeguarding dashboard (egbc-ra-core.js dial), from
   the hub's own numbers, never the AI's. Used on the live risk register's
   first tab and in the A4 print (ra-print.html).

     building({ ra: {hs, fire}, sched, today })  the building's six dials:
        the fire assessment in date, the health and safety assessment in
        date, its checks in date, actions overdue, open safety jobs, the
        required questions answered
     assessment(a, o)          one assessment's dials for its print: the
        overall after the controls, the questions answered, actions
        overdue, and its review
     html(dials, cls)          the row, for a page or a print
     CSS                       the screen's dial styles (the print has its own)
   Each dial: { key, title, line, rag, o } (o is RA.dial's).
   Nothing here is any one church's.
   =================================================================== */
(function (global) {
  'use strict';
  var RA = global.EGBCRaCore, HT = global.EGBCHsTemplates, esc = RA.esc;
  var N = RA.N;
  var CSS = '.hsd-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 14px}' +
    '.hsd-cell{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;text-align:center}' +
    '.hsd-cell .t{font:600 13px Inter,sans-serif;color:#111827;margin-top:6px}.hsd-cell .l{font:400 12px Inter,sans-serif;color:#6b7280}' +
    '.sgd-dw{position:relative;max-width:180px;margin:0 auto}.sgd-dial{display:block;width:100%;height:auto}' +
    '.sgd-mid{position:absolute;left:0;right:0;bottom:0;text-align:center}' +
    '.sgd-n{font:300 30px/1 Inter,sans-serif;color:#111827}.sgd-n span{font-size:.45em;color:#6b7280;margin-left:2px}' +
    '.sgd-of{font:400 12px Inter,sans-serif;color:#6b7280;margin-top:4px}' +
    '.sgd-dash{display:inline-block;width:26px;height:3px;border-radius:2px;background:#b0392c;margin:16px 0 4px}';

  function monthsBetween(a, b) { var p = String(a).split('-').map(Number), q = String(b).split('-').map(Number); return (q[0] - p[0]) * 12 + (q[1] - p[1]) + (q[2] - p[2]) / 31; }
  /* an assessment's review: countersigned and in date fills the dial with the months left (of 12) */
  function reviewDial(key, title, a, today) {
    if (!a || a.status !== 'countersigned') return { key: key, title: title, rag: 'red', line: !a ? 'Not started' : a.status === 'signed' ? 'Signed; a trustee hasn’t countersigned it' : 'A draft, not signed', o: { dash: true, sub: 'not in force' } };
    var rag = HT.reviewRag(a.reviewDue, today), left = Math.max(0, Math.round(monthsBetween(today, a.reviewDue)));
    return { key: key, title: title, rag: rag, line: rag === 'red' ? 'Overdue for review since ' + RA.longDate(a.reviewDue) : 'Review by ' + RA.longDate(a.reviewDue),
      o: { blocks: rag === 'red' ? [['red', N]] : [[rag, Math.max(1, Math.min(N, Math.round(left / 12 * N)))]], num: String(left), sub: left === 1 ? 'month to review' : 'months to review' } };
  }
  function overdueOf(list, today) { var open = 0, late = 0; (list || []).forEach(function (a) { if (!a || a.done || !a.what) return; open++; if (a.due && a.due < today) late++; }); return { open: open, late: late }; }
  /* none is a full green dial; each one open is a red block */
  function countDial(key, title, n, word) {
    return { key: key, title: title, rag: n ? 'red' : 'green', line: n ? n + ' ' + word : 'None', o: { blocks: n ? [['red', Math.min(N, n)]] : [['green', N]], num: String(n), sub: word } };
  }

  function building(o) {
    var today = o.today, ra = o.ra || {}, s = o.sched || { counts: {}, items: [], safetyJobs: [] }, c = s.counts || {};
    var on = (c.green || 0) + (c.amber || 0) + (c.red || 0), pc = on ? Math.round((c.green || 0) / on * 100) : 0;
    var acts = overdueOf(((ra.hs || {}).actions || []).concat((ra.fire || {}).actions || []), today);
    var qs = 0, left = 0;
    ['hs', 'fire'].forEach(function (k) { var a = ra[k]; if (!a) return; var all = HT.questionsFor(k, o.profile || {}); qs += all.length; left += HT.done(k, o.profile || {}, a.answers || {}).length; });
    return [
      reviewDial('fire', 'Fire risk assessment', ra.fire, today),
      reviewDial('hs', 'Health and safety assessment', ra.hs, today),
      { key: 'checks', title: 'Checks in date', rag: (c.red ? 'red' : c.amber ? 'amber' : 'green'), line: (c.green || 0) + ' in date · ' + (c.amber || 0) + ' due soon · ' + (c.red || 0) + ' overdue',
        o: on ? { blocks: RA.split([['green', c.green || 0], ['amber', c.amber || 0], ['red', c.red || 0]], on), num: String(pc), pc: true, sub: 'in date' } : { dash: true, sub: 'no checks yet' } },
      { key: 'actions', title: 'Actions overdue', rag: acts.late ? 'red' : acts.open ? 'amber' : 'green', line: acts.open ? acts.late + ' overdue of ' + acts.open + ' open' : 'None open',
        o: { blocks: acts.open ? RA.split([['red', acts.late], ['amber', acts.open - acts.late]], acts.open) : [], num: String(acts.late), sub: 'overdue' } },
      countDial('jobs', 'Open safety jobs', (s.safetyJobs || []).length, 'open'),
      { key: 'questions', title: 'Questions answered', rag: !qs ? 'red' : left ? 'amber' : 'green', line: qs ? (qs - left) + ' of ' + qs : 'No assessment yet',
        o: qs ? { blocks: RA.split([['green', qs - left], ['amber', left]], qs), num: String(Math.round((qs - left) / qs * 100)), pc: true, sub: 'answered' } : { dash: true, sub: 'none yet' } }
    ];
  }
  /* one assessment's dials (a building's or an event's): o = { questions: [...], left: [...], today, must } */
  function assessment(a, o) {
    var RANK = { red: 3, amber: 2, green: 1 }, ov = '', by = { red: 0, amber: 0, green: 0 };
    (a.hazards || []).forEach(function (h) { var g = RA.rating(h.rl, h.rs); by[g]++; if (RANK[g] > (RANK[ov] || 0)) ov = g; });
    if (o.must) ov = 'red';
    var n = (a.hazards || []).length, qs = o.questions.length, left = o.left.length, acts = overdueOf(a.actions, o.today);
    return [
      { key: 'overall', title: 'Overall, after the controls', rag: ov || 'red', line: ov ? RA.WORDS[ov] + (o.must ? ': must not go ahead as described' : '') : 'No hazards written yet',
        o: n ? { blocks: RA.split([['red', by.red], ['amber', by.amber], ['green', by.green]], n), num: String(n), sub: n === 1 ? 'hazard' : 'hazards' } : { dash: true, sub: 'no hazards' } },
      { key: 'questions', title: 'Questions answered', rag: left ? 'amber' : 'green', line: (qs - left) + ' of ' + qs,
        o: { blocks: RA.split([['green', qs - left], ['amber', left]], qs || 1), num: String(qs ? Math.round((qs - left) / qs * 100) : 0), pc: true, sub: 'answered' } },
      { key: 'actions', title: 'Actions overdue', rag: acts.late ? 'red' : acts.open ? 'amber' : 'green', line: acts.open ? acts.late + ' overdue of ' + acts.open + ' open' : 'None open',
        o: { blocks: acts.open ? RA.split([['red', acts.late], ['amber', acts.open - acts.late]], acts.open) : [], num: String(acts.late), sub: 'overdue' } }
    ].concat(o.reviewDue !== undefined ? [reviewDial('review', 'The review', Object.assign({}, a, { status: 'countersigned', reviewDue: o.reviewDue }), o.today)] : []);
  }
  function html(dials, id) {
    return '<div class="hsd-row" id="' + (id || 'hsDials') + '">' + dials.map(function (d) {
      return '<div class="hsd-cell" data-dial="' + d.key + '" data-rag="' + d.rag + '">' + RA.dial(d.o) + '<div class="t">' + esc(d.title) + '</div><div class="l">' + esc(d.line) + '</div></div>';
    }).join('') + '</div>';
  }
  var injected = false;
  function css() { if (injected || typeof document === 'undefined') return; injected = true; var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

  global.EGBCHsDash = { building: building, assessment: assessment, html: html, css: css, CSS: CSS };
})(typeof window !== 'undefined' ? window : this);
