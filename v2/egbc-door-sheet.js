/* ===================================================================
   EGBC — the door sheet (F-210; Martin, 15 Oct: "can I download a
   check-in list of attendees for an event like I can with ChurchSuite?")
   ===================================================================

   A printed SIGN-UP LIST for the door, not an attendance record: it is
   made from the sign-ups and payments and writes nothing anywhere (Martin's
   rule: no attendance history for adults is built from it).

     model({ ev, signups, tt, qs, pays, cols, where })  -> the sheet's content
     html(model)                                        -> a clean A4 page
     pdf(jsPDF, model)                                  -> the same, as a PDF

   Bookings are listed by the surname of the person who booked, A to Z.
   Each named person has their own line and tick box. The booking's ticket,
   places, "to pay £x" / "paid" and notes appear once, on its first line, so
   nobody pays twice at the door. cols: { phone: true, q: [question ids] }
   (medical questions only after the page has logged the download).

   Needs: egbc-events.js (money, toPay, fmtWhen). Events window.
   =================================================================== */

(function (global) {
  'use strict';
  var E = function () { return global.EGBCEvents; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* "Natasha Jones (invented)" -> "jones" */
  function surname(name) {
    var w = String(name || '').replace(/\([^)]*\)/g, '').trim().split(/\s+/).filter(Boolean);
    return (w.length ? w[w.length - 1] : '').toLowerCase();
  }
  function answerText(v) { return Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v); }

  function model(o) {
    var tname = {}; (o.tt || []).forEach(function (t) { tname[t.id] = t.name; });
    var cols = o.cols || {}, qs = (o.qs || []).filter(function (q) { return (cols.q || []).indexOf(q.id) >= 0; });
    var perPerson = qs.filter(function (q) { return q.per === 'attendee'; }), perBooking = qs.filter(function (q) { return q.per !== 'attendee'; });
    var bookings = (o.signups || []).filter(function (s) { return s.status === 'confirmed'; }).map(function (s) {
      var key = s.key || s.id, named = (s.attendees || []).filter(function (a) { return a && String(a.name || '').trim(); });
      var people = (named.length ? named : [{ name: s.name }]).map(function (a) {
        return { name: String(a.name || s.name), answers: perPerson.map(function (q) { return answerText(a['q_' + q.id]); }) };
      });
      var places = Number(s.places) || people.length;
      var pay = (o.pays || {})[key], due = E() ? E().toPay(s, o.tt || []) : 0, payWords = '';
      if (pay && (pay.status === 'refunded' || pay.status === 'part-refunded')) payWords = pay.status === 'refunded' ? 'Refunded' : 'Part refunded';
      else if (pay && pay.paid) payWords = 'Paid ' + E().money(pay.amount) + (pay.method === 'card-online' ? ' (card)' : pay.method === 'bank-online' ? ' (bank)' : '');
      else if (due > 0) payWords = 'To pay ' + E().money(due);
      return {
        key: key, by: s.name || '', surname: surname(s.name), people: people, extra: Math.max(0, places - people.length),
        ticket: tname[s.ticketTypeId] || '', places: places, pay: payWords, toPay: !(pay && pay.paid) && due > 0 ? due : 0,
        phone: cols.phone ? String(s.phone || '') : '', answers: perBooking.map(function (q) { return answerText((s.answers || {})[q.id]); }), notes: String(s.notes || '')
      };
    }).sort(function (a, b) { return a.surname.localeCompare(b.surname) || a.by.localeCompare(b.by); });
    return {
      title: (o.ev && o.ev.title) || 'Event', when: o.ev && E() ? E().fmtWhen(o.ev) : '', where: o.where || '',
      bookings: bookings, places: bookings.reduce(function (n, b) { return n + b.places; }, 0),
      toPay: bookings.reduce(function (n, b) { return n + b.toPay; }, 0),
      waiting: (o.signups || []).filter(function (s) { return s.status === 'waiting'; }).length,
      phone: !!cols.phone, perPerson: perPerson.map(function (q) { return q.label; }), perBooking: perBooking.map(function (q) { return q.label; }),
      printed: new Date()
    };
  }

  function head(m) {
    return ['', 'Name', 'Ticket', 'Places', 'Payment'].concat(m.phone ? ['Phone'] : []).concat(m.perPerson).concat(m.perBooking).concat(['Notes']);
  }
  function rows(m) {
    var out = [];
    m.bookings.forEach(function (b) {
      var lines = b.people.map(function (p) { return { name: p.name, answers: p.answers }; });
      if (b.extra) lines.push({ name: '+ ' + b.extra + ' more (no name given)', answers: m.perPerson.map(function () { return ''; }), extra: true });
      lines.forEach(function (l, i) {
        out.push({ first: i === 0, span: lines.length, booking: b, name: l.name, answers: l.answers, extra: !!l.extra });
      });
    });
    return out;
  }

  function html(m) {
    var r = rows(m), H = head(m);
    return '<div class="door-sheet">' +
      '<style>.door-sheet{font:12px/1.35 Arial,sans-serif;color:#111;background:#fff;max-width:190mm;margin:0 auto}' +
      '.door-sheet h1{font-size:18px;margin:0 0 2px}.door-sheet .w{color:#444;margin:0 0 6px}.door-sheet .tot{font-weight:700;margin:0 0 8px}' +
      '.door-sheet table{border-collapse:collapse;width:100%}.door-sheet th{background:#3d6263;color:#fff;text-align:left;padding:4px 5px;font-size:11px}' +
      '.door-sheet td{border:1px solid #999;padding:4px 5px;vertical-align:top}.door-sheet tr.first td{border-top:2px solid #333}' +
      '.door-sheet .box{display:inline-block;width:13px;height:13px;border:1.5px solid #333}.door-sheet .due{font-weight:700}' +
      '.door-sheet .foot{color:#666;font-size:10px;margin-top:8px}@page{size:A4;margin:12mm}</style>' +
      '<h1>' + esc(m.title) + '</h1><p class="w">' + esc(m.when) + (m.where ? ' · ' + esc(m.where) : '') + '</p>' +
      '<p class="tot" id="doorTotal">Door sheet: ' + m.places + ' place' + (m.places === 1 ? '' : 's') + ' booked in ' + m.bookings.length + ' booking' + (m.bookings.length === 1 ? '' : 's') +
        (m.toPay ? ' · ' + esc(E().money(m.toPay)) + ' to collect' : '') + (m.waiting ? ' · ' + m.waiting + ' on the waiting list' : '') + '</p>' +
      '<table id="doorTable"><thead><tr>' + H.map(function (h, i) { return '<th>' + (i === 0 ? '<span class="box" style="border-color:#fff"></span>' : esc(h)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      r.map(function (x) {
        var b = x.booking, span = ' rowspan="' + x.span + '"';
        return '<tr data-person class="' + (x.first ? 'first' : '') + '"><td>' + (x.extra ? '' : '<span class="box"></span>') + '</td><td>' + esc(x.name) + '</td>' +
          (x.first ? '<td' + span + '>' + esc(b.ticket) + '</td><td' + span + '>' + b.places + '</td><td' + span + (b.toPay ? ' class="due"' : '') + '>' + esc(b.pay) + '</td>' + (m.phone ? '<td' + span + '>' + esc(b.phone) + '</td>' : '') : '') +
          x.answers.map(function (a) { return '<td>' + esc(a) + '</td>'; }).join('') +
          (x.first ? b.answers.map(function (a) { return '<td' + span + '>' + esc(a) + '</td>'; }).join('') + '<td' + span + '>' + esc(b.notes) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>' +
      '<p class="foot">Printed ' + esc(E().fmtDate(m.printed)) + ' ' + esc(E().fmtTime(m.printed)) + '. A sign-up list for the door, from the bookings: tick people as they arrive. It is not kept as a record of who came.</p></div>';
  }

  function pdf(doc, m) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(String(m.title), 14, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(m.when + (m.where ? '  ·  ' + m.where : ''), 14, 22);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold');
    doc.text('Door sheet: ' + m.places + ' places booked in ' + m.bookings.length + ' bookings' + (m.toPay ? '  ·  ' + E().money(m.toPay) + ' to collect' : '') + (m.waiting ? '  ·  ' + m.waiting + ' waiting' : ''), 14, 28);
    doc.setFont('helvetica', 'normal');
    var H = head(m), body = rows(m).map(function (x) {
      var b = x.booking, cell = function (v) { return x.first ? { content: v, rowSpan: x.span } : null; };
      return [x.extra ? '' : ' ', x.name].concat(x.first ? [cell(b.ticket), cell(String(b.places)), cell(b.pay)].concat(m.phone ? [cell(b.phone)] : []) : [])
        .concat(x.answers).concat(x.first ? b.answers.map(cell).concat([cell(b.notes)]) : []).filter(function (c) { return c !== null; });
    });
    doc.autoTable({
      startY: 33, head: [H], body: body, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2, minCellHeight: 7, valign: 'middle' }, headStyles: { fillColor: [61, 98, 99], textColor: 255 },
      columnStyles: { 0: { cellWidth: 8 } },
      didDrawCell: function (d) { if (d.section === 'body' && d.column.index === 0 && d.cell.raw === ' ') { var s = 4; doc.setDrawColor(50); doc.rect(d.cell.x + (d.cell.width - s) / 2, d.cell.y + (d.cell.height - s) / 2, s, s); } }
    });
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text('Printed ' + E().fmtDate(m.printed) + ' ' + E().fmtTime(m.printed) + '. A sign-up list for the door, from the bookings. It is not kept as a record of who came.', 14, 290);
    doc.setTextColor(0);
  }

  global.EGBCDoorSheet = { model: model, html: html, pdf: pdf, surname: surname };
})(typeof window !== 'undefined' ? window : this);
