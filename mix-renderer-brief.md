# Mix Renderer — build brief

**For Claude Code handoff. Written 2026-09-05, revised to add the sample library.**

Target: a working renderer in **four focused sessions**, not weeks. The "what we are not building"
list in §2 is the main tool for keeping it there.

---

## 1. What we are building, in one sentence

A single-page tool that takes **a folder of audio files** and **a running order**, and bounces
**one continuous beat-matched WAV** — with a choice of transition per junction (crossfade, drum
bridge, or hard cut), per-track edit points so a song can start where you want it to, and a
**reusable library of samples** cut from the tracks themselves, dropped in wherever they are wanted
and automatically stretched to whatever tempo is playing there.

## 2. What we are NOT building

This list is load-bearing. Every item here would push the build past a week.

- **No live DJ decks.** No crossfader moved in real time, no cue/pre-listen output, no look-ahead
  scheduler, no MIDI, no latency tuning. The output is a file, not a performance.
- **No audio in Firebase.** Audio stays local — source files on disk, samples in IndexedDB.
  Storage cost and CORS posture change completely at tens of megabytes per track, for no benefit.
- **No integration with `songs/`.** That collection is PDF sheet music for worship; different
  domain. Do not touch it, do not reuse its doc-ID scheme.
- **No YouTube ingestion.** Local files the user already owns, nothing else.
- **No key detection or harmonic mixing in v1.** The chroma code in `EGBC-PlayThrough.html` makes
  this tempting. Resist it — it is not what makes a mix sound continuous.
- **No ML stem separation.** See §5.3; we use classical DSP that needs no model files.
- **No auth, no `egbc-shell.js`, no v2 platform integration in v1.** Build standalone, wire into the
  suite afterwards if it proves useful. Integration is a half-day whenever we want it; doing it
  first buries the interesting work under boilerplate.

## 3. Success criteria

Done when all nine are true.

1. Drop 40 audio files in; every one decodes and reports a BPM, a first downbeat and a waveform.
2. Paste a running order; the tool matches filenames to rows and flags what it cannot match.
3. Each track's BPM and downbeat can be corrected by hand, and correcting one re-renders only what
   depends on it.
4. **Each junction can be set to crossfade, drum bridge or hard cut, independently.**
5. **A drum bridge closes the outgoing track's music out over a chosen number of bars, holds its
   beat alone, and brings the next track in on a bar line.**
6. **A track can be told where to start — skipping a quiet intro — and can be built from more than
   one region of the source, so it can come in on the hook and then drop back to the verse.**
7. From any track, a section can be selected, have its drums stripped, and be **saved to a library
   with a name**.
8. **A saved sample can be dropped at any point in the mix, any number of times, and it stretches
   itself to the tempo playing at that point.** The library survives closing the browser.
9. Press one button; get a single WAV of the whole set with no gaps and no tempo jumps inside a blend.

Criteria 5, 6 and 8 are the point. Everything else serves them.

---

## 4. Architecture

Browser-only, single self-contained HTML file plus a sibling `.js` if it passes ~250 KB. No build
step, no npm, no framework — house style. All DSP hand-rolled; nothing fetched at runtime except
the Montserrat webfont.

```
  local audio files
        │
        ▼
  [1] DECODE ......... decodeAudioData → AudioBuffer, mono sum, 1400-bucket peaks
        │
        ▼
  [2] ANALYSE ........ Worker: spectral flux → autocorrelation tempo → beat phase → downbeat
        │              output: { bpm, confidence, firstBeatSec, downbeatSec }
        │
        ├──────────────────────────────┐
        ▼                              ▼
  [4] PLAN                       [3] SAMPLE LIBRARY
      running order +                select region → HPSS drum removal → high-pass
      grids + placements             → name it → store UNSTRETCHED in IndexedDB
        │                              │
        │        ┌─────────────────────┘
        ▼        ▼
  [5] STRETCH ........ WSOLA: tracks to their target tempo; each sample PLACEMENT to the
        │              tempo playing at that point in the mix
        ▼
  [6] RENDER ......... OfflineAudioContext in ~10 min chunks: place clips, automate gain and
        │              lowshelf per junction, layer sample placements, concatenate, bounce
        ▼
  one WAV
```

