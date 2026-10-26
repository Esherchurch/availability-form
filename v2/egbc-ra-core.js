/* ===================================================================
   THE RISK ASSESSMENT ENGINE: the pieces every register shares
   (F-280 section 2, H&S step 1)
   ===================================================================
   Shared code, not shared data. The safeguarding register uses these
   unchanged (moved here from egbc-sg-templates.js and egbc-sg-dash.js),
   and the health, safety and fire assessments will use the same ones,
   with their own data, rules and pages. Nothing here reads or writes the
   database, and nothing here is any one register's.

   score(l, i), rating(l, i)  likelihood x impact, 1-5 each: 15 and over
                              'red' (High), 5 and over 'amber' (Medium),
                              under 5 'green' (Low) - the same bands as
                              risk.html's hazards; WORDS gives the word
   answered(v)                an answer is there (words, or "N/A: " with a
                              reason)
   checklistFor(lists, kind, flags, extra)
                              the required questions for one assessment:
                              lists = { CHECKLIST, ALSO, FLAGS }
   todoState(risks, today)    each risk's "still to do" actions, counted
   dial(o), split(parts, of)  the dials, in the style of Martin's Calla
                              Compliance pictures: 14 rounded blocks
   =================================================================== */
(function (global) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function longDate(iso) { if (!iso) return ''; var d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---- RATINGS ---- */
  function score(l, i) { return (+l || 0) * (+i || 0); }
  function rating(l, i) { var s = score(l, i); return s >= 15 ? 'red' : s >= 5 ? 'amber' : 'green'; }
  var WORDS = { red: 'High', amber: 'Medium', green: 'Low' };

  /* ---- THE REQUIRED CHECKLIST ---- */
  /* an answer is there: words, or "N/A: " with a reason (a cover amount alone is not an answer) */
  function answered(v) { v = String(v || '').trim(); return !!v && !/^(N\/A|Yes|No):\s*$/.test(v) && !/^£[\d,]*:\s*$/.test(v); }
  /* the required questions for one assessment: the core, its kind's (and any it includes), the ticked flags', then the church's own */
  function checklistFor(lists, kind, flags, churchQs) {
    var CHECKLIST = lists.CHECKLIST, ALSO = lists.ALSO || {}, FLAGS = lists.FLAGS || [];
    flags = flags || {};
    var out = [].concat(CHECKLIST.core.map(function (q) { return Object.assign({ group: 'core' }, q); }));
    if (CHECKLIST[kind] && kind !== 'core') [kind].concat(ALSO[kind] || []).forEach(function (k) { out = out.concat(CHECKLIST[k].map(function (q) { return Object.assign({ group: k }, q); })); });
    FLAGS.forEach(function (f) { if (flags[f.id] === true && CHECKLIST[f.id]) out = out.concat(CHECKLIST[f.id].map(function (q) { return Object.assign({ group: f.id }, q); })); });
    (churchQs || []).forEach(function (q) { if (q && q.id && q.q) out.push({ id: q.id, label: q.q, hint: q.hint || 'The church’s own question', group: q.group || 'church' }); });
    return out;
  }

  /* ---- "STILL TO DO" ----
     todoState -> { open, overdue, unready (open with no person or date),
     redOpen (open on a risk still High after its controls) }, counts. */
  function todoState(risks, today) {
    var s = { open: 0, overdue: 0, unready: 0, redOpen: 0 };
    (risks || []).forEach(function (r) {
      var red = rating(r.rl, r.ri) === 'red';
      (r.todo || []).forEach(function (t) {
        if (!t || t.done || !String(t.what || '').trim()) return;
        s.open++;
        if (!String(t.who || '').trim() || !t.by) s.unready++;
        else if (today && t.by < today) s.overdue++;
        if (red) s.redOpen++;
      });
    });
    return s;
  }

  /* ---- THE DIALS ---- */
  var N = 14;
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

  var api = { esc: esc, longDate: longDate, plural: plural, score: score, rating: rating, WORDS: WORDS, answered: answered, checklistFor: checklistFor, todoState: todoState,
              N: N, COLOUR: COLOUR, dial: dial, split: split };
  global.EGBCRaCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
