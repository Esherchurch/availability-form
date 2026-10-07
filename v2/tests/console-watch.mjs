/* Shared by every check here: a page counts as working only when its error
 * console is empty.
 *
 * WHY THIS EXISTS. The Sunday Service Planner opened with an empty order of
 * service twice. The second time it was this window's own fix: calling the
 * start-up directly when the page had already loaded ran it before the module
 * had defined addSong, so it threw ReferenceError and stopped. The page served
 * 200, drew its frame, and lost its contents - and the check that was meant to
 * prove the fix passed, because the emulator was slow enough that the branch
 * which breaks was never taken.
 *
 * The browser said so, in one line, the whole time. Nothing was reading it.
 *
 * WHAT COUNTS. An uncaught exception, a console.error, or a failed assert.
 * Not a warning, not a log.
 *
 * WHAT IS IGNORED, and why it has to be. These checks deliberately refuse
 * every request that would leave the machine, and the Firebase SDK says so
 * loudly through console.error when its connection is cut off. Those lines are
 * the harness talking about itself, not the page failing. They are counted and
 * can be printed, so the exemption stays auditable instead of becoming a place
 * to hide a real error.
 */

/* Kept deliberately short. Every line excused by it is recorded and printed,
   so this cannot quietly grow into a list of real errors nobody looks at. */
const HARNESS_NOISE = [
  /ERR_BLOCKED_BY_CLIENT|ERR_FAILED|ERR_CONNECTION|net::ERR/i,
  /Failed to load resource/i,
  /Failed to fetch/i,
  /Could not reach Cloud Firestore backend/i,
  /WebChannelConnection .* transport errored/i
];

const text = (args) => (args || []).map(a => {
  if (a === null || a === undefined) return '';
  if (a.value !== undefined) return String(a.value);
  if (a.description) return String(a.description);
  if (a.preview && a.preview.description) return String(a.preview.description);
  return a.type || '';
}).join(' ').trim();

/* Collects errors for one page at a time.
 *
 *   const watch = watchConsole();
 *   ws.onmessage = e => { const m = JSON.parse(e.data); watch.handle(m); ... };
 *   watch.reset();                       // before each page
 *   ... load the page ...
 *   if (watch.errors.length) ...         // after it
 */
export function watchConsole() {
  const state = { errors: [], ignored: [] };

  state.handle = (m) => {
    let line = null;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = (m.params && m.params.exceptionDetails) || {};
      line = String((d.exception && (d.exception.description || d.exception.value)) || d.text || 'exception')
        .split('\n')[0];
    } else if (m.method === 'Runtime.consoleAPICalled' &&
               (m.params.type === 'error' || m.params.type === 'assert')) {
      line = text(m.params.args) || '(empty console.error)';
    } else {
      return false;
    }
    line = line.slice(0, 200);
    if (HARNESS_NOISE.some(re => re.test(line))) state.ignored.push(line);
    else state.errors.push(line);
    return true;
  };

  state.reset = () => { state.errors.length = 0; state.ignored.length = 0; };

  /* One line for a report: what went wrong, or how it was clean. */
  state.summary = () => state.errors.length
    ? state.errors.length + ' error(s): ' + state.errors[0]
    : 'clean' + (state.ignored.length ? ' (' + state.ignored.length + ' line(s) from the harness cutting the network off)' : '');

  return state;
}
