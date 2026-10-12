/* ONE ev() FOR EVERY CHECK, AND A THROW IN THE PAGE TURNS THE RUN RED.
   ===================================================================

   Martin, 12 Oct 2026: "make a throw inside a check fail the run, in the
   shared harness, with a deliberate break. A check that can't fail isn't
   a check."

   WHAT WAS WRONG. Every check drove the browser through its own copy of
   the same six lines - 31 identical copies - and those lines ended a
   page-side exception like this:

       if (r.exceptionDetails) return 'THREW ' + ...description;

   A return, not a throw. So an expression that blew up inside the page
   came back as the STRING "THREW SyntaxError: ..." and carried on as an
   ordinary value. I watched a run print

       THREW SyntaxError: Invalid or unexpected token
       41/41 passed

   and exit 0. The words were on the screen and the run was still green,
   which is the worst of both: it looks like evidence of nothing wrong.

   WHY NOT SIMPLY THROW. A handful of checks read that string on purpose
   and tolerate it - check-style-every-screen reports "(could not open)"
   for a screen and moves on to the next; check-share-format stops with
   a message of its own. Turning every tolerated condition into a hard
   stop would hide those messages behind a stack trace and lose the
   check's own account of what happened.

   SO THE THROW IS RECORDED, AND THE EXIT CODE IS FORCED. The string is
   still returned, so every existing call site reads the same as before,
   but the throw is now written down where it cannot be swallowed, and an
   exit handler turns a green run red if anything was written down. It is
   not something a check has to remember to assert: a check that forgets
   still goes red, which is the only kind of gate worth having.

   A check that WANTS a page-side throw - one proving a guard bites -
   says so by calling expectThrow() around it. That is an explicit,
   searchable opt-out, not a silent one. */

const thrown = [];
let hooked = false;
let expecting = 0;

/* A page-side exception, written down. Called by the ev() below; also
   exported, so a check driving the browser some other way can report one. */
export function notePageThrow(where, detail) {
  if (expecting > 0) return;
  thrown.push({ where: where || '(unnamed)', detail: String(detail || '').slice(0, 300) });
  hook();
}

export function pageThrows() { return thrown.slice(); }

/* For the rare check that is PROVING something throws in the page. The
   throws inside are not counted. Deliberately noisy to read. */
export async function expectThrow(fn) {
  expecting += 1;
  try { return await fn(); } finally { expecting -= 1; }
}

/* THE PART THAT CANNOT BE FORGOTTEN. The checks all end with
   process.exit(R.some(v => !v) ? 1 : 0), so a page-side throw that no
   assertion noticed would exit 0. Assigning process.exitCode inside an
   'exit' listener overrides the code passed to process.exit, which is
   what makes this work without touching 31 tallies. */
function hook() {
  if (hooked) return;
  hooked = true;
  process.on('exit', (code) => {
    if (!thrown.length) return;
    console.log('\n' + thrown.length + ' expression'
      + (thrown.length === 1 ? '' : 's') + ' threw inside the page:');
    for (const t of thrown) console.log('  ' + t.where + ': ' + t.detail);
    if (code === 0) {
      console.log('\nTHE RUN IS RED BECAUSE OF THAT, whatever the tally above says.');
      process.exitCode = 1;
    }
  });
}

/* Build a check's ev() from its CDP send(). Replaces the copy each check
   used to carry. `label` is only for the report, so a throw can be traced
   back to the check it came from. */
export function makeEval(send, label) {
  return async function ev(x, awaitPromise = false) {
    const r = (await send('Runtime.evaluate', {
      expression: x, returnByValue: true, awaitPromise,
    })) || {};
    if (r.exceptionDetails) {
      const d = String((r.exceptionDetails.exception || {}).description
        || r.exceptionDetails.text || '').split('\n')[0];
      notePageThrow((label ? label + ': ' : '') + String(x).replace(/\s+/g, ' ').slice(0, 70), d);
      return 'THREW ' + d;
    }
    return r.result && r.result.value;
  };
}
