# Mix Builder — build brief

**For Claude Code handoff. Rewritten 2026-09-05 around a persistent timeline.**

Supersedes the earlier "Mix Renderer" brief. The change: this is not a batch renderer that turns a
spreadsheet into a WAV. It is **a project you build up over days and come back to** — a timeline of
the whole set, saved locally, where every junction can be worked on, auditioned and re-worked
without touching the rest.

---

## 1. What we are building, in one sentence

A single-page tool holding **one saved project** — the whole running order on a timeline, with a
transition designed at every junction, a library of reusable samples, and a render button that
bounces the entire set to one continuous WAV.

## 2. What we are NOT building

Load-bearing list. Every item here would push this past a fortnight.

- **No live DJ decks.** No real-time crossfader, no cue output, no scheduler, no MIDI, no latency
  tuning. The output is a file.
- **No free-form DAW timeline.** Clips are not dragged to arbitrary positions — see §4, this is a
  deliberate decision and it saves most of the build.
- **No audio in Firebase.** Source audio stays on disk; samples live in IndexedDB. Tens of MB per
  track changes the storage bill and the CORS posture for no benefit.
- **No integration with `songs/`.** Different domain. Do not touch it, do not reuse its doc-ID scheme.
- **No YouTube ingestion.** Local files only.
- **No key detection or harmonic mixing in v1.**
- **No ML stem separation.** See §9 — the classical approach turned out to be the wrong tool for the
  main job anyway.
- **No auth or v2 platform integration in v1.** Standalone first; wiring in `egbc-auth.js` and
  `egbc-shell.js` is a half-day whenever it is wanted.
- **Nothing that guesses where to cut.** Cut points, entry points and transition choices are the
  user's editorial decisions. The tool proposes defaults and executes; it never overrides.

## 3. Success criteria

Done when all eight are true.

1. Drop a folder of audio in; every file decodes and reports BPM, first downbeat and a waveform.
2. Paste the running order; files are matched to rows by name and anything unmatched is flagged.
3. The whole set appears as a timeline with a bar ruler, showing every track and every junction.
4. Any junction can be opened, configured, auditioned in isolation, and closed — **without
   re-rendering anything else**.
5. Each track can be told where to start, where to mix out, and can be built from more than one
   region of the source.
6. A sample cut from any track can be saved to a library and dropped anywhere, any number of times,
   stretching itself to the tempo playing at that point.
7. **Close the browser, come back tomorrow, re-drop the audio folder, and the whole project is
   exactly as it was.**
8. One button renders the entire set to a single WAV with no gaps, no tempo jumps inside a
   transition, and no clipping.

Criteria 4 and 7 are what make this a tool rather than a script.

---

## 4. The core model — and the one decision that keeps this small

**The timeline is a view, not the source of truth.**

The project is an ordered list of tracks, each with its own edit points, plus a transition record at
each junction. Positions on the timeline are *computed* from those — track length, transition type,
overlap. The timeline draws that computation and is the click target for editing it. Clips are not
dragged to arbitrary positions.

This matters because free-dragging invites gaps, overlaps and off-grid placements that silently
break beat-matching, and then needs snapping, collision handling, ripple editing and an undo model
to make safe. That is the difference between a fortnight and a quarter. Every edit here is
bar-quantised by construction because there is no way to express anything else.

What the user gets instead of dragging:

- Reorder tracks (drag rows, or up/down).
- Click a junction to open its editor.
- Click a track to open its region editor.
- Drop a sample onto a bar position.
- Everything downstream re-flows automatically.

**Everything is incremental.** Each junction renders to its own cached audio segment. Editing
junction 12 invalidates only junction 12. The full render concatenates cached segments and only
re-renders what is stale. This is what makes a 40-track project workable rather than a
five-minute wait per change.

---

## 5. Architecture

Browser-only, no build step, no framework — house style. One HTML file plus sibling `.js` modules
once it passes ~250 KB, which it will. All DSP hand-rolled; nothing fetched at runtime except the
Montserrat webfont.

