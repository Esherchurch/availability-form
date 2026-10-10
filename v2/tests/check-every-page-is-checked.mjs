/* Is every page in v2 actually looked at by something?
 *
 *   node tests/check-every-page-is-checked.mjs      (no emulator needed)
 *
 * WHY. The events window asked for `maintenance.html` to be in the sweep
 * before the next release. It already is, because `smoke-all-pages.mjs`
 * reads the directory - but `check-style-every-screen.mjs` works from a
 * hand-written list in `group1-screens.mjs`, and a page missing from that
 * list is not reported as missing. It is simply never measured.
 *
 * That has happened three times and been written down twice:
 *   A-032  index.html has never been style-checked, and has emoji on its
 *          answer buttons
 *   A-046  youth-access.html and youthapp2.html, the same
 *   and churchshow.html would have been the fourth, had I not just written it
 *
 * So this is the gate. Every .html in v2 is either in the style check's list,
 * or on the NOT_YET list below with a reason. Adding a page and forgetting it
 * fails here; adding it to NOT_YET is a deliberate act with a note attached.
 *
 * It is not a style check. It is the check that the style check is looking.
 */
import fs from 'node:fs';
import { PAGES } from './group1-screens.mjs';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 600) : ''))); };

/* Pages deliberately outside the style check, each with the reason. A page
   leaves this list when it is restyled; nothing may join it without a line
   saying why. */
const NOT_YET = {
  /* Grouped by why, because "excused" with no reason is how a page stays
     unmeasured for a fortnight. A page leaves this list when it is
     restyled; nothing joins it without a line saying why.

     SIX OF THE FIRST VERSION OF THIS LIST WERE WRONG - pages I excused
     that the style check already covers - and the "no page is both" check
     below is what said so. */
  /* Not unchecked - checked by something else. The phone app's shell is
     held to APP-DESIGN-BRIEF, which is a different design from the desktop
     restyle the style check measures: four tabs, no menu, 48px targets,
     safe-area padding. tests/check-app-shell.mjs measures all of that on a
     phone-sized screen as five different people, which is more than the
     style sweep would ask of it. */
  "app.html": "the phone app's shell - measured by tests/check-app-shell.mjs, to APP-DESIGN-BRIEF rather than the desktop restyle",
  "attendance.html": "the events window's",
  "events-admin.html": "the events window's",
  "form.html": "the events window's",
  "forms-admin.html": "the events window's",
  "groups.html": "the events window's",
  "groups-admin.html": "the events window's",
  "headcounts.html": "the events window's",
  "hire.html": "the events window's",
  "kids-checkin.html": "the events window's",
  "maintenance.html": "the events window's (F-123)",
  "my-booking.html": "the events window's",
  "my-signup.html": "the events window's",
  "retention.html": "the events window's",
  "room.html": "the events window's",
  "safeguarding.html": "the events window's",
  "safeguarding-settings.html": "the events window's",
  "signup.html": "the events window's",
  "sermons-admin.html": "the events window's (F-132) - and not in the Menu yet, A-061",
  "whatson.html": "the events window's",
  /* All three were here as "Step M (Restyle Group 3)". Step M restyled them,
     so they are in tests/group1-screens.mjs now and the style check asserts
     on them - and the emoji tick A-046 named is a Lucide icon. */
  "EGBCWorship&AV.html": "Step P - not in a group yet",
  "Handover.html": "Step P - not in a group yet",
  "MonitorStageMap.html": "Step P - not in a group yet",
  "Performancenotes.html": "Step P - not in a group yet",
  "birthday.html": "Step P - still on Montserrat, which the sweep reports",
  "data-tools.html": "Step P - not in a group yet",
  "hubresources.html": "Step P - not in a group yet",
  "inventory-system-2.html": "Step P - not in a group yet",
  "schematic.html": "Step P - not in a group yet",
  "song-summary.html": "Step P - not in a group yet",
  "sundayplannersonglibrary.html": "Step P - not in a group yet",
  "upload.html": "Step P - not in a group yet",
  "Videoeditor.html": "Step P - not in a group yet",
  "index.html": "the public availability form - no group yet, and it has emoji on its answer buttons (A-032)",
  "Serviceplannerinstructions.html": "an instructions panel, opened from its tool",
  "rotaplannerinstructions.html": "an instructions panel, opened from its tool",
  "emailcompilerinstructions.html": "an instructions panel, opened from its tool",
  "uploaderinstructions.html": "an instructions panel, opened from its tool",
  "training Sunday planner.html": "a practice copy of a tool",
  "trainingbatchimporter.html": "a practice copy of a tool",
  "trainingmusicdatabase.html": "a practice copy of a tool",
  "trainingportalhub.html": "a practice copy of a tool",
  "trainingrotaplanner.html": "a practice copy of a tool",
  "worshiphubapp.html": "out of scope: Worship Hub",
  "studio.html": "out of scope: Calla Design",
  "mix-builder.html": "out of scope: Mix Builder",
  "mix-player.html": "out of scope: Mix Builder",
  "mix-analyser.html": "out of scope: Mix Builder",
  "SharepointHeader.html": "a fragment, not a page",
  "photoeditor.html": "a standalone tool with no sign-in",
  "sitemaker.html": "a standalone tool with no sign-in",
  "socialmaker.html": "a standalone tool with no sign-in",
};

const pages = fs.readdirSync('.').filter(f => /\.html$/i.test(f)).sort();
const checked = new Set(PAGES.map(s => s.page));
const excused = new Set(Object.keys(NOT_YET));

console.log('\nv2 has ' + pages.length + ' pages. ' + checked.size + ' are style-checked, '
  + excused.size + ' are excused.');

const missed = pages.filter(p => !checked.has(p) && !excused.has(p));
ok('every page is either style-checked or excused with a reason', missed.length === 0,
  'NOT LOOKED AT BY ANYTHING:\n          ' + missed.join('\n          ')
  + '\n\n          Add each to tests/group1-screens.mjs, or to NOT_YET in this'
  + '\n          file with a reason. Do not just delete the name.');

/* And the other way: a list that names pages which no longer exist rots, and
   a rotted list is how churchshow.html could have been "checked" by an entry
   pointing at nothing. */
const ghostsChecked = [...checked].filter(p => !pages.includes(p));
ok('the style check does not name a page that is gone', ghostsChecked.length === 0, ghostsChecked.join(', '));
const ghostsExcused = [...excused].filter(p => !pages.includes(p));
ok('and neither does the excused list', ghostsExcused.length === 0, ghostsExcused.join(', '));

/* An excuse has to say something. */
const empty = Object.entries(NOT_YET).filter(([, why]) => !why || String(why).trim().length < 8);
ok('every excuse gives a reason', empty.length === 0, empty.map(e => e[0]).join(', '));

/* A page cannot be both. */
const both = pages.filter(p => checked.has(p) && excused.has(p));
ok('no page is both checked and excused', both.length === 0, both.join(', '));

const failed = R.filter(v => !v).length;
console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
process.exit(failed ? 1 : 0);
