/* ===================================================================
   EGBC — the Sunday Service Planner, on a phone
   ===================================================================

   APP-DESIGN-BRIEF §7b. Martin, 10 Oct 2026: "why isnt there a core team
   area in the phone app? They will be doing the sunday service plans from
   the phone app. Look at the current core team phone app!"

   MOVED, NOT COPIED, AND NOT REWRITTEN. This is CoreTeamApp.html's own
   service planner - spInit and everything it calls - lifted out of that
   page unchanged, so that the installed Core Team app and the new phone
   app run THE SAME CODE. §7b says so in those words, and the reason is
   plain: two copies is how a fix looks finished and is not. A song search
   corrected in one of them would quietly stay wrong in the other, and
   nobody would know which one the person in front of you was using.

   WHAT CHANGED IN THE MOVE, and nothing else did:
     - db, toast and loader come from the host rather than from
       CoreTeamApp's globals, because the new app has its own.
     - spAutoFit measured '#screen-service textarea', which is an id in
       CoreTeamApp's markup. It measures inside the mounted root now.
     - personName, personId and isWorshipRole came with it. CoreTeamApp
       uses them in its rota code too, so it takes them back from here
       rather than keeping a second definition.
   The sp* functions still go on window, because the markup this builds
   carries inline onclick handlers and those look for them there. That is
   how the planner already worked; changing it would be a rewrite.

   HOW TO USE IT. One host per page:

     EGBCCorePlanner.mount({
       into: someElement,          // the planner's markup goes in here
       db: EGBCAuth.db,            // optional, defaults to EGBCAuth.db
       toast: fn, loader: fn       // optional
     });

   mount() is safe to call again on the same element - it leaves what is
   on screen alone and simply re-runs spInit, which is what happens every
   time somebody comes back to the tab.

   NEEDS, loaded before it: firebase compat, egbc-auth.js, and Sortable
   (the drag handle). Without Sortable the planner still works; the order
   is then changed by removing and re-adding, which is what CoreTeamApp
   did whenever the CDN was slow.
   =================================================================== */

/* ── egbc-uk-dates (Martin, 14 Oct 2026) ─────────────────────────────
   One copy in each rota and planner page, here and on the original site,
   because the original site's pages load nothing shared. KEEP EVERY COPY
   THE SAME: screenshots/events/rota-dates.test.mjs fails if one differs.

   EGBCUKDates.long('2026-10-11')   "Sunday 11 October 2026"
   EGBCUKDates.short('2026-10-11')  "Sun 11 Oct 2026"
   EGBCUKDates.today()              today in England, yyyy-mm-dd

   Rotas: past dates hidden unless "Show past dates" is on, remembered on
   this device; the page opens at the next date.
     hidden(date), showPast(), togglePast(btn), paintPast(btn), scrollToNext(box),
     openAtNext(box) after every redraw

   Planners: "Service date" becomes the coming services from the rota,
   with ◀ ▶ and "Pick another date". The date box stays underneath with
   its own id and value (yyyy-mm-dd), so everything that reads it, and
   everything that sets it, works as before.
     attach(input, { load, eventSelect, preferred, keepValue })

   Every date box on the page (rota rows, "new event", "Pick another
   date"): shows "Sun 18 Oct 2026", never the browser's 10/18/2026.
     ukify(input), ukifyAll(box), and it happens by itself to any added
   ─────────────────────────────────────────────────────────────────── */