**Two key structural decisions.**

*A sample is stored processed but not stretched* — trimmed, drums removed, high-passed, at its
original tempo. Stretching happens per *placement*, because the same hook dropped at a 108 BPM
junction and again at a 124 BPM junction needs two different stretches. Store once, stretch many
times.

*HPSS is used in both directions.* The same separation that strips drums out of a sample provides
the drums-only audio for a bridge — one module, two masks. Because the soft masks sum to 1, the
harmonic and percussive halves reconstruct the original exactly, which is what makes a bridge
seamless rather than a noticeable edit (verified: −142 dB reconstruction error).

`Videoeditor.html`'s mixdown at ~line 4997 is the closest existing precedent, but use
`OfflineAudioContext` rather than its manual `outL`/`outR` summation — it gives `BiquadFilterNode`
and parameter automation for free, which is exactly what a bass swap and a sample fade need.

---

## 5. Module breakdown

### 5.1 `analyse.worker` — tempo and beat grid

**Written and working in the prototype. Lift as-is.**

- Spectral flux onset envelope: FFT 1024, hop 512, Hann, sum of positive magnitude differences,
  half-wave rectified against a ±20-frame moving mean.
- Tempo: autocorrelation over lags for 70–200 BPM, weighted by a log-normal centred on 120 BPM so
  octave errors resolve correctly.
- Beat phase: the offset within one beat period maximising summed onset energy.
- Downbeat: of the four beat phases in a bar, the one carrying most energy.
- Confidence: autocorrelation peak over the mean of the search range, clamped 0–1.

Assumes 4/4 and roughly steady tempo. Drift is handled in §8, not here.

### 5.2 `stretch` — WSOLA time-stretch

**Written and working in the prototype. Lift as-is.**

Frame 2048, synthesis hop 512, analysis hop `512 × ratio`, correlation search ±256 samples.
Alignment offsets computed once from the mono sum and applied to every channel, so the stereo image
cannot drift apart. Comfortable to about ±10%; the planner constrains whole tracks to ±6%.

**Samples may exceed that.** A four-bar riff survives a 15% stretch far better than a four-minute
track does — less time for artefacts to accumulate, and it sits under another record. Allow ±15%
for sample placements, with a warning past 10%.

### 5.3 `hpss` — drum removal

Harmonic/percussive source separation by median filtering the spectrogram. Classical DSP, no models,
no dependencies, about 60 lines on top of the FFT already written.

- STFT: FFT 2048, hop 512, Hann. Keep the complex bins, not just magnitudes.
- Magnitude spectrogram `S[frame][bin]`.
- **Harmonic estimate** `H` = median of `S` along the *time* axis, kernel 17 frames. Sustained
  pitched material survives a horizontal median; drum hits do not.
- **Percussive estimate** `P` = median of `S` along the *frequency* axis, kernel 17 bins. Broadband
  transients survive a vertical median; sustained tones do not.
- **Soft mask** `Mh = H^p / (H^p + P^p)` with `p = 2`. Expose `p` to the UI as a *removal amount*
  slider — higher is more aggressive and more artefacty.
- Apply `Mh` to the complex STFT, inverse FFT, overlap-add with Hann, normalise by the window sum.
- Output: harmonic-only audio.

Runs in a Worker. A 30-second sample is roughly 2,500 frames × 1,024 bins; with a 17-element
insertion sort per point that is a second or two. Fine on demand, far too slow for full tracks —
**only ever run this on samples.**

