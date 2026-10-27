/* ===================================================================
   EGBC — "Gets the e-news" in the address book (comms window, 20 Oct 2026)
   ===================================================================

   Martin, 20 Oct: "The address book shows 'Gets the e-news' on each
   person and the office can change it there. Unsubscribed people can't
   be re-added from the address book."

   AN ADD-ON, so the address book's own code is not touched: one script
   tag loads this, and it watches the page as it draws -
     - each row of #memberListBody gets "Gets the e-news" (or
       "Unsubscribed from the e-news") beside the person's email;
     - the edit form gets a line under the email box: whether they get it,
       since when and how they agreed, with "Add to the e-news" (asking how
       they said yes - never added silently) or "Stop sending it".
   Every change goes through the hub's function (enewsSubscriberSave),
   which keeps the record of who, when and how. For the church office and
   master admins, when the e-news is switched on; nobody else sees any of
   it. An under-18 (ticked Under 16 or Under 18) is never offered; somebody who unsubscribed is shown as
   such and can only come back themselves, from the sign-up page.
   =================================================================== */
(function () {
  'use strict';
  var SUBS = null, BUSY = false;
  /* The person editMember() opened, so a new subscriber is linked to them
     (only while the email box still has their address). */
  var EDIT = { id: '', email: '' };
  var HOW = [['person', 'They told the office'], ['paper', 'On a paper form'], ['email', 'They asked by email'], ['phone', 'They asked by phone'], ['signedUp', 'They signed up themselves']];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function low(e) { return String(e || '').trim().toLowerCase(); }
  function may() {
    var A = window.EGBCAuth;
    if (!A || !A.profile || !A.profile()) return false;
    /* The office job (H-9; EGBC: Church office), after loadPerms. */
    var office = (A.isMaster && A.isMaster()) || (A.myJobs && A.myJobs().indexOf('office') >= 0);
    return !!office && !!(A.uses && A.uses('enews'));
  }
  function load() {
    return EGBCAuth.db.collection('enewsSubscribers').get().then(function (s) {
      SUBS = {}; s.docs.forEach(function (d) { var x = d.data(); SUBS[low(x.email)] = x; });
    }, function () { SUBS = {}; });
  }
  function words(x) {
    if (!x) return '';
    if (x.status === 'subscribed') return 'Gets the e-news';
    if (x.status === 'pending') return 'E-news: waiting for them to confirm';
    if (x.status === 'unsubscribed' || x.status === 'complained') return 'Unsubscribed from the e-news';
    if (x.status === 'bounced') return 'E-news: their email bounced';
    return '';
  }

  /* ---- the rows ------------------------------------------------------ */
  var EMAIL_RE = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/i;
  function badgeRows() {
    var body = document.getElementById('memberListBody'); if (!body || !SUBS) return;
    Array.prototype.forEach.call(body.querySelectorAll('tr'), function (tr) {
      if (tr.getAttribute('data-enews') === '1') return;
      var m = EMAIL_RE.exec(tr.textContent || ''); if (!m) return;
      var x = SUBS[low(m[0])], w = words(x);
      tr.setAttribute('data-enews', '1');
      if (!w) return;
      var on = x.status === 'subscribed';
      var cell = Array.prototype.filter.call(tr.querySelectorAll('div'), function (d) { return low(d.textContent) === low(m[0]); })[0];
      var b = document.createElement('div');
      b.className = 'enews-badge';
      b.style.cssText = 'display:inline-block;margin-top:3px;font:500 11px Inter,sans-serif;padding:2px 7px;border-radius:6px;' +
        (on ? 'background:#ecfdf3;color:#15803d;' : 'background:#f3f4f6;color:#6b7280;');
      b.textContent = w;
      (cell ? cell.parentNode : tr.cells[0] || tr).appendChild(b);
    });
  }

  /* ---- the form -------------------------------------------------------- */
  function panel() {
    var input = document.getElementById('email'); if (!input) return null;
    var p = document.getElementById('enewsPanel');
    if (!p) {
      p = document.createElement('div'); p.id = 'enewsPanel';
      p.style.cssText = 'margin:8px 0 4px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font:400 13px/1.45 Inter,sans-serif;color:#374151';
      input.parentNode.appendChild(p);
    }
    return p;
  }
  function drawForm() {
    var p = panel(); if (!p || !SUBS) return;
    var email = low((document.getElementById('email') || {}).value);
    var minor = !!(document.getElementById('isMinor') || {}).checked || !!(document.getElementById('under18') || {}).checked;
    if (!email) { p.innerHTML = '<b style="color:#111827">E-news:</b> add an email address first.'; return; }
    if (minor) { p.innerHTML = '<b style="color:#111827">E-news:</b> under 18 — the hub never emails under-18s.'; return; }
    var x = SUBS[email], c = (x && x.consent) || {};
    if (x && x.status === 'subscribed') {
      p.innerHTML = '<b style="color:#15803d">Gets the e-news</b>' + (c.how ? '<br><span style="color:#6b7280">They said yes: ' + esc(c.how) + (c.confirmedAt ? ', ' + esc(String(c.confirmedAt).slice(0, 10)) : '') + '</span>' : '') +
        '<div style="margin-top:8px"><button type="button" id="enewsStop" style="min-height:40px;padding:0 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font:500 13px Inter,sans-serif;cursor:pointer">Stop sending it</button></div>';
      document.getElementById('enewsStop').onclick = function () {
        if (!confirm('Stop sending the e-news to ' + email + '? They are kept as unsubscribed, and only they can sign up again.')) return;
        save({ email: email, action: 'stop' });
      };
      return;
    }
    if (x && (x.status === 'unsubscribed' || x.status === 'complained' || x.status === 'bounced')) {
      p.innerHTML = '<b style="color:#111827">' + esc(words(x)) + '</b>' + (x.updatedAt ? ' <span style="color:#6b7280">(' + esc(String(x.updatedAt).slice(0, 10)) + ')</span>' : '') +
        '<br><span style="color:#6b7280">They can only come back themselves, from the e-news sign-up page.</span>';
      return;
    }
    p.innerHTML = '<b style="color:#111827">Doesn’t get the e-news.</b>' + (x && x.status === 'pending' ? ' <span style="color:#6b7280">(they signed up and haven’t confirmed yet)</span>' : '') +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select id="enewsHow" aria-label="How did they say yes?" style="min-height:40px;border:1px solid #d1d5db;border-radius:8px;padding:0 8px;font:400 13px Inter,sans-serif"><option value="">How did they say yes?</option>' +
      HOW.map(function (h) { return '<option value="' + h[0] + '">' + esc(h[1]) + '</option>'; }).join('') + '</select>' +
      '<button type="button" id="enewsAdd" style="min-height:40px;padding:0 12px;border:1px solid #3d6263;border-radius:8px;background:#3d6263;color:#fff;font:500 13px Inter,sans-serif;cursor:pointer">Add to the e-news</button></div>';
    document.getElementById('enewsAdd').onclick = function () {
      var how = document.getElementById('enewsHow').value;
      if (!how) { alert('Choose how they said yes first. Nobody is added without it.'); return; }
      var name = String((document.getElementById('fullName') || {}).value || '').trim().split(/\s+/)[0] || '';
      save({ email: email, firstName: name, how: how, from: 'addressBook', memberId: EDIT.email === email ? EDIT.id : '' });
    };
  }
  function save(data) {
    if (BUSY) return; BUSY = true;
    var p = panel(); if (p) p.style.opacity = '.6';
    EGBCAuth.call('enewsSubscriberSave', data).then(function () { return load(); }, function (e) {
      alert(String((e && e.message) || e).replace(/^.*?:\s*(?=[A-Z])/, ''));
    }).then(function () {
      BUSY = false; if (p) p.style.opacity = '';
      var body = document.getElementById('memberListBody');
      if (body) Array.prototype.forEach.call(body.querySelectorAll('tr'), function (tr) { tr.removeAttribute('data-enews'); var b = tr.querySelector('.enews-badge'); if (b) b.remove(); });
      badgeRows(); drawForm();
    });
  }

  /* ---- start, once the page knows who is signed in --------------------- */
  var tries = 0;
  (function wait() {
    if (window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile()) {
      Promise.resolve(EGBCAuth.loadPerms ? EGBCAuth.loadPerms() : null).catch(function () {}).then(function () {
      if (!may()) return;
      load().then(function () {
        badgeRows(); drawForm();
        var body = document.getElementById('memberListBody');
        if (body && window.MutationObserver) new MutationObserver(badgeRows).observe(body, { childList: true });
        var input = document.getElementById('email');
        if (input) input.addEventListener('input', drawForm);
        ['isMinor', 'under18'].forEach(function (id) { var m = document.getElementById(id); if (m) m.addEventListener('change', drawForm); });
        /* The form is filled by the page's editMember(): redraw after it.
           The page defines it once its sign-in is ready, which can be
           after this runs, so keep looking for a while. */
        var looks = 0;
        (function wrap() {
          if (typeof window.editMember === 'function') {
            if (window.editMember.__enews) return;
            var orig = window.editMember;
            window.editMember = function (id) {
              var r = orig.apply(this, arguments);
              EDIT = { id: String(id || ''), email: low((document.getElementById('email') || {}).value) };
              setTimeout(drawForm, 0); return r;
            };
            window.editMember.__enews = true;
            return;
          }
          if (++looks < 100) setTimeout(wrap, 300);
        })();
      });
      });
      return;
    }
    if (++tries < 100) setTimeout(wait, 300);
  })();
})();
