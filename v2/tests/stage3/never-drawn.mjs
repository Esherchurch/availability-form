/* CONTROLS A PAGE NEVER DRAWS, PROVED FROM ITS CODE (the going-live test, Stage 3; 5 Nov 2026).
 *
 * tests/stage3/drawn-on.mjs proves a shared script's control is not on a page when nothing on the page
 * can call the function that draws it. These are the ones it cannot prove that way: the page does call
 * the drawing function, but with options under which the control is never drawn (the safeguarding
 * assessment opened read-only on the risk register), or the control is hidden on load and nothing shows
 * it again. Each proof names the lines it rests on, and is checked against them each time the list is
 * made: `holds` must still be found in its file, and `never` must not be - if the code changes, the
 * proof fails loudly instead of standing quietly (controls-stage3.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SGA = 'egbc-sg-assess.js';
/* drawn by the editor only when its options allow (egbc-sg-assess.js mount(el, o)) */
const EDIT_ONLY = ['id:sgaTpl', 'id:sgaStart', 'text:Use this', 'id:sgaQ_', 'id:sgaAddRisk', 'id:sgaSave', 'id:sgaReady', 'id:sgaHostAgain', 'text:Remove',
  'id:sgaHostAdd', 'id:sgaHostOk', 'id:sgaHostNext', 'id:sgaHostName', 'id:sgaHostFile', 'id:sgaHostUrls', 'id:sgaHostText', 'id:sgaHostGo',
  'id:sgaAiText', 'id:sgaAiU8', 'id:sgaAiGo', 'id:sgaAiSure', 'text:Add something still to do'];

export const PROOFS = [
  { page: 'safeguarding-risk.html', file: SGA, keys: EDIT_ONLY,
    reason: 'the register opens an assessment to read only - mount(..., { may: { edit: false, sign: false, waive: false } }) (safeguarding-risk.html) - and the editor draws this only when o.may.edit (egbc-sg-assess.js draw(): "o.may.edit ?", "var edit = o.may.edit", hostBox(edit), aiBox: "if (!o.may.edit) return \'\'", todoEdit only in the edit branch)',
    holds: [['safeguarding-risk.html', /may: \{ edit: false, sign: false, waive: false/], [SGA, /if \(!o\.may\.edit\) return ''/], [SGA, /var edit = o\.may\.edit && !A\.waived/]] },
  { page: 'safeguarding-risk.html', file: SGA, keys: ['id:sgaSign', 'id:sgaNote'],
    reason: 'the register opens an assessment with may.sign false (safeguarding-risk.html), and "Sign it off" and its note are drawn only when o.may.sign (egbc-sg-assess.js draw())',
    holds: [['safeguarding-risk.html', /may: \{ edit: false, sign: false, waive: false/], [SGA, /o\.may\.sign && !A\.waived && A\.status !== 'signed' \? '<button class="b" id="sgaSign">/], [SGA, /o\.may\.sign && reds && A\.status !== 'signed' \? '<label for="sgaNote">/]] },
  { page: 'safeguarding-risk.html', file: SGA, keys: ['id:sgaWhy', 'id:sgaWaive'],
    reason: 'the register opens an assessment with may.waive false (safeguarding-risk.html), and waiveBox() returns nothing unless o.may.waive (egbc-sg-assess.js)',
    holds: [['safeguarding-risk.html', /may: \{ edit: false, sign: false, waive: false/], [SGA, /if \(!o\.may\.waive \|\|/]] },
  { page: 'safeguarding.html', file: SGA, keys: ['id:sgaNoteIt'],
    reason: 'the event page gives the assessment no may.note - mount(..., { may: { edit, sign, waive } }) (safeguarding.html) - and "The trustees have noted it" is drawn only when o.may.note (egbc-sg-assess.js notedBox()); the trustees note it on the risk register, where it is reached',
    holds: [['safeguarding.html', /may: \{ edit: !!\(ADMIN \|\| ISLEAD \|\| LEADER\), sign: !!ISLEAD, waive: !!\(ISLEAD \|\| MASTER\) \}/], [SGA, /\(o\.may\.note \? ' <button class="b sec" type="button" id="sgaNoteIt"/]],
    never: [['safeguarding.html', /may: \{[^}]*note:/]] },
  { page: 'Youthcharter.html', file: 'Youthcharter.html', keys: ['fn:openPwModal', 'id:pw-input', 'fn:closePwModal'],
    reason: 'the old password box: its "Admin Edit" button (in #admin-locked-controls) is hidden as the page loads ("if (locked) locked.style.display = \'none\'") and nothing shows it again (every other line sets it to none); the box opens only from that button. Editing is entered by the admin gesture instead, where it is reached',
    holds: [['Youthcharter.html', /if \(locked\) locked\.style\.display = 'none';/]],
    never: [['Youthcharter.html', /admin-locked-controls'\)\.style\.display\s*=\s*'(?!none)/], ['Youthcharter.html', /locked\.style\.display\s*=\s*'(?!none)/]] }
];

/**
 * The proof that a page never draws a control, checked against the code it cites.
 * @param {string} page the page, as the inventory names it
 * @param {{ key: string, file?: string }} c the control
 * @returns {string} the reason, or '' when there is no proof for it
 */
export function neverOn(page, c) {
  const p = PROOFS.find((x) => x.page.toLowerCase() === page.toLowerCase() && x.keys.includes(c.key) && (!c.file || c.file === x.file));
  if (!p) return '';
  const text = (f) => fs.readFileSync(path.join(V2, f), 'utf8');
  for (const [f, re] of p.holds || []) if (!re.test(text(f))) throw new Error('never-drawn.mjs: the proof for ' + page + ' ' + c.key + ' rests on ' + f + ' ' + re + ', which is no longer there');
  for (const [f, re] of p.never || []) if (re.test(text(f))) throw new Error('never-drawn.mjs: the proof for ' + page + ' ' + c.key + ' needs ' + f + ' never to match ' + re + ', and it now does');
  return p.reason;
}