**What to expect, honestly.** Vocals and sustained instruments are harmonic and survive well, which
is what we want. Kick and snare largely disappear. Hi-hats partially survive because they are noisy
rather than transient. A synth bass is harmonic and will *not* be removed — which is why the editor
also has a high-pass control for the low end HPSS leaves behind. Used together, with the sample
sitting under another record at reduced volume, the result is convincing. Judged solo on headphones
it will sound watery. Expected, and it does not matter.

Keep the interface clean — `separate(buffer, amount) → { harmonic, percussive }` — so a better
separator can be swapped in later without touching anything else. **Return both halves**; samples
want the harmonic one, drum bridges want the percussive one.

### 5.3a `transitions` — the three junction types *(new)*

Every junction is one of three things. The planner proposes, the user overrides.

**Blend.** What §5.7 already describes: equal-power crossfade with the bass swap, 8–16 bars.
Works when the two records sit in similar territory. Fails when they do not — the tested example
was Despacito into Return of the Mack, where the beats matched perfectly and it still sounded wrong,
because two strong and unrelated vocals were fighting over each other.

**Drum bridge.** The answer to that failure, and the transition the user asked for. The outgoing
track's last bars are separated; the harmonic half is faded out over `fadeBars` while the percussive
half continues at full level, so the *music* closes out and the *beat* carries on alone. After
`bridgeBars` of beat, the incoming track enters on a bar line, optionally overlapping the last bar
or two of the beat.

Construct the bridge as **one clip**, not two overlapping ones:

```
bridge[t] = percussive[t] + harmonic[t] × env(t)      env: 1 → 0 over fadeBars, then 0
```

Because `harmonic + percussive = original`, the bridge clip begins bit-identical to the track, so
the join into it is inaudible and no crossfade is needed there. Overlapping a "full" clip with a
"percussive" clip instead would double the drums at the start of the fade — do not do that.

HPSS is far too slow for whole tracks. Separate **only the bridge region**, typically 16–24 bars.

**Hard cut.** Nothing matched; A ends on a bar line, B starts on the next. The planner picks this
automatically when two tracks are more than 6% apart after clamping. A sample tease (§5.4) often
works better across a hard cut than any blend would.

### 5.3b `regions` — where a track starts, and what it plays *(new)*

A track is not always "play from the downbeat to the end". Two things are needed.

**Entry point.** A single position, snapped to a bar, where playback begins. Set by clicking the
waveform. The case that drives it: a song with a long quiet intro that would kill the floor —
bypass it and come in where the track actually starts.

**Edit list.** An ordered list of regions from the source, each snapped to bars. This is what makes
*"come in on the hook, then go back to the verse"* possible: region 1 is bars 33–40, region 2 is
bar 9 onwards. The renderer plays them back to back.

Joins between regions are butt-joined on the bar line with a 10 ms equal-power crossfade to kill the
click. Do **not** try to be clever — a short crossfade on a downbeat is what a DJ does with a
hot cue, and it sounds right.

Keep the UI honest about it: show the regions as blocks over the waveform, with the total length in
bars, so the user can see they have built a 3-minute version of a 4-minute song.

### 5.4 `library` — the sample library *(the distinguishing feature)*

In the user's terms: *cut out the bit I want, take the drums off, keep it, and drop it wherever I
like — it should sort out the timing itself.*

**Cutting a sample.** Click a track to open a zoomed waveform with beat and bar lines over it. Drag
to select. Snap mode: bar / beat / free, default bar. Length is shown **in bars** — a sample is
*four bars*, not *7.43 seconds*, because bars are what survive a tempo change.

**Processing at save time** — baked into the stored audio, so it is done once:

1. Trim to selection, snapped to the source track's beat grid.
2. HPSS drum removal — on/off with an amount slider (§5.3).
3. High-pass, 0–400 Hz, default 0.
4. Normalise to −1 dBFS, so placement gain means the same thing for every sample.

**Not** baked in, because they vary per placement: stretch, gain, fades.

**Library entry**: name, source track and region, length in bars, source BPM, tags, waveform
thumbnail, a *used in N places* count, audition button, delete. Tags are a free-text list with
suggestions — `hook`, `stab`, `riser`, `vocal`, `intro`, `drop`, `sweep`.

