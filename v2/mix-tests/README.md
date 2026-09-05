# Mix Builder tests

Every lesson in §9 of the brief was found by rendering audio and measuring the
file, not by reading the code. These keep it that way. Run them after touching
`mix-dsp.js` in particular — a broken stretcher looks completely correct on
screen.

## Running

`test-layout.js` needs nothing but Node:

```sh
node test-layout.js
```

The three browser tests drive the real page in the real Chrome over http (not
`file://` — IndexedDB is blocked there, which is also why the tool itself must
be served rather than opened from disk):

```sh
npm install puppeteer-core
node dsp-test.js
node smoke.js
node stretch-diag.js
```

They expect Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`;
edit the path at the top of each file if it lives elsewhere. Edge works too.

## What each one covers

| File | Covers |
|---|---|
| `test-layout.js` | The pure model against the real 47-track running order: parsing, filename matching, junction seeding from the `Mix` column, tempo layout, the stretch budget, cache-key invalidation, re-link. No browser. |
| `test-order.js` | Reordering, benching, replacing and the sequencer. Asserts that a configured junction follows its pair when a track moves, that a swap is reversible, that pinned tracks never move, and that section direction is read correctly. No browser. |
| `dsp-test.js` | End to end through the DSP. Synthesises drum loops at known tempos, then asserts on detected BPM, stretch accuracy measured from kick spacing, blend/bridge/hard-cut renders, peak safety, the bridge's low-end energy, and the WAV header. |
| `smoke.js` | The page boots, the three modules load, a project round-trips through IndexedDB, the timeline paints 47 tracks and 46 junctions, and clicking a junction opens its editor. |
| `test-offline-ui.js` | Registers the service worker, saves a project, then **stops the server and cuts the network** and asserts the page still reloads, the project is intact, and edits still save. Then drives the live reorder buttons, the bench, swap, and the suggestion panel. |
| `render-test.js` | The full render end to end: plan, tempo ramps, progress, cancel, range export, duration, peak safety, and the **click check** — the largest sample-to-sample jump in the mix must not exceed what the source material itself reaches. |
| `render-scale.js` | The same at 47 tracks, reporting realtime factor and peak heap. Catches what only shows up at scale — a default 16-bar blend not fitting a short track was found here. |
| `seam-probe.js` | Diagnostic. Measures whether a stretched buffer can be spliced to anything. Its answer is why the render overlaps rather than concatenates. |
| `align-test.js` | The ramp maths, and the flam detector — including proving it detects a deliberate 30 ms misalignment. A test that can only say "tight" is worthless. |
| `region-test.js` | Edit lists: assembled length, no click at a join, and that assembling before stretching is measurably better than the reverse. |
| `sample-test.js` | The sample library and placements. The assertion that matters: one sample gets different stretch ratios at different junctions, read from the ramp. |
| `seam-probe.js` | Diagnostic. Whether a stretched buffer can be spliced to anything. Its answer is why the render overlaps rather than concatenates. |
| `stretch-diag.js` | Diagnostic, not an assertion. Prints measured output tempo against target across several ratios. Reach for it when a stretch looks wrong. |

## One thing the emulator cannot test

`test-offline-ui.js` cuts the network with Chrome's offline emulation and stops
the server, which genuinely proves the shell and the project survive — it
measures zero requests served afterwards. But `navigator.onLine` reads **true**
in the reloaded page under emulation, so asserting the offline badge after a
reload would be testing the emulator rather than the page. The badge is
therefore tested by dispatching the real `offline` / `online` events instead.

## The two assertions worth understanding

**Stretch accuracy is measured from kick spacing, never by re-analysing the
output.** The tempo estimator quantises to an integer lag, so at a 512-sample
hop a true 126 BPM signal can only ever read 125.00. The tool never analyses
stretched audio anyway — analysis runs on source files, stretch happens at
render. Measuring the actual spacing between transients is both exact and the
thing beat-matching depends on.

**The bridge must keep its low end.** `dsp-test.js` asserts that more than 15%
of the isolated beat's energy sits below 200 Hz. Straight HPSS left 1%, against
52% in the source, because at 2048-point resolution a kick's fundamental looks
sustained and the separator deletes it. That assertion is what stops anyone
quietly making separation the default again.

## Regenerating the running order

`running-order.json` is converted from the spreadsheet by `xlsx2json.js`, which
reads .xlsx with no dependencies (it is a zip; Node can inflate it):

```sh
node xlsx2json.js ../../../disco_mix_running_order_3.xlsx running-order.json
```

Doing the conversion here rather than in the browser is deliberate — it keeps
SheetJS and its 900 KB out of a codebase that has no build step.
