/* ===================================================================
   EGBC — the booking form (events window, Chunk 4 R2)
   ===================================================================

   One form, used by rooms.html (members, in the hub) and book.html (the
   public). The page decides what is offered:

     EGBCBookForm.render(el, {
       rooms: [room],       the rooms that may be chosen
       multi: true,         tick several rooms (members) or one (public)
       chosen: [roomId], day, start, end,
       menus: [menu],       refreshments on offer
       kit: [kit] | null,   members may ask for kit; the public may not
       contact: true,       the public give their name and email
       onChange: fn         called whenever anything changes
     })
     EGBCBookForm.values(el)  -> what was filled in

   It only collects. Whether the time is free, and whether the booking is
   confirmed or waits, is the page's job, and the rules' in the end.
   =================================================================== */

(function (global) {
  'use strict';

  var CSS =
    '.bf .field{margin-bottom:12px}.bf .two{display:flex;gap:12px;flex-wrap:wrap}.bf .two>.field{flex:1;min-width:120px}' +
    '.bf label.l{display:block;font-size:13px;font-weight:500;color:var(--ink,#111827);margin:0 0 5px}' +
    '.bf .inp,.bf select,.bf textarea{width:100%;height:40px;border:1px solid var(--line-2,#d1d5db);border-radius:8px;padding:0 12px;font:400 14px Inter,sans-serif;color:var(--ink,#111827);background:#fff}' +
    '.bf textarea{height:80px;padding:10px 12px}' +
    '.bf .inp:focus,.bf select:focus,.bf textarea:focus{outline:none;border-color:var(--brand,#3d6263);box-shadow:0 0 0 3px rgba(61,98,99,.15)}' +
    '.bf .ck{display:flex;align-items:center;gap:8px;font-size:14px;margin:6px 0;font-weight:400;color:var(--body,#374151)}' +
    '.bf .ck input{width:16px;height:16px;accent-color:var(--brand,#3d6263);flex:none}' +
    '.bf .sec{border-top:1px solid var(--line,#e5e7eb);padding-top:12px;margin-top:6px}' +
    '.bf .sec h3{font-size:14px;font-weight:600;color:var(--ink,#111827);margin:0 0 8px}' +
    '.bf .item{display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap}.bf .item .inp{width:80px;height:34px}' +
    '.bf .item span{flex:1;min-width:140px;font-size:14px}.bf .hint{font-size:13px;color:var(--muted,#6b7280)}' +
    '.bf .trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '.bf .hidden{display:none}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function css() {
    if (document.getElementById('bf-css')) return;
    var st = document.createElement('style'); st.id = 'bf-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  function times(from, to, sel) {
    var out = '';
    for (var m = from; m <= to; m += 15) {
      var t = EGBCBookings.hhmm(m);
      out += '<option value="' + t + '"' + (t === sel ? ' selected' : '') + '>' + t + '</option>';
    }
    return out;
  }
  function mins(sel) {
    return [0, 15, 30, 45, 60, 90, 120].map(function (m) {
      return '<option value="' + m + '"' + (+sel === m ? ' selected' : '') + '>' + (m ? m + ' minutes' : 'None') + '</option>';
    }).join('');
  }
  function money(v) { return '£' + (Number(v) || 0).toFixed(2); }

  function render(el, o) {
    css();
    el._bf = o;
    el.classList.add('bf');
    var R = global.EGBCRooms, rooms = o.rooms || [], chosen = o.chosen || (rooms[0] ? [rooms[0].id] : []);
    var roomPick = o.multi
      ? '<div class="field"><label class="l">Room' + (rooms.length > 1 ? 's' : '') + '</label>' + rooms.map(function (r) {
          return '<label class="ck"><input type="checkbox" class="bf-room" value="' + esc(r.id) + '"' + (chosen.indexOf(r.id) >= 0 ? ' checked' : '') + '> ' + esc(r.name) + '</label>';
        }).join('') + '<p class="hint">Tick more than one for an event that needs several rooms.</p></div>'
      : (rooms.length > 1
          ? '<div class="field"><label class="l" for="bf-room1">Room</label><select id="bf-room1" class="bf-room1">' + rooms.map(function (r) {
              return '<option value="' + esc(r.id) + '"' + (chosen[0] === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</select></div>'
          : '<input type="hidden" class="bf-room1" value="' + esc(chosen[0] || '') + '">');

    el.innerHTML =
      roomPick +
      '<div class="two">' +
        '<div class="field"><label class="l" for="bf-day">Date</label><input class="inp" type="date" id="bf-day" value="' + esc(o.day || '') + '" min="' + EGBCBookings.today() + '"></div>' +
        '<div class="field"><label class="l" for="bf-start">Start</label><select id="bf-start">' + times(360, 1425, o.start || '19:00') + '</select></div>' +
        '<div class="field"><label class="l" for="bf-end">Finish</label><select id="bf-end">' + times(375, 1425, o.end || '20:00') + '</select></div>' +
      '</div>' +
      '<div class="two">' +
        '<div class="field"><label class="l" for="bf-setup">Time to set up first</label><select id="bf-setup">' + mins(o.setup || 0) + '</select></div>' +
        '<div class="field"><label class="l" for="bf-pack">Time to clear away after</label><select id="bf-pack">' + mins(o.pack || 0) + '</select></div>' +
      '</div>' +
      '<p class="hint" style="margin:-4px 0 10px">The room is held for these too, so nobody else is booked in while you set up or clear away.</p>' +
      '<div class="field"><label class="l" for="bf-title">What is it for?</label><input class="inp" id="bf-title" maxlength="120" placeholder="' + (o.contact ? 'A birthday party' : 'Band practice') + '"></div>' +
      '<div class="two">' +
        '<div class="field"><label class="l" for="bf-people">How many people</label><input class="inp" id="bf-people" type="number" min="1" inputmode="numeric" value="' + esc(o.people || '') + '"></div>' +
        '<div class="field"><label class="l" for="bf-layout">Set out as</label><select id="bf-layout"><option value="">However it is</option>' +
          (R ? R.LAYOUTS.map(function (x) { return '<option value="' + x.id + '">' + esc(x.label) + '</option>'; }).join('') : '') + '</select></div>' +
      '</div>' +

      '<div class="sec"><h3>Sound and projection</h3>' +
        '<label class="ck"><input type="checkbox" id="bf-av"> We need sound or projection</label>' +
        '<div id="bf-av-more" class="field hidden"><label class="l" for="bf-av-what">What do you need?</label><input class="inp" id="bf-av-what" maxlength="300" placeholder="Two microphones and the projector"></div></div>' +

      ((o.menus || []).length ? '<div class="sec"><h3>Refreshments</h3>' +
        '<label class="ck"><input type="checkbox" id="bf-ref"> We would like refreshments</label>' +
        '<div id="bf-ref-more" class="hidden">' +
          (o.menus || []).map(function (m) {
            return '<div class="item"><span>' + esc(m.name) + ' <span class="hint">' + money(m.price) + (m.unit === 'item' ? ' each' : ' a person') +
              (m.noticeDays ? ', ' + m.noticeDays + ' working days\' notice' : '') + '</span></span>' +
              '<input class="inp bf-menu" type="number" min="0" data-id="' + esc(m.id) + '" aria-label="How many: ' + esc(m.name) + '" placeholder="0"></div>';
          }).join('') +
          '<div class="two" style="margin-top:8px"><div class="field"><label class="l" for="bf-serve">Serve at</label><select id="bf-serve">' + times(360, 1425, '') + '</select></div></div>' +
          '<p class="l" style="font-size:13px;font-weight:500;margin:0 0 5px">Special diets (how many people)</p><div class="two">' +
            [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['glutenFree', 'Gluten-free'], ['dairyFree', 'Dairy-free']].map(function (d) {
              return '<div class="field"><label class="l" for="bf-diet-' + d[0] + '">' + d[1] + '</label><input class="inp bf-diet" type="number" min="0" id="bf-diet-' + d[0] + '" data-k="' + d[0] + '"></div>';
            }).join('') + '</div>' +
          '<div class="field"><label class="l" for="bf-diet-notes">Anything else about food</label><input class="inp" id="bf-diet-notes" maxlength="300" placeholder="One nut allergy"></div>' +
          '<p class="hint" id="bf-late"></p>' +
        '</div></div>' : '') +

      (o.kit && o.kit.length ? '<div class="sec"><h3>Kit</h3>' + o.kit.map(function (k) {
        return '<div class="item"><span>' + esc(k.name) + (k.unlimited ? '' : ' <span class="hint">(' + (k.quantity || 0) + ')</span>') + '</span>' +
          '<input class="inp bf-kit" type="number" min="0"' + (k.unlimited ? '' : ' max="' + (k.quantity || 0) + '"') + ' data-id="' + esc(k.id) + '" aria-label="How many: ' + esc(k.name) + '" placeholder="0"></div>';
      }).join('') + '</div>' : '') +

      (o.contact ? '<div class="sec"><h3>Your details</h3>' +
        '<div class="two"><div class="field"><label class="l" for="bf-name">Your name</label><input class="inp" id="bf-name" maxlength="120" autocomplete="name"></div>' +
        '<div class="field"><label class="l" for="bf-email">Email</label><input class="inp" id="bf-email" type="email" maxlength="200" autocomplete="email"></div></div>' +
        '<div class="two"><div class="field"><label class="l" for="bf-phone">Phone (optional)</label><input class="inp" id="bf-phone" maxlength="40" autocomplete="tel"></div>' +
        '<div class="field"><label class="l" for="bf-org">Group or organisation (optional)</label><input class="inp" id="bf-org" maxlength="120" autocomplete="organization"></div></div>' +
        /* A box people never see. Only a robot fills it in. */
        '<div class="trap" aria-hidden="true"><label for="bf-website">Leave this empty</label><input id="bf-website" tabindex="-1" autocomplete="off"></div>' +
        '</div>' : '') +

      '<div class="sec"><div class="field"><label class="l" for="bf-notes">Anything else we should know</label><textarea id="bf-notes" maxlength="2000"></textarea></div></div>';

    function q(s) { return el.querySelector(s); }
    if (q('#bf-av')) q('#bf-av').onchange = function () { q('#bf-av-more').classList.toggle('hidden', !this.checked); };
    if (q('#bf-ref')) q('#bf-ref').onchange = function () { q('#bf-ref-more').classList.toggle('hidden', !this.checked); };
    el.oninput = el.onchange = function () {
      var v = values(el);
      if (q('#bf-late')) {
        var late = v.refreshments.needed ? EGBCBookings.lateItems(v.refreshments.items, o.menus, v.day) : [];
        q('#bf-late').textContent = late.length ? 'Not enough notice for: ' + late.join(', ') + '. Ask, but it may not be possible.' : '';
      }
      if (o.onChange) o.onChange(v);
    };
  }

  function values(el) {
    var o = el._bf || {}, q = function (s) { return el.querySelector(s); }, val = function (s) { var x = q(s); return x ? x.value.trim() : ''; };
    var rooms = o.multi
      ? [].slice.call(el.querySelectorAll('.bf-room:checked')).map(function (x) { return x.value; })
      : [val('.bf-room1')].filter(Boolean);
    var menus = o.menus || [], kit = o.kit || [];
    var items = [].slice.call(el.querySelectorAll('.bf-menu')).filter(function (x) { return +x.value > 0; }).map(function (x) {
      var m = menus.filter(function (y) { return y.id === x.dataset.id; })[0] || {};
      return { id: x.dataset.id, name: m.name || '', qty: Math.round(+x.value), unit: m.unit || 'head', price: +m.price || 0 };
    });
    var diet = {};
    [].slice.call(el.querySelectorAll('.bf-diet')).forEach(function (x) { if (+x.value > 0) diet[x.dataset.k] = Math.round(+x.value); });
    var refNeeded = !!(q('#bf-ref') && q('#bf-ref').checked);
    return {
      rooms: rooms, day: val('#bf-day'), start: val('#bf-start'), end: val('#bf-end'),
      setup: +val('#bf-setup') || 0, pack: +val('#bf-pack') || 0,
      title: val('#bf-title'), people: parseInt(val('#bf-people'), 10) || 0, layout: val('#bf-layout'),
      av: { needed: !!q('#bf-av').checked, what: q('#bf-av').checked ? val('#bf-av-what') : '' },
      refreshments: refNeeded ? { needed: true, items: items, servingAt: val('#bf-serve'), dietary: diet, notes: val('#bf-diet-notes') }
                              : { needed: false, items: [], servingAt: '', dietary: {}, notes: '' },
      resources: [].slice.call(el.querySelectorAll('.bf-kit')).filter(function (x) { return +x.value > 0; }).map(function (x) {
        var k = kit.filter(function (y) { return y.id === x.dataset.id; })[0] || {};
        return { id: x.dataset.id, name: k.name || '', qty: Math.round(+x.value) };
      }),
      notes: val('#bf-notes'),
      requester: o.contact ? { name: val('#bf-name'), email: val('#bf-email').toLowerCase(), phone: val('#bf-phone'), org: val('#bf-org') } : null,
      trap: val('#bf-website')
    };
  }

  global.EGBCBookForm = { render: render, values: values };

})(window);
