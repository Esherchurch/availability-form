/* helpAsk's normal case and refusals, on the Firestore emulator, with a
 * stand-in for the model (no real AI call). From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/help-ask.test.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { askHelp } from './help-ask.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run on the emulator.'); process.exit(2); }
process.env.FUNCTIONS_EMULATOR = 'true';
initializeApp({ projectId: 'demo-help-ask' });
const db = getFirestore();
let bad = 0;
const ok = (c, what) => { console.log((c ? 'PASS ' : 'FAIL ') + what); if (!c) bad++; };
const refused = (p) => p.then(() => '', (e) => e.code || 'error');

await db.collection('helpAiStub').doc('config').set({ url: 'http://stand-in', key: 'k' });
await db.collection('users').doc('u1').set({ status: 'active', teams: [], adminFor: [] });
await db.collection('users').doc('u2').set({ status: 'pending' });

let sent = null;
const model = async ({ request }) => { sent = request; return { content: [{ type: 'text', text: 'Press Schedule.' }], usage: { input_tokens: 10, output_tokens: 3 } }; };

const r = await askHelp({ db, uid: 'u1', data: { page: 'enews', question: 'How do I send it later?' }, call: model });
ok(r.known && r.answer === 'Press Schedule.', 'answers from the model');
ok(sent && JSON.stringify(sent.system).includes('THE HELP TEXT'), 'sends the page\'s help text');
ok(sent && !JSON.stringify(sent).includes('u1'), 'sends no ids');
ok(sent && sent.messages[0].content.includes('ordinary member'), 'says what the person can do');

const none = await askHelp({ db, uid: 'u1', data: { page: 'no-such-page', question: 'Hello?' }, call: model });
ok(!none.known, 'a page with no help: "I don\'t know", no AI call');

ok((await refused(askHelp({ db, uid: 'u1', data: { page: '../x', question: 'q' }, call: model }))) === 'invalid-argument', 'refuses a bad page name');
ok((await refused(askHelp({ db, uid: 'u1', data: { page: 'enews', question: '' }, call: model }))) === 'invalid-argument', 'refuses an empty question');
ok((await refused(askHelp({ db, uid: 'u1', data: { page: 'enews', question: 'x'.repeat(501) }, call: model }))) === 'invalid-argument', 'refuses a long question');
ok((await refused(askHelp({ db, uid: 'u2', data: { page: 'enews', question: 'q' }, call: model }))) === 'permission-denied', 'refuses someone not yet active');

const log = await db.collection('helpAiLog').get();
ok(log.docs.every((d) => !JSON.stringify(d.data()).includes('send it later')), 'the log never keeps the words');

console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
