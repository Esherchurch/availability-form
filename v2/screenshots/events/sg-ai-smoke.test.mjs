/* THE ONE-REAL-CALL SCRIPT ITSELF (sg-ai-smoke.mjs; the reviewing window,
   23 Oct): an API error gives the plain message and ends cleanly; a good
   run ends cleanly too - no crash on the way out (UV_HANDLE_CLOSING), no
   stack trace. It runs the script against a stand-in on this machine
   (--base-url, which the script allows for 127.0.0.1 only). No real call,
   no emulator.
     node screenshots/events/sg-ai-smoke.test.mjs */
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const V2 = path.resolve('.');
const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 700))); };

const H = (x) => Object.assign({ hazard: 'Getting separated', who: 'Children', likelihood: 3, impact: 4, controls: ['Headcounts'], likelihoodAfter: 2, impactAfter: 4, owner: 'The trip leader', review: 'Daily', mustNotGoAhead: false }, x);
const DRAFT = { summary: 'x', overall: 'green', hazards: [H({ hazard: 'Children alone in the prison', mustNotGoAhead: true, likelihoodAfter: 3, impactAfter: 5 }), H()], mustNotGoAhead: ['Children must not be left alone in the prison at any time.'], questions: ['Who is the first aider?'] };
const ANSWERS = [
  { status: 400, headers: { 'request-id': 'req_smoke_400' }, body: { type: 'error', error: { type: 'invalid_request_error', message: 'This API key is not scoped to a workspace (stand-in)' } } },
  { status: 401, headers: { 'request-id': 'req_smoke_401' }, body: { type: 'error', error: { type: 'authentication_error', message: 'the key has expired (stand-in)' } } },
  { status: 200, body: { id: 'msg_s', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: JSON.stringify(DRAFT) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 171, output_tokens: 3741 } } }
];
let calls = 0;
const stub = http.createServer((req, res) => {
  req.on('data', () => {}); req.on('end', () => {
    const a = ANSWERS[calls++] || { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'nothing more' } } };
    res.writeHead(a.status, Object.assign({ 'Content-Type': 'application/json' }, a.headers || {})); res.end(JSON.stringify(a.body));
  });
});
await new Promise((r) => stub.listen(5618, '127.0.0.1', r));

const run = () => new Promise((resolve) => {
  const p = spawn(process.execPath, ['screenshots/events/sg-ai-smoke.mjs', '--live', '--base-url', 'http://127.0.0.1:5618', '--text', 'A trip abroad with a prison visit for 200 children.', '--children', '200', '--leaders', '5', '--kind', 'trip', '--days', '10'],
    { cwd: V2, env: Object.assign({}, process.env, { SG_AI_KEY: 'stub-key' }) });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => resolve({ code, out, err }));
});
const CRASH = /UV_HANDLE_CLOSING|Assertion failed|at \S+ \(.*:\d+:\d+\)|Unhandled|uncaught/i;

let r = await run();
ok('A KEY NOT SCOPED TO A WORKSPACE (400): "The AI isn’t set up properly yet. Ask the church office."', /The AI isn’t set up properly yet\. Ask the church office\./.test(r.out), r.out + r.err);
ok('   with the status, the error type and the request id', /the API said 400 invalid_request_error, request req_smoke_400/.test(r.out), r.out);
ok('   exit 1, cleanly: no crash on the way out, no stack trace', r.code === 1 && !CRASH.test(r.out + r.err), JSON.stringify({ code: r.code, err: r.err.slice(0, 300) }));
ok('   tried once only', calls === 1, calls);
r = await run();
ok('AN EXPIRED KEY (401): the same plain message, exit 1, cleanly', /The AI isn’t set up properly yet/.test(r.out) && /401 authentication_error/.test(r.out) && r.code === 1 && !CRASH.test(r.out + r.err), r.out + r.err);
r = await run();
ok('A GOOD RUN: all four checks pass, the hub’s row "40 needed for 200 children; 5 named" is there', (r.out.match(/^ {2}PASS/gm) || []).length === 4 && /40 needed for 200 children; 5 named/.test(r.out), r.out);
ok('   exit 0, cleanly: no crash on the way out', r.code === 0 && !CRASH.test(r.out + r.err), JSON.stringify({ code: r.code, err: r.err.slice(0, 300) }));
stub.close();

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exitCode = passed === results.length ? 0 : 1;