```
  audio folder (re-dropped each session, never stored)
        │
        ▼
  [1] DECODE + ANALYSE ...... BPM, downbeat, peaks. Cached in IndexedDB by name+size+duration,
        │                     so this happens once per file, ever.
        ▼
  [2] PROJECT ............... ordered tracks, per-track regions, per-junction transitions,
        │                     sample placements. Auto-saved to IndexedDB on every change.
        ▼
  [3] LAYOUT ................ computes bar positions and the rolling target tempo per junction.
        │                     Pure function of the project. No audio.
        ▼
  [4] SEGMENT RENDER ........ one cached AudioBuffer per junction region, rendered on demand.
        │                     Invalidated only by edits that touch it.
        ▼
  [5] FULL RENDER ........... concatenate segments + the untouched middles of tracks, in
        │                     ~10 minute chunks, to one WAV.
        ▼
  the mix
```

Memory is the hard constraint: 2.5 hours of stereo 44.1 kHz is about **1.6 GB** of Float32. Never
hold the whole set in one `OfflineAudioContext`. Render in chunks with a few seconds of overlap and
concatenate.

---

## 5a. What we inherit — read this before writing anything

**This is not a new project.** It joins a suite of ~50 internal tools and should look, behave and be
built like them: one self-contained page, no build step, no npm, no framework, vanilla DOM JS,
static hosting on GitHub Pages. Four existing files carry most of what is needed.

### `availability-form/Videoeditor.html` (442 KB, "v3") — read this first

An in-browser multitrack non-linear editor. It is the closest existing thing to this tool and the
single most valuable file in the repo for it.

| What it already has | Where it goes here |
|---|---|
| Multitrack timeline model: tracks → clips, drag, snapping, trim, per-track mute, undo/redo | The timeline in §4. Take the model, drop the free-drag (§4 explains why). |
| `generateWaveform()` (~line 1258) — fetch → `arrayBuffer` → `decodeAudioData` → 512 peak buckets, cached in `_waveformCache` | Track and sample waveforms. Bump to ~1400 buckets for the wider view. |
| `drawWaveform()` (~line 1285) — per-clip `<canvas>` rendering | Waveform drawing; add the beat/bar grid overlay on top. |
| Mixdown (~line 4997) — sized `AudioBuffer`, sums clips into `outL`/`outR`, skips clips outside range | The precedent for §6.8. Use `OfflineAudioContext` instead of manual summation — it gives `BiquadFilterNode` and parameter automation free, which the bass swap and the reverb throw both need. |
| Fallback decoder (~line 5050) — `<audio>` → `createMediaElementSource` → `MediaRecorder` → decode the WebM | **Keep this.** Some m4a and mp3 files `decodeAudioData` rejects outright, and a folder of 40 purchased tracks will contain one. |
| Buffer caching by URL, WebCodecs export, `.mp3 .wav .aac .ogg .flac .m4a` handling | Straight reuse. |

### `availability-form/batchupload.html` — the running-order matcher, already written

This solves success criterion 2 almost for free. It was built to match dropped PDF filenames to song
titles; the job here is identical with audio files.

- `cleanTitle()` — strips extensions, bracketed text, key markers, and noise words, then normalises
  whitespace. Point it at `"05 Return of the Mack.mp3"` and it gives you `return of the mack`.
- `getMatches()` / `getConfidence()` — word-overlap ratio against every known title, top 5 kept,
  scored high ≥ 0.7 / medium ≥ 0.4 / low.

Reuse both against the running-order rows. Show high-confidence matches as accepted, medium as
"confirm this", low as unmatched. Do not write a new matcher.

### `availability-form/EGBC-PlayThrough.html` — the DSP precedent

Already ships real analysis: `OfflineAudioContext`, `AnalyserNode`, FFT 4096 / hop 2048, a sliding
window over raw PCM, a manual DFT per window folded into 12 pitch classes. The prototype's onset
detection is the same shape of loop at a different size — the pattern is proven in this codebase, on
this hosting, with these constraints. It also confirms heavy DSP in a page is acceptable here.

### `v2/egbc-auth.js` and `v2/egbc-shell.js` — the platform, for later

`egbc-shell.js` injects the consistent top bar with one script tag
(`<script src="egbc-shell.js" data-title="Mix Builder"></script>`). `egbc-auth.js` carries the
team/role model (`member < leader < admin < owner`, checked per team). Wire these in at session 6,
not session 1 — but build the page so dropping the shell tag in later needs no restructuring.

### House conventions to follow

The design tokens are copy-pasted into every page rather than linked, and this page should do the
same:

