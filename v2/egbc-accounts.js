/* ===================================================================
   EGBC — the accounts seam (events window, Chunk 5 stage 3)
   ===================================================================

   EVENTS-BOOKINGS-BRIEF §6.6. The hub is the whole money system on its
   own: charges, numbered invoices, payments, the accounts export. A church
   that has Calla Accounts can switch on a connector that ALSO sends
   customers, invoices and payments there. Every page calls this file, and
   never Calla directly.

   settings/accounts: { mode: 'none' (the default) | 'calla',
                        invoiceNumbersBy: 'hub' (until Martin decides),
                        payText, payDays }

   THE CALLA CONNECTION IS NOT BUILT. The brief says not to guess at
   Calla's API: it is a separate brief, written against Calla's own code.
   Until then, in 'calla' mode everything to send waits in accountsQueue,
   marked "not yet sent to Calla Accounts", and nothing in the hub waits
   for it or fails because of it.

   Money is whole pence throughout.
   =================================================================== */

(function (global) {
  'use strict';

  function db() { return EGBCAuth.db; }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function number(seq) { return 'INV-' + pad(seq, 5); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
  function addDays(day, n) { var d = new Date(day + 'T12:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }

  /* ---- the setting ---- */
  var SETTINGS = null;
  function settings(fresh) {
    if (SETTINGS && !fresh) return Promise.resolve(SETTINGS);
    return db().collection('settings').doc('accounts').get().then(function (s) {
      SETTINGS = Object.assign({ mode: 'none', invoiceNumbersBy: 'hub', payText: '', payDays: 14 }, s.exists ? s.data() : {});
      return SETTINGS;
    }).catch(function () { SETTINGS = { mode: 'none', invoiceNumbersBy: 'hub', payText: '', payDays: 14 }; return SETTINGS; });
  }

  /* ---- the connectors ----
     'none' sends nothing, and says so. 'calla' is a placeholder that
     refuses, so every send waits in the queue (see the top). */
  var NOT_BUILT = 'The Calla Accounts connection is not built yet: it needs its own brief, written against Calla\'s code.';
  var ADAPTERS = {
    none: { send: function () { return Promise.resolve({ ok: true, skipped: true }); }, status: function () { return Promise.resolve({ ok: true, skipped: true }); } },
    calla: { send: function () { return Promise.reject(new Error(NOT_BUILT)); }, status: function () { return Promise.reject(new Error(NOT_BUILT)); } }
  };

  /* Send one thing, never blocking: in 'calla' mode it is queued first,
     then tried; a failure leaves it waiting, with the reason. Resolves
     whatever happens. */
  function send(kind, refId, siteId, payload) {
    return settings().then(function (st) {
      if (st.mode !== 'calla') return ADAPTERS.none.send(kind, payload);
      var ref = db().collection('accountsQueue').doc('aq_' + kind + '_' + refId);
      return ref.set({ kind: kind, refId: refId, siteId: siteId, status: 'waiting', tries: 0, lastError: '', at: new Date().toISOString() })
        .then(function () { return tryOne(ref, kind, payload); });
    }).catch(function (e) { return { ok: false, error: e.message || String(e) }; });
  }
  function tryOne(ref, kind, payload) {
    return ADAPTERS.calla.send(kind, payload).then(function () {
      return ref.update({ status: 'sent', sentAt: new Date().toISOString() }).then(function () { return { ok: true }; });
    }, function (e) {
      return ref.get().then(function (s) {
        return ref.update({ status: 'waiting', tries: ((s.exists && s.data().tries) || 0) + 1, lastError: e.message || String(e), triedAt: new Date().toISOString() });
      }).then(function () { return { ok: false, queued: true, error: e.message || String(e) }; });
    }).catch(function (e) { return { ok: false, error: e.message || String(e) }; });
  }
  function sendCustomer(hirer, siteId) { return send('customer', hirer.id, siteId, hirer); }
  function sendInvoice(inv) { return send('invoice', inv.id, inv.siteId, inv); }
  function sendPayment(charge, p, i) { return send('payment', charge.id + '_' + i, charge.siteId, { charge: charge.id, payment: p }); }
  function fetchPaymentStatus(inv) {
    return settings().then(function (st) { return (st.mode === 'calla' ? ADAPTERS.calla : ADAPTERS.none).status(inv); })
      .catch(function (e) { return { ok: false, error: e.message || String(e) }; });
  }
  function waiting(siteId) {
    return db().collection('accountsQueue').where('siteId', '==', siteId).get().then(function (s) {
      return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (x) { return x.status !== 'sent'; });
    }).catch(function () { return []; });
  }
  function retry(siteId) {
    return waiting(siteId).then(function (l) {
      return l.reduce(function (p, x) { return p.then(function () { return tryOne(db().collection('accountsQueue').doc(x.id), x.kind, x); }); }, Promise.resolve());
    }).then(function () { return waiting(siteId); });
  }

  /* ---- numbered invoices ----
     One transaction: read the counter, write invoice number N, move the
     counter to N + 1, and mark each charge (and its booking) as invoiced.
     The rules check the numbering, so two at once cannot share a number.
     charges: [{ id, bookingKey, lines, subtotal, vat, total, payer, ... }]
     o: { siteId, payer, monthly, period, label(charge) -> words, by } */
  function issue(charges, o) {
    var counter = db().collection('counters').doc('invoices'), made;
    return settings().then(function (st) {
      return db().runTransaction(function (tx) {
        return tx.get(counter).then(function (c) {
          var seq = c.exists ? c.data().next : 1;
          var lines = o.monthly
            ? charges.map(function (ch) { return { label: o.label ? o.label(ch) : ch.bookingKey, amount: ch.subtotal, chargeId: ch.id }; })
            : charges[0].lines.map(function (l) { return { label: l.label, amount: l.amount, chargeId: charges[0].id }; });
          var sub = charges.reduce(function (n, ch) { return n + ch.subtotal; }, 0), vat = charges.reduce(function (n, ch) { return n + ch.vat; }, 0);
          made = { seq: seq, number: number(seq), siteId: o.siteId, chargeIds: charges.map(function (ch) { return ch.id; }),
            bookingKeys: charges.map(function (ch) { return ch.bookingKey; }), payer: o.payer, lines: lines, subtotal: sub, vat: vat, total: sub + vat,
            monthly: !!o.monthly, period: o.period || '', issuedAt: new Date().toISOString(), dueDate: addDays(today(), +st.payDays || 14),
            status: charges.every(function (ch) { return ch.status === 'paid'; }) ? 'paid' : 'unpaid', issuedBy: o.by || '' };
          tx.set(db().collection('invoices').doc('inv_' + seq), made);
          tx.set(counter, { next: seq + 1 });
          charges.forEach(function (ch) {
            tx.update(db().collection('charges').doc(ch.id), { invoiceId: 'inv_' + seq, invoiceNumber: made.number });
            tx.update(db().collection('bookings').doc(ch.bookingKey), { invoice: { number: made.number, issuedAt: made.issuedAt, dueDate: made.dueDate, monthly: made.monthly } });
          });
        });
      });
    }).then(function () { made.id = 'inv_' + made.seq; sendInvoice(made); return made; });
  }

  /* ---- the accounts export ----
     A row per charge line, VAT, payment, refund and damage deposit move,
     each with an id that never changes, so the treasurer's software can
     match it, and an exportedAt mark per row so "only what is new" never
     sends a row twice. Amounts in pounds, two places. */
  var HEAD = ['Id', 'Date', 'Type', 'Invoice', 'Payer', 'Organisation', 'Email', 'Booking reference', 'Room', 'Description', 'Net (£)', 'VAT (£)', 'Gross (£)', 'Method', 'Reference'];
  function money(p) { return Math.round(p) / 100; }
  function rows(charges, o) {
    o = o || {};
    var out = [], from = o.from || '0000', to = o.to || '9999';
    charges.forEach(function (ch) {
      var py = ch.payer || {}, base = function (id, date, type, desc, net, vat, method, ref) {
        return { id: id, cells: [id, date, type, ch.invoiceNumber || '', py.name || '', py.org || '', py.email || '', String(ch.bookingKey || '').slice(3, 11).toUpperCase(),
          o.roomName ? o.roomName(ch.roomId) : ch.roomId, desc, money(net), money(vat), money(net + vat), method || '', ref || ''], chargeId: ch.id };
      };
      var day = ch.dueDate || '';
      if (ch.status !== 'cancelled' && day >= from && day <= to) {
        (ch.lines || []).forEach(function (l, i) { out.push(base(ch.id + '#L' + i, day, 'Charge', l.label, l.amount, 0)); });
        if (ch.vat) out.push(base(ch.id + '#VAT', day, 'VAT', 'VAT at ' + (ch.vatRate || 0) + '%', 0, ch.vat));
      }
      (ch.payments || []).forEach(function (p, i) {
        if (p.date < from || p.date > to) return;
        var refund = p.kind === 'refund';
        out.push(base(ch.id + '#P' + i, p.date, refund ? 'Refund' : 'Payment', refund ? 'Refund' : 'Payment received', refund ? -p.amount : p.amount, 0, p.method, p.ref));
      });
      var dm = ch.damage || {};
      if (dm.takenOn && dm.takenOn >= from && dm.takenOn <= to) out.push(base(ch.id + '#DT', dm.takenOn, 'Damage deposit taken', 'Refundable damage deposit', dm.amount, 0, dm.method, ''));
      if (dm.closedOn && dm.closedOn >= from && dm.closedOn <= to) {
        if (dm.returned) out.push(base(ch.id + '#DR', dm.closedOn, 'Damage deposit returned', 'Damage deposit returned', -dm.returned, 0, dm.returnMethod || '', ''));
        if (dm.kept) out.push(base(ch.id + '#DK', dm.closedOn, 'Damage deposit kept', 'Kept: ' + (dm.note || ''), 0, 0, '', ''));
      }
    });
    if (o.onlyNew) out = out.filter(function (r) { var ch = charges.filter(function (c) { return c.id === r.chargeId; })[0]; return !(ch && ch.exportedAt && ch.exportedAt[r.id.split('#')[1]]); });
    return out.sort(function (a, b) { return a.cells[1] < b.cells[1] ? -1 : a.cells[1] > b.cells[1] ? 1 : a.id < b.id ? -1 : 1; });
  }
  /* After a download: mark every row in it as exported, on its charge. */
  function markExported(list) {
    var by = {}, at = new Date().toISOString();
    list.forEach(function (r) { (by[r.chargeId] = by[r.chargeId] || {})[r.id.split('#')[1]] = at; });
    return Object.keys(by).reduce(function (p, id) {
      var patch = {}; Object.keys(by[id]).forEach(function (k) { patch['exportedAt.' + k] = by[id][k]; });
      return p.then(function () { return db().collection('charges').doc(id).update(patch); });
    }, Promise.resolve());
  }

  global.EGBCAccounts = { settings: settings, NOT_BUILT: NOT_BUILT, sendCustomer: sendCustomer, sendInvoice: sendInvoice, sendPayment: sendPayment,
    fetchPaymentStatus: fetchPaymentStatus, waiting: waiting, retry: retry, issue: issue, number: number, HEAD: HEAD, rows: rows, markExported: markExported };

})(typeof window !== 'undefined' ? window : this);
