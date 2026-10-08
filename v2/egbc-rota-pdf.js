/* ===================================================================
   EGBC Suite - the rota PDFs
   ===================================================================

   Four documents, one generator:

     full        every date, every role
     individual  the dates one person is on
     household   the dates anyone in their household is on
     wall        a month-per-page calendar for the fridge

   These were written in the Rota Planner, where they are attached to the
   term email, and then written a second time in the read-only rota for the
   download buttons. The second copy drifted: it looked people up by a field
   almost nobody has, left out the time column, and had no wall planner at
   all - so what you downloaded was not what you had been sent. One file
   now, used by both.

   A household is worked out from `householdId`, the field the address book
   actually maintains - following the links in both directions, because the
   book records households two ways (see householdIds below). Roles can hold
   one person or several - two singers are stored as an array - so every
   lookup copes with both shapes.

   Needs jsPDF and the autoTable plugin on the page.
   =================================================================== */

(function (global) {
  'use strict';

  /* Everyone assigned to a role, whichever way it was stored. */
  function peopleIn(raw) {
    if (!raw) return [];
    return (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  }

  /* Everyone in this person's household.

     The address book records a household two different ways. The Prossers
     have a head: Natasha and Daniel both point at Martin, and Martin points
     at nobody. Samy and David point at each other. Following one link from
     the person - "find the head, then everyone under the head" - handles the
     first shape and loses people in the second, and would drop a child from
     a mixture of the two.

     So follow every link, both directions, until nothing new turns up. A
     household is simply the group of people joined by those pointers. */
  function householdIds(addressBook, memberId) {
    var seen = {}, queue = [memberId];
    seen[memberId] = true;

    while (queue.length) {
      var id = queue.shift();
      var person = addressBook.find(function (m) { return m.id === id; });

      /* Who they point at. */
      if (person && person.householdId && !seen[person.householdId]) {
        seen[person.householdId] = true;
        queue.push(person.householdId);
      }

      /* Who points at them. */
      addressBook.forEach(function (m) {
        if (m.householdId === id && !seen[m.id]) {
          seen[m.id] = true;
          queue.push(m.id);
        }
      });
    }

    /* Only ids that are really in the book - a pointer can outlive a record. */
    return addressBook.filter(function (m) { return seen[m.id]; }).map(function (m) { return m.id; });
  }

  function logoSize(doc, logo, w, h, wanted) {
    if (w && h) return { w: (w / h) * wanted, h: wanted };
    try {
      var p = doc.getImageProperties(logo);
      return { w: (p.width / p.height) * wanted, h: wanted };
    } catch (e) {
      return { w: wanted, h: wanted };
    }
  }

  function build(opts) {
    var jsPDF = (global.jspdf || {}).jsPDF;
    if (!jsPDF) throw new Error('jsPDF is not loaded on this page.');

    var type = opts.type;
    var memberId = opts.memberId;
    var addressBook = opts.addressBook || [];
    var logo = opts.logo || null;
    var avRoles = opts.avRoles || [];

    var events = (opts.events || []).slice()
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    if (!events.length) return null;

    /* ---- the wall planner ------------------------------------------- */

    if (type === 'wall') {
      var WALL_RGB = { worship: [61, 98, 99], av: [74, 95, 122], kids: [122, 95, 74] };
      var wallDoc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'A4' });
      var hIds = householdIds(addressBook, memberId);

      var byMonth = {};
      events.forEach(function (ev) {
        var key = new Date(ev.date).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
        (byMonth[key] = byMonth[key] || []).push(ev);
      });

      Object.keys(byMonth).sort(function (a, b) {
        return new Date(byMonth[a][0].date) - new Date(byMonth[b][0].date);
      }).forEach(function (month, idx) {
        if (idx > 0) wallDoc.addPage();

        if (logo) {
          var L = logoSize(wallDoc, logo, opts.logoWidth, opts.logoHeight, 60);
          wallDoc.addImage(logo, 'JPEG', 40, 20, L.w, L.h);
        }
        wallDoc.setFont('helvetica', 'bold'); wallDoc.setFontSize(22); wallDoc.setTextColor(61, 98, 99);
        wallDoc.text('Family Wall Planner', 150, 50);
        wallDoc.setFontSize(14); wallDoc.setTextColor(100, 100, 100); wallDoc.text(month, 150, 70);

        var first = new Date(byMonth[month][0].date);
        var yr = first.getFullYear(), mth = first.getMonth();
        var startDay = new Date(yr, mth, 1).getDay();
        var daysInM = new Date(yr, mth + 1, 0).getDate();
        var offset = startDay === 0 ? 6 : startDay - 1;

        var rows = [], week = new Array(7).fill(null), d, dayIdx;
        for (var i = 0; i < offset; i++) week[i] = { empty: true };
        for (d = 1; d <= daysInM; d++) {
          var dateStr = yr + '-' + String(mth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          dayIdx = (d + offset - 1) % 7;
          week[dayIdx] = {
            day: d,
            events: byMonth[month].filter(function (e) { return e.date === dateStr; })
          };
          if (dayIdx === 6 || d === daysInM) { rows.push(week); week = new Array(7).fill(null); }
        }

        wallDoc.autoTable({
          startY: 90,
          head: [['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']],
          body: rows.map(function (w) {
            return w.map(function (c) {
              if (!c || c.empty) return '';
              var cell = 'DAY:' + c.day;
              c.events.forEach(function (ev) {
                var mine = [];
                Object.keys(ev.assignments || {}).forEach(function (role) {
                  peopleIn(ev.assignments[role]).forEach(function (p) {
                    if (hIds.indexOf(p.id) !== -1) {
                      var team = isKidsRole(role) ? 'kids' : (avRoles.indexOf(role) !== -1 ? 'av' : 'worship');
                      mine.push('P:' + team + '~' + String(p.name || '').split(' ')[0] + ': ' + role);
                    }
                  });
                });
                if (mine.length) cell += '|S:' + ev.type + '|' + mine.join('|');
              });
              return cell;
            });
          }),
          theme: 'grid',
          /* The text is drawn by hand below, so the cell's own text is made
             invisible rather than removed - autoTable still needs it to work
             out how tall each cell should be. */
          styles: { fontSize: 0.1, cellPadding: 4, minCellHeight: 65, valign: 'top', textColor: [255, 255, 255] },
          headStyles: { fillColor: [61, 98, 99], textColor: 255, halign: 'center', fontSize: 10 },
          didDrawCell: function (data) {
            if (data.section !== 'body' || data.cell.raw === '') return;
            var segs = String(data.cell.raw).split('|');
            var yPos = data.cell.y + 12;
            segs.forEach(function (seg) {
              if (seg.indexOf('DAY:') === 0) {
                wallDoc.setFont('helvetica', 'bold'); wallDoc.setFontSize(10); wallDoc.setTextColor(180, 180, 180);
                wallDoc.text(seg.replace('DAY:', ''), data.cell.x + 5, yPos);
                yPos += 12;
              } else if (seg.indexOf('S:') === 0) {
                wallDoc.setFont('helvetica', 'bold'); wallDoc.setFontSize(7); wallDoc.setTextColor(61, 98, 99);
                var sl = wallDoc.splitTextToSize(seg.replace('S:', ''), data.cell.width - 10);
                wallDoc.text(sl, data.cell.x + 5, yPos);
                yPos += 4 + sl.length * 8;
              } else if (seg.indexOf('P:') === 0) {
                /* A pill in the team's colour behind each name, so the family
                   can see at a glance who is doing what (Martin, 8 Oct 2026). */
                var bits = seg.slice(2).split('~');
                var rgb = WALL_RGB[bits[0]] || WALL_RGB.worship;
                wallDoc.setFont('helvetica', 'bold'); wallDoc.setFontSize(7);
                var maxW = data.cell.width - 10;
                var lines = wallDoc.splitTextToSize(bits[1], maxW - 8);
                var pw = Math.min(maxW, Math.max.apply(null, lines.map(function (l) { return wallDoc.getTextWidth(l); })) + 8);
                var ph = 4 + lines.length * 8;
                wallDoc.setFillColor(rgb[0], rgb[1], rgb[2]);
                wallDoc.roundedRect(data.cell.x + 4, yPos - 7, pw, ph, ph / 2 > 6 ? 6 : ph / 2, ph / 2 > 6 ? 6 : ph / 2, 'F');
                wallDoc.setTextColor(255, 255, 255);
                wallDoc.text(lines, data.cell.x + 8, yPos - 0.5);
                yPos += ph + 3;
              }
            });
          }
        });
      });

      return wallDoc;
    }

    /* ---- the three table documents ---------------------------------- */

    var doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4', compress: true });
    var title = 'FULL ROTA';

    if (type === 'individual' || type === 'household') {
      var member = addressBook.find(function (m) { return m.id === memberId; });
      var ids = householdIds(addressBook, memberId);
      title = type === 'individual'
        ? String((member && member.name) || '').toUpperCase() + ' ROTA'
        : 'HOUSEHOLD ROTA';

      events = events.filter(function (e) {
        return Object.keys(e.assignments || {}).some(function (role) {
          return peopleIn(e.assignments[role]).some(function (p) {
            return type === 'individual' ? p.id === memberId : ids.indexOf(p.id) !== -1;
          });
        });
      });
      if (!events.length) return null;
    }

    if (logo) {
      var L2 = logoSize(doc, logo, opts.logoWidth, opts.logoHeight, 20);
      doc.addImage(logo, 'JPEG', 255, 10, L2.w, L2.h);
    }
    doc.setFillColor(240, 246, 246); doc.roundedRect(12, 12, 230, 10, 4, 4, 'F');
    doc.setTextColor(61, 98, 99); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text(title, 16, 19);

    /* The full rota can be narrowed to the reader's own teams. A personal or
       household one never is: it shows the whole team for those dates, which
       is how you know who you are serving with. */
    drawTables(doc, events, {
      avRoles: avRoles,
      roleFilter: (type === 'full' && opts.roleFilter) ? opts.roleFilter : null,
      memberIds: type === 'individual' ? [memberId] : (type === 'household' ? ids : null)
    });

    return doc;
  }

  /* ---- the rota table, shared by the Rota Planner and the read-only rota --

     Martin, 8 Oct 2026: the household PDF had twenty columns once Kids Church
     slots joined the Sunday event - names broke mid-word and the dates ran
     together. So:
       - Worship & AV in one table, Kids Church in its own underneath; the
         worship rota was never meant to carry Kids Church slots.
       - a role column appears only if somebody is in it on these dates.
       - one "When" column: the date on its own line, then time and service.
       - banded rows with a rule between dates. */
  function isKidsRole(r) {
    if (typeof EGBCAuth !== 'undefined' && EGBCAuth.roleTeam) return EGBCAuth.roleTeam(r) === 'Kids Church';
    return r === 'Session Leader' || r.indexOf('Helper ') === 0 ||
           r.indexOf('Leader (') === 0 || r.indexOf('Assistant (') === 0;
  }

  function whenText(e) {
    var d = new Date(e.date + 'T12:00:00');
    var day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    var time = (e.startTime || '') + (e.startTime && e.endTime ? '–' : '') + (e.endTime || '');
    return day + '\n' + [time, e.type || ''].filter(Boolean).join('  ·  ');
  }

  function drawTables(doc, events, opts) {
    /* One list in date order. For each date, one row per team that is
       serving - Worship & AV, Kids Church - and, on a personal or household
       rota, only the teams that person or household is actually on that day
       (Martin, 8 Oct 2026: "Don't put in the worship line for that date if
       they are not on worship"). Each cell is the role, small, with the name
       under it, so rows from different teams sit in one table. */
    var avRoles = opts.avRoles || [];
    var mine = opts.memberIds || null;
    var TEAM_RGB = { worship: [61, 98, 99], av: [74, 95, 122], kids: [122, 95, 74] };
    var teamOf = function (r) { return isKidsRole(r) ? 'kids' : (avRoles.indexOf(r) !== -1 ? 'av' : 'worship'); };

    var order = [];
    events.forEach(function (e) {
      (e.roles || []).concat(Object.keys(e.assignments || {})).forEach(function (r) {
        if (order.indexOf(r) === -1) order.push(r);
      });
    });
    order = order.filter(function (r) { return teamOf(r) === 'worship'; })
      .concat(order.filter(function (r) { return teamOf(r) === 'av'; }))
      .concat(order.filter(function (r) { return teamOf(r) === 'kids'; }));

    var names = function (e, r) {
      var p = peopleIn(e.assignments && e.assignments[r]);
      if (p.length) return p;
      return (r === 'Choir' && (e.roles || []).indexOf('Choir') !== -1) ? [{ name: 'Choir' }] : [];
    };

    var groups = [];
    events.forEach(function (e) {
      var allowed = opts.roleFilter ? opts.roleFilter(e) : null;
      var lines = [];
      [['worship', 'Worship & AV', function (r) { return teamOf(r) !== 'kids'; }],
       ['kids', 'Kids Church', function (r) { return teamOf(r) === 'kids'; }]].forEach(function (t) {
        var slots = order.filter(t[2]).filter(function (r) {
          return (!allowed || allowed.indexOf(r) !== -1) && names(e, r).length;
        }).map(function (r) { return { role: r, people: names(e, r) }; });
        if (!slots.length) return;
        if (mine && !slots.some(function (s) {
          return s.people.some(function (p) { return mine.indexOf(p.id) !== -1; });
        })) return;
        lines.push({ e: e, team: t[0], label: t[1], slots: slots });
      });
      if (lines.length) groups.push(lines);
    });

    /* The key, for the teams that appear. */
    var seen = { worship: false, av: false, kids: false };
    groups.forEach(function (g) { g.forEach(function (l) { l.slots.forEach(function (s) { seen[teamOf(s.role)] = true; }); }); });
    var keyX = 14;
    [['worship', 'Worship'], ['av', 'AV'], ['kids', 'Kids Church']].forEach(function (k) {
      if (!seen[k[0]]) return;
      doc.setFillColor(TEAM_RGB[k[0]][0], TEAM_RGB[k[0]][1], TEAM_RGB[k[0]][2]);
      doc.roundedRect(keyX, 25.2, 3.2, 3.2, 0.6, 0.6, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(75, 85, 99);
      doc.text(k[1], keyX + 4.6, 27.8);
      keyX += 4.6 + doc.getTextWidth(k[1]) + 7;
    });
    if (mine) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(17, 24, 39);
      doc.text(mine.length > 1 ? 'Names in bold are your household.' : 'Your name is in bold.', keyX + 4, 27.8);
    }

    if (!groups.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(107, 114, 128);
      doc.text('Nobody is on the rota for these dates.', 14, 40);
      return;
    }

    var N = 0;
    groups.forEach(function (g) { g.forEach(function (l) { N = Math.max(N, l.slots.length); }); });

    var body = [], meta = [];
    groups.forEach(function (g, gi) {
      g.forEach(function (l, li) {
        var row = [];
        if (li === 0) row.push({ content: whenText(l.e), rowSpan: g.length });
        row.push(l.label);
        for (var i = 0; i < N; i++) {
          var s = l.slots[i];
          row.push(s ? s.role + '\n' + s.people.map(function (p) { return p.name; }).join('\n') : '');
        }
        body.push(row);
        meta.push({ band: gi % 2, line: l });
      });
    });

    var BAND = [[255, 255, 255], [240, 246, 246]];
    doc.autoTable({
      startY: 32,
      margin: { left: 12, right: 12, bottom: 8 },
      head: [['When', 'Team', { content: 'Who is serving', colSpan: N }]],
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [61, 98, 99], textColor: 255, fontStyle: 'bold', fontSize: 8, valign: 'middle' },
      styles: { fontSize: 7.5, cellPadding: 1.6, valign: 'top', overflow: 'linebreak',
                lineColor: [209, 223, 223], lineWidth: 0.25, textColor: [31, 41, 55] },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 21 } },
      didParseCell: function (d) {
        if (d.section !== 'body') return;
        var m = meta[d.row.index];
        d.cell.styles.fillColor = BAND[m.band];
        var col = d.column.index;
        if (col === 0) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.valign = 'middle'; return; }
        if (col === 1) {
          d.cell.styles.fillColor = TEAM_RGB[m.line.team];
          d.cell.styles.textColor = 255; d.cell.styles.fontStyle = 'bold'; d.cell.styles.valign = 'middle';
          return;
        }
        /* Slot cells are drawn by hand below; the text stays for the height. */
        d.cell.styles.textColor = BAND[m.band];
      },
      didDrawCell: function (d) {
        if (d.section !== 'body' || d.column.index < 2) return;
        var s = meta[d.row.index].line.slots[d.column.index - 2];
        if (!s) return;
        var x = d.cell.x + 1.6, y = d.cell.y + 1.6, w = d.cell.width - 3.2;
        var c = TEAM_RGB[teamOf(s.role)];
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3); doc.setTextColor(c[0], c[1], c[2]);
        var roleLines = doc.splitTextToSize(s.role, w);
        doc.text(roleLines, x, y + 2.2);
        y += 2.2 + roleLines.length * 2.6;
        s.people.forEach(function (p) {
          var me = mine && mine.indexOf(p.id) !== -1;
          doc.setFont('helvetica', me ? 'bold' : 'normal'); doc.setFontSize(7.5);
          if (me) doc.setTextColor(17, 24, 39); else doc.setTextColor(55, 65, 81);
          var nl = doc.splitTextToSize(p.name, w);
          doc.text(nl, x, y + 0.8);
          y += nl.length * 3.1;
        });
      }
    });
  }

  global.EGBCRotaPdf = { build: build, drawTables: drawTables, householdIds: householdIds, peopleIn: peopleIn };
})(window);
