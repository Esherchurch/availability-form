/* ===================================================================
   A HIRER'S OWN RISK ASSESSMENT, on Room bookings (H&S step 5; F-280
   section 3D; Martin's answer 6)
   ===================================================================
   For the kinds of booking the office ticks in Health and safety settings
   (raSettings/church.hireRaTypes), the hirer sends their own risk
   assessment. The office puts it up here; the raReadReport function reads
   it (kind 'hire') and checks it against the building's significant
   hazards; the number booked is checked against the room's fire maximum;
   the office confirms it (raHire/<booking key>).

     settings()                 loads the setting once
     line(b, room)              the booking card's line ('' when not needed)
     fill(el)                   draws every line in el
   Nothing here is any one church's.
   =================================================================== */
(function (global) {
  'use strict';
  var SET = null;
  function db() { return EGBCAuth.db; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(c, d) { return db().collection(c).doc(d).get().then(function (x) { return x.exists ? x.data() : null; }, function () { return null; }); }
  function day(ts) { var d = ts && ts.toDate ? ts.toDate() : null; return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; }

  function settings() {
    return SET ? Promise.resolve(SET) : get('raSettings', 'church').then(function (s) { SET = s || {}; return SET; });
  }
  function needed(b) { return !!SET && b.kind === 'hire' && b.status !== 'declined' && b.status !== 'cancelled' && (SET.hireRaTypes || []).indexOf(b.bookingType || '') >= 0; }
  function line(b, room) {
    return needed(b) ? '<div class="rahire" data-rahire="' + esc(b.key) + '" data-site="' + esc(b.siteId) + '" data-people="' + (+b.people || 0) + '" data-max="' + (+((room || {}).fireMax) || 0) + '">' +
      '<div class="st wait">Their risk assessment: checking…</div></div>' : '';
  }
  function fill(el) { (el || document).querySelectorAll('[data-rahire]').forEach(draw); }

  function draw(box) {
    var key = box.getAttribute('data-rahire'), people = +box.getAttribute('data-people'), max = +box.getAttribute('data-max');
    Promise.all([get('raReads', key + '__hire'), get('raHire', key)]).then(function (w) {
      var r = w[0], ok = w[1];
      var nums = max && people > max ? '<div class="st no" data-rahirenum>' + people + ' people booked; the room holds ' + max + ' at most for fire safety.</div>' : '';
      if (ok) { box.innerHTML = '<div class="st ok" data-rahireok>Their risk assessment: confirmed by ' + esc(ok.confirmedByName) + ' on ' + esc(day(ok.confirmedAt)) + (ok.note ? ': ' + esc(ok.note) : '') + '</div>' + nums; return; }
      var up = '<input type="file" accept=".pdf,.docx,image/*" style="display:none" data-rahirefile><button class="btn sec" type="button" data-rahireup>' + (r ? 'Read a newer one' : 'Put up their risk assessment') + '</button> <span class="hint" data-rahiremsg role="status"></span>';
      if (!r) { box.innerHTML = '<div class="st wait" data-rahireneed>This kind of booking needs the hirer’s own risk assessment.</div>' + nums + '<div class="acts">' + up + '</div>'; return wire(box, key, null); }
      box.innerHTML = '<div class="st wait" data-rahireread>Their risk assessment (' + esc(r.file.name) + ') has been read: check it, then confirm it.</div>' + nums +
        (r.gaps.length ? '<div class="st no" data-rahiregaps>It doesn’t deal with: ' + esc(r.gaps.map(function (g) { return g.words.replace(/^the building’s hazard: /, ''); }).join('; ')) + '.</div>' : '<div class="st ok">It deals with each of the building’s significant hazards' + (r.buildingHazards ? ' (' + r.buildingHazards + ')' : '') + '.</div>') +
        (r.buildingHazards === 0 ? '<div class="hint">The building has no countersigned assessment with significant hazards to check it against yet.</div>' : '') +
        (r.findings.length ? '<div class="hint">What it covers: ' + esc(r.findings.map(function (f) { return f.hazard; }).join('; ')) + '</div>' : '') +
        (r.personalFound ? '<div class="hint">It had names, phone numbers or emails in it; they were left out of what was read.</div>' : '') +
        '<label class="hint" style="display:block;margin-top:6px">A note (optional) <input class="inp" data-rahirenote maxlength="1000" style="width:100%"></label>' +
        '<div class="acts"><button class="btn" type="button" data-rahireconfirm>Confirm their risk assessment</button>' + up + '</div>';
      wire(box, key, r);
    });
  }
  function wire(box, key, r) {
    var msg = box.querySelector('[data-rahiremsg]'), file = box.querySelector('[data-rahirefile]');
    box.querySelector('[data-rahireup]').onclick = function () { file.click(); };
    file.onchange = function () {
      var f = file.files[0]; if (!f) return;
      if (f.size > 7 * 1024 * 1024) { msg.textContent = 'The file is too big: 7 MB at most.'; return; }
      msg.textContent = 'Reading… this takes a minute or two.';
      var rd = new FileReader();
      rd.onload = function () {
        EGBCAuth.call('raReadReport', { kind: 'hire', bookingKey: key, fileName: f.name, contentType: f.type, data: String(rd.result).split(',')[1] || '' }, { timeoutMs: 190000 })
          .then(function () { draw(box); }, function (e) { msg.textContent = (e && e.name === 'AbortError') ? 'Still working: reload in a minute.' : 'Not read: ' + ((e && e.message) || e); });
      };
      rd.readAsDataURL(f);
    };
    var c = box.querySelector('[data-rahireconfirm]');
    if (c) c.onclick = function () {
      c.disabled = true;
      db().collection('raHire').doc(key).set({ siteId: box.getAttribute('data-site'), confirmedBy: EGBCAuth.user().uid, confirmedByName: ((EGBCAuth.profile && EGBCAuth.profile()) || {}).name || '',
        confirmedAt: firebase.firestore.FieldValue.serverTimestamp(), note: (box.querySelector('[data-rahirenote]').value || '').trim().slice(0, 1000) })
        .then(function () { draw(box); }, function (e) { c.disabled = false; msg.textContent = 'Not confirmed: ' + ((e && e.message) || e); });
    };
  }

  global.EGBCRaHire = { settings: settings, line: line, fill: fill, needed: needed };
})(typeof window !== 'undefined' ? window : this);