```css
--canvas:#eef4f3; --surface:#fff; --ink:#14201f; --body:#3a4d4c;
--muted:#6b8281; --hairline:#dde7e6; --brand:#3d6263; --brand-dark:#2e4c4d;
--brand-tint:#e7f0ef; --success:#3b7d23; --danger:#b0392c; --gold:#b07d2e;
--r-sm:8px; --r-md:12px; --r-lg:18px; --r-pill:999px;
```

Montserrat 400–800. Uppercase 11px letterspaced labels, 26px/800 headings, soft shadows, rounded
cards. Carry the `escapeHtml()` / `safeUrl()` / `jsAttr()` helpers across as every other page does.

**Where it lives:** `v2/`, alongside the platform files. The prototype is already at
`v2/mix-analyser.html` and this grows out of it.

### What we deliberately do not inherit

- **The music suite's Firebase backend.** `songs/`, Storage, the doc-ID scheme — all PDF sheet music
  for the worship team. Different domain. This project stores nothing in Firebase.
- **The mixed SDK versions.** The suite has 8.10.1 compat style in some pages and 10.x modular in
  others. This page touches Firebase at all only at session 6, and then only modular.
- **Single-file discipline, past a point.** Videoeditor is 442 KB in one file and is hard to work in.
  See §12 — split this one.

## 6. Modules

### 6.1 `analyse` — tempo and beat grid
**Written and working. Lift from `v2/mix-analyser.html` as-is.** Same shape of analysis loop as
`EGBC-PlayThrough.html` already runs in production.

Spectral flux onset envelope (FFT 1024, hop 512, Hann, positive magnitude differences, rectified
against a ±20-frame moving mean) → autocorrelation over 70–200 BPM weighted by a log-normal centred
on 120 → beat phase → downbeat → confidence. Runs in a Worker.

Assumes 4/4 and roughly steady tempo. Every value is hand-correctable and *must stay so* — detection
on 1970s recordings is good but not reliable, and the *Check grid* audition (8 bars with a click on
every beat) settles it by ear in ten seconds.

### 6.2 `stretch` — WSOLA time-stretch
**Written and working. Lift as-is, including the fix in §9.**

Frame 2048, synthesis hop 512, analysis hop `512 × ratio`, correlation search ±256. Alignment
offsets computed once from the mono sum and applied to every channel so the stereo image cannot
drift. Whole tracks constrained to ±6%; samples may go to ±15%.

### 6.3 `transitions` — four types
**Types 1–3 written and working. Lift as-is.**

Every junction is one of these. The layout proposes, the user overrides.

**Cut + reverb throw** *(default)*. The music stops dead on a bar line; a reverb send tapped
*before* the EQ opens for the final beat and shuts at the cut, so the last note blooms and decays
over the beat that carries on underneath. This reads as a deliberate gesture. A gradual filter
ramp, by contrast, just sounds like a fade — which is what it is.

Impulse response is synthesised: exponentially decaying decorrelated noise with a 20 ms pre-delay.
No sample files needed.

**Beat bridge.** After the cut, the outgoing track keeps playing with its mids filtered out, for a
chosen number of bars, then the next track enters on a bar line. Isolation is **EQ, not
separation** — see §9, this matters more than anything else in this document. Three peaking bells at
700 Hz, 1.8 kHz and 3.5 kHz, Q 1.0, cut by ~24 dB. **Nothing below 300 Hz or above 6 kHz is
touched**, so kick, bass, hats and the crack of the snare all survive.

Separation (HPSS) stays available as an aggressive alternative, with its low end preserved — but it
is not the default and should not be.

**Blend.** Equal-power crossfade with a bass swap: outgoing lowshelf ramps 0 → −20 dB over the first
half, incoming −20 → 0 dB over the second. 8–16 bars. Works between records of similar character;
fails between unrelated ones *even when the beats match perfectly*, which is a musical fact, not a
bug to fix.

**Hard cut.** A ends on a bar line, B starts on the next. Proposed automatically when two tracks are
more than 6% apart after clamping.

### 6.4 `regions` — where a track starts, ends, and what it plays

**Entry point.** Bar-snapped position where playback begins. Set by clicking the waveform. Bypasses
quiet intros.

**Mix-out point.** Bar-snapped position where the transition begins working backwards from. **Must
default to the last audible bar, never to the end of the file** — see §9.