(function (g) {
  if (g.EGBCUKDates) return;
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var KEY = 'egbc-rota-show-past';

  function parts(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').slice(0, 10));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return { y: +m[1], m: +m[2] - 1, d: +m[3], w: d.getUTCDay() };
  }
  function long(ymd) { var p = parts(ymd); return p ? DAYS[p.w] + ' ' + p.d + ' ' + MONTHS[p.m] + ' ' + p.y : String(ymd == null ? '' : ymd); }
  function short(ymd) { var p = parts(ymd); return p ? DAYS[p.w].slice(0, 3) + ' ' + p.d + ' ' + MONTHS[p.m].slice(0, 3) + ' ' + p.y : String(ymd == null ? '' : ymd); }
  function today() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
  }

  /* ---- rotas ---- */
  function showPast() { try { return g.localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function setShowPast(v) { try { if (v) g.localStorage.setItem(KEY, '1'); else g.localStorage.removeItem(KEY); } catch (e) {} }
  function hidden(ymd) { return !showPast() && String(ymd || '') < today(); }
  function paintPast(btn) {
    if (!btn) return;
    var on = showPast();
    btn.textContent = on ? 'Hide past dates' : 'Show past dates';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('data-past-toggle', on ? 'on' : 'off');
  }
  function togglePast(btn) { setShowPast(!showPast()); paintPast(btn); return showPast(); }
  /* The first row dated today or later, brought into view. */
  function scrollToNext(box) {
    var rows = (box || document).querySelectorAll('[data-date]'), t = today();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-date') >= t) {
        try { rows[i].scrollIntoView({ block: 'start' }); } catch (e) { rows[i].scrollIntoView(); }
        return rows[i];
      }
    }
    return null;
  }
  /* Called after every redraw: for the first few seconds the list is
     drawn again as the rota arrives, and each redraw would put the page
     back at the top. Stops the moment the person scrolls, taps or types. */
  var opened = 0, stopped = false;
  function stop() { stopped = true; }
  function openAtNext(box) {
    if (stopped || (opened && Date.now() - opened > 5000)) return null;
    var row = scrollToNext(box);
    if (row && !opened) {
      opened = Date.now();
      ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (t) { g.addEventListener(t, stop, { capture: true, passive: true }); });
    }
    return row;
  }

  /* ---- planners ---- */
  var BTN = 'background:#f0f6f6;color:#3d6263;border:1px solid #d1dfdf;border-radius:8px;padding:8px 12px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;flex:0 0 auto;';
  var SEL = 'flex:1 1 200px;min-width:0;max-width:100%;background:#fff;color:#111827;border:1px solid #d1dfdf;border-radius:8px;padding:8px 10px;font:500 14px Inter,system-ui,sans-serif;';
  var LINK = 'background:none;border:none;color:#3d6263;text-decoration:underline;font:500 13px Inter,system-ui,sans-serif;padding:4px 2px;cursor:pointer;flex:0 0 auto;';
  function isService(ev) { return !/practice|meeting|workshop/i.test(ev.type || ''); }
  function fire(el) { var e; try { e = new Event('change', { bubbles: true }); } catch (x) { e = document.createEvent('Event'); e.initEvent('change', true, true); } el.dispatchEvent(e); }

  /* ---- every date box: UK words on top ----
     A browser draws <input type="date"> in ITS language: on a computer set
     to US English, 10/18/2026, whatever the page says. So every date box on
     these pages shows "Sun 18 Oct 2026" instead, with the browser's own box
     lying invisibly over the words: a click or a tap still opens its
     calendar, and the value underneath is the same yyyy-mm-dd as ever. */
  var OVER = 'position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;margin:0;padding:0;border:0;cursor:pointer;font-size:16px;';
  function outer(input) { var p = input.parentNode; return p && p.getAttribute && p.getAttribute('data-uk-date') !== null ? p : input; }
  function paintDate(input) {
    var p = input.parentNode, shown = p && p.querySelector ? p.querySelector('[data-uk-shown]') : null;
    if (shown && shown.parentNode === p) shown.textContent = input.value ? short(input.value) : 'Pick a date';
    input.setAttribute('aria-label', 'Date: ' + (input.value ? long(input.value) : 'not chosen'));
  }
  function ukify(input) {
    if (!input || String(input.type).toLowerCase() !== 'date' || outer(input) !== input || !input.parentNode) return;
    var box = document.createElement('span');
    box.setAttribute('data-uk-date', '');
    box.className = input.className;
    box.style.cssText = input.style.cssText;
    box.style.position = 'relative';
    if (box.style.display !== 'none') box.style.display = 'inline-flex';
    box.style.alignItems = 'center';
    var shown = document.createElement('span');
    shown.setAttribute('data-uk-shown', '');
    shown.style.cssText = 'pointer-events:none;white-space:nowrap;';
    input.parentNode.insertBefore(box, input);
    box.appendChild(shown);
    box.appendChild(input);
    input.className = '';
    input.style.cssText = OVER;
    var paint = function () { paintDate(input); };
    input.addEventListener('input', paint);
    input.addEventListener('change', paint);
    input.addEventListener('focus', paint);
    input.addEventListener('click', function () { paint(); try { if (input.showPicker) input.showPicker(); } catch (e) {} });
    paint();
  }
  function ukifyAll(root) {
    if (!root) return;
    if (root.tagName === 'INPUT') { ukify(root); return; }
    if (!root.querySelectorAll) return;
    var l = root.querySelectorAll('input[type="date"]');
    for (var i = 0; i < l.length; i++) ukify(l[i]);
  }
  if (g.MutationObserver && g.document) {
    var watch = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) if (ms[i].addedNodes[j].nodeType === 1) ukifyAll(ms[i].addedNodes[j]);
    });
    var begin = function () { ukifyAll(document); watch.observe(document.documentElement, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin); else begin();
  }

  function attach(input, o) {
    if (!input || input.getAttribute('data-uk-pick')) return null;
    o = o || {};
    input.setAttribute('data-uk-pick', '1');
    var wrap = document.createElement('div');
    wrap.className = 'uk-pick';
    wrap.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%;box-sizing:border-box;';
    wrap.innerHTML = '<button type="button" data-uk="prev" aria-label="The service before" style="' + BTN + '">&#9664;</button>' +
      '<select data-uk="list" aria-label="Service date" style="' + SEL + '"><option value="">Reading the rota…</option></select>' +
      '<button type="button" data-uk="next" aria-label="The next service" style="' + BTN + '">&#9654;</button>' +
      '<button type="button" data-uk="other" style="' + LINK + '">Pick another date</button>';
    var at = outer(input);
    at.parentNode.insertBefore(wrap, at);
    at.style.display = 'none';
    /* The date box, in UK words, shown only for "Pick another date". */
    var showBox = function () { var b = outer(input); b.style.display = b === input ? '' : 'inline-flex'; paintDate(input); };
    var sel = wrap.querySelector('[data-uk="list"]');

    function real() { return Array.prototype.filter.call(sel.options, function (op) { return op.value && !op.hasAttribute('data-other'); }); }
    function pickType(type) {
      if (!type || !o.eventSelect) return;
      var n = 0;
      (function look() {
        var s = document.getElementById(o.eventSelect);
        var hit = s && Array.prototype.filter.call(s.options, function (op) { return op.value !== '' && op.text.indexOf(type) === 0; })[0];
        if (hit) { if (s.value !== hit.value) { s.value = hit.value; fire(s); } return; }
        if (++n < 40) setTimeout(look, 100);
      })();
    }
    function choose(v) {
      var bits = String(v).split('|'), date = bits[0], type = bits.slice(1).join('|');
      if (input.value !== date) { input.value = date; fire(input); } else sync();
      paintDate(input);
      pickType(type);
    }
    /* The date box changed some other way: show it in the list. */
    function sync() {
      var d = input.value, other = sel.querySelector('option[data-other]');
      var hit = real().filter(function (op) { return op.value.split('|')[0] === d; })[0];
      if (hit) { if (other) other.parentNode.removeChild(other); if (sel.value.split('|')[0] !== d) sel.value = hit.value; return; }
      if (!d) return;
      if (!other) { other = document.createElement('option'); other.setAttribute('data-other', ''); sel.insertBefore(other, sel.firstChild); }
      other.value = d + '|';
      other.text = short(d) + ' (another date)';
      sel.value = other.value;
    }
    function step(k) {
      var list = real(), i = list.map(function (op) { return op.value; }).indexOf(sel.value), d = input.value, t = null;
      if (i >= 0) t = list[i + k];
      else if (k > 0) t = list.filter(function (op) { return op.value.split('|')[0] > d; })[0];
      else t = list.filter(function (op) { return op.value.split('|')[0] < d; }).pop();
      if (t) { sel.value = t.value; choose(t.value); }
    }
    /* At the first or last service there is nothing to step to: say so by
       greying the arrow out, rather than a button that does nothing (audit,
       15 Oct 2026). */
    function target(k) {
      var list = real(), i = list.map(function (op) { return op.value; }).indexOf(sel.value), d = input.value;
      if (i >= 0) return list[i + k] || null;
      return k > 0 ? (list.filter(function (op) { return op.value.split('|')[0] > d; })[0] || null)
                   : (list.filter(function (op) { return op.value.split('|')[0] < d; }).pop() || null);
    }
    function paintEnds() {
      [['prev', -1], ['next', 1]].forEach(function (p) {
        var b = wrap.querySelector('[data-uk="' + p[0] + '"]'); if (!b) return;
        var none = !target(p[1]);
        b.disabled = none; b.style.opacity = none ? '.35' : ''; b.style.cursor = none ? 'default' : '';
        b.title = none ? (p[1] < 0 ? 'No earlier service on the rota' : 'No later service on the rota') : '';
      });
    }
    try { new MutationObserver(paintEnds).observe(sel, { childList: true }); } catch (e) {}
    sel.addEventListener('change', paintEnds);
    input.addEventListener('change', paintEnds);
    setTimeout(paintEnds, 0);
    input.addEventListener('change', sync);
    sel.addEventListener('change', function () { if (sel.value) choose(sel.value); });
    wrap.querySelector('[data-uk="prev"]').onclick = function () { step(-1); };
    wrap.querySelector('[data-uk="next"]').onclick = function () { step(1); };
    wrap.querySelector('[data-uk="other"]').onclick = function () {
      ukify(input);
      showBox();
      try { input.focus(); if (input.showPicker) input.showPicker(); } catch (e) {}
    };

    Promise.resolve(o.load ? o.load() : []).then(function (evs) {
      var t = today(), seen = {};
      var list = (evs || []).filter(function (ev) {
        if (!ev || !ev.date || ev.archived === true || ev.date < t || !isService(ev)) return false;
        var k = ev.date + '|' + (ev.type || '');
        if (seen[k]) return false;
        seen[k] = 1; return true;
      }).sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.startTime || '').localeCompare(String(b.startTime || ''));
      });
      sel.innerHTML = '';
      list.forEach(function (ev) {
        var op = document.createElement('option');
        op.value = ev.date + '|' + (ev.type || '');
        op.text = short(ev.date) + (ev.type ? ' · ' + ev.type : '');
        sel.appendChild(op);
      });
      if (!list.length) { var none = document.createElement('option'); none.value = ''; none.text = 'Nothing coming on the rota'; sel.appendChild(none); }
      if (input.value || o.keepValue) { sync(); return; }
      var first = (o.preferred && list.filter(o.preferred)[0]) || list[0];
      if (first) { sel.value = first.date + '|' + (first.type || ''); choose(sel.value); }
    }).catch(function () {
      sel.innerHTML = '<option value="">Could not read the rota - pick a date</option>';
      ukify(input);
      showBox();
    });
    return { sync: sync, select: sel };
  }

  g.EGBCUKDates = { long: long, short: short, today: today, hidden: hidden, showPast: showPast, setShowPast: setShowPast,
    togglePast: togglePast, paintPast: paintPast, scrollToNext: scrollToNext, openAtNext: openAtNext, attach: attach, isService: isService,
    ukify: ukify, ukifyAll: ukifyAll };
})(window);
/* ── end egbc-uk-dates ── */

