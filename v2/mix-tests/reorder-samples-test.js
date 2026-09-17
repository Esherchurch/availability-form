/* Samples stay with their record when the running order changes.

   A placement is stored as a junction number and positioned relative to the
   record AFTER that junction — the sample list shows it as 'before "X"'.
   Nothing updated that number when tracks moved, so removing one early track
   slid every later sample onto the next record along, silently. Junctions had
   already been made to follow the pair they join; samples had not.

   Every reorder is checked: move, remove, insert, replace. After each, every
   sample must still sit before the record it sat before, and the finished
   position must come out the same distance in front of that record.

   mix-app/node_modules/electron/dist/electron.exe v2/mix-tests/reorder-samples-test.js */
const { app, BrowserWindow } = require('electron');
const path = require('path');

let fails = 0;
const ok = (c, m, x) => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (x ? '   — ' + x : ''));
  if (!c) fails++;
};

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const errs = [];
  w.webContents.on('console-message', (e, lvl, msg) => {
    if (lvl >= 2 && !/Security Warning|Content-Security-Policy/.test(msg)) errs.push(msg);
  });
  await w.loadFile(path.join(__dirname, '..', 'mix-builder.html'));
  await new Promise(r => setTimeout(r, 1200));

  /* a script that throws in the page rejects here; without this the run
     never exits and looks like a slow machine rather than a broken build */
  setTimeout(() => { console.log('  FAIL  timed out'); app.exit(2); }, 60000);
  process.on('unhandledRejection', err => { console.log('  FAIL  page script threw: ' + (err && err.message)); app.exit(1); });
  const out = await w.webContents.executeJavaScript(`(() => {
    const MP = window.MixProject, MR = window.MixRender;
    const TAB = String.fromCharCode(9), NL = String.fromCharCode(10);
    const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
    function fresh() {
      const rows = MP.parseRunningOrder(
        ['#', 'Track', 'Artist', 'BPM', 'Section', 'Mix', 'Note'].join(TAB) + NL +
        names.map((n, i) => [String(i + 1), n, 'X', '120', 'W', '', ''].join(TAB)).join(NL));
      const p = MP.seedProject(rows, [], null);
      p.tracks.forEach(t => {
        t.durationSec = 200; t.entrySec = 0; t.exitSec = 190;
        t.linked = true; t.sourceBpm = 120; t.downbeatSec = 0;
      });
      p.junctions = p.junctions.map(() => ({ type: 'blend', bars: 8, bassCutDb: 20 }));
      /* three samples, each before a different record, at different distances */
      p.placements = [
        { sampleId: 's1', atJunction: 1, barsBeforeEntry: 4,  gainDb: -8, mode: 'over' },  // before Charlie
        { sampleId: 's2', atJunction: 3, barsBeforeEntry: 12, gainDb: -8, mode: 'over' },  // before Echo
        { sampleId: 's3', atJunction: 4, barsBeforeEntry: 2,  gainDb: -8, mode: 'over' }   // before Foxtrot
      ];
      return p;
    }
    /* a junction number past the end names no record at all — which is what
       the unfixed code produced — so report that rather than throwing on it */
    const before = p => p.placements.map(x => ({ s: x.sampleId,
      b: (p.tracks[x.atJunction + 1] || {}).title || '(no record at junction ' + x.atJunction + ')' }));
    /* how far in front of its record each sample lands, in the finished mix */
    const leads = p => {
      const plan = MR.buildPlan(p);
      return p.placements.map(x => {
        const at = MR.placementOutputSec ? MR.placementOutputSec(plan, x) : null;
        const rec = plan.tracks[x.atJunction + 1];
        return { s: x.sampleId, lead: (at == null || !rec) ? null : +(rec.startSec - at).toFixed(3) };
      });
    };
    const res = {};
    const base = fresh();
    res.start = before(base);
    res.startLeads = leads(base);

    let p = fresh(); const cid = p.tracks[1].id;
    MP.removeTrack(p, 1);                        // Bravo out
    res.remove = before(p);  res.removeLeads = leads(p);
    res.removeDropped = (p.droppedPlacements || []).length;

    p = fresh();
    MP.moveTrack(p, 5, 0);                       // Foxtrot to the top
    res.moveTop = before(p);
    res.moveTopDropped = (p.droppedPlacements || []).map(x => x.sampleId);

    p = fresh();
    MP.moveTrack(p, 2, 4);                       // Charlie later
    res.moveMid = before(p);  res.moveMidLeads = leads(p);

    p = fresh();
    const extra = Object.assign({}, p.tracks[0], { id: 'trk_new', title: 'Inserted' });
    MP.insertTrack(p, 1, extra);                 // something new after Alpha
    res.insert = before(p);  res.insertLeads = leads(p);

    p = fresh();
    p.bench = [Object.assign({}, p.tracks[0], { id: 'trk_bench', title: 'Swapped In' })];
    MP.replaceTrack(p, 2, 0);                    // Charlie swapped for an alternate
    res.replace = before(p);
    res.replaceDropped = (p.droppedPlacements || []).length;

    /* the saved file must not carry the transient list */
    res.savedHasDropped = JSON.stringify(p).indexOf('droppedPlacements') !== -1;
    res.hasExport = !!MP.reanchorPlacements;
    return res;
  })()`);

  const show = xs => xs.map(x => x.s + ' before ' + x.b).join(', ');
  console.log('  at the start: ' + show(out.start));

  ok(out.hasExport, 'the re-anchoring is part of the project model, not the UI');

  const expect = { s1: 'Charlie', s2: 'Echo', s3: 'Foxtrot' };
  const stays = xs => xs.every(x => expect[x.s] === x.b);
  const sameLeads = (a, b) => a.every(x => {
    const y = b.find(z => z.s === x.s);
    return y && x.lead != null && Math.abs(x.lead - y.lead) < 0.01;
  });

  ok(stays(out.remove) && out.removeDropped === 0,
     'removing an earlier record leaves every sample before the same record', show(out.remove));
  ok(sameLeads(out.removeLeads, out.startLeads),
     'and the same distance in front of it in the finished mix',
     out.removeLeads.map(x => x.s + ' ' + x.lead + 's').join(', '));
  ok(stays(out.moveMid), 'moving a record keeps every sample with its record', show(out.moveMid));
  ok(sameLeads(out.moveMidLeads, out.startLeads), 'and at the same distance', '');
  ok(stays(out.insert), 'inserting a record does not push samples onto the wrong one', show(out.insert));
  ok(sameLeads(out.insertLeads, out.startLeads), 'and they land the same distance in front', '');
  ok(out.moveTop.every(x => x.s === 's3' ? false : expect[x.s] === x.b) &&
     out.moveTopDropped.join() === 's3',
     'a record moved to the very top has nothing in front of it, so its sample is taken off and SAID so',
     'dropped: ' + out.moveTopDropped.join(', ') + '; kept: ' + show(out.moveTop));
  ok(out.replaceDropped === 0 &&
     out.replace.find(x => x.s === 's1').b === 'Swapped In',
     'swapping a record for an alternate keeps its sample in that slot', show(out.replace));
  ok(!out.savedHasDropped, 'the list of dropped samples never reaches the saved project');
  ok(errs.length === 0, 'no console errors', errs.slice(0, 2).join(' | '));

  console.log(fails ? '\n' + fails + ' FAILED' : '\nsamples stay with their record however the order changes');
  app.exit(fails ? 1 : 0);
});
