/* ===================================================================
   EGBC — label sizes (F-185)
   ===================================================================

   ONE LABEL SIZE FOR THE WHOLE CHURCH: the children's labels at Sunday
   check-in and the name labels at an event print on the same labels, so
   the same printer and the same roll do both. Chosen once, in
   labelSettings/main.format, by an admin (Kids Church settings, or an
   event's check-in settings). ChurchSuite's own default is the Brother
   small roll, 62 x 29 mm.

     EGBCLabels.FORMATS          id -> { name, w, h (mm), roll | sheet }
     EGBCLabels.load()           -> Promise of the church's format id
     EGBCLabels.save(id)         -> Promise (admins)
     EGBCLabels.apply(id)        puts the print sizes on the page
     EGBCLabels.selectHtml(id)   the choice, for a settings card

   A label is any element with class "lbl"; inside it, ".lbl-big" is the
   name and ".lbl-small" the rest. On screen they look as they always did;
   only printing changes. Plain paper (the default until a church chooses)
   prints them as they are on screen, as before.
   =================================================================== */

(function (global) {
  'use strict';

  var FORMATS = {
    paper:         { name: 'Plain paper: as many as fit on a page', w: 0, h: 0 },
    brother62x29:  { name: 'Brother small roll, 62 × 29 mm', w: 62, h: 29, roll: true },
    brother62x100: { name: 'Brother large roll, 62 × 100 mm', w: 62, h: 100, roll: true },
    dymo89x36:     { name: 'Dymo roll, 89 × 36 mm', w: 89, h: 36, roll: true },
    a4x21:         { name: 'A4 sheet of 21, 63.5 × 38.1 mm', w: 63.5, h: 38.1, sheet: true, cols: 3, top: 15.15, side: 7.25, gapX: 2.5, gapY: 0 },
    a4x8:          { name: 'A4 sheet of 8, 99.1 × 67.7 mm', w: 99.1, h: 67.7, sheet: true, cols: 2, top: 13, side: 4.65, gapX: 2.5, gapY: 0 }
  };
  var DEFAULT = 'paper';

  function db() { return global.EGBCAuth && EGBCAuth.db; }

  function load() {
    var d = db(); if (!d) return Promise.resolve(DEFAULT);
    return d.collection('labelSettings').doc('main').get().then(function (s) {
      var f = s.exists ? s.data().format : '';
      return FORMATS[f] ? f : DEFAULT;
    }, function () { return DEFAULT; });
  }

  function save(id) {
    if (!FORMATS[id]) return Promise.reject(new Error('Not a label size'));
    var u = (global.EGBCAuth && EGBCAuth.user && EGBCAuth.user()) || {};
    return db().collection('labelSettings').doc('main').set({ format: id, updatedAt: global.firebase.firestore.FieldValue.serverTimestamp(), updatedBy: u.uid || '' });
  }

  /* The print rules for one size. Text is sized from the label's height, so
     a name fills a small label and does not shout on a large one. */
  function css(id) {
    var f = FORMATS[id]; if (!f || !f.w) return '';
    var big = Math.min(9, Math.max(4.2, f.h * 0.2)), small = Math.min(4, Math.max(2.4, f.h * 0.095));
    var label = '.lbl{width:' + f.w + 'mm!important;height:' + f.h + 'mm!important;box-sizing:border-box!important;overflow:hidden!important;' +
      'margin:0!important;border:none!important;border-radius:0!important;padding:2mm 3mm!important;break-inside:avoid;page-break-inside:avoid}' +
      '.lbl .lbl-big{font-size:' + big.toFixed(1) + 'mm!important;line-height:1.1!important}' +
      '.lbl .lbl-small{font-size:' + small.toFixed(1) + 'mm!important;line-height:1.2!important}' +
      (f.h < 60 ? '.lbl .lbl-tall{display:none!important}' : '');
    if (f.roll) {
      return '@page{size:' + f.w + 'mm ' + f.h + 'mm;margin:0}' + label +
        '.lbl-sheet{display:block!important;gap:0!important}.lbl{page-break-after:always;break-after:page}';
    }
    return '@page{size:A4;margin:' + f.top + 'mm ' + f.side + 'mm}' + label +
      '.lbl-sheet{display:grid!important;grid-template-columns:repeat(' + f.cols + ',' + f.w + 'mm)!important;column-gap:' + f.gapX + 'mm!important;row-gap:' + f.gapY + 'mm!important}';
  }

  function apply(id) {
    var doc = global.document, el = doc.getElementById('egbc-label-print');
    if (!el) { el = doc.createElement('style'); el.id = 'egbc-label-print'; doc.head.appendChild(el); }
    el.textContent = '@media print{' + css(id) + '}';
    doc.documentElement.setAttribute('data-label-format', id);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function selectHtml(id, elId) {
    return '<select id="' + esc(elId || 'labelFormat') + '">' + Object.keys(FORMATS).map(function (k) {
      return '<option value="' + k + '"' + (k === id ? ' selected' : '') + '>' + esc(FORMATS[k].name) + '</option>';
    }).join('') + '</select>';
  }

  global.EGBCLabels = { FORMATS: FORMATS, DEFAULT: DEFAULT, load: load, save: save, css: css, apply: apply, selectHtml: selectHtml };
})(window);