**Edit list.** An ordered list of regions from the source, each bar-snapped, played back to back.
This is what makes *"come in on the hook, then drop back to the verse"* possible: region 1 is bars
33–40, region 2 is bar 9 onwards. Joins are butt-joined on the bar line with a 10 ms equal-power
crossfade to kill the click — that is what a DJ does with a hot cue and it sounds right. Do not be
clever about it.

Show regions as blocks over the waveform with the total length in bars.

### 6.5 `hpss` — harmonic/percussive separation
**Written and working. Lift as-is.**

Median filtering of the spectrogram: horizontal median → harmonic, vertical median → percussive,
soft mask `H^p/(H^p+P^p)`. FFT 2048, hop 512, kernels 17. Mask computed from the mono sum, applied
per channel. Interface: `separate(buffer, amount) → { harmonic, percussive }`.

Used for **samples** (strip drums out of a hook) and as the non-default aggressive bridge. Verified
numerically: harmonic + percussive reconstructs the original to −142 dB; on synthetic material the
harmonic half retains 100% of sustained content with 0% transient leakage. Far too slow for whole
tracks — only ever run it on a region.

### 6.6 `library` — reusable samples

**Cutting.** Drag-select on a zoomed waveform, bar-snapped, length shown in bars. Waveform
rendering and caching come from `Videoeditor.html`'s `generateWaveform()` / `drawWaveform()`.

**Processing baked in at save time:** trim, HPSS drum removal (optional, with amount), high-pass
0–400 Hz, normalise to −1 dBFS so placement gain means the same thing for every sample.

**Not baked in, because they vary per use:** stretch, gain, fades.

**Stored unstretched**, at its source tempo. The same hook at a 108 BPM junction and a 124 BPM
junction needs two different stretches. Store once, stretch per placement.

**Entry:** name, source track and region, bars, source BPM, tags, waveform thumbnail, *used in N
places*, audition, delete. Tags free-text with suggestions — `hook`, `stab`, `riser`, `vocal`,
`drop`.

**Import** of plain audio files too — bought risers, sweeps, an air horn. They skip HPSS and get an
editable source-BPM field; blank BPM means place without stretching, correct for one-shots.

**Export** as a ZIP of WAVs plus a manifest, so a library survives and can seed the next project.

### 6.7 `layout` — positions and tempo

Pure function of the project. No audio, so it can run on every keystroke.

- **Rolling target tempo.** Each track targets the mean of itself and its neighbours, clamped to 6%
  stretch. A single global tempo is impossible across an 89 → 132 BPM set.
- **Junction classification.** Still more than 6% apart after clamping → propose `hard-cut`.
- **Bar positions** for every track, region, junction and sample placement.
- **Total running time**, live.

### 6.8 `render`

Per-junction segments cached; full render concatenates. Two rules that are not optional:

- **Peak-safety on every output.** Summed clips exceed full scale — see §9.
- **Chunked rendering.** ~10 minutes per `OfflineAudioContext`, overlapped and concatenated.

Exports: whole mix, a single junction, or a bar range. Always 44.1 or 48 kHz stereo WAV.

### 6.9 `ui`

House design tokens, Montserrat. Four areas: **library of tracks** (drop zone, waveforms, grids),
**the timeline**, **the junction editor**, **the sample library**. The timeline and the library
panel both want to be permanently reachable rather than buried in modals.

---

## 7. Persistence — the part that makes it a project

Everything auto-saves to IndexedDB on every change. No save button; a "saved" indicator is enough.

| Store | Contents | Why |
|---|---|---|
| `project` | Ordered tracks, regions, junctions, placements, settings | The whole document. Small — a few KB. |
| `analysis` | BPM, downbeat, peaks per file, keyed by name+size+duration | So a 40-file folder is analysed once, ever. |
| `samples` | Sample metadata | The library. |
| `sampleAudio` | Sample audio blobs | Past what `localStorage` can hold; needs IndexedDB. |
| `segments` | Cached rendered junction audio | Optional. Drop it if the store gets large; it only costs re-render time. |

**Source audio is never stored.** Forty tracks is gigabytes. On reopening, the project loads
instantly with waveforms and every setting intact, and shows a *"re-link audio"* prompt. Drop the
folder, files are matched by name + size + duration, and it is playable again. Anything that cannot
be matched is listed by name so the user knows what to find.