**Import.** The library also accepts plain audio files dragged straight in — bought FX packs,
risers, sirens, an air-horn. Imported samples skip HPSS but get a source BPM field, which may be
blank; a sample with no BPM is placed without stretching (correct for one-shots like an impact,
wrong for a loop, so the field is editable).

**Export.** *Export library* writes a ZIP of WAVs plus a `library.json` manifest. Reimport restores
it. This is the backup story, and it means a library built for one mix can seed the next.

**Placement.** From the running order, at any junction or any bar position: choose a sample, set how
many bars before the incoming track's entry it starts, set gain and fades. Placement always lands on
a bar line. Many placements per sample, many samples per junction.

**Audition.** Renders the surrounding 16 bars with the placement in it, and plays. This is the loop
the user lives in, so make it fast — cache the stretched buffer per (sample, target BPM) pair, so
changing gain or position does not re-stretch.

### 5.5 `storage`

- **`localStorage`** — track analysis results, keyed by filename + size + duration. Small.
- **`IndexedDB`** — sample audio (Float32 or encoded WAV blobs) and the library manifest.
  `localStorage` caps out around 5–10 MB and a library of thirty four-bar samples is well past that.
  Two stores: `samples` (metadata) and `sampleAudio` (blobs, keyed by sample id).
- **Nothing in Firebase.** If the tool later joins v2, persist the *plan and manifest* to
  `mixSets/{id}` and leave the audio local.

Source audio files are **not** stored — they are re-dropped each session and matched by filename,
size and duration. Storing 40 tracks in IndexedDB is gigabytes for no gain.

### 5.6 `plan`

Input: ordered tracks with grids, plus sample placements. Output: a render plan.

- **Rolling target tempo.** Not one tempo for the whole set. Each track targets the mean of itself
  and its neighbours, clamped so no track stretches more than 6%. The running order climbs
  89 → 132 BPM, so a single global tempo is impossible; a rolling target keeps every individual
  stretch inaudible.
- **Junction classification.** If after clamping two neighbours are still more than 6% apart, mark
  the junction `hard-cut` rather than `blend`. Show it — it is a musical decision the user may want
  to override, and a sample tease often works *better* across a hard cut than a blend does.
- **Blend length.** Default 16 bars, per-junction override. §8 explains why short matters.
- **Exit point.** Default: the last bar line in track A leaving room for the blend.
- **Entry point.** Track B's first detected downbeat, per-junction override.
- **Placement tempo.** For each sample placement, the target tempo is whatever the plan says is
  playing at that bar. The planner computes it; the renderer just uses it.

### 5.7 `render`

Per track: `AudioBufferSourceNode` → `BiquadFilterNode` (lowshelf, 220 Hz) → `GainNode` →
destination. Per sample placement: `AudioBufferSourceNode` → `GainNode` → destination, started on a
bar line.

Per junction:
- Equal-power crossfade — `cos(t·π/2)` out, `sin(t·π/2)` in — via `setValueCurveAtTime`.
- Bass swap: outgoing lowshelf ramps 0 → −20 dB over the first half of the blend; incoming ramps
  −20 → 0 dB over the second half. **This is what makes it sound like a DJ rather than a fade.**
  Two full-range basslines together is mud, and it is the commonest giveaway in an amateur mix.
- Sample placements layered on top at their planned bar offsets.

Memory is the real constraint: 2.5 hours of stereo 44.1 kHz is about **1.6 GB** of Float32. Render
in **~10-minute chunks** with a few seconds of overlap and concatenate, never one context for the
whole set.

### 5.8 `ui`

House design tokens, Montserrat, single page. Sections: drop zone → track list with waveform, grid
overlay, editable BPM/downbeat, *Check grid* → sample editor → **library panel** → running order
with junction rows and their placements → render and download.

The library panel wants to be always reachable, not buried in a modal — it is the thing being
returned to constantly.

