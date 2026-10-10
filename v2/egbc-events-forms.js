/* ===================================================================
   EGBC — forms and consent, the shared part (events window, Chunk 3 E2)
   ===================================================================

   forms-admin.html builds forms and sends them; form.html is where a
   parent, leader or hirer fills one in from a link, without logging in.
   Both need the same answers to: what the templates are, which answers
   are medical, how long an answer lasts, and what the emails say.

   FOUR THINGS WORTH KNOWING BEFORE CHANGING ANY OF IT

   1. MEDICAL ANSWERS ARE SPLIT OFF ON THE WAY IN. A field counts as
      medical when the form marks it so, or its wording matches the same
      keyword list the downloads use (EGBCCheckin.isMedical - Martin's
      rule, E1). Those answers go to sensitiveResponses, which ordinary
      admins cannot list; everything else goes to formResponses. split()
      below is the only thing that decides, so there is one answer.

   2. A REQUEST'S DOCUMENT ID IS THE LINK. 32 random characters, like a
      sign-up's manage key. The parent's link is form.html?k=<key>.

   3. THE SENSITIVE PART HAS ITS OWN SECRET. Its document id is a second
      random key made in the parent's browser when they send the form, and
      it is never written anywhere an ordinary admin can read. It goes to
      the parent in their "your form is in" email, so they can see what is
      held about them - and nobody else can open it by guessing or listing.

   4. REUSE IS DECIDED BY AN ADMIN'S PAGE, NOT THE PUBLIC ONE. The public
      page cannot list anyone's earlier answers. When forms are sent for an
      event, forms-admin.html looks for a still-valid answer to the same
      form, from the same email, covering the same people, and if there is
      one the parent is asked "still correct?" instead of filling it again.
   =================================================================== */