**Project export/import** as a single JSON file (plus samples ZIP) is the backup story and the way
to move a project between machines.

---

## 8. Data shapes

```jsonc
// IndexedDB "project" — the whole document
{
  "id": "mix_birthday",
  "name": "Birthday disco",
  "created": "2026-09-05T00:00:00Z",
  "maxStretch": 0.06,
  "maxSampleStretch": 0.15,

  "tracks": [
    {
      "id": "trk_04",
      "file": "05 Return of the Mack.mp3",
      "fileSize": 8412345,            // part of the re-link key
      "sourceBpm": 95.1,              // detected, hand-correctable
      "downbeatSec": 0.83,
      "bpmLocked": true,              // user corrected it; never re-detect
      "regions": [                    // omit for the simple entry-to-exit case
        { "startSec": 62.1, "bars": 8 },
        { "startSec": 16.8, "bars": 96 }
      ],
      "entrySec": 0.83,
      "exitSec": 201.4                // defaults to the last AUDIBLE bar
    }
  ],

  "junctions": [
    { "after": "trk_04", "type": "throw-bridge",
      "reverbBars": 2, "beatBars": 16,
      "midCutDb": 24, "highCutDb": 0, "isolation": "eq",
      "overlapBars": 1 },
    { "after": "trk_05", "type": "blend", "bars": 16, "bassCutDb": 20 },
    { "after": "trk_07", "type": "hard-cut", "gapMs": 0, "note": "cake" }
  ],

  "placements": [
    { "sampleId": "smp_7c2a", "atJunction": 11, "barsBeforeEntry": 8,
      "gainDb": -8, "fadeInMs": 40, "fadeOutMs": 300 },
    { "sampleId": "smp_7c2a", "atJunction": 23, "barsBeforeEntry": 8,
      "gainDb": -8, "fadeInMs": 40, "fadeOutMs": 600 }
  ]
}

// IndexedDB "samples" — audio in "sampleAudio" under the same id
{
  "id": "smp_7c2a",
  "name": "Sir Duke horns",
  "tags": ["hook", "brass"],
  "sourceFile": "24 Sir Duke.mp3",
  "sourceStartSec": 41.20,
  "bars": 4,
  "sourceBpm": 120.0,
  "processing": { "removeDrums": true, "removalAmount": 2.0, "highPassHz": 120 }
}
```

Note the same `sampleId` at two junctions. **Samples are assets; placements are uses.**

Running-order import reuses `cleanTitle()` / `getMatches()` / `getConfidence()` from
`batchupload.html` to match rows to filenames — see §5a. It accepts the existing spreadsheet's columns — `#`, `Track`, `Artist`, `BPM`,
`Length`, `Section`, `Mix`. The `Mix` column already carries junction decisions: `Hard cut`,
`STOP / START`, `COLD START`, `TEMPO CHANGE` and `LAST DANCE` map straight onto junction types, so
the project seeds itself rather than asking.

---

## 9. What the prototype proved — including four things that cost real time

`mix-analyser.html` works today and demonstrates: decode, analysis in a Worker, waveforms with beat
and bar grids, *Check grid* click audition, hand-correction of BPM and downbeat, entry and mix-out
markers, WSOLA stretching, blends with bass swap, beat bridges with EQ or separation, reverb throws,
peak-safe WAV export.

The four lessons below were each found by rendering something, listening, and measuring the file.
**Encode them; do not rediscover them.**

**Never anchor a transition to the end of the file.** The first bridge sounded like a straight cut.
Measurement showed it had worked perfectly — into the fade-out and trailing silence at the end of
the MP3, where there was nothing left to hear. Every transition must work backwards from a mix-out
point that defaults to the **last audible bar** (backward RMS scan, ~−34 dBFS threshold).

**Summed clips clip.** A finished render measured 2,880 samples pinned at full scale across 64
regions, with flat-topped waveforms — audible distortion throughout. Modern masters sit near 0 dBFS,
so any crossfade or overlap exceeds it. Float render headroom is unlimited, so scan the finished
buffer and pull it under 0 dBFS before playback or export. Also clamp the overlap-add normalisation
divisor in both the stretcher and the HPSS resynthesis (`/= Math.max(norm, 0.5)`); at buffer edges
only one window overlaps and dividing by a near-zero sum amplifies the edges into distortion.