---

## 6. Data shapes

```jsonc
// localStorage: mixAnalysis:{filename}:{size}
{
  "bpm": 128.02, "confidence": 0.91,
  "firstBeatSec": 0.412, "downbeatSec": 0.412,
  "durationSec": 214.7, "sampleRate": 44100,
  "analysedAt": "2026-09-05T00:00:00Z"
}

// IndexedDB store "samples" — the library. Audio lives in "sampleAudio" under the same id.
{
  "id": "smp_7c2a",
  "name": "Sir Duke horns",
  "tags": ["hook", "brass"],
  "sourceFile": "24 Sir Duke.mp3",
  "sourceStartSec": 41.20,        // for provenance and re-cutting, not for playback
  "bars": 4,
  "sourceBpm": 120.0,             // what the stored audio actually runs at
  "processing": { "removeDrums": true, "removalAmount": 2.0, "highPassHz": 120 },
  "createdAt": "2026-09-05T00:00:00Z"
}

// the render plan
{
  "targetPolicy": "rolling",
  "maxStretch": 0.06,
  "maxSampleStretch": 0.15,
  "tracks": [
    { "file": "05 Return of the Mack.mp3", "sourceBpm": 95.1, "targetBpm": 96.4,
      // regions play back to back; omit for the simple "entry to end" case
      "regions": [ { "startSec": 62.1, "bars": 8 },     // come in on the hook
                   { "startSec": 16.8, "bars": 96 } ],  // then back to the verse
      "exitSec": 201.4 }
  ],
  "junctions": [
    { "from": 0, "to": 1, "type": "blend", "bars": 16, "bassCutDb": 20 },
    { "from": 1, "to": 2, "type": "bridge", "fadeBars": 4, "bridgeBars": 8,
      "removalAmount": 2.0, "overlapBars": 1 },
    { "from": 7, "to": 8, "type": "hard-cut", "gapMs": 0, "note": "cake" }
  ],
  "placements": [
    { "sampleId": "smp_7c2a", "atJunction": 11, "barsBeforeEntry": 8,
      "gainDb": -8, "fadeInMs": 40, "fadeOutMs": 300 },
    { "sampleId": "smp_7c2a", "atJunction": 11, "barsBeforeEntry": 4,
      "gainDb": -5, "fadeInMs": 40, "fadeOutMs": 300 },
    { "sampleId": "smp_7c2a", "atJunction": 23, "barsBeforeEntry": 8,
      "gainDb": -8, "fadeInMs": 40, "fadeOutMs": 600 }
  ]
}
```

Note the same `sampleId` appearing three times at two different junctions. That is the whole point
of the split: **samples are assets, placements are uses.**

Running-order import should accept the existing spreadsheet's columns: `#`, `Track`, `Artist`,
`BPM`, `Length`, `Section`, `Mix`. The `Mix` column already carries the junction decisions — rows
reading `Hard cut`, `STOP / START`, `COLD START`, `TEMPO CHANGE` and `LAST DANCE` map directly onto
junction types, so the planner seeds itself from it rather than asking.

---

## 7. The four risks, and what to do about them

**Tempo drift in older recordings.** Chic, Sister Sledge, Kool & the Gang and Rapper's Delight were
played by humans with no click track; tempo wanders a beat or two across four minutes. A
constant-rate stretch cannot fix that, and variable-rate warping is days of work.

*Mitigation: keep blends short.* Over 8–16 bars the drift is a handful of milliseconds and nobody
hears it. The two records only have to agree for the length of the blend, not the length of the
song. **This single decision removes the need for warping entirely** and is why this is a
four-session build rather than a four-week one. It applies to samples too — four bars is safe
almost anywhere.

**Octave errors in detection.** Half-time and double-time misreads are the normal failure mode. The
log-normal weighting catches most; *Halve* / *Double* buttons and the *Check grid* audition catch
the rest in seconds. Do not try to solve this perfectly in code.