(function (global) {
  'use strict';

  /* ---- the planner's own styles, from CoreTeamApp's <style> ----------
     Kept as one string and written once per page, so the two hosts
     cannot drift apart on spacing either. The colours are var()s that
     both pages define: --teal/--brand, --bg, --border, --white, --font.
     The app defines the aliases this needs beside its own tokens. */
  var CSS = [
    '.sp-input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;',
    'padding:10px 12px;font-family:var(--font);font-size:14px;font-weight:600;color:var(--teal);outline:none}',
    '.sp-input:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(61,98,99,.28)}',
    '.sp-top{padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--white);',
    'border-bottom:1px solid var(--border)}',
    '.sp-date-row{display:flex;gap:8px;flex-wrap:wrap}',
    '.sp-date-row input,.sp-date-row select{flex:1;min-width:0}',
    '.sp-leader{font-size:13px;font-weight:600;color:var(--teal);opacity:.6;padding:0 2px}',
    '.sp-leader span{font-weight:600;opacity:1}',
    '.sp-section-header{display:flex;align-items:center;justify-content:space-between;',
    'padding:14px 12px 8px;flex-wrap:wrap;gap:8px}',
    '.sp-section-header h2{font-size:15px;font-weight:600;color:var(--teal);margin:0}',
    '.sp-btn-row{display:flex;gap:6px;flex-wrap:wrap}',
    '.sp-btn{padding:10px 14px;border-radius:12px;font-family:var(--font);font-size:12px;font-weight:600;',
    'cursor:pointer;border:1px solid var(--border);background:var(--teal-light);color:var(--teal);',
    'text-decoration:none;display:inline-flex;align-items:center;min-height:44px}',
    '.song-block{background:var(--white);border:1px solid var(--border);border-radius:1.5rem;margin:0 12px 10px}',
    '.song-block-header{display:flex;align-items:center;gap:8px;padding:12px 14px}',
    '.sp-drag-handle{cursor:grab;color:var(--border);font-size:1.2rem;display:flex;align-items:center;',
    'flex-shrink:0;touch-action:none}',
    '.sp-song-number{font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap;min-width:48px}',
    '.sp-title-wrap{flex:1;position:relative;min-width:0}',
    '.song-title{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:.5rem;',
    'padding:8px 10px;font-family:var(--font);font-weight:600;font-size:13px;color:var(--teal);outline:none}',
    '.song-title:focus{border-color:var(--teal)}',
    '.sp-suggest-box{position:absolute;top:100%;left:0;right:0;background:var(--white);',
    'border:1px solid var(--border);border-radius:.75rem;box-shadow:0 8px 24px rgba(61,98,99,.15);',
    'z-index:300;overflow:hidden;margin-top:2px;display:none}',
    '.sp-suggest-item{padding:12px 14px;font-size:13px;font-weight:600;color:var(--teal);cursor:pointer;',
    'border-bottom:1px solid var(--bg)}',
    '.sp-suggest-item:last-child{border-bottom:none}',
    '.sp-suggest-item:hover{background:var(--bg)}',
    '.sp-collapse-btn{width:44px;height:44px;border:none;background:none;font-size:13px;color:var(--teal);',
    'cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;',
    'flex-shrink:0;transition:transform .2s}',
    '.is-collapsed .sp-collapse-btn{transform:rotate(-90deg)}',
    '.sp-remove-btn{width:44px;height:44px;border:none;background:none;font-size:1.3rem;color:var(--border);',
    'cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.sp-remove-btn:hover{color:#b22222}',
    '.song-content{padding:0 14px 14px;border-top:1px solid var(--bg)}',
    '.song-content.hidden{display:none}',
    '.sp-keys-row{display:flex;gap:6px;margin-top:10px}',
    '.song-key{flex:1;min-width:0;font-size:12px;padding:10px 6px;background:var(--bg);',
    'border:1px solid var(--border);border-radius:8px;font-family:var(--font);font-weight:600;',
    'color:var(--teal);outline:none}',
    '.song-note{margin-top:8px;width:100%;background:var(--white);border:1px solid var(--border);',
    'border-radius:.75rem;padding:.75rem 1rem;font-family:var(--font);font-weight:600;color:var(--teal);',
    'outline:none;font-size:14px;resize:none;overflow:hidden}',
    '.song-note:focus{border-color:var(--teal)}',
    '.sp-key-info{margin-top:8px;padding:8px 10px;background:var(--bg);border-radius:8px;font-size:13px;',
    'font-weight:600;color:var(--teal);line-height:1.5}',
    '.sp-files-box{margin-top:8px;padding:10px 12px;background:var(--bg);border-radius:10px;font-size:13px}',
    '.sp-files-box a{display:inline-block;background:var(--teal);color:#fff;padding:8px 12px;',
    'border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin:2px 2px 0 0}',
    '.sp-serve-badge{display:inline-flex;align-items:center;justify-content:center;min-width:2rem;',
    'height:2rem;border-radius:999px;font-size:12px;font-weight:600;padding:0 .5rem;',
    'background:var(--teal-light);color:var(--teal);border:1px solid var(--border);flex-shrink:0}',
    '.sp-serve-badge.is-peak{background:var(--teal);color:#fff;border-color:var(--teal)}',
    '.sp-serve-badge.hidden-badge{visibility:hidden}',
    '.item-block{background:var(--bg);border:1px solid transparent;border-radius:1rem;margin:0 12px 8px;',
    'display:flex;align-items:center;gap:8px;padding:12px 14px}',
    '.item-block:hover{border-color:var(--border)}',
    '.item-title{flex:1;background:transparent;border:none;font-family:var(--font);font-weight:600;',
    'font-size:15px;color:var(--teal);outline:none;min-width:0}',
    '.sp-rota-table{width:100%;border-collapse:collapse}',
    '.sp-rota-table th{text-align:left;padding:8px 12px;font-size:13px;color:var(--muted);',
    'font-weight:600;border-bottom:1px solid var(--border)}',
    '.sp-rota-table td{padding:10px 12px;font-size:13px;font-weight:600;color:var(--body);',
    'border-bottom:1px solid var(--border)}',
    '.sp-rota-table td:first-child{font-weight:600;color:var(--teal)}',
    '.sp-rota-table textarea{width:100%;background:var(--bg);border:1px solid var(--border);',
    'border-radius:8px;padding:6px 8px;font-family:var(--font);font-size:12px;font-weight:600;',
    'color:var(--teal);outline:none;resize:none;overflow:hidden}',
    '.sp-actions{display:flex;gap:10px;padding:16px 12px;flex-wrap:wrap}',
    '.sp-actions button{flex:1;min-width:120px;padding:14px;border:none;border-radius:12px;',
    'font-family:var(--font);font-size:14px;font-weight:600;cursor:pointer;min-height:48px}',
    /* CHOOSING A SONG (Martin approved the mock-up, 19 Oct 2026:
       design-mocks/core-team/song-flow-1540). */
    '.sp-pick{position:fixed;inset:0;z-index:1000;background:rgba(17,24,39,.4);display:flex;align-items:flex-end;justify-content:center}',
    '.sp-pick-box{background:#fff;width:100%;max-width:560px;height:calc(100% - 64px);max-height:720px;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden}',
    '@media(min-width:700px){.sp-pick{align-items:center}.sp-pick-box{border-radius:18px;height:80vh}}',
    '.sp-pick-h{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)}',
    '.sp-pick-h b{font-size:16px;color:var(--ink,#111827)}',
    '.sp-pick-x{width:44px;height:44px;border:1px solid var(--border);border-radius:10px;background:#fff;cursor:pointer;display:grid;place-items:center;color:var(--teal)}',
    '.sp-pick-q{margin:12px 16px;min-height:48px;border:2px solid var(--teal);border-radius:12px;padding:0 12px;font:500 16px var(--font);color:var(--ink,#111827);outline:none}',
    '.sp-pick-list{overflow-y:auto;flex:1;padding-bottom:16px}',
    '.sp-pick-lab{padding:8px 16px 4px;font-size:12px;font-weight:600;color:var(--muted)}',
    '.sp-pick-row{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:8px 16px;border:0;border-bottom:1px solid var(--border);background:#fff;text-align:left;cursor:pointer;font-family:var(--font)}',
    '.sp-pick-row:hover{background:var(--bg)}',
    '.sp-pick-row b{display:block;color:var(--ink,#111827);font-size:14px}.sp-pick-row small{color:var(--muted);font-size:12px}',
    '.sp-pick-row .add{margin-left:auto;flex:none;width:40px;height:40px;border-radius:10px;background:var(--teal-light);color:var(--teal);display:grid;place-items:center;font-size:20px;font-weight:600}',
    '.sp-pick-row mark{background:#fef3c7;color:inherit;padding:0}',
    '.sp-keybtns{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}',
    '.sp-keybtns button{flex:1 1 70px;min-height:44px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font:600 13px var(--font);color:var(--ink,#111827);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1}',
    '.sp-keybtns button small{font-size:10px;font-weight:500;color:var(--muted)}',
    '.sp-keybtns button.on{border-color:var(--teal);background:var(--teal-light);color:var(--teal)}',
    '.sp-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:1001;background:#111827;color:#fff;border-radius:10px;padding:12px 16px;font:500 14px var(--font);max-width:calc(100% - 32px)}'
  ].join('');

  /* ---- the planner's markup, from CoreTeamApp's #screen-service ------
     The outer .screen div is the HOST's, not this module's: in
     CoreTeamApp it is a screen, in the app it is a tab. Everything
     inside is the same. */
  var HTML = ''
    + '<div class="sp-top">'
    +   '<div class="sp-date-row">'
    +     '<input type="date" id="spDate" onchange="spLoadRota()" class="sp-input">'
    +     '<select id="spEventSelect" onchange="spSelectEvent()" class="sp-input">'
    +       '<option value="">Select Service…</option>'
    +     '</select>'
    +   '</div>'
    +   '<input id="spTypeNotes" class="sp-input" placeholder="General Notes">'
    +   '<div class="sp-leader">Leader: <span id="spLeaderName">None</span></div>'
    + '</div>'
    + '<div style="padding:10px 12px 0;">'
    +   '<textarea id="spIntro" class="sp-input" placeholder="Opening remarks (appears in team email)…" rows="2"></textarea>'
    + '</div>'
    + '<div class="sp-section-header">'
    +   '<h2>Order of Service</h2>'
    +   '<div class="sp-btn-row">'
    +     '<button class="sp-btn" onclick="spPickSong()">+ Song</button>'
    +     '<button class="sp-btn" onclick="spAddItem()">+ Item</button>'
    +     '<a href="sundayplannersonglibrary.html" target="_blank" class="sp-btn">Songs DB</a>'
    +   '</div>'
    + '</div>'
    + '<div id="sp-order"></div>'
    + '<div style="padding:0 12px;">'
    +   '<div style="background:var(--white);border-radius:16px;border:1px solid var(--border);padding:16px;margin-bottom:12px;">'
    +     '<div style="font-size:13px;font-weight:600;color:var(--teal);margin-bottom:12px;">Service Team &amp; Roles</div>'
    +     '<div style="overflow-x:auto;">'
    +       '<table class="sp-rota-table">'
    +         '<thead><tr><th>Role</th><th>Person</th><th>Notes</th></tr></thead>'
    +         '<tbody id="spTeamBody"></tbody>'
    +       '</table>'
    +     '</div>'
    +   '</div>'
    +   '<textarea id="spOutro" class="sp-input" placeholder="Closing remarks (appears at end of team email)…" rows="2" style="margin-bottom:12px;"></textarea>'
    +   '<div class="sp-actions">'
    +     '<button onclick="spSave()" style="background:var(--teal);color:white;">Save</button>'
    +     '<input id="spSenderEmail" type="email" placeholder="Your email..." style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12px;font-weight:500;color:var(--teal);font-family:var(--font);outline:none;margin-bottom:6px;width:100%;min-height:44px" oninput="localStorage.setItem(\'egbc-sender-email\',this.value)">'
    +     '<button onclick="spEmail()" style="background:var(--bg);color:var(--teal);border:1.5px solid var(--border);">Email Team</button>'
    +   '</div>'
    + '</div>';

  /* ---- the host ------------------------------------------------------
     One per page. db, toast and loader were CoreTeamApp's globals; the
     app has its own, so they are handed in. The fallbacks are there so a
     page that passes nothing still works rather than throwing from
     inside a save. */
  var H = {
    root: null,
    db: null,
    toast: function (m) { try { console.log('[planner] ' + m); } catch (e) {} },
    loader: function () {}
  };
  function db() { return H.db || (global.EGBCAuth && EGBCAuth.db); }
  function toast(m) { H.toast(m); }
  function loader(show, msg) { H.loader(show, msg); }

  /* ---- helpers that came with it -------------------------------------
     CoreTeamApp's rota code uses these too, so it takes them from here
     rather than keeping a second copy that could drift. */
  var personName = function (raw) {
    return Array.isArray(raw) ? raw.map(function (p) { return p.name; }).join(', ')
                              : ((raw && raw.name) || '');
  };
  var personId = function (raw) {
    return Array.isArray(raw) ? ((raw[0] && raw[0].id) || '') : ((raw && raw.id) || '');
  };
  var isWorshipRole = function (r) {
    if (typeof global.EGBCAuth !== 'undefined' && EGBCAuth.roleTeam) {
      return EGBCAuth.roleTeam(r) !== 'Kids Church';
    }
    return !(r === 'Session Leader' || r.indexOf('Helper ') === 0
             || r.indexOf('Leader (') === 0 || r.indexOf('Assistant (') === 0);
  };

  /* ══ SERVICE PLANNER ══ verbatim from CoreTeamApp.html ══════════════ */

  var SP_ALL_KEYS = ["Ab","A","Am","A#","A#m","Bb","B","Bm","C","Cm","C#","C#m","Db","D","Dm","D#","D#m","Eb","E","Em","F","Fm","F#","F#m","Gb","G","Gm","G#","G#m"];
  var spEventsForDay = [];
  var spLeader = '';
  var spAddressBook = [];
  var _spSortableInit = false;
  var _spDefaultLoaded = false;
  var _spInputWired = false;
  /* The planner's markup, built once and moved between hosts - see mount(). */
  var PANEL = null;

  function spInit() {
    var order = document.getElementById('sp-order');
    if (!order) return;
    if (!_spSortableInit && typeof global.Sortable !== 'undefined') {
      global.Sortable.create(order, {
        animation: 150, handle: '.sp-drag-handle',
        onEnd: function () { spUpdateNumbers(); }
      });
      _spSortableInit = true;
    }
    /* Wired ONCE, not on every visit to the tab. In CoreTeamApp spInit
       ran on each showScreen('service') and added another listener each
       time, so the longer somebody stayed in the app the more times a
       keystroke re-measured the box. Harmless there and worse in a tab
       bar, where coming back is one tap. */
    if (!_spInputWired) {
      order.addEventListener('input', function (e) {
        if (e.target.tagName.toLowerCase() === 'textarea') spAutoFit();
      });
      _spInputWired = true;
    }
    /* OPEN ON THE COMING SUNDAY (Martin, 11 Oct 2026). It opened on a
       blank date, so the first thing anybody did was pick the date they
       were always going to pick. The planner is for this Sunday far more
       often than for any other day.
       In the module rather than in either host, so the Core Team app and
       the phone app open the same way - which is the whole reason the
       planner lives here. */
    if (!_spDefaultLoaded) {
      _spDefaultLoaded = true;
      var dateBox = document.getElementById('spDate');
      /* Service date: the coming services from the rota, in UK words, with
         the date box underneath (Martin, 14 Oct 2026). It still opens on
         the coming Sunday, set just below. */
      if (dateBox) EGBCUKDates.attach(dateBox, { eventSelect: 'spEventSelect', keepValue: true, load: function () {
        return db().collection('events').where('date', '>=', EGBCUKDates.today()).get()
          .then(function (s) { return s.docs.map(function (d) { return d.data(); }); });
      } });
      if (dateBox && !dateBox.value) {
        dateBox.value = comingSunday();
        /* And the service on it, IF THERE IS EXACTLY ONE. Two means a
           choice - a morning service and an evening one, say - and
           choosing for somebody is how you plan the wrong service
           without noticing. */
        spLoadRota().then(function () {
          var sel = document.getElementById('spEventSelect');
          if (sel && sel.options.length === 2) {
            sel.value = sel.options[1].value;
            return spSelectEvent();
          }
          /* Nothing on the rota that day, or more than one: the default
             order, as before. */
          spSetupDefaultOrder();
          spAutoFit();
        }).catch(function () { spSetupDefaultOrder(); spAutoFit(); });
        return;
      }
      // Pre-populate default order on first open, exactly like the desktop planner
      spSetupDefaultOrder();
      spAutoFit();
    }
  }

  /* The next Sunday, or today when today IS Sunday - a plan is most often
     worked on during the week before, and on the morning itself. Local
     time throughout: new Date() is the phone's own day, and the date box
     wants yyyy-mm-dd in that same day, so toISOString() (which is UTC)
     would hand somebody in a British summer evening the day before. */
  function comingSunday() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    var m = String(d.getMonth() + 1), day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m)
                           + '-' + (day.length < 2 ? '0' + day : day);
  }

  function spSetupDefaultOrder() {
    spAddSong(); spAddSong(); spAddSong();
    spAddItem('Welcome and Notices');
    spAddSong();
    spAddItem('Message');
    spAddSong(); spAddSong(); spAddSong();
  }

  function spAutoFit() {
    /* Scoped to the mounted root. It said '#screen-service textarea',
       which is an id that exists only in CoreTeamApp. */
    var root = H.root || document;
    root.querySelectorAll('textarea').forEach(function (t) {
      t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px';
    });
  }

  function spUpdateNumbers() {
    document.querySelectorAll('#sp-order .song-block').forEach(function (b, i) {
      var lbl = b.querySelector('.sp-song-number');
      if (lbl) lbl.textContent = 'Song ' + (i + 1);
    });
  }

  function spToggle(btn) {
    var block = btn.closest('.song-block');
    var content = block.querySelector('.song-content');
    block.classList.toggle('is-collapsed');
    content.classList.toggle('hidden');
    btn.textContent = content.classList.contains('hidden') ? '<i data-lucide=\'chevron-right\' style=\'width:14px;height:14px\'></i>' : '<i data-lucide=\'chevron-down\' style=\'width:14px;height:14px\'></i>';
    if (!content.classList.contains('hidden')) spAutoFit();
  }

  function spAddSong() {
    var container = document.getElementById('sp-order');
    var id = Math.random().toString(36).substr(2, 9);
    var isFirst = container.querySelectorAll('.song-block').length === 0;
    var div = document.createElement('div');
    div.className = 'service-block song-block' + (isFirst ? '' : ' is-collapsed');
    div.innerHTML = ''
      + '<div class="song-block-header">'
      +   '<div class="sp-drag-handle">⠿</div>'
      +   '<button onclick="spToggle(this)" class="sp-collapse-btn">' + (isFirst ? '<i data-lucide=\'chevron-down\' style=\'width:14px;height:14px\'></i>' : '<i data-lucide=\'chevron-right\' style=\'width:14px;height:14px\'></i>') + '</button>'
      +   '<span class="sp-song-number">Song</span>'
      +   '<div class="sp-title-wrap">'
      +     '<input class="song-title" oninput="spSearch(this,\'' + id + '\')" placeholder="Song title">'
      +     '<div id="sp-suggest-' + id + '" class="sp-suggest-box"></div>'
      +   '</div>'
      +   '<div id="sp-serve-' + id + '" class="sp-serve-badge hidden-badge"></div>'
      +   '<button onclick="this.closest(\'.song-block\').remove();spUpdateNumbers();" class="sp-remove-btn">&times;</button>'
      + '</div>'
      + '<div class="song-content ' + (isFirst ? '' : 'hidden') + '">'
      +   '<div class="sp-keys-row">'
      +     '<select onchange="spKeyChanged(\'' + id + '\')" class="song-key"><option value="">Key 1</option>' + SP_ALL_KEYS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select>'
      +     '<select onchange="spKeyChanged(\'' + id + '\')" class="song-key"><option value="">Key 2</option>' + SP_ALL_KEYS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select>'
      +     '<select onchange="spKeyChanged(\'' + id + '\')" class="song-key"><option value="">Key 3</option>' + SP_ALL_KEYS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select>'
      +   '</div>'
      +   '<textarea class="song-note" placeholder="Notes for the band..." rows="1"></textarea>'
      +   '<div id="sp-keyinfo-' + id + '" class="sp-key-info" style="display:none;"></div>'
      +   '<div id="sp-files-' + id + '"></div>'
      + '</div>';
    container.appendChild(div);
    /* Tapped "+": show the new row and put the cursor in it - at the foot of
       a long plan it was added out of sight, and the button seemed to do
       nothing (audit, 15 Oct 2026). Not while a saved plan is being drawn. */
    if (window.event && window.event.type === 'click') {
      try { div.scrollIntoView({ block: 'center', behavior: 'smooth' }); var nIn = div.querySelector('input'); if (nIn) nIn.focus({ preventScroll: true }); } catch (e) {}
    }
    spUpdateNumbers();
    return id;
  }

  /* ==== CHOOSING A SONG (Martin, 16 Oct 2026: "can't make out how you
     actually choose the song"; the mock-up approved 19 Oct) ===============
     "+ Song" opens the song library, not a blank box: what was sung
     recently and what is sung most come first; typing a title or a line
     finds it (the line shown, so you know it is the right one); one tap
     adds it, opens it and offers its keys - the ones with chord sheets
     first, "Other..." for any. A song not in the library can still be
     added by name. The history is read from the saved plans (services). */
  var SP_LIB = null;
  function spLibrary() {
    if (SP_LIB) return SP_LIB;
    SP_LIB = Promise.all([db().collection('songs').get(), db().collection('services').get()]).then(function (r) {
      var songs = r[0].docs.map(function (d) { var x = d.data() || {}; x._id = d.id; return x; }).filter(function (s) { return s.title; });
      var used = {}, today = new Date().toISOString().slice(0, 10);
      r[1].docs.forEach(function (d) {
        var sv = d.data() || {}; if (!sv.date || sv.date > today) return;
        (sv.order || []).forEach(function (it) {
          if (!it || it.type !== 'song' || !it.title) return;
          var k = String(it.title).trim().toLowerCase(), u = used[k] || (used[k] = { last: '', count: 0, keys: {} });
          u.count++; if (sv.date > u.last) u.last = sv.date;
          (it.keys || []).forEach(function (x) { if (x) u.keys[x] = 1; });
        });
      });
      return { songs: songs, used: used };
    }, function () { SP_LIB = null; return { songs: [], used: {} }; });
    return SP_LIB;
  }
  function spEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function spChordKeys(s) {
    var k = (s.files || []).filter(function (f) { return f && f.type === 'Chord Sheet' && f.key; }).map(function (f) { return f.key; });
    return k.filter(function (x, i) { return k.indexOf(x) === i; });
  }
  function spUkDate(iso) { var d = new Date(iso + 'T12:00'); return isNaN(d) ? iso : d.getDate() + ' ' + d.toLocaleDateString('en-GB', { month: 'short' }); }
  function spPickRow(s, sub) {
    return '<button type="button" class="sp-pick-row" data-song="' + spEsc(s.title) + '"><span style="min-width:0"><b>' + spEsc(s.title) + '</b><small>' + sub + '</small></span><span class="add" aria-hidden="true">+</span></button>';
  }
  function spPickDraw(q) {
    var list = document.getElementById('sp-pick-list'); if (!list) return;
    spLibrary().then(function (L) {
      var keysOf = function (s) { var k = spChordKeys(s); return k.length ? (k.length > 1 ? 'keys ' : 'key ') + k.join(', ') : 'no chord sheets yet'; };
      var html = '';
      q = String(q || '').trim().toLowerCase();
      if (q.length < 2) {
        var withUse = L.songs.map(function (s) { return { s: s, u: L.used[s.title.trim().toLowerCase()] }; }).filter(function (x) { return x.u; });
        /* Recently: sung in the last four weeks. Most used: the rest, by how often. */
        var since = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
        var recent = withUse.filter(function (x) { return x.u.last >= since; }).sort(function (a, b) { return b.u.last.localeCompare(a.u.last); }).slice(0, 5);
        var taken = recent.map(function (x) { return x.s.title; });
        var most = withUse.filter(function (x) { return taken.indexOf(x.s.title) === -1; }).sort(function (a, b) { return b.u.count - a.u.count; }).slice(0, 5);
        if (recent.length) html += '<div class="sp-pick-lab">Used recently</div>' + recent.map(function (x) { return spPickRow(x.s, 'Last sung ' + spEsc(spUkDate(x.u.last)) + ' \u00b7 ' + spEsc(keysOf(x.s))); }).join('');
        if (most.length) html += '<div class="sp-pick-lab">Most used</div>' + most.map(function (x) { return spPickRow(x.s, 'Sung ' + x.u.count + (x.u.count === 1 ? ' time' : ' times') + ' \u00b7 ' + spEsc(keysOf(x.s))); }).join('');
        if (!html) html = '<div class="sp-pick-lab">Type a title, or a line from the song</div>';
      } else {
        var words = q.split(/\s+/).filter(Boolean);
        var hits = L.songs.map(function (s) {
          var t = s.title.toLowerCase(), ly = String(s.lyrics || '').replace(/\s+/g, ' ');
          var inTitle = words.every(function (w) { return t.indexOf(w) !== -1; });
          var at = ly.toLowerCase().indexOf(q);
          return { s: s, inTitle: inTitle, at: at, ly: ly };
        }).filter(function (h) { return h.inTitle || h.at !== -1; })
          .sort(function (a, b) { return (b.inTitle - a.inTitle) || a.s.title.localeCompare(b.s.title); }).slice(0, 20);
        html += '<div class="sp-pick-lab">' + hits.length + (hits.length === 1 ? ' song' : ' songs') + '</div>';
        html += hits.map(function (h) {
          var sub;
          if (h.at !== -1 && !h.inTitle) {
            var from = Math.max(0, h.at - 18), to = Math.min(h.ly.length, h.at + q.length + 24);
            sub = '\u201c' + (from ? '\u2026' : '') + spEsc(h.ly.slice(from, h.at)) + '<mark>' + spEsc(h.ly.slice(h.at, h.at + q.length)) + '</mark>'
              + spEsc(h.ly.slice(h.at + q.length, to)) + (to < h.ly.length ? '\u2026' : '') + '\u201d \u00b7 ' + spEsc(keysOf(h.s));
          } else sub = 'title \u00b7 ' + spEsc(keysOf(h.s));
          return spPickRow(h.s, sub);
        }).join('');
        var raw = document.getElementById('sp-pick-q').value.trim();
        html += '<div class="sp-pick-lab">Not in the library?</div>'
          + '<button type="button" class="sp-pick-row" data-new="' + spEsc(raw) + '"><span style="min-width:0"><b>Add \u201c' + spEsc(raw) + '\u201d as a new song</b><small>You can add its keys and files later</small></span><span class="add" aria-hidden="true">+</span></button>';
      }
      list.innerHTML = html;
    });
  }
  function spPickClose() {
    var p = document.getElementById('sp-pick'); if (p) p.remove();
    document.removeEventListener('keydown', spPickKey);
    if (SP_PICK_FROM) try { SP_PICK_FROM.focus(); } catch (e) {}
  }
  function spPickKey(e) { if (e.key === 'Escape') spPickClose(); }
  var SP_PICK_FROM = null;
  function spPickSong() {
    spPickClose();
    SP_PICK_FROM = document.activeElement;
    var p = document.createElement('div');
    p.className = 'sp-pick'; p.id = 'sp-pick'; p.setAttribute('data-egbc-overlay', '');
    p.innerHTML = '<div class="sp-pick-box" role="dialog" aria-modal="true" aria-labelledby="sp-pick-t">'
      + '<div class="sp-pick-h"><b id="sp-pick-t">Add a song</b><button type="button" class="sp-pick-x" aria-label="Close" data-close="1">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>'
      + '<input id="sp-pick-q" class="sp-pick-q" type="search" placeholder="Title or a line from the song" autocomplete="off" aria-label="Find a song by its title or a line from it">'
      + '<div class="sp-pick-list" id="sp-pick-list"><div class="sp-pick-lab">Loading the song library\u2026</div></div></div>';
    document.body.appendChild(p);
    p.addEventListener('click', function (e) {
      if (e.target === p || e.target.closest('[data-close]')) { spPickClose(); return; }
      var row = e.target.closest('[data-song],[data-new]'); if (!row) return;
      spPickAdd(row.getAttribute('data-song') || row.getAttribute('data-new'), !!row.getAttribute('data-song'));
    });
    var q = document.getElementById('sp-pick-q');
    q.addEventListener('input', function () { spPickDraw(q.value); });
    document.addEventListener('keydown', spPickKey);
    setTimeout(function () { try { q.focus(); } catch (e) {} }, 50);
    spPickDraw('');
  }
  function spPickAdd(title, inLibrary) {
    title = String(title || '').trim(); if (!title) return;
    spPickClose();
    var id = spAddSong();
    var block = document.getElementById('sp-files-' + id).closest('.song-block');
    block.querySelector('.song-title').value = title;
    /* Open, with its keys: the one just added is the one being worked on. */
    block.classList.remove('is-collapsed');
    var content = block.querySelector('.song-content'); if (content) content.classList.remove('hidden');
    var n = document.querySelectorAll('#sp-order .song-block').length;
    if (inLibrary) spShowKeyInfo(id, title);
    spKeyChanged(id);
    spLibrary().then(function (L) {
      var s = L.songs.filter(function (x) { return x.title === title; })[0] || {};
      var chord = spChordKeys(s);
      var row = document.createElement('div');
      row.className = 'sp-keybtns'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Key for ' + title);
      row.innerHTML = chord.slice(0, 4).map(function (k) { return '<button type="button" data-key="' + spEsc(k) + '">' + spEsc(k) + '<small>chords</small></button>'; }).join('')
        + '<button type="button" data-key="">Other\u2026</button>';
      var keysRow = block.querySelector('.sp-keys-row');
      if (chord.length) keysRow.style.display = 'none';
      keysRow.parentNode.insertBefore(row, keysRow);
      row.addEventListener('click', function (e) {
        var b = e.target.closest('[data-key]'); if (!b) return;
        var k = b.getAttribute('data-key');
        if (!k) { keysRow.style.display = ''; var sel = keysRow.querySelector('.song-key'); if (sel) sel.focus(); return; }
        var sels = [].slice.call(block.querySelectorAll('.song-key'));
        var already = sels.filter(function (x) { return x.value === k; })[0];
        if (already) { already.value = ''; b.classList.remove('on'); }
        else { var free = sels.filter(function (x) { return !x.value; })[0] || sels[0]; free.value = k; b.classList.add('on'); }
        spKeyChanged(id);
      });
    });
    try { block.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    var t = document.createElement('div'); t.className = 'sp-toast'; t.setAttribute('role', 'status');
    t.textContent = '\u201c' + title + '\u201d added as song ' + n;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3000);
  }

  function spAddItem(val) {
    val = typeof val === 'string' ? val : '';
    var div = document.createElement('div');
    div.className = 'service-block item-block';
    div.innerHTML = ''
      + '<div class="sp-drag-handle">⠿</div>'
      + '<div style="width:28px;"></div>'
      + '<input value="' + String(val).replace(/"/g, '&quot;') + '" class="item-title" placeholder="Service Item Name...">'
      + '<button onclick="this.parentElement.remove()" class="sp-remove-btn">&times;</button>';
    document.getElementById('sp-order').appendChild(div);
    /* Tapped "+": show the new row and put the cursor in it - at the foot of
       a long plan it was added out of sight, and the button seemed to do
       nothing (audit, 15 Oct 2026). Not while a saved plan is being drawn. */
    if (window.event && window.event.type === 'click') {
      try { div.scrollIntoView({ block: 'center', behavior: 'smooth' }); var nIn = div.querySelector('input'); if (nIn) nIn.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  async function spShowKeyInfo(id, title) {
    if (!title) return;
    var docId = title.toLowerCase().replace(/\s+/g, '-');
    var snap = await db().collection('songs').doc(docId).get();
    if (!snap.exists) return;
    var data = snap.data();
    var chordKeys = (data.files || []).filter(function (f) { return f.type === 'Chord Sheet' && f.key; }).map(function (f) { return f.key; });
    var unique = [...new Set(chordKeys)];
    var missing = SP_ALL_KEYS.filter(function (k) { return !unique.includes(k); });
    var box = document.getElementById('sp-keyinfo-' + id);
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<span style="font-weight:600;color:var(--teal);">Available:</span> ' + (unique.sort().join(', ') || 'None') + ' &nbsp;·&nbsp; <span style="font-weight:600;color:#b22222;">Missing:</span> <span style="opacity:0.6;">' + missing.join(', ') + '</span>';
    var sundayHistory = (data.servingHistory || []).filter(function (s) { return s.day && s.day.toLowerCase() === 'sunday'; });
    var badge = document.getElementById('sp-serve-' + id);
    if (sundayHistory.length) {
      var counts = sundayHistory.map(function (s) { return s.count || 0; });
      var latest = sundayHistory[0].count || 0;
      var max = Math.max.apply(null, counts);
      badge.textContent = latest;
      badge.classList.remove('hidden-badge');
      latest === max ? badge.classList.add('is-peak') : badge.classList.remove('is-peak');
    } else { badge.textContent = ''; badge.classList.add('hidden-badge'); }
  }

  async function spSearch(input, id) {
    var val = input.value.toLowerCase().trim();
    var box = document.getElementById('sp-suggest-' + id);
    if (val.length < 2) { box.style.display = 'none'; return; }
    var snap = await db().collection('songs').get();
    var words = val.split(' ');
    var matches = snap.docs.map(function (d) { return d.data(); }).filter(function (s) {
      var t = (s.title || '').toLowerCase();
      var n = (s.normalized || '').toLowerCase();
      return words.every(function (w) { return t.includes(w) || n.includes(w); });
    }).slice(0, 10);
    if (!matches.length) {
      var enc = encodeURIComponent(input.value);
      box.innerHTML = '<div class="sp-suggest-item" style="color:#b22222;">Not in library</div>'
        + '<div style="padding:8px 14px;font-size:13px;display:flex;gap:12px;background:var(--white);">'
        + '<a href="https://songselect.ccli.com/search/results?search=' + enc + '" target="_blank" style="color:var(--teal);font-weight:500;"><i data-lucide="search" style="width:14px;height:14px"></i> SongSelect</a>'
        + '<a href="https://www.youtube.com/results?search_query=' + enc + '" target="_blank" style="color:var(--teal);font-weight:600;"><i data-lucide="play" style="width:14px;height:14px"></i> YouTube</a>'
        + '</div>';
    } else {
      box.innerHTML = matches.map(function (s) {
        return '<div class="sp-suggest-item" onclick="spSelectSong(\'' + s.title.replace(/'/g, "\\'") + '\',\'' + id + '\')">' + s.title + '</div>';
      }).join('');
    }
    box.style.display = 'block';
  }

  async function spSelectSong(title, id) {
    var block = document.getElementById('sp-suggest-' + id).closest('.song-block');
    block.querySelector('.song-title').value = title;
    document.getElementById('sp-suggest-' + id).style.display = 'none';
    document.getElementById('sp-keyinfo-' + id).style.display = 'none';
    document.getElementById('sp-files-' + id).innerHTML = '';
    await spShowKeyInfo(id, title);
    spKeyChanged(id);
  }

  async function spKeyChanged(id) {
    var block = document.getElementById('sp-files-' + id).closest('.song-block');
    var title = block.querySelector('.song-title').value;
    var keys = Array.from(block.querySelectorAll('.song-key')).map(function (s) { return s.value; }).filter(function (v) { return v; });
    var container = document.getElementById('sp-files-' + id);
    if (!title) { container.innerHTML = ''; return; }
    var docId = title.toLowerCase().replace(/\s+/g, '-');
    var snap = await db().collection('songs').doc(docId).get();
    if (!snap.exists) { container.innerHTML = ''; return; }
    var data = snap.data();
    var youtube = data.youtube || '';
    var ccli = data.ccli || '';
    var ssLink = ccli ? 'https://songselect.ccli.com/Songs/' + ccli : 'https://songselect.ccli.com/search/results?search=' + encodeURIComponent(title);
    var html = '<div class="sp-files-box"><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;font-size:13px;font-weight:500;">'
      + (youtube ? '<a href="' + youtube + '" target="_blank" style="color:#b22222;text-decoration:none;">YouTube</a>' : '')
      + '<a href="' + ssLink + '" target="_blank" style="color:var(--teal);text-decoration:none;"><i data-lucide="search" style="width:14px;height:14px"></i> SongSelect</a>'
      + (ccli ? '<span style="color:var(--teal);opacity:0.5;">CCLI: ' + ccli + '</span>' : '')
      + '</div>';
    if (keys.length) {
      keys.forEach(function (k) {
        var kFiles = (data.files || []).filter(function (f) { return f.key && f.key.trim().toLowerCase() === k.trim().toLowerCase(); });
        html += '<div style="margin-top:6px;"><div style="font-size:13px;font-weight:600;text-transform:none;color:var(--teal);opacity:0.5;margin-bottom:4px;">Key: ' + k + '</div>';
        if (!kFiles.length) { html += '<span style="font-size:13px;opacity:0.5;font-weight:600;">No files for ' + k + '</span>'; }
        else {
          var g = {}; kFiles.forEach(function (f) { if (!g[f.type]) g[f.type] = []; g[f.type].push(f); });
          Object.keys(g).forEach(function (t) {
            html += '<div style="font-size:13px;font-weight:600;text-transform:none;color:var(--teal);opacity:0.4;margin-top:4px;">' + t + '</div>';
            g[t].forEach(function (f) { html += '<a href="' + f.url + '" target="_blank">Open File</a>'; });
          });
        }
        html += '</div>';
      });
    } else { html += '<div style="font-size:13px;opacity:0.5;font-weight:600;">Select keys to see sheet music</div>'; }
    html += '</div>';
    container.innerHTML = html;
  }

  async function spLoadRota() {
    var date = document.getElementById('spDate').value;
    var snap = await db().collection('events').get();
    spEventsForDay = [];
    var seen = {};
    snap.forEach(function (d) {
      var ev = d.data();
      if (ev.date !== date || ev.archived) return;
      var key = ev.type || 'Unknown';
      if (!seen[key]) seen[key] = ev;
    });
    spEventsForDay = Object.values(seen);
    var select = document.getElementById('spEventSelect');
    select.innerHTML = '<option value="">Select Service…</option>';
    spEventsForDay.forEach(function (ev, i) {
      select.innerHTML += '<option value="' + i + '">' + ev.type + '</option>';
    });
  }

  function spSortAssignments(arr) {
    var tech = ['Sound', 'Words', 'Camera', 'Cameras'];
    return arr.sort(function (a, b) {
      var tA = tech.includes(a[0]), tB = tech.includes(b[0]);
      if (tA && !tB) return 1; if (!tA && tB) return -1;
      if (tA && tB) return tech.indexOf(a[0]) - tech.indexOf(b[0]);
      return a[0].localeCompare(b[0]);
    });
  }

  var NOTE_CELL = '<td><textarea class="sp-instr-note" placeholder="Notes..." rows="1" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 8px;font-family:var(--font);font-size:12px;font-weight:600;color:var(--teal);outline:none;resize:none;overflow:hidden;"></textarea></td>';

  async function spSelectEvent() {
    var index = document.getElementById('spEventSelect').value;
    if (index === '') return;
    var data = spEventsForDay[index];
    document.getElementById('spTypeNotes').value = data.description || '';
    spLeader = personName(data.assignments && data.assignments['Worship Leader']) || 'None';
    document.getElementById('spLeaderName').textContent = spLeader;

    var teamBody = document.getElementById('spTeamBody');
    teamBody.innerHTML = '';
    /* Service Leader and Speaker are typed into the Rota Planner as fields on
       the event (serviceLeader / speaker), not rota roles, so they are not in
       assignments - bring them in from the event itself. */
    [['Service Leader', data.serviceLeader], ['Speaker', data.speaker]].forEach(function (pair) {
      if (pair[1]) teamBody.innerHTML += '<tr><td>' + pair[0] + '</td><td>' + pair[1] + '</td>' + NOTE_CELL + '</tr>';
    });
    spSortAssignments(Object.entries(data.assignments || {}).filter(function (e) { return isWorshipRole(e[0]); })).forEach(function (e) {
      teamBody.innerHTML += '<tr><td>' + e[0] + '</td><td>' + personName(e[1]) + '</td>' + NOTE_CELL + '</tr>';
    });

    /* NO SAVED SCHEDULE BUT THE PLAN WAS EMAILED: show the emailed order
       rather than an empty one (Martin, 12 Oct 2026). 11 Oct was sent but
       never saved - Send writes songSummaries/{date}, Save writes
       services - so ChurchShow, which falls back to songSummaries, showed
       the plan while both planners showed the leaders and no songs.
       Nothing had deleted anything.

       BOTH READS AT ONCE, not one after the other. Asking for the
       emailed plan only after the services query came back empty put a
       second round trip in front of every fresh date, and the planner
       drew its default order that much later - enough that
       check-core-planner caught the phone app with an empty order of
       service. Concurrently, the fallback costs nothing in time. The
       emailed plan is read whether or not it is needed, which is one
       small document and the honest price of not being slower. */
    var q = db().collection('services').where('date', '==', data.date);
    var both = await Promise.all([
      q.get(),
      db().collection('songSummaries').doc(data.date).get()
        .catch(function (e) { console.warn('Could not read the emailed plan', e); return null; })
    ]);
    var snap = both[0], ss = both[1];
    document.getElementById('sp-order').innerHTML = '';
    var saved = !snap.empty ? snap.docs[0].data() : null;
    if (!saved && ss && ss.exists && (ss.data().items || []).length) {
      saved = { order: (ss.data().items || []).map(function (it) {
        return { type: it.type, title: it.title || '',
                 keys: it.keys || [], notes: it.notes || '' };
      }) };
    }
    if (saved) {
      document.getElementById('spIntro').value = saved.introText || '';
      document.getElementById('spOutro').value = saved.outroText || '';
      document.getElementById('spTypeNotes').value = saved.serviceNotes || data.description || '';
      if (saved.roleNotes) {
        document.querySelectorAll('#spTeamBody tr').forEach(function (row) {
          var role = row.children[0].textContent;
          if (saved.roleNotes[role]) row.querySelector('.sp-instr-note').value = saved.roleNotes[role];
        });
      }
      (saved.order || []).forEach(function (item) {
        if (item.type === 'song') {
          var id = spAddSong();
          var last = document.getElementById('sp-order').lastChild;
          last.querySelector('.song-title').value = item.title;
          var keyInputs = last.querySelectorAll('.song-key');
          var ks = Array.isArray(item.keys) ? item.keys : [item.key || ''];
          ks.forEach(function (k, i) { if (keyInputs[i]) keyInputs[i].value = k; });
          last.querySelector('.song-note').value = item.notes || '';
          spShowKeyInfo(id, item.title);
          spKeyChanged(id);
          last.querySelector('.song-content').classList.remove('hidden');
          last.classList.remove('is-collapsed');
          last.querySelector('.sp-collapse-btn').textContent = '<i data-lucide=\'chevron-down\' style=\'width:14px;height:14px\'></i>';
        } else { spAddItem(item.title); }
      });
    } else {
      // No saved service — load fresh default order, just like the desktop
      document.getElementById('spIntro').value = '';
      document.getElementById('spOutro').value = '';
      spSetupDefaultOrder();
    }
    spUpdateNumbers();
    spAutoFit();
  }

  /* The audience for a date, with this host's two lookups. The policy -
     who counts, and what "did not resolve" means - is in
     egbc-plan-audience.js, because SundayServicePlanner.html has to do
     exactly the same thing with a different SDK. */
  async function spAudienceFor(date) {
    var empty = { audience: [], unresolved: [], withoutAccount: [] };
    try {
      var ev = spEventsForDay.filter(function (e) { return e && e.date === date; });
      /* Every service that day, not just the chosen one: a Sunday with a
         morning and an evening sends one email between them. */
      return await EGBCPlanAudience.build(EGBCPlanAudience.mergeDay(ev), {
        findMemberIdsByNames: async function (names) {
          var out = {};
          for (var i = 0; i < names.length; i++) {
            var s = await db().collection('addressBook').where('name', '==', names[i]).limit(2).get();
            /* ONE MATCH ONLY. Two people with the same name is exactly
               when a guess is dangerous, so it is left unresolved and
               reported rather than picking the first. */
            if (s.size === 1) out[names[i]] = s.docs[0].id;
          }
          return out;
        },
        findUidsByMemberIds: async function (ids) {
          var out = {};
          for (var i = 0; i < ids.length; i++) {
            var s = await db().collection('users').where('memberId', '==', ids[i]).limit(1).get();
            if (!s.empty) out[ids[i]] = s.docs[0].id;
          }
          return out;
        }
      });
    } catch (e) {
      /* A plan that cannot work out its audience still saves. Losing the
         plan because a lookup failed would be a far worse fault than a
         preacher having to ask for the link. */
      console.warn('Could not work out who the plan is for', e);
      return empty;
    }
  }

  async function spSave(quiet) {
    var date = document.getElementById('spDate').value;
    if (!date) { toast('Please select a date first'); return; }
    var roleNotes = {};
    document.querySelectorAll('#spTeamBody tr').forEach(function (row) {
      var role = row.children[0].textContent;
      var cell = row.querySelector('.sp-instr-note');
      var note = cell && cell.value;
      if (note) roleNotes[role] = note;
    });
    var order = [];
    document.querySelectorAll('#sp-order .service-block').forEach(function (b) {
      if (b.classList.contains('song-block')) {
        order.push({ type: 'song', title: b.querySelector('.song-title').value, keys: Array.from(b.querySelectorAll('.song-key')).map(function (s) { return s.value; }).filter(function (v) { return v; }), notes: b.querySelector('.song-note').value });
      } else { order.push({ type: 'item', title: b.querySelector('.item-title').value }); }
    });
    var serviceData = { date: date, worshipLeader: spLeader, serviceNotes: document.getElementById('spTypeNotes').value, introText: document.getElementById('spIntro').value, outroText: document.getElementById('spOutro').value, roleNotes: roleNotes, order: order };
    /* WHO THE PLAN IS FOR, written onto it (Martin, 12 Oct 2026:
       "EVERYONE ON THE SUNDAY PLAN EMAIL CAN SEE THE PLAN — that
       includes the preachers and service leader"). Without this a
       preacher on no team opens the link in their own email and is told
       "No access". */
    var aud = await spAudienceFor(date);
    serviceData.audience = aud.audience;
    serviceData.audienceUnresolved = aud.unresolved;
    loader(true, 'Saving...');
    try {
      var snap = await db().collection('services').where('date', '==', date).get();
      if (!snap.empty) await db().collection('services').doc(snap.docs[0].id).update(serviceData);
      else await db().collection('services').add(serviceData);
      /* QUIET WHEN SENDING, because Email calls this first and two
         toasts for one button teaches people to ignore both. A FAILURE
         still speaks either way: the point of saving on send is that a
         plan which has gone out is never lost, so a silent failed save
         would be the original fault in a smaller window. */
      if (!quiet) toast('Service saved');
    } catch (e) { toast('Error saving'); }
    loader(false);
  }

  async function spEmail() {
    var date = document.getElementById('spDate').value || 'TBC';
    /* SENDING SAVES THE SCHEDULE FIRST, so a plan that has gone to the
       team is never missing from the planners (Martin, 12 Oct 2026).
       TBC is skipped: a services document is keyed by a real date. */
    if (date !== 'TBC') await spSave(true);
    var serviceNotes = document.getElementById('spTypeNotes').value || '';
    var introText = document.getElementById('spIntro').value || '';
    var outroText = document.getElementById('spOutro').value || '';

    var html = '<div style="font-family:Inter, system-ui, sans-serif;color:#3d6263;max-width:650px;padding:30px;background:#fff;margin:auto;">'
      + '<h1 style="color:#3d6263;font-size:24px;font-weight:600;text-align:center;">Service Plan</h1>'
      + '<p style="text-transform:none;font-weight:600;color:#3d6263;opacity:.6;letter-spacing:1.5px;font-size:13px;text-align:center;">' + EGBCUKDates.long(date) + ' · Leader: ' + spLeader + '</p>'
      + (serviceNotes ? '<div style="background:#f0f6f6;border-left:4px solid #3d6263;padding:15px;margin:16px 0;font-size:13px;">' + serviceNotes.replace(/\n/g, '<br>') + '</div>' : '')
      + (introText ? '<div style="font-size:14px;margin:16px 0;">' + introText.replace(/\n/g, '<br>') + '</div>' : '')
      + '<h2 style="border-bottom:3px solid #3d6263;padding-bottom:8px;text-transform:none;font-size:13px;letter-spacing:1px;margin:16px 0;">Order of Service</h2>'
      + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">'
      + '<thead style="background:#f0f6f6;"><tr>'
      + '<th style="text-align:left;padding:8px;font-size:13px;text-transform:none;color:#3d6263;border-bottom:1px solid #d1dfdf;">Title</th>'
      + '<th style="text-align:center;padding:8px;font-size:13px;text-transform:none;color:#3d6263;border-bottom:1px solid #d1dfdf;">Key</th>'
      + '<th style="text-align:center;padding:8px;font-size:13px;text-transform:none;color:#3d6263;border-bottom:1px solid #d1dfdf;">Resources</th>'
      + '</tr></thead><tbody>';

    var blocks = document.querySelectorAll('#sp-order .service-block');
    var songIdx = 1;
    for (const b of blocks) {
      if (b.classList.contains('song-block')) {
        var title = b.querySelector('.song-title').value;
        var keys = Array.from(b.querySelectorAll('.song-key')).map(function (s) { return s.value; }).filter(function (v) { return v; });
        var notes = b.querySelector('.song-note').value;
        if (!title) continue;
        var docId = title.toLowerCase().replace(/\s+/g, '-');
        var snap = await db().collection('songs').doc(docId).get();
        var res = '';
        if (snap.exists) {
          var d = snap.data();
          var ss = d.ccli ? 'https://songselect.ccli.com/Songs/' + d.ccli : 'https://songselect.ccli.com/search/results?search=' + encodeURIComponent(title);
          res = '<div style="margin-bottom:6px;">' + (d.youtube ? '<a href="' + d.youtube + '" style="color:#3d6263;font-weight:500;font-size:13px;padding:0 5px;text-decoration:none;">YouTube</a><span style="color:#cbd5e1;">&nbsp;|&nbsp;</span>' : '') + '<a href="' + ss + '" style="color:#3d6263;font-weight:500;font-size:13px;padding:0 5px;text-decoration:none;">SongSelect</a></div>';
          keys.forEach(function (k) {
            var kf = (d.files || []).filter(function (f) { return f.key && f.key.trim().toLowerCase() === k.trim().toLowerCase(); });
            if (kf.length) { res += '<div style="font-size:13px;color:#3d6263;font-weight:600;margin-top:4px;">Key: ' + k + '</div>'; kf.forEach(function (f) { res += '<div><a href="' + f.url + '" style="color:#3d6263;text-decoration:underline;font-size:13px;">Download ' + f.type + '</a></div>'; }); }
          });
        }
        html += '<tr>'
          + '<td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;"><p style="font-weight:600;font-size:14px;color:#1e293b;margin:0;">' + songIdx + '. ' + title + '</p>' + (notes ? '<p style="font-style:italic;font-size:13px;color:#64748b;margin:4px 0 0;">' + notes + '</p>' : '') + '</td>'
          + '<td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:#3d6263;">' + (keys.join(', ') || '-') + '</td>'
          + '<td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:center;">' + res + '</td>'
          + '</tr>';
        songIdx++;
      } else {
        var itemEl = b.querySelector('.item-title');
        var item = itemEl && itemEl.value;
        if (item) html += '<tr><td colspan="3" style="padding:10px 8px;background:#f8fafc;border-left:4px solid #3d6263;font-weight:600;font-size:12px;color:#3d6263;text-transform:none;">' + item + '</td></tr>';
      }
    }
    html += '</tbody></table>';

    var teamRows = Array.from(document.querySelectorAll('#spTeamBody tr'));
    var rosterNames = [];
    html += '<p style="font-weight:600;font-size:13px;margin:16px 0 8px;">Team for this service:</p><table style="width:100%;border-collapse:collapse;"><tbody>';
    spSortAssignments(teamRows.map(function (r) {
      var n = r.querySelector('.sp-instr-note');
      return [r.children[0].textContent, r.children[1].textContent, (n && n.value) || ''];
    })).forEach(function (row) {
      var role = row[0], name = row[1], note = row[2];
      if (name && name !== 'None') rosterNames.push(name.trim());
      html += '<tr><td style="padding:8px 0;border-bottom:1px solid #f0f4f8;font-size:13px;width:35%;color:#3d6263;font-weight:600;">' + role + '</td><td style="padding:8px 0;border-bottom:1px solid #f0f4f8;font-size:13px;">' + name + (note ? '<br><i style="font-size:13px;color:#666;">Note: ' + note + '</i>' : '') + '</td></tr>';
    });
    html += '</tbody></table>';
    if (outroText) html += '<div style="font-size:14px;color:#444;margin-top:16px;">' + outroText.replace(/\n/g, '<br>') + '</div>';
    html += '</div>';

    if (!spAddressBook.length) {
      try { var s = await db().collection('addressBook').get(); s.forEach(function (d2) { var r = d2.data(); if (r.email) spAddressBook.push(r); }); } catch (e) {}
    }
    var spRecipients = [...new Set(spAddressBook.filter(function (p) { return rosterNames.includes(p.name && p.name.trim()) && p.email; }).map(function (p) { return p.email; }))];
    var spSubject = 'Service Plan: ' + EGBCUKDates.long(date);
    var senderBox = document.getElementById('spSenderEmail');
    var senderEmail = (senderBox && senderBox.value) || localStorage.getItem('egbc-sender-email') || 'worship@esherchurch.org';

    if (spRecipients.length > 0) {
      toast('Sending plan...');
      try {
        var resp = await fetch('https://sendemail-irkwdhx3xq-uc.a.run.app', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: spRecipients, subject: spSubject, html: html, replyTo: senderEmail })
        });
        var result = await resp.json();
        if (result.ok) toast('Plan sent to ' + spRecipients.length + ' people');
        else toast('Could not send: ' + (result.error || 'unknown error'));
      } catch (e) { toast('Could not send: no connection'); }
    } else { toast('No recipients found'); }
  }

  /* ---- mounting ------------------------------------------------------ */

  function mount(opts) {
    opts = opts || {};
    var into = opts.into;
    if (!into) return null;
    if (opts.db) H.db = opts.db;
    if (opts.toast) H.toast = opts.toast;
    if (opts.loader) H.loader = opts.loader;
    H.root = into;

    if (!document.getElementById('egbc-core-planner-css')) {
      var s = document.createElement('style');
      s.id = 'egbc-core-planner-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    /* THE PLANNER OWNS ITS OWN NODE, and is moved into whatever is
       hosting it rather than rebuilt there.
       The first version wrote the markup into the host unless it was
       already present, which sounds like the same thing and is not: the
       phone app's shell rebuilds a tab's HTML on every draw, so the host
       is a NEW empty element each time, the markup looked absent, and
       coming back to Plan threw away the order of service somebody had
       just typed. The check caught it - "coming back to Plan still has
       what was typed" said "(gone)".
       Keeping the node means a half-written plan survives leaving the
       tab, going to another space, and coming back. */
    if (!PANEL) {
      PANEL = document.createElement('div');
      PANEL.className = 'sp-panel';
      PANEL.innerHTML = HTML;
    }
    if (PANEL.parentNode !== into) into.appendChild(PANEL);
    H.root = PANEL;
    spInit();
    if (global.EGBCUI && EGBCUI.icons) EGBCUI.icons();
    return into;
  }

  /* The inline onclick handlers in the markup above look for these on
     window. That is how the planner already worked in CoreTeamApp;
     making it anything else would be the rewrite §7b forbids. */
  global.spInit = spInit;
  global.spSetupDefaultOrder = spSetupDefaultOrder;
  global.spAutoFit = spAutoFit;
  global.spUpdateNumbers = spUpdateNumbers;
  global.spToggle = spToggle;
  global.spAddSong = spAddSong;
  global.spAddItem = spAddItem;
  global.spPickSong = spPickSong;
  global.spShowKeyInfo = spShowKeyInfo;
  global.spSearch = spSearch;
  global.spSelectSong = spSelectSong;
  global.spKeyChanged = spKeyChanged;
  global.spLoadRota = spLoadRota;
  global.spSelectEvent = spSelectEvent;
  global.spSave = spSave;
  global.spEmail = spEmail;

  global.EGBCCorePlanner = {
    mount: mount,
    html: function () { return HTML; },
    css: function () { return CSS; },
    personName: personName,
    personId: personId,
    isWorshipRole: isWorshipRole,
    spSortAssignments: spSortAssignments
  };
})(window);
