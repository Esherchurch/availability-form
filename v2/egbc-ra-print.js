/* ===================================================================
   THE A4 PRINT: the pieces every register's print shares (F-280
   section 2, H&S step 1). Moved unchanged from sg-print.html; the styles
   are egbc-ra-print.css. Needs egbc-ra-core.js first.
   ===================================================================
     longDate(v)           "27 October 2026" (a date, an ISO string or a
                           Firestore time)
     printedFooter()       "Printed on <date>" in the page's footer
     header(church, what)  the church's logo and name, and what this is
     rag(l, i)             a rating in words and colour, with its sums
     riskTable(risks, o)   hazard, who, before, controls, after, owner,
                           review: o.controlLabel turns a control into words
     todoTable(risks)      every "still to do" action
     dialCell(...)         one dial of the row, with its title and line
     mustBox(must)         the red box: what must not go ahead
     signBoxes(labels)     signature lines for a paper file
   =================================================================== */
(function (global) {
  'use strict';
  var R = global.EGBCRaCore, esc = R.esc, WORDS = R.WORDS;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function longDate(v) { if (!v) return ''; var d = v && v.toDate ? v.toDate() : new Date(String(v).length <= 10 ? v + 'T12:00:00' : v); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  /* the page and its footer: A4 portrait, page numbers, and "Printed on <date>" (a page margin can't take a variable, so the date is written in) */
  var PAGE = '@page{size:A4 portrait;margin:14mm 12mm 16mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:8.5pt;color:#6b7280}}';
  function printedFooter() {
    var printed = longDate(new Date().toISOString());
    var page = document.createElement('style');
    page.textContent = PAGE;
    document.head.appendChild(page);
    var foot = document.createElement('style');
    foot.textContent = '@page{@bottom-left{content:"Printed on ' + printed + '";font-size:8.5pt;color:#6b7280}}';
    document.head.appendChild(foot);
    return printed;
  }
  function header(church, what) {
    return '<div class="head">' + (church.logoUrl ? '<img src="' + esc(church.logoUrl) + '" alt="">' : '') + '<div><div class="church" id="pChurch">' + esc(church.name || '') + '</div><div class="what">' + esc(what) + '</div></div></div>';
  }
  function rag(l, i) { var r = R.rating(l, i); return '<span class="rag ' + r + '" data-rag="' + r + '">' + WORDS[r] + ' ' + R.score(l, i) + '</span><div class="note">' + l + ' × ' + i + '</div>'; }
  /* STILL TO DO (Derby's steps 4 and 5): every action, its risk, who, by when, and done or not */
  function todoTable(risks) {
    var rows = [], today = new Date().toISOString().slice(0, 10);
    (risks || []).forEach(function (x) { (x.todo || []).forEach(function (t) { if (t && t.what) rows.push([x.risk, t]); }); });
    if (!rows.length) return '';
    return '<h2>Still to do</h2><table class="ck" id="pTodo"><thead><tr><th>The risk</th><th>Still to do</th><th>Who</th><th>By</th><th>Done</th></tr></thead><tbody>' +
      rows.map(function (p) { var t = p[1]; return '<tr data-ptodo><td>' + esc(p[0]) + '</td><td>' + esc(t.what) + '</td><td>' + esc(t.who || 'Nobody named') + '</td><td>' + esc(t.by ? longDate(t.by) : 'No date') +
        (!t.done && t.by && t.by < today ? ' <span class="rag amber" data-ptodolate>Overdue</span>' : '') + '</td><td>' + (t.done ? 'Done' : 'Not yet') + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  /* the risk table: hazard, who, before, controls (a list), after, owner, review - one row never split across pages */
  function riskTable(risks, opts) {
    opts = opts || {};
    var label = opts.controlLabel || function (c) { return c && c.text || ''; };
    return '<table id="' + (opts.id || 'pRisks') + '"><thead><tr><th>Hazard</th><th>Who’s at risk</th><th>Before</th><th>Controls</th><th>After</th><th>Owner</th><th>Review</th>' + (opts.status ? '<th>Status</th>' : '') + '</tr></thead><tbody>' +
      (risks.length ? risks.map(function (r) {
        var ctl = (r.controls || []).map(function (c) { return typeof c === 'string' ? c : label(c); }).filter(Boolean);
        return '<tr data-prisk' + (r.mustNot ? ' data-pmust' : '') + '><td>' + (r.mustNot ? '<b style="color:var(--red)">Must not go ahead as described.</b><br>' : '') + esc(r.risk) + (r.from === 'hub' ? '<div class="note">From the hub’s numbers</div>' : '') + '</td><td>' + esc(r.who || '') + '</td>' +
          '<td>' + (r.before ? '<span class="rag ' + r.before + '" data-rag="' + r.before + '">' + WORDS[r.before] + ' ' + r.beforeScore + '</span>' : rag(r.l, r.i)) + '</td>' +
          '<td>' + (ctl.length ? '<ul>' + ctl.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '<span class="missing">None given</span>') + '</td>' +
          '<td>' + (r.after ? '<span class="rag ' + r.after + '" data-rag="' + r.after + '">' + WORDS[r.after] + ' ' + r.afterScore + '</span>' : rag(r.rl, r.ri)) + '</td>' +
          '<td>' + esc(r.owner || r.ownerName || '') + '</td><td>' + esc(r.review || (r.reviewDue ? longDate(r.reviewDue) : '')) + '</td>' + (opts.status ? '<td>' + (r.status === 'closed' ? 'Closed' : 'Open') + '</td>' : '') + '</tr>';
      }).join('') : '<tr><td colspan="8" class="na">No risks written yet.</td></tr>') + '</tbody></table>';
  }
  /* one dial of the row: the dial, its title, its line (each says its rating or number in words) */
  function dialCell(key, o, title, line) { return '<div class="dl" data-pdial="' + key + '">' + R.dial(o) + '<div class="t">' + esc(title) + '</div><div class="l">' + esc(line) + '</div></div>'; }
  /* the red box: what must not go ahead as described */
  function mustBox(must) {
    return must.length ? '<div class="must" id="pMust"><b>This must not go ahead as described.</b> ' + (must.length === 1 ? 'This item has' : 'These ' + must.length + ' items have') + ' to be changed or taken out first:<ul id="pMustList">' + must.map(function (x) { return '<li>' + esc(x.risk) + '</li>'; }).join('') + '</ul></div>' : '';
  }
  /* signature lines for a paper file: [[label, label], ...] - each with its date */
  function signBoxes(labels) { return '<div class="sign" id="pSign">' + labels.map(function (l) { return '<div><span>' + esc(l) + '</span></div><div><span>Date</span></div>'; }).join('') + '</div>'; }

  global.EGBCRaPrint = { longDate: longDate, printedFooter: printedFooter, header: header, rag: rag, riskTable: riskTable, todoTable: todoTable, dialCell: dialCell, mustBox: mustBox, signBoxes: signBoxes, WORDS: WORDS, esc: esc };
})(typeof window !== 'undefined' ? window : this);
