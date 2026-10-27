/* ===================================================================
   THE AI FIRST DRAFT, on the page (H&S step 7; F-280 section 5)
   ===================================================================
   Shared by a building's assessment (assessment.html) and an event's
   (event-ra.html). The raDraftAssessment function returns a draft; this
   puts it into the form, unsaved, labelled "First draft by AI: check every
   line". The AI's answers to the required questions are suggestions, each
   with "Use it"; they never count as answers by themselves. Saving is the
   person's check: it records who checked it, and when.

     box(state)                 the card: state from raAiStatus
     merge(A, res, o)           the draft into the form (o: { targets, today })
     label(A, longDate)         "First draft by AI ..." for the page
     suggestion(A, id)          the suggestion under a question
     checked(A, name, today)    on save: who checked it
   =================================================================== */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function newId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function box(state, what) {
    var ready = state && state.state === 'ready';
    return '<div class="card" id="draftCard"><h2>Describe ' + esc(what) + ', and get a first draft</h2>' +
      '<p class="banner gold" id="draftNo" style="margin:0 0 8px">Don’t put in anyone’s name, contact details or medical details. Use roles and general words: “the fire safety lead”, “two people use wheelchairs”.</p>' +
      (ready ? '<textarea id="draftText" rows="3" maxlength="4000" placeholder="For example: a Victorian church with a tower and bells, a kitchen, candles at most services, about 120 on a Sunday"></textarea>' +
        '<div class="row"><button class="btn sec" type="button" id="draftGo">Get a first draft</button><span class="hint" id="draftMsg" role="status"></span></div>' +
        '<p class="hint" style="margin:6px 0 0">The hub sends what it already knows: the rooms’ fire maximums, the checks and their colours, and counts, never names. The AI suggests; the hub does the sums; you check every line.</p>'
        : '<p class="hint" id="draftState" data-state="' + esc((state && state.state) || 'checking') + '">' + esc((state && state.message) || (state ? 'Not available for you here.' : 'Checking…')) + '</p>') + '</div>';
  }
  function merge(A, res, o) {
    (res.hazards || []).forEach(function (h) {
      A.hazards.push({ id: newId('h'), source: 'ai', hazard: h.hazard, who: h.who, l: h.l, s: h.s, rl: h.rl, rs: h.rs, checks: [], owner: '', written: (h.controls || []).join('. ') });
    });
    (res.actions || []).forEach(function (a) {
      A.actions.push({ id: newId('a'), source: a.from === 'hub' ? 'hub' : 'ai', what: a.what, priority: a.priority, due: global.EGBCHsTemplates.actionDue(a.priority, o.today, o.targets), owner: '', done: false, jobId: '' });
    });
    A.suggested = Object.assign({}, A.suggested || {}, res.answers || {});
    A.ai = { at: res.at, by: o.by || '', mustNot: (res.mustNot || []).slice(0, 20), checkedBy: '', checkedOn: '' };
  }
  function label(A, longDate) {
    if (!A.ai) return '';
    var must = (A.ai.mustNot || []).length ? '<div class="banner red" id="aiMust" style="margin-top:8px">The AI says these must not go ahead as described: ' + esc(A.ai.mustNot.join('; ')) + '. Check them.</div>' : '';
    return '<p class="' + (A.ai.checkedBy ? 'hint' : 'banner gold') + '" id="aiLabel">' + (A.ai.checkedBy ? 'First draft by AI, checked by ' + esc(A.ai.checkedBy) + ' on ' + esc(longDate(A.ai.checkedOn)) + '.'
      : '<b>First draft by AI: check every line.</b> Nothing is saved until you save it; saving says you have checked it.') + '</p>' + must;
  }
  function suggestion(A, id, editing) {
    var s = (A.suggested || {})[id];
    if (!s || String((A.answers || {})[id] || '').trim()) return '';
    return '<div class="hint" data-suggest="' + esc(id) + '">Suggested by the AI, to confirm: “' + esc(s) + '”' + (editing ? ' <button class="btn sec" type="button" data-use="' + esc(id) + '" style="min-height:32px;padding:0 10px">Use it</button>' : '') + '</div>';
  }
  function checked(A, name, today) { if (A.ai && !A.ai.checkedBy) { A.ai.checkedBy = String(name || '').slice(0, 120) || 'someone'; A.ai.checkedOn = today; } }

  global.EGBCRaDraft = { box: box, merge: merge, label: label, suggestion: suggestion, checked: checked };
})(typeof window !== 'undefined' ? window : this);
