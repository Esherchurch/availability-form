/* ===================================================================
   EGBC — what a hire costs (events window, Chunk 5 stage 1)
   ===================================================================

   One sum, used by book.html (the instant quote, as the hirer fills in
   the form), bookings-admin.html (the office checks and adjusts it before
   approving) and the tests. Nothing here reads or writes the database.

   ALL MONEY IS WHOLE PENCE. Prices are typed in pounds on the Places page
   and stored as pence, so no sum ever drifts by a fraction of a penny.

   A RATE CARD is one room's prices for one booking type
   (rateCards/<room>__<type>):
     hourly, halfDay (up to 4 hours), fullDay (up to 10 hours),
     evening (within 18:00 to 23:00), minimum      - room hire
     setupCharged     - whether setting up and clearing away are charged
     weekendPct       - added on Saturdays and Sundays
     outOfHoursPct    - added when the time runs before 08:00 or after 22:00
     cleaning         - a fixed fee
     avHourly         - a sound and projection technician, by the hour
     charityPct, regularPct - off the room hire and its surcharges
     vat, vatRate     - whether VAT is charged, and at what rate (a setting
                        next to the tick; off unless ticked)

   MEMBERS' RATE (Martin, F-077): a kind of booking may give signed-in
   members either a percentage off the room (q.memberPct), or a price list
   of their own (the page passes that card, with q.memberList). The public
   never get it. One discount only: the largest that applies.
     deposit          - due when the booking is confirmed (part of the total)
     damageDeposit    - refundable, on top of the total

   Room hire is whichever of hourly, half day, full day and evening is
   cheapest for the times chosen (the brief, §6.18).
   =================================================================== */

