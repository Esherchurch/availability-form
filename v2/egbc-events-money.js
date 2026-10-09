/* ===================================================================
   EGBC — the office's money tabs on Room bookings (Chunk 5, stage 3)
   ===================================================================

   Invoices (single and monthly), hirers' records with their documents and
   expiry dates, and Accounts (the export, the setting, what waits for
   Calla Accounts). bookings-admin.html makes one of these with what it
   knows: EGBCMoney(ctx), ctx = { db, esc, toast, room, site, siteId(),
   list(), charges(), hirers(), invoices(), reload(), pageLink(b),
   isAdmin }.
   =================================================================== */

(function (global) {
  'use strict';

  var DOCS = [['insurance', 'Public liability insurance'], ['safeguarding', 'Safeguarding policy'], ['risk', 'Risk assessment'], ['other', 'Other']];
  var SOON = 30; /* days: a document expiring within this is flagged */

  function daysTo(day) { var a = new Date(day + 'T12:00'), b = new Date(); b.setHours(12, 0, 0, 0); return Math.round((a - b) / 86400000); }
  function docState(d) {
    if (!d.expires) return { cls: 'ok', words: 'no expiry date' };
    var n = daysTo(d.expires);
    if (n < 0) return { cls: 'no', words: 'expired ' + EGBCEvents.fmtDate(d.expires + 'T12:00') };
    if (n <= SOON) return { cls: 'wait', words: 'expires in ' + n + ' day' + (n === 1 ? '' : 's') };
    return { cls: 'ok', words: 'until ' + EGBCEvents.fmtDate(d.expires + 'T12:00') };
  }
  function lastMonth() { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

  function EGBCMoney(ctx) {
    var esc = ctx.esc, Q = global.EGBCQuote, A = global.EGBCAccounts, B = global.EGBCBookings;
    function db() { return ctx.db(); }

    /* ---- hirers ---- */
    function hirerFor(b) {
      var e = String(((b && b.requester) || {}).email || '').toLowerCase();
      return e ? ctx.hirers().filter(function (h) { return h.email === e && h.active !== false; })[0] || null : null;
    }
    /* The line on a booking card: who they are to us, and any document
       that is out of date. */
    function hirerLine(b) {
      if (b.kind !== 'hire') return '';
      var h = hirerFor(b);
      if (!h) return '<div class="hint" data-hirer="' + esc(b.key) + '">No hirer record yet. <button class="btn sec" style="height:28px" data-addhirer="' + esc(b.key) + '">Add as a hirer</button></div>';
      var bad = (h.documents || []).map(function (d) { return { d: d, s: docState(d) }; }).filter(function (x) { return x.s.cls !== 'ok'; });
      return '<div class="hint" data-hirer="' + esc(b.key) + '">Hirer: <b>' + esc(h.org || h.name) + '</b>' +
        (h.charity ? ' · charity' + (h.charityChecked ? ' (checked)' : ' (not yet checked)') : '') + (h.regular ? ' · regular' : '') + (h.monthly ? ' · invoiced monthly' : '') + '</div>' +
        bad.map(function (x) { return '<div class="st ' + x.s.cls + '" data-docwarn="' + esc(b.key) + '">' + esc(label(x.d.kind)) + ' ' + esc(x.s.words) + '.</div>'; }).join('');
    }
    function label(kind) { return (DOCS.filter(function (d) { return d[0] === kind; })[0] || [0, 'Document'])[1]; }

    function drawHirers(el, openId, prefill) {
      var hs = ctx.hirers().slice().sort(function (a, b) { return (a.org || a.name).localeCompare(b.org || b.name); });
      el.innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><h2>Hirers</h2>' +
        '<button class="btn" id="h-new">Add a hirer</button></div><p class="hint">Who hires: contact, invoice address, charity, regular hirer, monthly invoicing, and their documents.</p>' +
        (hs.length ? hs.map(function (h) {
          return '<div class="bk" style="border-top:1px solid var(--line);padding:10px 0" data-hrow="' + esc(h.id) + '"><b>' + esc(h.org || h.name) + '</b>' + (h.org ? ' <span class="hint">' + esc(h.name) + '</span>' : '') +
            '<br><span class="hint">' + esc(h.email) + (h.charity ? ' · charity' + (h.charityChecked ? ' (checked)' : ' (not checked)') : '') + (h.regular ? ' · regular' : '') + (h.monthly ? ' · monthly invoices' : '') + '</span>' +
            (h.documents || []).map(function (d) { var s = docState(d); return '<div class="st ' + s.cls + '" style="margin:4px 0;padding:4px 8px">' + esc(label(d.kind)) + ': ' + esc(s.words) + '</div>'; }).join('') +
            '<div class="acts"><button class="btn sec" data-hedit="' + esc(h.id) + '">Open</button></div></div>';
        }).join('') : '<p class="hint">No hirers yet.</p>') + '</div><div id="h-form"></div>';
      document.getElementById('h-new').onclick = function () { form(null, {}); };
      el.querySelectorAll('[data-hedit]').forEach(function (b) { b.onclick = function () { form(b.dataset.hedit); }; });
      if (openId !== undefined) form(openId, prefill);
    }
    function form(id, prefill) {
      var h = id ? ctx.hirers().filter(function (x) { return x.id === id; })[0] : Object.assign({ name: '', org: '', email: '', phone: '', address: '', charity: false, charityNumber: '', charityChecked: false, regular: false, monthly: false, notes: '', documents: [] }, prefill || {});
      var box = document.getElementById('h-form'), f = function (k, l, t) { return '<div class="field"><label class="l" for="hf-' + k + '">' + l + '</label><input class="inp" id="hf-' + k + '" ' + (t || '') + ' value="' + esc(h[k] || '') + '"></div>'; };
      var ck = function (k, l) { return '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="hf-' + k + '"' + (h[k] ? ' checked' : '') + '> ' + l + '</label>'; };
      box.innerHTML = '<div class="card" id="h-card"><h2>' + (id ? esc(h.org || h.name) : 'A new hirer') + '</h2>' +
        '<div class="act two"><div>' + f('name', 'Name') + '</div><div>' + f('org', 'Organisation') + '</div><div>' + f('email', 'Email', 'type="email"') + '</div><div>' + f('phone', 'Phone') + '</div></div>' +
        '<div class="field"><label class="l" for="hf-address">Invoice address</label><textarea class="inp" id="hf-address" style="height:70px;padding:8px 12px">' + esc(h.address || '') + '</textarea></div>' +
        ck('charity', 'A registered charity') + f('charityNumber', 'Charity number') + ck('charityChecked', 'We have checked the charity number (the charity rate applies)') +
        ck('regular', 'A regular hirer (the regular hirer rate applies)') + ck('monthly', 'Invoice monthly, all their bookings in a month together') +
        '<div class="field"><label class="l" for="hf-notes">Notes</label><input class="inp" id="hf-notes" maxlength="500" value="' + esc(h.notes || '') + '"></div>' +
        '<div class="acts"><button class="btn" id="hf-save">Save</button></div>' +
        (id ? '<h3 style="margin:16px 0 6px">Documents</h3>' + ((h.documents || []).length ? h.documents.map(function (d, i) {
          var s = docState(d); return '<div class="drow"><span class="d">' + esc(label(d.kind)) + ' · ' + esc(d.name) + '</span><span class="st ' + s.cls + '">' + esc(s.words) + '</span>' +
            '<button class="btn sec" data-hopen="' + i + '">Open</button></div>'; }).join('') : '<p class="hint">None yet.</p>') +
          '<div class="act two" style="margin-top:8px"><div><label class="l" for="hd-kind">Kind</label><select id="hd-kind">' + DOCS.map(function (d) { return '<option value="' + d[0] + '">' + d[1] + '</option>'; }).join('') + '</select></div>' +
          '<div><label class="l" for="hd-exp">Expires</label><input class="inp" type="date" id="hd-exp"></div>' +
          '<div><label class="l" for="hd-file">File (PDF or picture)</label><input class="inp" type="file" id="hd-file" accept="application/pdf,image/*" style="padding:6px"></div></div>' +
          '<div class="acts"><button class="btn sec" id="hd-add">Add the document</button></div>' : '<p class="hint">Save first, then add their documents.</p>') + '</div>';
      document.getElementById('hf-save').onclick = function () { save(id, h); };
      var add = document.getElementById('hd-add'); if (add) add.onclick = function () { addDoc(h); };
      box.querySelectorAll('[data-hopen]').forEach(function (b) {
        b.onclick = function () { EGBCAuth.storage().ref(h.documents[+b.dataset.hopen].path).getDownloadURL().then(function (u) { window.open(u, '_blank', 'noopener'); }, function (e) { ctx.toast('Could not open it: ' + (e.message || e)); }); };
      });
      box.scrollIntoView({ block: 'start' });
    }
    function save(id, h) {
      var v = function (k) { return document.getElementById('hf-' + k).value.trim(); }, c = function (k) { return document.getElementById('hf-' + k).checked; };
      var d = { siteId: ctx.siteId(), name: v('name').slice(0, 120), org: v('org').slice(0, 120), email: v('email').toLowerCase().slice(0, 200), phone: v('phone').slice(0, 40),
        address: document.getElementById('hf-address').value.trim().slice(0, 500), charity: c('charity'), charityNumber: v('charityNumber').slice(0, 40), charityChecked: c('charityChecked'),
        regular: c('regular'), monthly: c('monthly'), notes: v('notes').slice(0, 500), documents: h.documents || [], active: true, updatedAt: new Date().toISOString() };
      if (!d.name) { ctx.toast('It needs a name'); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { ctx.toast('It needs an email address, to match their bookings'); return; }
      var ref = id ? db().collection('hirers').doc(id) : db().collection('hirers').doc('hr_' + EGBCEvents.key(14));
      if (!id) d.createdAt = d.updatedAt;
      ref.set(d, { merge: true }).then(function () { A.sendCustomer(Object.assign({ id: ref.id }, d), d.siteId); ctx.toast('Saved'); return ctx.reload({ tab: 'hirers', open: ref.id }); })
        .catch(function (e) { ctx.toast('Could not save: ' + (e.message || e)); });
    }
    function addDoc(h) {
      var file = document.getElementById('hd-file').files[0], exp = document.getElementById('hd-exp').value, kind = document.getElementById('hd-kind').value;
      if (!file) { ctx.toast('Choose the file'); return; }
      if (!exp && kind !== 'other') { ctx.toast('Give its expiry date'); return; }
      var path = 'hirerDocs/' + ctx.siteId() + '/' + h.id + '/' + Date.now() + '-' + file.name.replace(/[^a-z0-9.\-_]/gi, '_').slice(-60);
      EGBCAuth.storage().ref(path).put(file, { contentType: file.type || 'application/pdf' }).then(function () {
        var docs = (h.documents || []).concat([{ kind: kind, name: file.name.slice(0, 120), path: path, expires: exp, uploadedAt: new Date().toISOString() }]);
        return db().collection('hirers').doc(h.id).update({ documents: docs, updatedAt: new Date().toISOString() });
      }).then(function () { ctx.toast('Document added'); return ctx.reload({ tab: 'hirers', open: h.id }); })
        .catch(function (e) { ctx.toast('Could not add it: ' + (e.message || e)); });
    }

    /* ---- invoices ---- */
    function invoiceHtml(inv, links) {
      return '<p><strong>Invoice ' + esc(inv.number) + '</strong>, ' + esc(EGBCEvents.fmtDate(inv.issuedAt)) + (inv.monthly ? ', for ' + esc(monthWords(inv.period)) : '') + '</p>' +
        '<p>' + esc(inv.payer.org || inv.payer.name || '') + (inv.payer.address ? '<br>' + esc(inv.payer.address).replace(/\n/g, '<br>') : '') + '</p>' +
        Q.table({ lines: inv.lines, subtotal: inv.subtotal, vat: inv.vat, vatRate: inv.vat ? '' : 0, total: inv.total, deposit: 0, damageDeposit: 0 }).replace('VAT (%)', 'VAT') +
        '<p>Please pay by <strong>' + esc(EGBCEvents.fmtDate(inv.dueDate + 'T12:00')) + '</strong>, quoting <strong>' + esc(inv.number) + '</strong>.</p>' +
        (ctx.payText() ? '<p>' + esc(ctx.payText()).replace(/\n/g, '<br>') + '</p>' : '') + (links || '');
    }
    function monthWords(p) { return p ? new Date(p + '-15T12:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''; }
    function emailInvoice(inv, bookings) {
      var to = inv.payer.email; if (!to) return Promise.resolve();
      var links = '<p style="color:#6b7280;font-size:13px">Your booking' + (bookings.length > 1 ? 's' : '') + ': ' + bookings.map(function (b) { return '<a href="' + ctx.pageLink(b) + '">' + esc(B.when(b)) + '</a>'; }).join(', ') + '</p>';
      return EGBCChurch.send({ to: [to], subject: 'Invoice ' + inv.number + ': ' + Q.pounds(inv.total) + (inv.monthly ? ', ' + monthWords(inv.period) : ''),
        html: EGBCChurch.wrap('Invoice ' + inv.number, invoiceHtml(inv, links)) })
        .then(function () { return db().collection('invoices').doc(inv.id).update({ emailedAt: new Date().toISOString() }); });
    }
    function payerOf(ch, h) { var p = ch.payer || {}; return { name: (h && h.name) || p.name || '', org: (h && h.org) || p.org || '', email: (h && h.email) || p.email || '', address: (h && h.address) || '' }; }
    function bookingOf(ch) { return ctx.list().filter(function (b) { return b.key === ch.bookingKey; })[0]; }
    /* One booking's invoice, from its card. */
    function issueOne(b) {
      var ch = ctx.charges()[b.key], h = hirerFor(b);
      return A.issue([ch], { siteId: ctx.siteId(), payer: payerOf(ch, h), by: (EGBCAuth.user() || {}).uid })
        .then(function (inv) { return emailInvoice(inv, [b]).then(function () { return inv; }); });
    }
    /* What each monthly hirer has not been invoiced for, in a month. */
    function monthly(period) {
      var out = [];
      ctx.hirers().filter(function (h) { return h.monthly && h.active !== false; }).forEach(function (h) {
        var cs = Object.keys(ctx.charges()).map(function (k) { return ctx.charges()[k]; }).filter(function (ch) {
          return !ch.invoiceId && ch.status !== 'cancelled' && String((ch.payer || {}).email || '').toLowerCase() === h.email && String(ch.dueDate || '').slice(0, 7) === period;
        }).sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; });
        if (cs.length) out.push({ hirer: h, charges: cs });
      });
      return out;
    }
    function drawInvoices(el) {
      var period = ctx.state.period || lastMonth(), due = monthly(period);
      var invs = ctx.invoices().slice().sort(function (a, b) { return b.seq - a.seq; });
      el.innerHTML = '<div class="card"><h2>Monthly invoices</h2><p class="hint">For hirers marked "invoice monthly": all their bookings in a month, on one invoice.</p>' +
        '<div class="row"><div class="f"><label class="l" for="i-month">Month</label><input class="inp" type="month" id="i-month" value="' + esc(period) + '"></div></div>' +
        (due.length ? due.map(function (x) {
          var t = x.charges.reduce(function (n, c) { return n + c.total; }, 0);
          return '<div class="drow" data-due="' + esc(x.hirer.id) + '"><span class="d"><b>' + esc(x.hirer.org || x.hirer.name) + '</b>: ' + x.charges.length + ' booking' + (x.charges.length === 1 ? '' : 's') + '</span><span>' + Q.pounds(t) + '</span></div>';
        }).join('') + '<div class="acts"><button class="btn" id="i-go">Issue the monthly invoices</button></div>' : '<p class="hint">Nothing to invoice for that month.</p>') + '</div>' +
        '<div class="card"><h2>Invoices issued</h2>' + (invs.length ? invs.map(function (inv) {
          return '<div class="drow" data-inv="' + esc(inv.id) + '"><span class="d"><b>' + esc(inv.number) + '</b> · ' + esc(inv.payer.org || inv.payer.name) + (inv.monthly ? ' · ' + esc(monthWords(inv.period)) : '') +
            ' · issued ' + esc(EGBCEvents.fmtDate(inv.issuedAt)) + '</span><span>' + Q.pounds(inv.total) + '</span><span class="pill ' + (inv.status === 'paid' ? 'ok' : 'wait') + '">' + esc(inv.status.replace('-', ' ')) + '</span></div>';
        }).join('') : '<p class="hint">None yet.</p>') + '</div>';
      document.getElementById('i-month').onchange = function () { ctx.state.period = this.value; drawInvoices(el); };
      var go = document.getElementById('i-go');
      if (go) go.onclick = function () {
        go.disabled = true;
        due.reduce(function (p, x) {
          return p.then(function () {
            var label = function (ch) { var b = bookingOf(ch); return b ? B.when(b) + ', ' + ctx.room(b.roomId).name + ': ' + (b.title || 'Booking') : ch.bookingKey; };
            return A.issue(x.charges, { siteId: ctx.siteId(), payer: payerOf(x.charges[0], x.hirer), monthly: true, period: period, label: label, by: (EGBCAuth.user() || {}).uid })
              .then(function (inv) { return emailInvoice(inv, x.charges.map(bookingOf).filter(Boolean)); });
          });
        }, Promise.resolve()).then(function () { ctx.toast('Monthly invoices issued and emailed'); return ctx.reload({ tab: 'invoices' }); })
          .catch(function (e) { go.disabled = false; ctx.toast('Could not issue them: ' + (e.message || e)); });
      };
    }
    /* After a payment: an invoice is paid once all its charges are. */
    function settleInvoice(invoiceId) {
      if (!invoiceId) return Promise.resolve();
      var inv = ctx.invoices().filter(function (x) { return x.id === invoiceId; })[0];
      return db().collection('charges').where('invoiceId', '==', invoiceId).where('siteId', '==', ctx.siteId()).get().then(function (s) {
        var cs = s.docs.map(function (d) { return d.data(); });
        var st = cs.every(function (c) { return c.status === 'paid' || c.status === 'cancelled'; }) ? 'paid' : cs.some(function (c) { return c.status === 'paid' || c.status === 'part-paid'; }) ? 'part-paid' : 'unpaid';
        if (inv && inv.status === st) return;
        return db().collection('invoices').doc(invoiceId).update(st === 'paid' ? { status: st, paidAt: new Date().toISOString() } : { status: st });
      });
    }

    /* ---- accounts ---- */
    function drawAccounts(el) {
      var st = ctx.settings(), s = ctx.state;
      var from = s.from || (new Date().toISOString().slice(0, 8) + '01'), to = s.to || B.today();
      el.innerHTML = '<div class="card"><h2>The accounts export</h2><p class="hint">Every charge line, VAT, payment, refund and damage deposit, a row each, with an id that never changes. ' +
        '"Only what is new" leaves out rows already exported, so nothing goes into the books twice.</p>' +
        '<div class="row"><div class="f"><label class="l" for="x-from">From</label><input class="inp" type="date" id="x-from" value="' + esc(from) + '"></div>' +
        '<div class="f"><label class="l" for="x-to">To</label><input class="inp" type="date" id="x-to" value="' + esc(to) + '"></div></div>' +
        '<label style="display:flex;gap:8px;align-items:center;margin:0 0 10px"><input type="checkbox" id="x-new"' + (s.onlyNew === false ? '' : ' checked') + '> Only what is new since the last export</label>' +
        '<div class="acts"><button class="btn" data-x="csv">CSV</button><button class="btn sec" data-x="xlsx">Excel</button><button class="btn sec" data-x="json">JSON</button></div>' +
        '<p class="hint" id="x-out"></p></div>' +
        (ctx.isAdmin ? '<div class="card"><h2>Accounts software</h2>' +
          '<label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="radio" name="x-mode" value="none"' + (st.mode !== 'calla' ? ' checked' : '') + '> None: the hub is the whole money system</label>' +
          '<label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="radio" name="x-mode" value="calla"' + (st.mode === 'calla' ? ' checked' : '') + '> Calla Accounts: also send hirers, invoices and payments there</label>' +
          '<p class="hint">With Calla Accounts, who numbers the invoices is for Martin to decide; until then the hub does.</p>' +
          '<div class="field"><label class="l" for="x-pay">How to pay (printed on invoices)</label><textarea class="inp" id="x-pay" style="height:70px;padding:8px 12px" placeholder="Bank transfer to ...">' + esc(st.payText || '') + '</textarea></div>' +
          '<div class="row"><div class="f"><label class="l" for="x-days">Pay within (days)</label><input class="inp" type="number" min="0" max="120" id="x-days" value="' + (+st.payDays || 14) + '"></div></div>' +
          '<div class="acts"><button class="btn" id="x-save">Save</button></div></div>' : '') +
        '<div class="card" id="x-queue"><h2>Not yet sent to Calla Accounts</h2><p class="hint">Loading…</p></div>';
      ['from', 'to'].forEach(function (k) { document.getElementById('x-' + k).onchange = function () { s[k] = this.value; }; });
      document.getElementById('x-new').onchange = function () { s.onlyNew = this.checked; };
      el.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { exportNow(b.dataset.x); }; });
      var sv = document.getElementById('x-save');
      if (sv) sv.onclick = function () {
        var mode = (document.querySelector('input[name="x-mode"]:checked') || {}).value || 'none';
        /* officeSites: whose bookings admins may read this (office only, F-108). */
        db().collection('settings').doc('accounts').set({ mode: mode, invoiceNumbersBy: 'hub', officeSites: (ctx.siteIds ? ctx.siteIds() : []).slice(0, 3),
          payText: document.getElementById('x-pay').value.trim().slice(0, 1000),
          payDays: Math.max(0, Math.min(120, parseInt(document.getElementById('x-days').value, 10) || 14)) })
          .then(function () { return A.settings(true); }).then(function () { ctx.toast('Saved'); return ctx.reload({ tab: 'accounts' }); })
          .catch(function (e) { ctx.toast('Could not save: ' + (e.message || e)); });
      };
      drawQueue();
    }
    function drawQueue() {
      A.waiting(ctx.siteId()).then(function (l) {
        var box = document.getElementById('x-queue'); if (!box) return;
        box.innerHTML = '<h2>Not yet sent to Calla Accounts</h2>' + (l.length ? '<p id="x-count"><b>' + l.length + '</b> waiting. Everything is saved in the hub; this is only what has not reached Calla Accounts.</p>' +
          l.map(function (x) { return '<div class="drow"><span class="d">' + esc(x.kind) + ' ' + esc(x.refId) + '</span><span class="hint">' + (x.tries || 0) + ' tries' + (x.lastError ? ': ' + esc(x.lastError) : '') + '</span></div>'; }).join('') +
          '<div class="acts"><button class="btn sec" id="x-retry">Try again</button></div>' : '<p class="hint" id="x-count">Nothing waiting.</p>');
        var rt = document.getElementById('x-retry'); if (rt) rt.onclick = function () { A.retry(ctx.siteId()).then(drawQueue); };
      });
    }
    function exportNow(kind) {
      var o = { from: document.getElementById('x-from').value, to: document.getElementById('x-to').value, onlyNew: document.getElementById('x-new').checked,
        roomName: function (id) { return ctx.room(id).name; } };
      var all = Object.keys(ctx.charges()).map(function (k) { return ctx.charges()[k]; });
      var rows = A.rows(all, o), out = document.getElementById('x-out');
      if (!rows.length) { out.textContent = 'Nothing to export for those dates' + (o.onlyNew ? ' that has not been exported before.' : '.'); return; }
      var name = 'room hire ' + o.from + ' to ' + o.to;
      var done = kind === 'csv' ? Promise.resolve(saveFile(name + '.csv', new Blob(['﻿' + csv(rows)], { type: 'text/csv;charset=utf-8' })))
        : kind === 'json' ? Promise.resolve(saveFile(name + '.json', new Blob([JSON.stringify(rows.map(function (r) { var x = {}; A.HEAD.forEach(function (h, i) { x[h] = r.cells[i]; }); return x; }), null, 1)], { type: 'application/json' })))
        : xlsxLib().then(function () {
            var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet([A.HEAD].concat(rows.map(function (r) { return r.cells.map(function (c) { return typeof c === 'string' && /^[=+\-@]/.test(c) ? "'" + c : c; }); })));
            XLSX.utils.book_append_sheet(wb, ws, 'Room hire');
            saveFile(name + '.xlsx', new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
          });
      done.then(function () { return A.markExported(rows); }).then(function () {
        out.textContent = rows.length + ' rows exported, and marked so they are not exported again.';
        return ctx.reload({ tab: 'accounts', keep: true });
      }).catch(function (e) { out.textContent = 'Could not export: ' + (e.message || e); });
    }
    function csv(rows) {
      var q = function (v) { v = v == null ? '' : String(v); if (/^[=+\-@]/.test(v) && isNaN(Number(v))) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      return [A.HEAD].concat(rows.map(function (r) { return r.cells; })).map(function (r) { return r.map(q).join(','); }).join('\r\n');
    }
    function saveFile(name, blob) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }
    var xl = null;
    function xlsxLib() {
      if (global.XLSX) return Promise.resolve();
      return xl || (xl = new Promise(function (res, rej) {
        var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
      }));
    }

    return { hirerFor: hirerFor, hirerLine: hirerLine, drawHirers: drawHirers, drawInvoices: drawInvoices, drawAccounts: drawAccounts, issueOne: issueOne,
             settleInvoice: settleInvoice, docState: docState, monthly: monthly, csv: csv };
  }

  global.EGBCMoney = EGBCMoney;
})(window);
