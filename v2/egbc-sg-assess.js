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

   STEP 5: "Describe the event, and get a first draft" (sgDraftAssessment):
   the same people who write it may ask. The draft is labelled "First draft
   by AI: check every line"; the hub's own sums give its overall; a "must
   not go ahead" item stops sign-off until it is changed or taken out.
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
    '.sga .ck{border-top:1px solid #f0f0f0;padding:6px 0}.sga .ck[data-ckmiss]{background:#fdecea;border-radius:8px;padding:6px 8px}.sga .ck [data-suggest]{margin:4px 0}' +
    '.sga .muted{color:#6b7280;font-size:13px}@media (max-width:520px){.sga .g4{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '.sga .ai{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:12px 0;background:#fafaf9}.sga .ai textarea{min-height:110px}.sga .ai input[type=number]{width:100px;min-height:44px;border:1px solid #d1d5db;border-radius:10px;padding:8px 10px}' +
    '.sga .must{background:#fdecea;color:#7f1d1d;border:1px solid #f5c2bc;border-radius:12px;padding:10px 12px;margin:10px 0}.sga .must ul{margin:6px 0 0;padding-left:18px}' +
    '.sga .tag{display:inline-flex;min-height:22px;padding:0 8px;border-radius:999px;font:600 11.5px Inter,sans-serif;align-items:center;margin:4px 4px 0 0;background:#f3f4f6;color:#374151}.sga .tag.red{background:#fdecea;color:#b0392c}';

  /* A DRAFT TAKES 30-60 SECONDS (the reviewing window's live run: 46 s).
     The shared EGBCAuth.call() waits 8 s unless told otherwise; main's
     { timeoutMs } (aa740f1b) lets these calls wait DRAFT_WAIT, as long as the
     function itself may run (180 s). The server's own refusals come through
     as they are; a call that runs out of time is "still working"; anything
     else is said plainly (plainError). */
  var DRAFT_WAIT = 180000;
  /* what one assessment holds (H-9: no limits beyond what a record holds; the rules and functions/sg-ai-core.cjs MAX the same) */
  var MAX = { risks: 200, controls: 50, host: 500 };
  function callLong(name, data, ms) {
    return EGBCAuth.call(name, data, { timeoutMs: ms || api.DRAFT_WAIT }).catch(function (e) {
      /* the server's codes are words; a browser's abort carries the old number 20, so it isn't one */
      if (e && typeof e.code === 'string' && e.code) throw e;
      var x = new Error(''); x.code = e && e.name === 'AbortError' ? 'still-working' : e instanceof SyntaxError ? 'unknown' : 'unreachable'; throw x;
    });
  }
  /* never a raw error: the server's own refusals are already plain words; anything else is said plainly */
  var PLAIN = ['invalid-argument', 'failed-precondition', 'permission-denied', 'resource-exhausted', 'unavailable', 'unauthenticated'];
  function plainError(e) {
    e = e || {};
    if (e.code === 'still-working') return 'Still working: reload in a minute to see the draft.';
    if (e.code === 'unreachable') return 'The hub couldn’t be reached. Check the connection and try again.';
    if (PLAIN.indexOf(e.code) >= 0 && e.message) return e.message;
    if (e.code === 'internal' && /^The (draft|list) came back incomplete/.test(e.message || '')) return e.message;
    return 'The draft couldn’t be finished just now. Reload in a minute to see whether it was saved, or try again.';
  }

  function mount(el, o) {
    if (!document.getElementById('sga-css')) { var st = document.createElement('style'); st.id = 'sga-css'; st.textContent = CSS; document.head.appendChild(st); }
    var db = EGBCAuth.db, ref = db.collection('sgAssessments').doc(o.calEventId), gate = db.collection('sgGate').doc(o.calEventId), A = null;
    var tplId = (o.ev && o.ev.sgKind) || 'trip', CHURCHQ = [], MINCOVER = 0, GUIDE = {}, READS = {};
    /* who has read the host's safeguarding policy (S3): its own record, sgPolicyReads/<event> */
    var reads = db.collection('sgPolicyReads').doc(o.calEventId);
    /* the trustees have noted the signed assessment (S4): its own record, sgNoted/<event> */
    var notedRef = db.collection('sgNoted').doc(o.calEventId), NOTED = null, NOTEDSET = null;
    /* the required checklist for this event: its kind, the ticked flags, and the church's own questions */
    function questions() { return T.checklistFor((o.ev && o.ev.sgKind) || (A && A.templateId) || tplId, (A && A.flags) || {}, CHURCHQ.concat(T.hostQuestions(A))); }
    function now() { return new Date().toISOString(); }
    function stamp(x) { return Object.assign(x, { updatedAt: now(), updatedBy: o.me.uid }); }
    function load() {
      return Promise.all([ref.get(), db.collection('safeguardingSettings').doc('defaults').get().catch(function () { return null; }),
        o.may.sign && o.siteId ? db.collection('bookingSettings').doc(o.siteId).get().catch(function () { return null; }) : null,
        reads.get().catch(function () { return null; }),
        notedRef.get().catch(function () { return null; })]).then(function (r) {
        NOTED = r[4] && r[4].exists ? r[4].data() : null;
        READS = (r[3] && r[3].exists && r[3].data().reads) || {};
        /* the signer's role, for "Signed off by <name>, <role>" */
        var b = r[2] && r[2].exists ? r[2].data() : {}, mid = o.me.memberId || '';
        var st = r[1] && r[1].exists ? r[1].data() : {};
        if (o.may.sign) o.me.role = mid && b.safeguardingDeputy === mid && b.safeguardingLead !== mid ? 'Deputy safeguarding lead' : 'Safeguarding lead';
        /* in the church's own words (Safeguarding settings: what it calls its safeguarding lead) */
        if (global.EGBCSafeguarding && EGBCSafeguarding.setLeadTitle) { EGBCSafeguarding.setLeadTitle((st.register || {}).leadTitle); if (o.may.sign) o.me.role = EGBCSafeguarding.lead(o.me.role); }
        CHURCHQ = ((st.register || {}).checklist || []).filter(function (q) { return q && q.id && q.q; });
        MINCOVER = (st.register || {}).minCover || 0; GUIDE = (st.register || {}).guidance || {}; NOTEDSET = (st.register || {}).noted || null;
        A = r[0].exists ? r[0].data() : null; draw();
      }, function () { el.innerHTML = '<p class="muted">The assessment could not be read here.</p>'; });
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
        el.innerHTML = head + aiBox() + (o.may.edit ? '<label for="sgaTpl">Start from a template</label><select id="sgaTpl">' + T.EVENT_KINDS.map(function (k) { return '<option value="' + k.id + '"' + (k.id === tplId ? ' selected' : '') + '>' + esc(T.EVENT_TEMPLATES[k.id].label) + '</option>'; }).join('') + '</select>' +
          '<div class="btns"><button class="b" id="sgaStart">Start the assessment</button></div>' : '<p class="muted">Not started yet.</p>') + waiveBox() + '</div>';
        wire(); return;
      }
      var edit = o.may.edit && !A.waived;
      /* THE REQUIRED CHECKLIST: an answer, or "not applicable" with a reason, for every question */
      var sug = (A.source && A.source.suggest) || {}, qs0 = questions();
      var left = qs0.filter(function (q) { return !T.answered((A.answers || {})[q.id]); }).length;
      var answers = hostBox(edit) + policyBox(edit) + '<div id="sgaChecklist"><label style="margin-top:16px">The checklist <span class="muted" style="font-weight:400" id="sgaCkCount">' + (qs0.length - left) + ' of ' + qs0.length + ' answered</span></label>' +
        '<p class="muted" style="margin:0 0 6px">Every question needs an answer, or “not applicable” with a reason, before it can be signed off.</p>' + guideLine() +
        (edit ? '<div class="flags">' + T.FLAGS.map(function (f) { return '<label style="display:flex;gap:8px;font-weight:400;margin:4px 0"><input type="checkbox" data-flag="' + f.id + '"' + (((A.flags || {})[f.id]) ? ' checked' : '') + '> ' + esc(f.label) + '</label>'; }).join('') + '</div>' : '') +
        qs0.map(function (q) {
          var v = String((A.answers || {})[q.id] || ''), na = /^N\/A:/.test(v), why = na ? v.replace(/^N\/A:\s*/, '') : '';
          var hub = q.id === 'leaders' && o.hub ? '<div class="muted" data-hubcheck>The hub’s check: ' + esc(o.hub) + '</div>' : '';
          var ai = sug[q.id] && !T.answered(v) ? '<div class="muted" data-suggest="' + q.id + '">AI suggests (to confirm): ' + esc(sug[q.id]) + (edit ? ' <button class="b sec" type="button" data-use="' + q.id + '" style="min-height:30px;padding:0 10px">Use this</button>' : '') + '</div>' : '';
          /* the answers that are flags: no paediatric first aider, no male and female leader, the cover */
          var fl = T.answerFlags(A.answers, A.flags, MINCOVER).filter(function (x) { return x.id === q.id; })[0];
          var flag = fl ? ' <span class="sga-rag ' + fl.level + '" data-ckflag="' + q.id + '"' + (q.id === 'paedFirstAid' ? ' data-paedflag="' + fl.level + '"' : '') + '>' + esc(fl.words) + '</span>' : '';
          /* where a question came from (the church's own, the host's), and the paediatric note */
          var note = q.hint && (q.yesNo || q.group === 'host' || q.group === 'church') ? '<div class="muted" data-cknote>' + esc(q.hint) + '</div>' : '';
          if (!edit) return '<div class="ck" data-ck="' + q.id + '"><b>' + esc(q.label) + '</b>' + flag + (q.group === 'host' ? note : '') + '<br>' + (T.answered(v) ? (na ? 'Not applicable: ' + esc(why) : esc(v)) : '<span class="muted">Not answered</span>') + hub + '</div>';
          if (q.yesNo) {
            /* Yes, No, or the question's own "not applicable" choice ("Not a mixed group"), which needs no words */
            var yn = (/^(Yes|No|N\/A):/.exec(v) || [])[1] || '', rest = v.replace(/^(Yes|No|N\/A):\s*/, '');
            if (yn === 'N/A' && !q.naLabel) yn = '';
            return '<div class="ck" data-ck="' + q.id + '"' + (T.answered(v) ? '' : ' data-ckleft') + '><label for="sgaQ_' + q.id + '">' + esc(q.label) + '</label>' + flag + note + ai +
              '<select data-yn="' + q.id + '" aria-label="Yes or no" style="max-width:220px;margin:4px 0"><option value="">Choose…</option><option' + (yn === 'Yes' ? ' selected' : '') + '>Yes</option><option' + (yn === 'No' ? ' selected' : '') + '>No</option>' +
              (q.naLabel ? '<option value="N/A"' + (yn === 'N/A' ? ' selected' : '') + '>' + esc(q.naLabel) + '</option>' : '') + '</select>' +
              '<textarea id="sgaQ_' + q.id + '" data-q="' + q.id + '" maxlength="500" placeholder="' + esc(q.placeholder || 'Who, and when their certificate runs out (or, if not, why not)') + '"' + (yn === 'N/A' ? ' style="display:none"' : '') + '>' + esc(yn === 'N/A' ? '' : rest) + '</textarea></div>';
          }
          /* an amount and words: the public liability cover ("£5,000,000: Ecclesiastical, checked by …") */
          if (q.money) {
            var amt = T.coverOf(v), words = v.replace(/^£[\d,]*:\s*/, '');
            return '<div class="ck" data-ck="' + q.id + '"' + (T.answered(v) ? '' : ' data-ckleft') + '><label for="sgaQ_' + q.id + '">' + esc(q.label) + '</label>' + flag + ai +
              '<div style="display:flex;gap:6px;align-items:center;margin:4px 0"><span aria-hidden="true">£</span><input type="text" inputmode="numeric" data-money="' + q.id + '" aria-label="Public liability cover, in pounds" placeholder="Public liability cover" style="max-width:220px" value="' + (amt === null ? '' : String(amt).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) + '"></div>' +
              '<textarea id="sgaQ_' + q.id + '" data-q="' + q.id + '" maxlength="480" placeholder="Who insures it, what it covers, and who checked, when">' + esc(words) + '</textarea></div>';
          }
          return '<div class="ck" data-ck="' + q.id + '"' + (T.answered(v) ? '' : ' data-ckleft') + '><label for="sgaQ_' + q.id + '">' + esc(q.label) + '</label>' + note + hub + ai +
            '<textarea id="sgaQ_' + q.id + '" data-q="' + q.id + '" maxlength="500" placeholder="' + esc(q.hint) + '"' + (na ? ' disabled' : '') + '>' + esc(na ? '' : v) + '</textarea>' +
            '<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:4px 0"><input type="checkbox" data-na="' + q.id + '"' + (na ? ' checked' : '') + '> Not applicable</label>' +
            '<input type="text" data-nawhy="' + q.id + '" maxlength="300" placeholder="Why it doesn’t apply" value="' + esc(why) + '"' + (na ? '' : ' style="display:none"') + '></div>';
        }).join('') + '</div>';
      var risks = (A.risks || []).map(function (r, k) {
        if (!edit) return '<div class="r" data-sgarisk="' + k + '">' + tags(r) + '<b>' + esc(r.risk) + '</b><div class="muted">' + esc(r.who || '') + (r.owner ? ' · Owner: ' + esc(r.owner) : '') + '</div>' + rag(r.l, r.i, 'Before') + rag(r.rl, r.ri, 'After') +
          '<div class="muted">' + (r.controls || []).map(T.controlLabel).map(esc).join(' · ') + '</div>' + todoView(r) + '</div>';
        var sel = function (f, v) { var s = '<select data-rf="' + f + '" aria-label="' + f + '">'; for (var n = 1; n <= 5; n++) s += '<option' + (n === v ? ' selected' : '') + '>' + n + '</option>'; return s + '</select>'; };
        return '<div class="r" data-sgarisk="' + k + '">' + tags(r) + '<input type="text" data-rf="risk" maxlength="200" value="' + esc(r.risk) + '" aria-label="The risk">' +
          '<input type="text" data-rf="who" maxlength="120" value="' + esc(r.who || '') + '" aria-label="Who" style="margin-top:6px">' +
          '<div class="g4" style="margin-top:6px"><div><span class="muted">How likely</span>' + sel('l', r.l) + '</div><div><span class="muted">How bad</span>' + sel('i', r.i) + '</div><div><span class="muted">After: likely</span>' + sel('rl', r.rl) + '</div><div><span class="muted">After: bad</span>' + sel('ri', r.ri) + '</div></div>' +
          '<textarea data-rf="controls" maxlength="1000" aria-label="Controls, one a line" style="margin-top:6px">' + esc((r.controls || []).map(T.controlLabel).join('\n')) + '</textarea>' + rag(r.l, r.i, 'Before') + rag(r.rl, r.ri, 'After') + todoEdit(r, k) + '</div>';
      }).join('');
      var reds = (A.risks || []).filter(function (r) { return T.rating(r.rl, r.ri) === 'red'; }).length;
      var ai = A.source && A.source.kind === 'ai', stops = (A.risks || []).filter(function (r) { return r.mustNot; }).length;
      var aiHead = ai ? '<p class="warn" id="sgaAiLabel">First draft by AI: check every line. It counts for nothing until the safeguarding lead or deputy signs it off.</p>' +
        (A.source.leftOut > 0 ? '<p class="muted" id="sgaSockets">' + (A.source.leftOut === 1 ? 'One suggestion was' : A.source.leftOut + ' suggestions were') + ' left out: socket covers aren’t advised for UK sockets, which have shutters built in.</p>' : '') +
        '<p class="muted" id="sgaOverall">Overall, by the hub’s sums: <span class="sga-rag ' + esc(overallOf(A)) + '" data-overall="' + esc(overallOf(A)) + '">' + WORDS[overallOf(A)] + '</span></p>' : '';
      /* the count and the list are the same items: those marked "must not go ahead"; the draft's own sentences follow, as its reasons */
      var marked = (A.risks || []).filter(function (r) { return r.mustNot; });
      var mustBox = stops ? '<div class="must" id="sgaMustNot"><b>This must not go ahead as described.</b> Change ' + (stops === 1 ? 'this item' : 'these ' + stops + ' items') + ', or take ' + (stops === 1 ? 'it' : 'them') + ' out, before it can be signed off:' +
        '<ul id="sgaMustList">' + marked.map(function (r) { return '<li>' + esc(r.risk) + '</li>'; }).join('') + '</ul>' +
        ((A.source && A.source.mustNot || []).length ? '<p style="margin:8px 0 0" id="sgaMustWhy">What the draft says must not happen:</p><ul>' + A.source.mustNot.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>' : '';
      var qs = ai && (A.source.questions || []).length ? '<div id="sgaQuestions"><label>Questions to answer before sign-off</label><ul class="muted" style="margin:0;padding-left:18px">' + A.source.questions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
      el.innerHTML = head + aiHead + mustBox + (A.status !== 'signed' && !A.waived ? aiBox() : '') + qs + (edit ? '<p class="warn">General words only: never name a child, a family or a medical detail.</p>' : '') + answers +
        '<label>Risks</label>' + risks + (edit ? '<button class="b sec" id="sgaAddRisk" type="button">Add a risk</button>' : '') +
        '<div class="btns">' + (edit ? '<button class="b sec" id="sgaSave">Save</button>' + (A.status === 'draft' ? '<button class="b" id="sgaReady">Ready for sign-off</button>' : '') : '') +
        (o.may.sign && !A.waived && A.status !== 'signed' ? '<button class="b" id="sgaSign">Sign it off</button>' : '') + '<a class="b sec" id="sgaPrint" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="sg-print.html?event=' + encodeURIComponent(o.calEventId) + '">Print / save as PDF</a></div>' +
        (o.may.sign && reds && A.status !== 'signed' ? '<label for="sgaNote">' + reds + ' risk' + (reds === 1 ? ' is' : 's are') + ' still high after the controls: say why it can go ahead</label><textarea id="sgaNote" maxlength="300"></textarea>' : '') +
        notedBox() + '<p class="muted" id="sgaMsg" role="status"></p>' + waiveBox() + '</div>';
      wire();
    }
    /* THE HOST'S OWN REQUIREMENTS (F-277): add their file; check the questions Claude reads from it; confirm */
    function hostBox(edit) {
      var h = A && A.host, signed = A && (A.status === 'signed' || A.waived);
      var file = h && h.file ? '<button class="b sec" type="button" id="sgaHostOpen" style="min-height:32px;padding:0 10px">Open ' + esc(h.file.name) + '</button>' : '';
      if (h && h.confirmed) return '<div class="ai" id="sgaHost"><b>The host’s requirements</b><p class="muted" id="sgaHostDone" style="margin:4px 0">Requirements taken from ' + esc(h.web ? (h.web.pages || []).length + ' of ' + (h.name || 'the host') + '’s web pages' + (h.web.pasted ? ' and pasted text' : '') : h.file ? h.file.name : 'their list') + ', checked by ' + esc(h.checkedByName || '') + ' on ' + esc(String(h.checkedAt || '').slice(0, 10)) + '. ' +
        (h.items || []).length + ' question' + ((h.items || []).length === 1 ? '' : 's') + ' added to the checklist.</p>' + file + (edit && !signed ? ' <button class="b sec" type="button" id="sgaHostAgain" style="min-height:32px;padding:0 10px">Add a new list</button>' + hostForm(true) : '') + '</div>';
      if (h && !h.confirmed && edit) return '<div class="ai" id="sgaHost"><b>From ' + esc(h.name) + '’s requirements</b> <span class="muted">(' + esc(h.file ? h.file.name : '') + ')</span>' +
        '<p class="warn" style="margin:6px 0">Check each one: change it, remove one that repeats our own questions, or add one that was missed. Then confirm, and they are required questions like ours.</p>' +
        (h.personalFound ? '<p class="warn" id="sgaHostPersonal">The file seems to have names, phone numbers or emails in it. They were left out' + (h.dropped ? ' (' + h.dropped + ' question' + (h.dropped === 1 ? '' : 's') + ')' : '') + '.</p>' : '') +
        (h.leftOut > 0 ? '<p class="warn" id="sgaHostSockets">' + (h.leftOut === 1 ? 'One requirement was' : h.leftOut + ' requirements were') + ' left out: socket covers aren’t advised for UK sockets, which have shutters built in. If the host insists on them, talk to the host.</p>' : '') +
        webRead(h) +
        '<div id="sgaHostItems">' + (h.items || []).map(function (x) { return '<div data-hostitem="' + esc(x.id) + '" style="margin:6px 0"><div style="display:flex;gap:6px"><input type="text" data-hostq maxlength="300" value="' + esc(x.q) + '"><button class="b sec" type="button" data-hostdel style="min-height:40px;padding:0 10px">Remove</button></div>' + (x.line ? '<div class="muted">From: “' + esc(x.line) + '”' + (x.source ? ' <span data-hostsource>(' + esc(x.source) + ')</span>' : '') + '</div>' : '') + '</div>'; }).join('') + '</div>' +
        '<div class="btns"><button class="b sec" type="button" id="sgaHostAdd">Add one</button><button class="b" type="button" id="sgaHostOk">Confirm these as required questions</button>' + file +
        '<button class="b sec" type="button" id="sgaHostAgain">Add a different list</button></div><p class="muted" id="sgaHostReviewMsg" role="status"></p>' + hostForm(true) + '</div>';
      if (!edit || signed) return h ? '<div class="ai" id="sgaHost"><b>The host’s requirements</b> <span class="muted">not checked yet</span> ' + file + '</div>' : '';
      return '<div class="ai" id="sgaHost"><b>The host’s or organiser’s own requirements</b>' + hostForm(false) + '</div>';
    }
    /* the pages read from the web (S6): each address, and any that weren't read, with why */
    function webRead(h) {
      if (!h.web) return '';
      return '<div class="muted" id="sgaHostWeb" style="margin:6px 0"><b>Read from ' + (h.web.pages || []).length + ' page' + ((h.web.pages || []).length === 1 ? '' : 's') + (h.web.pasted ? ', and the pasted text' : '') + ':</b><ul style="margin:4px 0;padding-left:18px">' +
        (h.web.pages || []).map(function (p) { return '<li data-webpage>' + esc(p.title || p.url) + ' <span>(' + esc(p.url) + ')</span></li>'; }).join('') + '</ul>' +
        ((h.web.refused || []).length ? '<b>Not read:</b><ul style="margin:4px 0;padding-left:18px">' + h.web.refused.map(function (r) { return '<li data-webrefused>' + esc(r.url) + ': ' + esc(r.why) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }
    function hostForm(hidden) {
      return '<div id="sgaHostForm"' + (hidden ? ' style="display:none"' : '') + '><p class="muted" style="margin:4px 0">If the host sent a list of their requirements (a PDF, a Word document, or a photo or scan of a printed sheet), add it. Claude reads it and turns each requirement into a question for the checklist.</p>' +
        '<p class="warn" id="sgaHostWarn">Don’t add a file with any child’s name, contact details or medical details in it.</p>' +
        '<label for="sgaHostName">The host or organiser</label><input type="text" id="sgaHostName" maxlength="120" placeholder="e.g. Hilltop Christian Camp">' +
        '<label for="sgaHostFile">Their list</label><input type="file" id="sgaHostFile" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*">' +
        /* S6: no single document (Newday has only help pages)? Their web pages, or paste the words */
        '<label for="sgaHostUrls">Or their web pages: up to 5 addresses, one a line</label><textarea id="sgaHostUrls" maxlength="2500" placeholder="https://…"></textarea>' +
        '<p class="muted" style="margin:2px 0 6px">The pages each one links to on the same site are read too (20 pages at most): a help centre’s folder page is enough.</p>' +
        '<label for="sgaHostText">Or paste their requirements</label><textarea id="sgaHostText" maxlength="60000"></textarea>' +
        '<p class="muted">Sent to Anthropic’s Claude to read; the file, or what was read from the pages, is kept with this assessment.</p><div class="btns"><button class="b" type="button" id="sgaHostGo">Read the requirements</button></div><p class="muted" id="sgaHostMsg" role="status"></p></div>';
    }
    function wireHost() {
      var q = function (x) { return el.querySelector(x); };
      if (q('#sgaHostAgain')) q('#sgaHostAgain').onclick = function () { q('#sgaHostForm').style.display = ''; this.remove(); };
      if (q('#sgaHostOpen')) q('#sgaHostOpen').onclick = function () {
        var b = this; b.disabled = true;
        callLong('sgRequirementsFile', { calEventId: o.calEventId }, 60000).then(function (r) {
          b.disabled = false; var bin = atob(r.data), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          global.open(URL.createObjectURL(new Blob([u8], { type: r.type || 'application/octet-stream' })), '_blank', 'noopener');
        }, function (e) { b.disabled = false; alert(plainError(e)); });
      };
      el.querySelectorAll('[data-hostdel]').forEach(function (b) { b.onclick = function () { b.closest('[data-hostitem]').remove(); }; });
      if (q('#sgaHostAdd')) q('#sgaHostAdd').onclick = function () {
        if (el.querySelectorAll('[data-hostitem]').length >= MAX.host) { var hm = q('#sgaHostReviewMsg'); if (hm) hm.textContent = 'The host’s list holds at most ' + MAX.host + ' questions. Join two together, or remove one first.'; return; }
        var d = document.createElement('div'); d.setAttribute('data-hostitem', 'h_new_' + Math.random().toString(36).slice(2, 8)); d.style.margin = '6px 0';
        d.innerHTML = '<div style="display:flex;gap:6px"><input type="text" data-hostq maxlength="300" placeholder="A requirement that was missed"><button class="b sec" type="button" data-hostdel style="min-height:40px;padding:0 10px">Remove</button></div>';
        q('#sgaHostItems').appendChild(d); d.querySelector('[data-hostdel]').onclick = function () { d.remove(); }; d.querySelector('input').focus();
      };
      if (q('#sgaHostOk')) q('#sgaHostOk').onclick = function () {
        var b = this, items = [].slice.call(el.querySelectorAll('[data-hostitem]')).map(function (r) {
          var was = (A.host.items || []).filter(function (x) { return x.id === r.getAttribute('data-hostitem'); })[0] || {};
          return Object.assign({ id: r.getAttribute('data-hostitem'), q: r.querySelector('[data-hostq]').value.trim().slice(0, 300), line: was.line || '' }, was.source ? { source: was.source } : {});
        }).filter(function (x) { return x.q; }).slice(0, MAX.host);
        var host = Object.assign({}, A.host, { items: items, confirmed: true, checkedBy: o.me.uid, checkedByName: String(o.me.name || '').slice(0, 80), checkedAt: now() });
        b.disabled = true;
        ref.update({ host: host, hostIds: items.map(function (x) { return x.id; }), updatedAt: now(), updatedBy: o.me.uid }).then(load, function (e) { b.disabled = false; q('#sgaHostReviewMsg').textContent = 'Not saved: ' + (e.message || e); });
      };
      if (q('#sgaHostGo')) q('#sgaHostGo').onclick = function () {
        var b = this, f = q('#sgaHostFile').files[0], msg = q('#sgaHostMsg');
        var urls = String((q('#sgaHostUrls') || {}).value || '').split(/\s+/).map(function (x) { return x.trim(); }).filter(Boolean), pasted = String((q('#sgaHostText') || {}).value || '').trim();
        if (!f && (urls.length || pasted)) {
          if (urls.length > 5) { msg.textContent = 'Up to 5 addresses at a time. The pages they link to on the same site are read too.'; return; }
          b.disabled = true; msg.textContent = 'Reading the pages… this takes a minute or two.';
          callLong('sgRequirementsFromLinks', { calEventId: o.calEventId, host: q('#sgaHostName').value.trim(), urls: urls, text: pasted }).then(function (r) {
            return load().then(function () { if (r && r.message && el.querySelector('#sgaHostPersonal')) el.querySelector('#sgaHostPersonal').textContent = r.message; });
          }, function (e) { b.disabled = false; msg.setAttribute('data-err', (e && e.code) || ''); msg.textContent = plainError(e); });
          return;
        }
        if (!f) { q('#sgaHostFile').focus(); return; }
        if (f.size > 7 * 1024 * 1024) { msg.textContent = 'The file is too big: 7 MB at most. A photo of each page will do.'; return; }
        b.disabled = true; msg.textContent = 'Reading… this takes about a minute.';
        var rd = new FileReader();
        rd.onload = function () {
          callLong('sgExtractRequirements', { calEventId: o.calEventId, host: q('#sgaHostName').value.trim(), fileName: f.name, contentType: f.type, data: String(rd.result).split(',')[1] || '' }).then(function (r) {
            return load().then(function () { if (r && r.message && el.querySelector('#sgaHostPersonal')) el.querySelector('#sgaHostPersonal').textContent = r.message; });
          }, function (e) { b.disabled = false; msg.setAttribute('data-err', (e && e.code) || ''); msg.textContent = plainError(e); });
        };
        rd.readAsDataURL(f);
      };
    }
    function overallOf(a) { var w = { red: 3, amber: 2, green: 1 }, o = 'green';
      (a.risks || []).forEach(function (r) { var g = T.rating(r.rl, r.ri); if (w[g] > w[o]) o = g; });
      return (a.risks || []).some(function (r) { return r.mustNot; }) ? 'red' : o; }
    function tags(r) {
      return (r.mustNot ? '<span class="tag red" data-mustnot>Must not go ahead as described</span>' : '') +
        (r.from === 'hub' ? '<span class="tag" data-fromhub>From the hub’s numbers</span>' : r.from === 'ai' ? '<span class="tag" data-fromai>AI draft</span>' : '');
    }
    /* "Describe the event, and get a first draft" - for those who write it */
    function aiBox() {
      if (!o.may.edit) return '';
      return '<div class="ai" id="sgaAi"><label for="sgaAiText" style="margin-top:0">Describe the event, and get a first draft</label>' +
        '<p class="warn" id="sgaAiNo">Don’t put in any child’s name, anyone’s contact details or anyone’s medical details. Describe needs in general: “two children need an adult with them at all times”.</p>' +
        '<div id="sgaAiBody"><p class="muted">Checking…</p></div></div>';
    }
    function aiReady(state, message) {
      var box = el.querySelector('#sgaAiBody'); if (!box) return;
      if (state !== 'ready') { box.innerHTML = '<p class="muted" id="sgaAiState" data-state="' + esc(state) + '">' + esc(message || 'Not available for you here.') + '</p>'; return; }
      box.innerHTML = '<textarea id="sgaAiText" maxlength="4000" placeholder="For example: A day trip to the coast for 30 children aged 8–11, by coach; 5 adults; swimming in the sea; lunch on the beach."></textarea>' +
        '<label for="sgaAiU8">How many of the children are under 8? (if you know)</label><input type="number" id="sgaAiU8" min="0" max="999">' +
        '<p class="muted" id="sgaAiWhere">Sent to Anthropic’s Claude to draft; not kept by the hub.' + (A && (A.risks || []).length ? ' The draft replaces the risks written so far.' : '') + '</p>' +
        '<div class="btns"><button class="b" id="sgaAiGo" type="button">Draft it</button></div><p class="muted" id="sgaAiMsg" role="status"></p>';
      var go = box.querySelector('#sgaAiGo');
      var ask = function (confirmed) {
        var text = box.querySelector('#sgaAiText').value.trim(), msg = box.querySelector('#sgaAiMsg');
        if (!text) { box.querySelector('#sgaAiText').focus(); return; }
        go.disabled = true; msg.textContent = 'Drafting… this takes about a minute.';
        callLong('sgDraftAssessment', { calEventId: o.calEventId, text: text, under8: box.querySelector('#sgaAiU8').value, confirmed: !!confirmed }).then(function (res) {
          res = (res && res.data) || res || {};
          if (res.needsConfirm) {
            go.disabled = false; msg.innerHTML = esc(res.message) + ' <button class="b sec" id="sgaAiSure" type="button">It’s in general words: draft it</button>';
            msg.querySelector('#sgaAiSure').onclick = function () { ask(true); };
            return;
          }
          return load();
        }, function (e) { go.disabled = false; msg.setAttribute('data-err', (e && e.code) || ''); msg.textContent = plainError(e); });
      };
      go.onclick = function () { ask(false); };
    }
    function aiStatus() {
      if (!el.querySelector('#sgaAiBody')) return;
      callLong('sgAiStatus', { calEventId: o.calEventId }, 30000).then(function (r) { r = (r && r.data) || r || {}; aiReady(r.state, r.message); },
        function () { aiReady('unavailable', 'AI drafting can’t be reached just now. Write the assessment from a template instead.'); });
    }
    function waiveBox() {
      if (!o.may.waive || (A && (A.waived || A.status === 'signed'))) return '';
      return '<details style="margin-top:12px"><summary class="muted">Not needed for this event?</summary><label for="sgaWhy">Why not (recorded, with your name)</label><textarea id="sgaWhy" maxlength="300"></textarea>' +
        '<div class="btns"><button class="b sec" id="sgaWaive">It isn’t needed</button></div></details>';
    }
    function say(t) { var m = el.querySelector('#sgaMsg'); if (m) m.textContent = t; }
    /* STILL TO DO (Derby's steps 4 and 5): what, who and by when, for each risk */
    function todoView(r) {
      var td = (r.todo || []).filter(function (t) { return t && t.what; });
      if (!td.length) return '';
      var today = now().slice(0, 10);
      return '<div class="muted" data-todos style="margin-top:4px"><b>Still to do:</b> ' + td.map(function (t) {
        return '<span data-todoline>' + esc(t.what) + ' (' + esc(t.who || 'nobody named') + ', by ' + esc(t.by || 'no date') + ')' + (t.done ? ' – done' : t.by && t.by < today ? ' <span class="sga-rag amber" data-todolate>overdue</span>' : '') + '</span>'; }).join('; ') + '</div>';
    }
    function todoEdit(r, k) {
      var row = function (t) { t = t || {}; return '<div data-todo style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0"><input type="text" data-td="what" maxlength="200" placeholder="Still to do" aria-label="Still to do" value="' + esc(t.what || '') + '" style="flex:2;min-width:160px">' +
        '<input type="text" data-td="who" maxlength="80" placeholder="Who (a person or a role)" aria-label="Who" value="' + esc(t.who || '') + '" style="flex:1;min-width:120px"><input type="date" data-td="by" aria-label="By when" value="' + esc(t.by || '') + '" style="max-width:160px">' +
        '<label style="display:flex;gap:4px;align-items:center;font-weight:400"><input type="checkbox" data-td="done"' + (t.done ? ' checked' : '') + '> Done</label>' +
        (!t.done && t.by && t.by < now().slice(0, 10) ? '<span class="sga-rag amber" data-todolate>overdue</span>' : '') + '</div>'; };
      var td = r.todo || [];
      return '<div data-todolist style="margin-top:6px"><span class="muted">Still to do (up to ' + T.MAX_TODO + ')</span>' + td.map(row).join('') + (td.length < T.MAX_TODO ? '<button class="b sec" type="button" data-todoadd="' + k + '" style="min-height:30px;padding:0 10px">Add something still to do</button>' : '<p class="muted" data-todofull>A risk holds at most ' + T.MAX_TODO + ' things still to do. Join two together, or take one out, to add another.</p>') + '</div>';
    }
    /* TRUSTEES NOTED (S4, Martin's answer 18): after sign-off, for the kinds the church's setting names; it never stops the event */
    function notedBox() {
      if (!A || A.waived || A.status !== 'signed' || !T.needsNoted((o.ev && o.ev.sgKind) || A.templateId, A.flags, NOTEDSET)) return '';
      var n = NOTED && NOTED.version === A.signedVersion ? NOTED : null;
      if (n) return '<p class="muted" id="sgaNoted" data-noted="yes">Trustees noted on ' + esc(String(n.at && n.at.toDate ? n.at.toDate().toISOString() : n.at || '').slice(0, 10)) + ', by ' + esc(n.byName || '') + '.</p>';
      return '<p class="warn" id="sgaNoted" data-noted="no">Waiting for the trustees to note it. It doesn’t stop the event.' + (o.may.note ? ' <button class="b sec" type="button" id="sgaNoteIt" style="min-height:32px;padding:0 10px">The trustees have noted it</button>' : '') + '</p>';
    }
    /* HAS EACH LEADER READ THE HOST'S SAFEGUARDING POLICY (S3, F-280 10.3): one
       tick per leader, with the date, when the event has a host. Amber until
       every leader has. Kept in its own record, not in the assessment. */
    function policyBox(edit) {
      var h = A && A.host, ls = o.leaders || [];
      if (!h || !ls.length) return '';
      var got = ls.filter(function (l) { return READS[l.memberId]; }).length;
      return '<div class="ai" id="sgaPolicy"><b>Has each leader read ' + esc(h.name || 'the host') + '’s safeguarding policy?</b> ' +
        '<span class="sga-rag ' + (got === ls.length ? 'green' : 'amber') + '" data-policycount>' + got + ' of ' + ls.length + '</span>' +
        ls.map(function (l) { var d = READS[l.memberId] || ''; return '<label style="display:flex;gap:8px;font-weight:400;margin:4px 0"><input type="checkbox" data-policyread="' + esc(l.memberId) + '"' + (d ? ' checked' : '') + (edit ? '' : ' disabled') + '> ' + esc(l.name) + (d ? ' <span class="muted">(' + esc(d) + ')</span>' : '') + '</label>'; }).join('') +
        '<p class="muted" id="sgaPolicyMsg" role="status"></p></div>';
    }
    function wirePolicy() {
      el.querySelectorAll('[data-policyread]').forEach(function (b) { b.onchange = function () {
        var mid = b.getAttribute('data-policyread'), next = Object.assign({}, READS);
        if (b.checked) next[mid] = now().slice(0, 10); else delete next[mid];
        reads.set({ siteId: o.siteId, reads: next, updatedAt: now(), updatedBy: o.me.uid }).then(function () { READS = next; /* unsaved answers kept, as the ticks above do */ if (el.querySelector('[data-q]')) A = Object.assign({}, A, read()); draw(); },
          function (e) { b.checked = !b.checked; var m = el.querySelector('#sgaPolicyMsg'); if (m) m.textContent = 'Not saved: ' + (e.message || e); });
      }; });
    }
    /* the church's own denomination's guidance (Safeguarding settings), and NSPCC Learning for everyone */
    function guideLine() {
      var name = String(GUIDE.name || '').trim(), url = /^https:\/\/[^\s"<>]+$/.test(String(GUIDE.url || '')) ? GUIDE.url : '';
      var g = name ? (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(name) + '</a>' : esc(name)) : '';
      return '<p class="muted" id="sgaGuide" style="margin:0 0 6px">' + (g ? 'This church follows ' + g + '. ' : '') + 'Help with any question: <a href="https://learning.nspcc.org.uk/" target="_blank" rel="noopener">NSPCC Learning</a>.</p>';
    }
    function read() {
      var t = T.EVENT_TEMPLATES[A.templateId] || T.EVENT_TEMPLATES.trip, answers = Object.assign({}, A.answers || {}), flags = Object.assign({}, A.flags || {});
      el.querySelectorAll('[data-flag]').forEach(function (f) { if (f.checked) flags[f.getAttribute('data-flag')] = true; else delete flags[f.getAttribute('data-flag')]; });
      if (o.under8 > 0) flags.under8 = true;
      el.querySelectorAll('[data-q]').forEach(function (q) {
        var id = q.getAttribute('data-q'), na = el.querySelector('[data-na="' + id + '"]'), why = el.querySelector('[data-nawhy="' + id + '"]');
        var yn = el.querySelector('[data-yn="' + id + '"]');
        var money = el.querySelector('[data-money="' + id + '"]'), amt = money ? money.value.replace(/[^\d]/g, '').replace(/^0+/, '') : '';
        var naLabel = yn && (questions().filter(function (x) { return x.id === id; })[0] || {}).naLabel;
        var v = yn ? (yn.value === 'N/A' && naLabel ? 'N/A: ' + naLabel
                      : yn.value && yn.value !== 'N/A' && q.value.trim() ? yn.value + ': ' + q.value.trim().slice(0, 490) : '')
          : money ? (q.value.trim() ? (amt ? '£' + amt.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ': ' : '') + q.value.trim().slice(0, 480) : '')
          : na && na.checked ? (why.value.trim() ? 'N/A: ' + why.value.trim().slice(0, 290) : '') : q.value.trim().slice(0, 500);
        if (v) answers[id] = v; else delete answers[id];
      });
      var risks = [].slice.call(el.querySelectorAll('[data-sgarisk]')).map(function (row) {
        var f = function (n) { return row.querySelector('[data-rf="' + n + '"]'); }, was = (A.risks || [])[+row.getAttribute('data-sgarisk')] || {};
        var x = { risk: f('risk').value.trim().slice(0, 200), who: f('who').value.trim().slice(0, 120), l: +f('l').value, i: +f('i').value, rl: +f('rl').value, ri: +f('ri').value,
          controls: f('controls').value.split('\n').map(function (x) { return x.trim().slice(0, 200); }).filter(Boolean).slice(0, MAX.controls).map(function (x) { return { kind: 'text', text: x }; }) };
        if (was.owner) x.owner = was.owner; if (was.review) x.review = was.review; if (was.from) x.from = was.from;
        var td = [].slice.call(row.querySelectorAll('[data-todo]')).map(function (t) { var g = function (n) { return t.querySelector('[data-td="' + n + '"]'); };
          return { what: g('what').value.trim().slice(0, 200), who: g('who').value.trim().slice(0, 80), by: g('by').value || '', done: !!g('done').checked }; }).filter(function (t) { return t.what; }).slice(0, T.MAX_TODO);
        if (td.length) x.todo = td;
        if (was.mustNot && x.risk === was.risk && T.rating(x.rl, x.ri) === 'red') x.mustNot = true;
        return x;
      }).filter(function (r) { return r.risk; }).slice(0, MAX.risks);
      return { answers: answers, flags: flags, risks: risks, templateId: t === T.EVENT_TEMPLATES[A.templateId] ? A.templateId : 'trip' };
    }
    /* any change after signing goes back to "waiting", and bookings close again */
    function save(status) {
      /* a risk with more controls than one can hold: said, not cut silently */
      var many = [].some.call(el.querySelectorAll('[data-rf="controls"]'), function (t) { return t.value.split('\n').filter(function (x) { return x.trim(); }).length > MAX.controls; });
      if (many) { say('A risk holds at most ' + MAX.controls + ' controls. Join some together, then save.'); return Promise.resolve(); }
      var r = read(), wasSigned = A.status === 'signed';
      var next = stamp(Object.assign({}, A, r, { status: status || (wasSigned ? 'waiting' : A.status), version: (A.version || 1) + (wasSigned ? 1 : 0) }));
      /* an AI draft saved by a person: "First draft by AI: checked by <name> on <date>" */
      if (A.source && A.source.kind === 'ai' && !A.source.checkedBy) next.source = Object.assign({}, A.source, { checkedBy: o.me.uid, checkedByName: String(o.me.name || '').slice(0, 80), checkedAt: now() });
      var b = db.batch(); b.set(ref, next); if (wasSigned) b.set(gate, { needed: true, open: false, updatedAt: now() });
      return b.commit().then(function () { A = next; say(wasSigned ? 'Saved. It needs signing off again before more bookings.' : 'Saved.'); draw(); }, function (e) { say('Not saved: ' + (e.message || e)); });
    }
    function wire() {
      var q = function (s) { return el.querySelector(s); };
      aiStatus(); wireHost(); wirePolicy();
      if (q('#sgaStart')) q('#sgaStart').onclick = function () {
        var id = q('#sgaTpl').value, t = T.EVENT_TEMPLATES[id];
        var d = stamp({ siteId: o.siteId, calEventId: o.calEventId, title: String((o.ev && o.ev.title) || '').slice(0, 120), templateId: id, answers: {},
          risks: t.risks.map(function (r) { return { risk: r.risk, who: r.who, l: r.l, i: r.i, rl: r.rl, ri: r.ri, controls: r.controls }; }), status: 'draft', version: 1 });
        var b = db.batch(); b.set(ref, d); b.set(gate, { needed: true, open: false, updatedAt: now() });
        b.commit().then(function () { A = d; draw(); }, function (e) { el.insertAdjacentHTML('beforeend', '<p class="muted">Could not start it: ' + esc(e.message || e) + '</p>'); });
      };
      el.querySelectorAll('[data-flag]').forEach(function (f) { f.onchange = function () { A = Object.assign({}, A, read()); draw(); }; });
      el.querySelectorAll('[data-yn]').forEach(function (s) { s.onchange = function () { var t = q('[data-q="' + s.getAttribute('data-yn') + '"]'); if (t) t.style.display = s.value === 'N/A' ? 'none' : ''; }; });
      el.querySelectorAll('[data-na]').forEach(function (b) { b.onchange = function () { var id = b.getAttribute('data-na'); q('[data-nawhy="' + id + '"]').style.display = b.checked ? '' : 'none'; q('[data-q="' + id + '"]').disabled = b.checked; if (b.checked) q('[data-nawhy="' + id + '"]').focus(); }; });
      el.querySelectorAll('[data-use]').forEach(function (b) { b.onclick = function () { var id = b.getAttribute('data-use'); q('[data-q="' + id + '"]').value = ((A.source || {}).suggest || {})[id] || ''; b.parentNode.remove(); }; });
      el.querySelectorAll('[data-todoadd]').forEach(function (b) { b.onclick = function () { var r = read(), k = +b.getAttribute('data-todoadd'); A = Object.assign({}, A, r); var rk = A.risks[k]; if (rk) { rk.todo = (rk.todo || []).concat([{ what: '', who: '', by: '', done: false }]).slice(0, T.MAX_TODO); } draw(); }; });
      if (q('#sgaNoteIt')) q('#sgaNoteIt').onclick = function () {
        notedRef.set({ siteId: o.siteId, version: A.signedVersion, by: o.me.uid, byName: String(o.me.name || '').slice(0, 80), at: firebase.firestore.FieldValue.serverTimestamp() })
          .then(load, function (e) { say('Not saved: ' + (e.message || e)); });
      };
      if (q('#sgaAddRisk')) q('#sgaAddRisk').onclick = function () { var r = read(); A = Object.assign({}, A, r);
        if (A.risks.length >= MAX.risks) { draw(); say('An assessment holds at most ' + MAX.risks + ' risks. Join two together, or take one out first.'); return; }
        A.risks.push({ risk: 'A new risk', who: '', l: 3, i: 3, rl: 2, ri: 3, controls: [] }); draw(); };
      if (q('#sgaSave')) q('#sgaSave').onclick = function () { save(); };
      if (q('#sgaReady')) q('#sgaReady').onclick = function () { save('waiting'); };
      if (q('#sgaSign')) q('#sgaSign').onclick = function () {
        var r = o.may.edit ? read() : { answers: A.answers, flags: A.flags || {}, risks: A.risks, templateId: A.templateId };
        if (A.host && !A.host.confirmed) { say('Check the host’s requirements and confirm them first.'); return; }
        var miss = T.checklistFor((o.ev && o.ev.sgKind) || r.templateId, r.flags || {}, CHURCHQ.concat(T.hostQuestions(A))).filter(function (x) { return !T.answered((r.answers || {})[x.id]); });
        if (miss.length) { say('Answer ' + (miss.length === 1 ? 'this' : 'these ' + miss.length) + ' first, or mark ' + (miss.length === 1 ? 'it' : 'them') + ' not applicable with a reason: ' + miss.map(function (x) { return x.label.split(/[:?]/)[0]; }).join('; ') + '.');
          el.querySelectorAll('[data-ck]').forEach(function (c) { c.toggleAttribute('data-ckmiss', miss.some(function (x) { return x.id === c.getAttribute('data-ck'); })); }); return; }
        var reds = r.risks.filter(function (x) { return T.rating(x.rl, x.ri) === 'red'; }).length, note = (q('#sgaNote') ? q('#sgaNote').value.trim() : '').slice(0, 300);
        if (r.risks.some(function (x) { return x.mustNot; })) { say('A “must not go ahead” item is still there: change it or take it out first.'); return; }
        /* STILL TO DO (Martin, answer 17): open actions may stay, each with a person and a date - but not on a risk still High after its controls */
        var tds = T.todoState(r.risks);
        if (tds.unready) { say('Give each open “still to do” a person and a date first (' + tds.unready + ' without).'); return; }
        if (tds.redOpen) { say('A risk still High after its controls has something still to do: finish it, or bring the risk down, first.'); return; }
        if (reds && !note) { say('Say why it can go ahead with a high risk left, or change it first.'); return; }
        var v = (A.version || 1);
        var next = stamp(Object.assign({}, A, r, { status: 'signed', version: v, signedBy: o.me.uid, signedByName: String(o.me.name || '').slice(0, 80),
          signedAt: firebase.firestore.FieldValue.serverTimestamp(), signedVersion: v, signedNote: note, signedByRole: String(o.me.role || 'Safeguarding lead').slice(0, 60) }));
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
  var api = { mount: mount, plainError: plainError, DRAFT_WAIT: DRAFT_WAIT, MAX: MAX };
  global.EGBCSgAssess = api;
})(window);
