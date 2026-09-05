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
| `render-test.js` | The full render end to end: plan, tempo ramps, progress, cancel, range export, duration, peak safety, and the **click check** — the largest sample-to-sample jump in the mix must not exceed what the source material itself reaches. |
| `render-scale.js` | The same at 47 tracks, reporting realtime factor and peak heap. Catches what only shows up at scale — a default 16-bar blend not fitting a short track was found here. |
| `seam-probe.js` | Diagnostic. Measures whether a stretched buffer can be spliced to anything. Its answer is why the render overlaps rather than concatenates. |
| `align-test.js` | The ramp maths, and the flam detector — including proving it detects a deliberate 30 ms misalignment. A test that can only say "tight" is worthless. |
| `region-test.js` | Edit lists: assembled length, no click at a join, and that assembling before stretching is measurably better than the reverse. |
| `sample-test.js` | The sample library and placements. The assertion that matters: one sample gets different stretch ratios at different junctions, read from the ramp. |
| `seam-probe.js` | Diagnostic. Whether a stretched buffer can be spliced to anything. Its answer is why the render overlaps rather than concatenates. |
| `stretch-diag.js` | Diagnostic, not an assertion. Prints measured output tempo against target across several ratios. Reach for it when a stretch looks wrong. |

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

## The mix-out default

`reach-test.js` asserts that a freshly ingested and a freshly re-linked track
both come out with a mix-out that is **after** the entry point and **before** the
end of the file. That default — the last audible bar, found by a backward RMS
scan at about −34 dBFS — has been lost three separate times, each time making
every track unrenderable with entry and mix-out identical. It now lives in one
function, `defaultMixOut()` in `mix-ui.js`, with fallbacks so it can never
return a zero-length range.

## Retired

`test-offline-ui.js` covered the service worker and PWA offline shell. Both
were deleted when the tool became an Electron app: offline is the default for a
desktop app, and the worker had spent a day serving a stale cached shell so that
edits appeared not to land. The test hung on `navigator.serviceWorker.ready`
once the worker was gone, which is the correct outcome for a test of something
that no longer exists.

The desktop build has its own checks in the scratchpad rather than here, since
they need to launch Electron rather than a page.
