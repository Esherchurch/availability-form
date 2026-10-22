/* ===================================================================
   EGBC — a one-off event's safeguarding assessment (F-265, step 2)
   ===================================================================
   EGBCSgAssess.mount(el, { calEventId, ev, siteId, me: { uid, name },
     may: { edit, sign, waive } }) -> Promise

   An under-18s trip, overnight, holiday club or off-site event (its
   sgKind) is assessed from a template: questions in general words and
   starter risks, adapted. The event's team and named leaders fill it in;
   only the site's safeguarding lead or deputy signs it off, and until then
   the event takes no bookings (the rules; sgGate tells the public page).
   Any change after signing takes it back to "waiting for sign-off".
   Only the lead, deputy or a master admin may say it isn't needed, with a
   reason - recorded. General words only: never a child, a family or a
   medical detail.
   =================================================================== */
(function (global) {
  'use strict';
  var T = global.EGBCSgTemplates;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var WORDS = { red: 'High', amber: 'Medium', green: 'Low' };
  var STATUS = { draft: 'Being written', waiting: 'Waiting for sign-off', signed: 'Signed off' };
  function rag(l, i, label) { var r = T.rating(l, i); return '<span class="sga-rag ' + r + '" data-rag="' + r + '">' + (label ? label + ': ' : '') + WORDS[r] + ' ' + T.score(l, i) + '</span>'; }
  var CSS = '.sga h3{margin:0 0 6px;font-size:16px;color:#111827}.sga .st{display:inline-flex;min-height:26px;padding:0 10px;border-radius:999px;font:600 12.5px Inter,sans-serif;align-items:center}' +
    '.sga .st.draft{background:#f3f4f6;color:#374151}.sga .st.waiting{background:#fdf6e9;color:#b07d2e}.sga .st.signed{background:#ecfdf3;color:#15803d}.sga .st.waived{background:#eef5f4;color:#2a4a4b}' +
    '.sga label{display:block;font:600 13px Inter,sans-serif;color:#111827;margin:12px 0 4px}.sga textarea,.sga input[type=text],.sga select{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #d1d5db;border-radius:10px;padding:8px 10px;font:400 14px Inter,sans-serif}' +
    '.sga textarea{min-height:60px}.sga .r{border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin:10px 0}.sga .g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}' +
    '.sga-rag{display:inline-flex;min-height:24px;padding:0 9px;border-radius:999px;font:600 12px Inter,sans-serif;align-items:center;margin:4px 4px 0 0}.sga-rag.red{background:#fdecea;color:#b0392c}.sga-rag.amber{background:#fdf6e9;color:#b07d2e}.sga-rag.green{background:#ecfdf3;color:#15803d}' +
    '.sga .warn{background:#fdf6e9;color:#6b4a26;border-radius:10px;padding:8px 10px;font-size:12.5px;margin:8px 0}.sga .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}' +
    '.sga .b{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid #3d6263;background:#3d6263;color:#fff;font:600 14px Inter,sans-serif;cursor:pointer}.sga .b.sec{background:#fff;color:#3d6263}' +
    '.sga .muted{color:#6b7280;font-size:13px}@media (max-width:520px){.sga .g4{grid-template-columns:repeat(2,minmax(0,1fr))}}';

  function mount(el, o) {
    if (!document.getElementById('sga-css')) { var st = document.createElement('style'); st.id = 'sga-css'; st.textContent = CSS; document.head.appendChild(st); }
    var db = EGBCAuth.db, ref = db.collection('sgAssessments').doc(o.calEventId), gate = db.collection('sgGate').doc(o.calEventId), A = null;
    var tplId = (o.ev && o.ev.sgKind) || 'trip';
    function now() { return new Date().toISOString(); }
    function stamp(x) { return Object.assign(x, { updatedAt: now(), updatedBy: o.me.uid }); }
    function load() {
      return ref.get().then(function (d) { A = d.exists ? d.data() : null; draw(); }, function () { el.innerHTML = '<p class="muted">The assessment could not be read here.</p>'; });
    }
    function statusPill() {
      if (!A) return '<span class="st draft" data-sgstatus="none">Not started</span>';
      if (A.waived) return '<span class="st waived" data-sgstatus="waived">Not needed (' + esc(A.waivedByName || '') + ')</span>';
      return '<span class="st ' + A.status + '" data-sgstatus="' + A.status + '">' + STATUS[A.status] + '</span>';
    }
    function draw() {
      var t = T.EVENT_TEMPLATES[(A && A.templateId) || tplId] || T.EVENT_TEMPLATES.trip;
      var head = '<div class="sga"><h3>Safeguarding assessment ' + statusPill() + '</h3>' +
        (A && A.status === 'signed' && !A.waived ? '<p class="muted" id="sgaSigned">Signed off by ' + esc(A.signedByName || '') + (A.signedNote ? '. Their note: ' + esc(A.signedNote) : '') + '</p>' : '') +
        (A && A.waived ? '<p class="muted" id="sgaWaived">Not needed, said ' + esc(A.waivedByName || '') + ': ' + esc(A.waivedWhy || '') + '</p>' : '') +
        (!A || (A.status !== 'signed' && !A.waived) ? '<p class="warn" id="sgaGateWords">Bookings open after the safeguarding lead or deputy signs this off.</p>' : '');
      if (!A) {
        el.innerHTML = head + (o.may.edit ? '<label for="sgaTpl">Start from a template</label><select id="sgaTpl">' + T.EVENT_KINDS.map(function (k) { return '<option value="' + k.id + '"' + (k.id === tplId ? ' selected' : '') + '>' + esc(T.EVENT_TEMPLATES[k.id].label) + '</option>'; }).join('') + '</select>' +
          '<div class="btns"><button class="b" id="sgaStart">Start the assessment</button></div>' : '<p class="muted">Not started yet.</p>') + waiveBox() + '</div>';
        wire(); return;
      }
      var edit = o.may.edit && !A.waived;
      var answers = t.questions.map(function (q) {
        var v = (A.answers || {})[q.id] || '';
        return edit ? '<label for="sgaQ_' + q.id + '">' + esc(q.label) + '</label><textarea id="sgaQ_' + q.id + '" data-q="' + q.id + '" maxlength="500" placeholder="' + esc(q.hint) + '">' + esc(v) + '</textarea>'
          : '<p><b>' + esc(q.label) + '</b><br>' + (v ? esc(v) : '<span class="muted">Not answered</span>') + '</p>';
      }).join('');
      var risks = (A.risks || []).map(function (r, k) {
        if (!edit) return '<div class="r" data-sgarisk="' + k + '"><b>' + esc(r.risk) + '</b><div class="muted">' + esc(r.who || '') + '</div>' + rag(r.l, r.i, 'Before') + rag(r.rl, r.ri, 'After') +
          '<div class="muted">' + (r.controls || []).map(T.controlLabel).map(esc).join(' · ') + '</div></div>';
        var sel = function (f, v) { var s = '<select data-rf="' + f + '" aria-label="' + f + '">'; for (var n = 1; n <= 5; n++) s += '<option' + (n === v ? ' selected' : '') + '>' + n + '</option>'; return s + '</select>'; };
        return '<div class="r" data-sgarisk="' + k + '"><input type="text" data-rf="risk" maxlength="200" value="' + esc(r.risk) + '" aria-label="The risk">' +
          '<input type="text" data-rf="who" maxlength="120" value="' + esc(r.who || '') + '" aria-label="Who" style="margin-top:6px">' +
          '<div class="g4" style="margin-top:6px"><div><span class="muted">How likely</span>' + sel('l', r.l) + '</div><div><span class="muted">How bad</span>' + sel('i', r.i) + '</div><div><span class="muted">After: likely</span>' + sel('rl', r.rl) + '</div><div><span class="muted">After: bad</span>' + sel('ri', r.ri) + '</div></div>' +
          '<textarea data-rf="controls" maxlength="1000" aria-label="Controls, one a line" style="margin-top:6px">' + esc((r.controls || []).map(T.controlLabel).join('\n')) + '</textarea>' + rag(r.l, r.i, 'Before') + rag(r.rl, r.ri, 'After') + '</div>';
      }).join('');
      var reds = (A.risks || []).filter(function (r) { return T.rating(r.rl, r.ri) === 'red'; }).length;
      el.innerHTML = head + (edit ? '<p class="warn">General words only: never name a child, a family or a medical detail.</p>' : '') + answers +
        '<label>Risks</label>' + risks + (edit ? '<button class="b sec" id="sgaAddRisk" type="button">Add a risk</button>' : '') +
        '<div class="btns">' + (edit ? '<button class="b sec" id="sgaSave">Save</button>' + (A.status === 'draft' ? '<button class="b" id="sgaReady">Ready for sign-off</button>' : '') : '') +
        (o.may.sign && !A.waived && A.status !== 'signed' ? '<button class="b" id="sgaSign">Sign it off</button>' : '') + '<button class="b sec" id="sgaPrint" type="button">Print</button></div>' +
        (o.may.sign && reds && A.status !== 'signed' ? '<label for="sgaNote">' + reds + ' risk' + (reds === 1 ? ' is' : 's are') + ' still high after the controls: say why it can go ahead</label><textarea id="sgaNote" maxlength="300"></textarea>' : '') +
        '<p class="muted" id="sgaMsg" role="status"></p>' + waiveBox() + '</div>';
      wire();
    }
    function waiveBox() {
      if (!o.may.waive || (A && (A.waived || A.status === 'signed'))) return '';
      return '<details style="margin-top:12px"><summary class="muted">Not needed for this event?</summary><label for="sgaWhy">Why not (recorded, with your name)</label><textarea id="sgaWhy" maxlength="300"></textarea>' +
        '<div class="btns"><button class="b sec" id="sgaWaive">It isn’t needed</button></div></details>';
    }
    function say(t) { var m = el.querySelector('#sgaMsg'); if (m) m.textContent = t; }
    function read() {
      var t = T.EVENT_TEMPLATES[A.templateId] || T.EVENT_TEMPLATES.trip, answers = {};
      el.querySelectorAll('[data-q]').forEach(function (q) { var v = q.value.trim().slice(0, 500); if (v) answers[q.getAttribute('data-q')] = v; });
      var risks = [].slice.call(el.querySelectorAll('[data-sgarisk]')).map(function (row) {
        var f = function (n) { return row.querySelector('[data-rf="' + n + '"]'); };
        return { risk: f('risk').value.trim().slice(0, 200), who: f('who').value.trim().slice(0, 120), l: +f('l').value, i: +f('i').value, rl: +f('rl').value, ri: +f('ri').value,
          controls: f('controls').value.split('\n').map(function (x) { return x.trim().slice(0, 200); }).filter(Boolean).slice(0, 20).map(function (x) { return { kind: 'text', text: x }; }) };
      }).filter(function (r) { return r.risk; }).slice(0, 40);
      return { answers: answers, risks: risks, templateId: t === T.EVENT_TEMPLATES[A.templateId] ? A.templateId : 'trip' };
    }
    /* any change after signing goes back to "waiting", and bookings close again */
    function save(status) {
      var r = read(), wasSigned = A.status === 'signed';
      var next = stamp(Object.assign({}, A, r, { status: status || (wasSigned ? 'waiting' : A.status), version: (A.version || 1) + (wasSigned ? 1 : 0) }));
      var b = db.batch(); b.set(ref, next); if (wasSigned) b.set(gate, { needed: true, open: false, updatedAt: now() });
      return b.commit().then(function () { A = next; say(wasSigned ? 'Saved. It needs signing off again before more bookings.' : 'Saved.'); draw(); }, function (e) { say('Not saved: ' + (e.message || e)); });
    }
    function wire() {
      var q = function (s) { return el.querySelector(s); };
      if (q('#sgaStart')) q('#sgaStart').onclick = function () {
        var id = q('#sgaTpl').value, t = T.EVENT_TEMPLATES[id];
        var d = stamp({ siteId: o.siteId, calEventId: o.calEventId, title: String((o.ev && o.ev.title) || '').slice(0, 120), templateId: id, answers: {},
          risks: t.risks.map(function (r) { return { risk: r.risk, who: r.who, l: r.l, i: r.i, rl: r.rl, ri: r.ri, controls: r.controls }; }), status: 'draft', version: 1 });
        var b = db.batch(); b.set(ref, d); b.set(gate, { needed: true, open: false, updatedAt: now() });
        b.commit().then(function () { A = d; draw(); }, function (e) { el.insertAdjacentHTML('beforeend', '<p class="muted">Could not start it: ' + esc(e.message || e) + '</p>'); });
      };
      if (q('#sgaAddRisk')) q('#sgaAddRisk').onclick = function () { var r = read(); A = Object.assign({}, A, r); A.risks.push({ risk: 'A new risk', who: '', l: 3, i: 3, rl: 2, ri: 3, controls: [] }); draw(); };
      if (q('#sgaSave')) q('#sgaSave').onclick = function () { save(); };
      if (q('#sgaReady')) q('#sgaReady').onclick = function () { save('waiting'); };
      if (q('#sgaPrint')) q('#sgaPrint').onclick = function () { global.print(); };
      if (q('#sgaSign')) q('#sgaSign').onclick = function () {
        var r = o.may.edit ? read() : { answers: A.answers, risks: A.risks, templateId: A.templateId };
        var reds = r.risks.filter(function (x) { return T.rating(x.rl, x.ri) === 'red'; }).length, note = (q('#sgaNote') ? q('#sgaNote').value.trim() : '').slice(0, 300);
        if (reds && !note) { say('Say why it can go ahead with a high risk left, or change it first.'); return; }
        var v = (A.version || 1);
        var next = stamp(Object.assign({}, A, r, { status: 'signed', version: v, signedBy: o.me.uid, signedByName: String(o.me.name || '').slice(0, 80),
          signedAt: firebase.firestore.FieldValue.serverTimestamp(), signedVersion: v, signedNote: note }));
        var b = db.batch(); b.set(ref, next); b.set(gate, { needed: true, open: true, updatedAt: now() });
        b.commit().then(function () { return load(); }).then(function () { say('Signed off. Bookings are open.'); }, function (e) { say('Not signed: ' + (e.message || e)); });
      };
      if (q('#sgaWaive')) q('#sgaWaive').onclick = function () {
        var why = q('#sgaWhy').value.trim().slice(0, 300); if (!why) { q('#sgaWhy').focus(); return; }
        var base = A || { siteId: o.siteId, calEventId: o.calEventId, title: String((o.ev && o.ev.title) || '').slice(0, 120), templateId: tplId, answers: {}, risks: [], status: 'draft', version: 1 };
        var next = stamp(Object.assign({}, base, { waived: true, waivedBy: o.me.uid, waivedByName: String(o.me.name || '').slice(0, 80), waivedAt: firebase.firestore.FieldValue.serverTimestamp(), waivedWhy: why }));
        var b = db.batch(); b.set(ref, next); b.set(gate, { needed: true, open: true, updatedAt: now() });
        b.commit().then(load, function (e) { say('Not saved: ' + (e.message || e)); });
      };
    }
    return load();
  }
  global.EGBCSgAssess = { mount: mount };
})(window);
