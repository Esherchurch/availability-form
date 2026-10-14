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
    input.parentNode.insertBefore(wrap, input);
    input.style.display = 'none';
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
    input.addEventListener('change', sync);
    sel.addEventListener('change', function () { if (sel.value) choose(sel.value); });
    wrap.querySelector('[data-uk="prev"]').onclick = function () { step(-1); };
    wrap.querySelector('[data-uk="next"]').onclick = function () { step(1); };
    wrap.querySelector('[data-uk="other"]').onclick = function () {
      input.style.display = '';
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
      input.style.display = '';
    });
    return { sync: sync, select: sel };
  }

  g.EGBCUKDates = { long: long, short: short, today: today, hidden: hidden, showPast: showPast, setShowPast: setShowPast,
    togglePast: togglePast, paintPast: paintPast, scrollToNext: scrollToNext, openAtNext: openAtNext, attach: attach, isService: isService };
})(window);
/* ── end egbc-uk-dates ── */