(function (global) {
  'use strict';

  var TYPES = [
    ['text', 'Short answer'], ['longtext', 'Longer answer'], ['choice', 'A choice'],
    ['yesno', 'Yes or no'], ['date', 'A date'], ['number', 'A number'],
    ['file', 'A file (PDF or picture)'], ['signature', 'Signature (typed name and tick)'],
    ['repeat', 'A section for each child']
  ];

  /* ---- what is medical ---- */
  function isSensitive(f) {
    if (!f) return false;
    if (f.sensitive) return true;
    return !!(global.EGBCCheckin && global.EGBCCheckin.isMedical({ id: f.id, label: f.label }, {}));
  }

  /* Answers in, two halves out. A section for each child is split row by
     row, so row 2's allergies sit beside row 2 of the ordinary answers. */
  function split(form, answers) {
    var plain = {}, sens = {}, any = false;
    (form.fields || []).forEach(function (f) {
      var v = answers[f.id];
      if (v === undefined) return;
      if (f.type === 'repeat') {
        var rowsP = [], rowsS = [], has = false;
        (v || []).forEach(function (row) {
          var p = {}, s = {};
          (f.fields || []).forEach(function (sf) {
            if (row[sf.id] === undefined) return;
            if (isSensitive(sf)) { s[sf.id] = row[sf.id]; has = true; } else p[sf.id] = row[sf.id];
          });
          rowsP.push(p); rowsS.push(s);
        });
        plain[f.id] = rowsP;
        if (has) { sens[f.id] = rowsS; any = true; }
      } else if (isSensitive(f)) { sens[f.id] = v; any = true; }
      else plain[f.id] = v;
    });
    return { plain: plain, sensitive: sens, hasSensitive: any };
  }

  /* The opposite, for showing a parent everything they sent. */
  function merge(form, plain, sens) {
    var out = JSON.parse(JSON.stringify(plain || {}));
    sens = sens || {};
    (form.fields || []).forEach(function (f) {
      if (sens[f.id] === undefined) return;
      if (f.type === 'repeat') {
        out[f.id] = (out[f.id] || []).map(function (row, i) { return Object.assign({}, row, (sens[f.id] || [])[i] || {}); });
      } else out[f.id] = sens[f.id];
    });
    return out;
  }

  /* ---- how long an answer lasts ---- */
  function iso(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* validity.mode: 'event' (this event only), 'days' (N days), 'months' (N
     calendar months from when it is given: Martin's default, 12, for every
     template), 'schoolyear' (to the next 31 August). Returns YYYY-MM-DD. */
  function validUntil(form, eventStartLocal, now) {
    now = now || new Date();
    var v = form.validity || { mode: 'event' };
    if (v.mode === 'days') return iso(new Date(now.getTime() + (parseInt(v.days, 10) || 365) * 864e5));
    if (v.mode === 'months') {
      var m = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
      m.setMonth(m.getMonth() + (parseInt(v.months, 10) || 12));
      return iso(m);
    }
    if (v.mode === 'schoolyear') {
      var end = new Date(now.getFullYear(), 7, 31);
      if (now > new Date(now.getFullYear(), 7, 31, 23, 59)) end = new Date(now.getFullYear() + 1, 7, 31);
      return iso(end);
    }
    var ev = eventStartLocal ? new Date(String(eventStartLocal).slice(0, 10) + 'T12:00') : now;
    return iso(isNaN(ev) ? now : ev);
  }

  function deleteAfter(form, until) {
    var d = new Date(until + 'T12:00');
    d.setMonth(d.getMonth() + (parseInt(form.retentionMonths, 10) || 12));
    return iso(d);
  }

  function validityText(form) {
    var v = form.validity || { mode: 'event' };
    if (v.mode === 'days') return 'Lasts ' + (v.days || 365) + ' days';
    if (v.mode === 'months') return 'Lasts ' + (v.months || 12) + ' months from when it is given';
    if (v.mode === 'schoolyear') return 'Lasts to the end of the school year (31 August)';
    return 'For one event only';
  }

  /* ---- reuse ----
     A still-valid answer from the same email, to the same form, that
     covers every person on this booking. Newest first. */
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function findReusable(responses, o) {
    var need = (o.subjects || []).map(norm).filter(Boolean);
    var day = String(o.onDate || iso(new Date())).slice(0, 10);
    return (responses || []).filter(function (r) {
      if (r.formId !== o.formId || norm(r.email) !== norm(o.email)) return false;
      if (!r.validUntil || r.validUntil < day) return false;
      var have = (r.subjects || []).map(norm);
      return need.every(function (n) { return have.indexOf(n) >= 0; });
    }).sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); })[0] || null;
  }

  /* ---- links and emails ---- */
  function base() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  function formUrl(key, secret) { return base() + 'form.html?k=' + key + (secret ? '&s=' + secret : ''); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function button(href, text) {
    return '<p><a href="' + href + '" style="display:inline-block;background:#3d6263;color:#fff;text-decoration:none;' +
      'padding:10px 16px;border-radius:8px;font:500 14px Inter,Arial,sans-serif">' + text + '</a></p>';
  }

  function requestEmail(req, reminder) {
    var reuse = req.status === 'reuse';
    var what = esc(req.formTitle) + (req.eventTitle ? ' for <strong>' + esc(req.eventTitle) + '</strong>' : '');
    var body = '<p>Hello ' + esc(req.name) + ',</p>' +
      (reuse
        ? '<p>We already have your ' + what + ' on file. Please check it is still correct - it takes a moment.</p>'
        : '<p>Please fill in the ' + what + (req.subjects && req.subjects.length ? ', for ' + esc(req.subjects.join(', ')) : '') + '.</p>') +
      button(formUrl(req.key), reuse ? 'Check it is still correct' : 'Fill in the form') +
      '<p style="color:#6b7280;font-size:13px">This link is just for you. You do not need an account.</p>';
    var title = (reminder ? 'Reminder: ' : '') + (reuse ? 'Is this still correct?' : 'A form to fill in');
    return {
      to: [req.email],
      subject: (reminder ? 'Reminder: ' : '') + req.formTitle + (req.eventTitle ? ' - ' + req.eventTitle : ''),
      html: EGBCChurch.wrap(title, body),
      log: req.calEventId ? { calEventId: req.calEventId, kind: reminder ? 'form reminder' : 'form request' } : null
    };
  }

  function doneEmail(req, secret, reused) {
    var body = '<p>Thank you' + (req.name ? ', ' + esc(req.name) : '') + '. ' +
      (reused ? 'You told us your ' + esc(req.formTitle) + ' is still correct.' : 'Your ' + esc(req.formTitle) + ' is in.') + '</p>' +
      button(formUrl(req.key, secret), 'See what you sent') +
      '<p style="color:#6b7280;font-size:13px">Keep this email: the link shows everything we hold from this form, ' +
      'including any medical details, and only you have it.</p>';
    return { to: [req.email], subject: 'Received: ' + req.formTitle, html: EGBCChurch.wrap('Form received', body) };
  }

  /* ---- templates ----
     EGBC supplies the real wording and the policy behind it; these are the
     shapes, with plain placeholder wording (FINDINGS-events.md F-036). */
  function f(id, type, label, extra) { return Object.assign({ id: id, type: type, label: label, required: false }, extra || {}); }
  var YEARS = ['Pre-school', 'Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6',
               'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13'];

  function childSection(extra) {
    return f('children', 'repeat', 'Each child', { required: true, fields: [
      f('name', 'text', 'Child\'s full name', { required: true }),
      f('dob', 'date', 'Date of birth', { required: true }),
      f('year', 'choice', 'School year', { options: YEARS }),
      f('medical', 'longtext', 'Medical conditions', { sensitive: true, help: 'Write "none" if there are none.' }),
      f('medication', 'longtext', 'Medication they take or may need', { sensitive: true }),
      f('allergies', 'longtext', 'Allergies', { sensitive: true, help: 'Write "none" if there are none.' }),
      f('dietary', 'text', 'Dietary needs'),
      f('needs', 'longtext', 'Additional needs we should know about', { sensitive: true }),
      f('photo', 'yesno', 'May we take photos or video that include them?', { required: true }),
      f('firstaid', 'yesno', 'May a trained leader give first aid?', { required: true })
    ].concat(extra || []) });
  }
  var PARENT = [
    f('parentName', 'text', 'Your name (parent or guardian)', { required: true }),
    f('parentPhone', 'text', 'Your phone number', { required: true }),
    /* Martin, N-6c: a second parent or carer can be called to collect too. */
    f('parentEmail2', 'text', 'A second parent or carer\'s email (optional)', { help: 'So a leader can call them to collect on their phone as well. They sign in to the hub with this email.' }),
    f('emergency', 'longtext', 'Emergency contacts: two names and phone numbers, not including you', { required: true }),
    f('collectors', 'text', 'Who may collect your children? (names, separated by commas)', { required: true,
      help: 'Leaders will only hand your child to someone on this list.' })
  ];

  var TEMPLATES = [
    { id: 'parent', title: 'Parent or guardian consent', kind: 'consent',
      purpose: 'We need this to keep your child safe while they are with us: who to call, who may collect them, and anything leaders must know about their health.',
      validity: { mode: 'months', months: 12 }, retentionMonths: 12,
      fields: [childSection([f('alone', 'yesno', 'Older youth: may they leave on their own at the end?')])].concat(PARENT)
        .concat([f('sign', 'signature', 'I am the parent or guardian, and what I have written is correct', { required: true })]) },
    { id: 'trip', title: 'Trip or residential consent', kind: 'trip',
      purpose: 'We need this to look after your child safely away from church, including travel and any overnight stay.',
      validity: { mode: 'months', months: 12 }, retentionMonths: 12,
      fields: [childSection()].concat(PARENT).concat([
        f('travel', 'yesno', 'May they travel in transport arranged by the church?', { required: true }),
        f('overnight', 'yesno', 'May they stay overnight?'),
        f('activities', 'yesno', 'May they take part in all the activities described?', { required: true }),
        f('sign', 'signature', 'I am the parent or guardian, and what I have written is correct', { required: true })]) },
    { id: 'leader', title: 'Leader or volunteer declaration', kind: 'leader',
      purpose: 'We need this to show every leader working with children or vulnerable adults has the checks and training our policy asks for.',
      validity: { mode: 'months', months: 12 }, retentionMonths: 12,
      fields: [
        f('policy', 'yesno', 'I have read the safeguarding policy', { required: true }),
        f('dbs', 'choice', 'DBS check', { required: true, options: ['Current', 'Applied for', 'None yet'],
          help: 'We record the status and the date only. Do not write the certificate number.' }),
        f('dbsDate', 'date', 'Date the DBS check was seen'),
        f('training', 'yesno', 'I have done safeguarding training', { required: true }),
        f('trainingDate', 'date', 'Date of the training'),
        f('sign', 'signature', 'What I have written is correct', { required: true })] },
    { id: 'hirer', title: 'Hirer safeguarding', kind: 'hirer',
      purpose: 'We need this before a group that works with children or vulnerable adults uses our building.',
      validity: { mode: 'months', months: 12 }, retentionMonths: 12,
      fields: [
        f('org', 'text', 'Name of your group', { required: true }),
        f('children', 'yesno', 'Does your group work with children or vulnerable adults?', { required: true }),
        f('contact', 'text', 'Your safeguarding contact: name, phone and email', { required: true }),
        f('policyFile', 'file', 'Your safeguarding policy (PDF or picture)'),
        f('sign', 'signature', 'I am authorised to sign for the group, and this is correct', { required: true })] },
    { id: 'health', title: 'Health and access needs', kind: 'health',
      purpose: 'We ask so we can make the event safe and welcoming for you. Leave anything blank that does not apply.',
      validity: { mode: 'months', months: 12 }, retentionMonths: 6,
      fields: [
        f('health', 'longtext', 'Anything about your health we should know', { sensitive: true }),
        f('access', 'longtext', 'Access needs (step-free, hearing loop, seating)', { sensitive: true }),
        f('sign', 'signature', 'What I have written is correct', { required: true })] }
  ];

  /* A new form from a template. `settings` is the church's Safeguarding
     settings (safeguardingSettings/defaults): where it names a period for
     this template, that wins over the one written here. */
  function fromTemplate(id, settings) {
    var t = TEMPLATES.filter(function (x) { return x.id === id; })[0];
    if (!t) return null;
    var c = JSON.parse(JSON.stringify(t));
    delete c.id;
    c.template = id;
    var d = settings && settings.templates && settings.templates[id];
    if (d) {
      if (d.validity && d.validity.mode) c.validity = JSON.parse(JSON.stringify(d.validity));
      if (d.retentionMonths) c.retentionMonths = d.retentionMonths;
    }
    return c;
  }

  /* The periods a template has when nobody has changed them. */
  function templateDefaults(id) {
    var t = TEMPLATES.filter(function (x) { return x.id === id; })[0];
    return t ? { validity: JSON.parse(JSON.stringify(t.validity)), retentionMonths: t.retentionMonths } : null;
  }

  /* An answer as words, for screens and downloads. */
  /* UK dates on screen (Thu 1 Mar 2018); stored as YYYY-MM-DD. */
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function ukDate(s) {
    var d = new Date(String(s).slice(0, 10) + 'T12:00');
    return isNaN(d) ? String(s) : DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function show(field, v) {
    if (v == null || v === '') return '';
    if (field.type === 'signature') return v.name ? v.name + (v.agreed ? ' (agreed)' : '') + (v.at ? ', ' + ukDate(v.at) : '') : '';
    if (field.type === 'date') return ukDate(v);
    if (field.type === 'file') return v.name || '';
    if (field.type === 'yesno') return v === true || v === 'Yes' ? 'Yes' : v === false || v === 'No' ? 'No' : String(v);
    return String(v);
  }

  var api = {
    TYPES: TYPES, TEMPLATES: TEMPLATES, fromTemplate: fromTemplate, templateDefaults: templateDefaults,
    isSensitive: isSensitive, split: split, merge: merge,
    validUntil: validUntil, deleteAfter: deleteAfter, validityText: validityText,
    findReusable: findReusable, formUrl: formUrl, requestEmail: requestEmail, doneEmail: doneEmail,
    show: show, iso: iso
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCForms = api;

})(typeof window !== 'undefined' ? window : this);