(function (global) {
  'use strict';

  function p(x) { return Math.round(+x || 0); }
  function pounds(pence) { var v = p(pence), n = (Math.abs(v) / 100).toFixed(2); return (v < 0 ? '-' : '') + '£' + n.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function toPence(poundsText) { var n = Number(String(poundsText == null ? '' : poundsText).replace(/[£,\s]/g, '')); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; }
  function isoDow(day) { var d = new Date(day + 'T12:00'); return ((d.getDay() + 6) % 7) + 1; }
  function hrs(min) { var h = min / 60; return (Math.round(h * 100) / 100) + (h === 1 ? ' hour' : ' hours'); }

  /* q: { card, day, start, end (minutes), setup, pack, people,
          items: [{ name, qty, unit: 'head'|'item', price (pounds, as menus store it) }],
          kit: [{ name, qty, hirePrice (pence) }], av: { needed }, charity, regular }
     -> { lines: [{ code, label, amount }], subtotal, vat, total, deposit, damageDeposit } */
  function price(q) {
    var c = q.card || {}, lines = [];
    var setup = c.setupCharged ? (+q.setup || 0) : 0, pack = c.setupCharged ? (+q.pack || 0) : 0;
    var from = q.start - setup, to = q.end + pack, span = Math.max(0, to - from);

    /* Room hire: the cheapest way of charging these times. */
    var options = [];
    if (p(c.hourly)) options.push({ amount: Math.ceil(span / 15) * p(c.hourly) / 4, label: 'Room hire, ' + hrs(Math.ceil(span / 15) * 15) + ' at ' + pounds(c.hourly) + ' an hour' });
    if (p(c.halfDay) && span <= 240) options.push({ amount: p(c.halfDay), label: 'Room hire, half day' });
    if (p(c.fullDay) && span <= 600) options.push({ amount: p(c.fullDay), label: 'Room hire, full day' });
    if (p(c.evening) && from >= 18 * 60 && to <= 23 * 60) options.push({ amount: p(c.evening), label: 'Room hire, evening' });
    options.forEach(function (o) { o.amount = Math.round(o.amount); });
    options.sort(function (a, b) { return a.amount - b.amount; });
    var hire = options[0] || { amount: 0, label: 'Room hire' };
    if (p(c.minimum) && hire.amount < p(c.minimum)) hire = { amount: p(c.minimum), label: hire.label + ' (the minimum charge)' };
    if (q.memberList) hire.label = "Members' rate: " + hire.label.charAt(0).toLowerCase() + hire.label.slice(1);
    if (hire.amount) lines.push({ code: 'hire', label: hire.label + (setup || pack ? ', including setting up and clearing away' : ''), amount: hire.amount });

    var base = hire.amount;
    if (p(c.weekendPct) && isoDow(q.day) >= 6 && hire.amount) {
      var w = Math.round(hire.amount * p(c.weekendPct) / 100);
      lines.push({ code: 'weekend', label: 'Weekend surcharge (' + p(c.weekendPct) + '%)', amount: w }); base += w;
    }
    if (p(c.outOfHoursPct) && hire.amount && (from < 8 * 60 || to > 22 * 60)) {
      var o2 = Math.round(hire.amount * p(c.outOfHoursPct) / 100);
      lines.push({ code: 'outofhours', label: 'Out-of-hours surcharge, before 08:00 or after 22:00 (' + p(c.outOfHoursPct) + '%)', amount: o2 }); base += o2;
    }
    var offers = [];
    if (q.charity && p(c.charityPct)) offers.push({ pct: p(c.charityPct), code: 'discount', label: 'Charity rate' });
    if (q.regular && p(c.regularPct)) offers.push({ pct: p(c.regularPct), code: 'discount', label: 'Regular hirer rate' });
    if (p(q.memberPct)) offers.push({ pct: p(q.memberPct), code: 'member', label: "Members' rate" });
    offers.sort(function (a, b) { return b.pct - a.pct; });
    var best = offers[0];
    if (best && base) lines.push({ code: best.code, label: best.label + ', ' + best.pct + '% off the room', amount: -Math.round(base * best.pct / 100) });

    (q.kit || []).forEach(function (k) {
      if (p(k.hirePrice) && (+k.qty || 0) > 0) lines.push({ code: 'kit', label: k.qty + ' × ' + k.name, amount: p(k.hirePrice) * k.qty });
    });
    (q.items || []).forEach(function (i) {
      var each = Math.round((+i.price || 0) * 100);
      if (each && (+i.qty || 0) > 0) lines.push({ code: 'catering', label: i.qty + ' × ' + i.name + (i.unit === 'item' ? '' : ' (a person)'), amount: each * i.qty });
    });
    if (q.av && q.av.needed && p(c.avHourly)) {
      var t = Math.ceil((q.end - q.start) / 15) * 15;
      lines.push({ code: 'av', label: 'Sound and projection technician, ' + hrs(t), amount: Math.round(t / 60 * p(c.avHourly)) });
    }
    if (p(c.cleaning)) lines.push({ code: 'cleaning', label: 'Cleaning', amount: p(c.cleaning) });
    return totals(lines, c);
  }

  /* The sums under the lines. The office's adjusted lines go through here
     too, so the total always matches the lines shown. */
  function totals(lines, c) {
    c = c || {};
    var subtotal = lines.reduce(function (n, l) { return n + p(l.amount); }, 0);
    var rate = c.vat ? p(c.vatRate) : 0, vat = Math.round(subtotal * rate / 100), total = subtotal + vat;
    return { lines: lines, subtotal: subtotal, vat: vat, vatRate: rate, total: total,
             deposit: Math.min(p(c.deposit), total), damageDeposit: p(c.damageDeposit) };
  }

  /* The quote as a little table, for the page and for emails. */
  function table(qt, o) {
    o = o || {};
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
    var row = function (a, b, strong) { return '<tr><td style="padding:4px 8px 4px 0' + (strong ? ';font-weight:600' : '') + '">' + a + '</td><td style="padding:4px 0;text-align:right;white-space:nowrap' + (strong ? ';font-weight:600' : '') + '">' + b + '</td></tr>'; };
    return '<table style="width:100%;border-collapse:collapse;font-size:14px"' + (o.id ? ' id="' + o.id + '"' : '') + '>' +
      qt.lines.map(function (l) { return row(esc(l.label), pounds(l.amount)); }).join('') +
      (qt.vat ? row('VAT (' + qt.vatRate + '%)', pounds(qt.vat)) : '') +
      row('Total', pounds(qt.total), true) +
      (qt.deposit ? row('of which a deposit, due when it is confirmed', pounds(qt.deposit)) : '') +
      (qt.damageDeposit ? row('Refundable damage deposit, on top', pounds(qt.damageDeposit)) : '') + '</table>';
  }

  /* Which prices apply, and any members' rate. Only a member's own booking
     (kind 'member') ever gets it; a hire request from the public never does,
     whatever it says about itself. cards: { '<room>__<kind>': card, ... }.
     -> { card, memberPct, memberList, members } or null if not charged. */
  function pick(kind, type, roomId, cards) {
    if (!type || !type.charged) return null;
    var m = type.membersRate || {}, member = kind === 'member';
    var own = cards[roomId + '__' + type.id + '__members'], std = cards[roomId + '__' + type.id];
    if (member && m.mode === 'list' && own) return { card: own, memberPct: 0, memberList: true, members: true };
    if (!std) return { card: null, memberPct: 0, memberList: false, members: false };
    var pct = member && m.mode === 'percent' ? p(m.pct) : 0;
    return { card: std, memberPct: pct, memberList: false, members: pct > 0 };
  }

  var api = { price: price, totals: totals, table: table, pounds: pounds, toPence: toPence, pick: pick };
  global.EGBCQuote = api;

})(typeof window !== 'undefined' ? window : this);