**HPSS quality.** Covered honestly in §5.3. The mitigation is the use case: a sample at −8 dB under
a full record hides a great deal. Do not chase a cleaner separation before hearing it in context.

**Vocal collision.** A vocal over a vocal is the other amateur giveaway. v1 handles it by letting
the user set the exit point by hand with the waveform and bar lines visible. Samples make this
worse, not better — a vocal hook teased over an outgoing vocal will clash. Worth a UI warning, not
worth solving automatically.

---

## 8. Build order

| # | Session | Deliverable |
|---|---|---|
| 1 | Ingest and analysis | Drop files, waveforms with grid overlay, editable BPM/downbeat, *Check grid* audition, `localStorage` cache. **Done — in the prototype.** |
| 2 | Transitions | Blend and drum bridge, both auditionable between any two tracks; HPSS; entry-point selection by clicking the waveform. **Done — in the prototype.** |
| 3 | Regions and sample library | Multi-region edit lists per track with bar-snapped blocks over the waveform; drag-select, HPSS, high-pass, normalise, name and save to IndexedDB; library panel with audition and delete; import of external audio; export/import as ZIP. |
| 4 | Placement and planner | Running order import, rolling target tempo, junction classification, drop samples at any bar, per-placement stretch and gain, single-junction audition. |
| 5 | Full render | Chunked whole-set render, WAV export, progress UI. |

Optional session 6: fold into v2 with `egbc-auth.js` and `egbc-shell.js`, persist plan and library
manifest to Firestore as `mixSets/{id}` — metadata only, never audio.

---

## 9. What the prototype already proves

`mix-analyser.html` runs standalone today and demonstrates, working:

- Decode, mono sum, peaks, waveform with beat and bar lines drawn over it.
- Spectral flux → autocorrelation → phase → downbeat, in a Worker with progress reporting.
- Confidence scoring, and hand-correction of BPM and downbeat with live re-draw.
- *Check grid*: 8 bars from the detected downbeat with a click on every beat, so a grid can be
  verified by ear in about ten seconds.
- WSOLA time-stretch, pitch-preserving.
- Entry-point selection: click a waveform to set where a track starts, snapped to the nearest bar.
- A full two-track blend: both stretched to a common tempo, downbeats aligned, equal-power crossfade
  with the bass swap, rendered offline, auditioned and exported as WAV.
- **HPSS separation**, mask computed from the mono sum and applied per channel so the stereo image
  cannot drift.
- **A full drum bridge**: music closed out over N bars, beat carrying on alone, next track entering
  on a bar line with a configurable overlap.
- Stretch-budget warning past 6%, which now suggests a bridge instead of a blend.

**HPSS was verified numerically before it was wired to anything**, against synthetic material with
known ground truth — a sustained two-tone drone plus decaying broadband clicks:

| Measure | Result |
|---|---|
| `harmonic + percussive` vs the original | −142 dB error (numerical noise floor) |
| Sustained tone retained in the harmonic half | 100.0% |
| Click energy leaking into the harmonic half | 0.0% |
| Energy split found vs the true split | 99.5 / 0.5 against a true 99.5 / 0.5 |

Real music is harder than a test signal — hi-hats are noisy rather than transient and partly
survive, and a synth bass is harmonic and will not be removed. But the algorithm is correct and the
reconstruction property that makes bridges seamless is exact.

So sessions 1 and 2 are done. **Genuinely new work is the region edit list (§5.3b), the sample
library and its storage (§5.4–5.5), the planner (§5.6), and the chunked whole-set render.** That is
the honest remaining scope.

---

## 10. One thing to decide before starting

Whether the running order arrives as a **pasted table** or a **parsed .xlsx**. Pasting is twenty
minutes and needs no library. Parsing xlsx in the browser without a build step means vendoring
SheetJS — 900 KB, and against the grain of this codebase.

Recommendation: paste, with a *Copy from spreadsheet* instruction. If it grates after a week, export
to CSV and parse that in fifty lines.
