/* ===================================================================
   Building compliance: seed the starter templates, and the synthetic test
   church (Stage 1; F-230). Events window.
   ===================================================================
     --templates   write egbc-compliance-templates.js's templates into
                   complianceTemplates/<id> (the global, versioned copy).
                   A template already at this version is left alone.
     --fixtures    THE SYNTHETIC TEST CHURCH, on the emulator only:
                   a church (Church of England, built before 2000, gas,
                   lightning protection, fire alarm, kitchen), a hall (public
                   use, food, play equipment, no gas) and a let house (gas),
                   each a site with rooms, and their profiles applied.
   Safe by default: nothing is written without --write; nothing real without
   --live (and --fixtures never runs live).
     node tools/seed-compliance.mjs --templates                  dry run
     node tools/seed-compliance.mjs --templates --fixtures --write   (emulator)
     node tools/seed-compliance.mjs --templates --live --write   (Martin, at switch-over)
   =================================================================== */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEngine, loadStore, loadTemplates } from '../screenshots/events/compliance-engine.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);

/* The synthetic church: invented names only. */
export const FIXTURES = {
  sites: [
    { id: 'cmp_church', name: 'St Example’s Church (invented)', profile: { type: 'church', cofe: true, pre2000: true, gas: true, lightning: true, fireAlarm: true, emergencyLighting: true, fireDoors: true, kitchen: true, publicUse: true },
      rooms: [['cmp_church_nave', 'Nave (invented)', 'hall'], ['cmp_church_kitchen', 'Church kitchen (invented)', 'kitchen'], ['cmp_church_av', 'Sound desk room (invented)', 'av']] },
    { id: 'cmp_hall', name: 'Example Hall (invented)', profile: { type: 'hall', publicUse: true, food: true, play: true, gas: false, kitchen: true, fireAlarm: true },
      rooms: [['cmp_hall_main', 'Main hall (invented)', 'hall'], ['cmp_hall_kitchen', 'Hall kitchen (invented)', 'kitchen']] },
    { id: 'cmp_house', name: 'The Manse (invented)', profile: { type: 'house', letHouse: true, gas: true },
      rooms: [['cmp_house_kitchen', 'Manse kitchen (invented)', 'kitchen']] }
  ]
};

export async function seedTemplates(db, T, write) {
  let made = 0, same = 0;
  for (const t of T.TEMPLATES) {
    const ref = db.collection('complianceTemplates').doc(t.id), d = await ref.get();
    if (d.exists && (d.data().version || 1) >= (t.version || 1)) { same++; continue; }
    if (write) await ref.set(JSON.parse(JSON.stringify(t)));
    made++;
  }
  return { made, same };
}
export async function seedFixtures(db, E, S, T) {
  const who = { uid: 'seed', name: 'The test church’s setup' };
  for (const s of FIXTURES.sites) {
    await db.collection('sites').doc(s.id).set({ name: s.name, active: true, order: 1 });
    for (const [id, name, kind] of s.rooms) {
      await db.collection('rooms').doc(id).set({ name, siteId: s.id, active: true, kind: 'room' });
      await db.collection('roomProfiles').doc(id).set({ siteId: s.id, kind, updatedAt: new Date().toISOString() });
    }
    await S.applyProfile(db, E, s.id, s.profile, T.TEMPLATES, who);
  }
}

async function main() {
  const WRITE = flag('--write'), LIVE = flag('--live'), EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (WRITE && !EMU && !LIVE) { console.log('Not on the emulator: add --live to write to the real database.'); process.exit(2); }
  if (flag('--fixtures') && !EMU) { console.log('The test church goes on the emulator only.'); process.exit(2); }
  const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
  const { initializeApp, applicationDefault } = fnRequire('firebase-admin/app');
  const { getFirestore } = fnRequire('firebase-admin/firestore');
  initializeApp(EMU ? { projectId: 'egbc-worship-planner' } : { projectId: 'egbc-worship-planner', credential: applicationDefault() });
  const db = getFirestore(), E = loadEngine(), S = loadStore(), T = loadTemplates();
  if (flag('--templates')) { const r = await seedTemplates(db, T, WRITE); console.log((WRITE ? 'Templates written: ' : 'Templates that would be written: ') + r.made + ', already at this version: ' + r.same + ' (version ' + T.VERSION + ')'); }
  if (flag('--fixtures') && WRITE) { await seedFixtures(db, E, S, T); console.log('The synthetic test church is in place: ' + FIXTURES.sites.map(s => s.name).join(', ')); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error('Stopped: ' + (e.message || e)); process.exit(1); });