**HPSS is the wrong tool for "keep the beat going".** The isolated beat measured **1% of its energy
below 200 Hz**, against 52% in the source. At 2048-point resolution a kick's low fundamental looks
*sustained*, so the separator files it as music and deletes it. What was left was midrange hash,
which then got boosted to compensate — the user's description was "underwater", the exact signature
of reconstructed audio. **Use EQ.** A DJ does not separate anything; they pull the mids down and
leave the low and high ends alone. And when filtering, **keep above 6 kHz too** — an early attempt
stacked filters into an accidental low-pass, leaving 0.5% of energy above 4 kHz. Losing the hats and
the snare crack turns a beat into a rumble. The transients at the top are what make it read as
rhythm.

**A beat-matched blend is not automatically a good transition.** Despacito into Return of the Mack
matched perfectly and still sounded wrong, because two strong unrelated vocals were fighting. That
is a musical limit, not a bug. It is why there are four transition types and why the user chooses.

---

## 10. Remaining risks

**Tempo drift in older recordings.** Chic, Sister Sledge, Kool & the Gang, Rapper's Delight — human
drummers, no click track, tempo wanders a beat or two across four minutes. Constant-rate stretching
cannot fix it and variable-rate warping is days of work.

*Mitigation: keep blends short.* Over 8–16 bars the drift is a handful of milliseconds. The two
records only have to agree for the length of the transition, not the length of the song. **This one
decision removes the need for warping entirely.**

**Octave errors in detection.** Half- and double-time misreads are the normal failure. Weighting
catches most; *Halve* / *Double* and the click audition catch the rest in seconds. Do not chase
perfection in code.

**Project size.** 40 tracks × cached segments could grow large in IndexedDB. Cached segments are
disposable — evict oldest first, re-render on demand.

**Re-link friction.** The one rough edge of not storing audio. Make it a single folder drop with a
clear list of anything unmatched.

---

## 11. Build order

| # | Session | Deliverable |
|---|---|---|
| 1 | Ingest and analysis | Drop files, waveforms with grids, editable BPM/downbeat, click audition, IndexedDB analysis cache. **Done — lift from the prototype.** |
| 2 | Transitions | All four types, auditionable between any two tracks. **Done — lift from the prototype.** |
| 3 | Project and timeline | The project model, auto-save, reopen and re-link, running-order import, the timeline view, junction editor, incremental segment caching. **This is the session that turns it into a tool.** |
| 4 | Regions and samples | Multi-region edit lists; sample library with IndexedDB storage, import, export, placement at any bar. |
| 5 | Full render | Chunked whole-set render, WAV export, progress and bar-range export. |

Session 3 is the one that matters. Sessions 1 and 2 already exist; 4 and 5 are additive. If time
runs short, a project with working transitions and no sample library is still a finished mix.

---

## 12. Decisions to make before starting

**Running-order input.** Pasted table, or parsed .xlsx? Pasting is twenty minutes and needs nothing.
Parsing xlsx in the browser without a build step means vendoring SheetJS at 900 KB, against the
grain of this codebase. Recommendation: paste, with CSV as the fallback if it grates.

**One project or several.** v1 assumes a single project in IndexedDB, which is simplest. A project
list is an hour's work later if a second mix is ever wanted; do not build it now.

**File split.** This will pass 250 KB. Recommendation: `mix-builder.html` plus `mix-dsp.js`,
`mix-project.js`, `mix-ui.js` as plain scripts, no bundler — consistent with how v2 already
separates `egbc-auth.js` and `egbc-shell.js`.

---

## 13. Reading order

1. `v2/mix-analyser.html` — the working prototype. Analysis, stretching and all four transition
   types are already in here, tested against real records.
2. `availability-form/Videoeditor.html` — timeline model, waveform generation and caching, mixdown,
   decoder fallback.
3. `availability-form/batchupload.html` — `cleanTitle`, `getMatches`, `getConfidence`. The
   running-order matcher, already written.
4. `availability-form/EGBC-PlayThrough.html` — the existing in-page DSP precedent.
5. `v2/egbc-shell.js` and `v2/egbc-auth.js` — the platform, for session 6.
6. `availability-form/Library.html` — house UI patterns and the suite's general style.
