# EGBC Music Suite — technical handoff

Context pack for building a new DJ / "disco" app (multi-track beat matching, tempo stretching, crossfading). Describes what already exists, what is reusable, and — importantly — what does **not** exist and must be built.

Written 2026-09-05 from the source in `Downloads/availability-form-main`.

---

## 1. What the music suite actually is

It is **not** an audio system. It is a **sheet-music and song-metadata library for a church worship team** (Esher Green Baptist Church, "EGBC"). The stored assets are PDFs — chord sheets, lead sheets, lyrics, bass tabs — plus YouTube links and CCLI numbers. There is no audio file anywhere in it.

It sits inside a larger suite of ~50 internal tools (rota planners, address book, AV training pages, video editor, inventory) built by the same person.

### The music pages

| File | Title | What it does |
|---|---|---|
| `Library.html` | Song Library | Master CRUD editor. Search by title, search by lyrics (iTunes API then fuzzy title match), edit artist/YouTube/CCLI, per-file key and type, usage stats, delete. |
| `sundayplannersonglibrary.html` | Song Library – Quick View | Read-only variant used alongside the service planner. |
| `music-uploader.html` | Music Upload | Single-song upload. Drag/drop files, auto-detect key from filename, tag type, push to Storage + Firestore. |
| `batchupload.html` | Batch Music Importer | Folder-drop bulk import. Cleans titles, fuzzy-matches to existing songs with a confidence score, groups by inferred song, dedupe/skip/force per row. |
| `song-summary.html` | Song Summary | Print/share view of one service's song list, keyed by date in the URL (`?date=YYYY-MM-DD`). |
| `Performancenotes.html` | Performance Notes | Notes against services/schedules/events. |
| `worshiphubapp.html` | Worship Hub | 123 KB landing app for the worship team. |
| `trainingmusicdatabase.html` | Song Library — TRAINING | Sandbox clone for training. |
| `EGBC-PlayThrough.html` | Play Through | **The one page with real DSP** — see §5. |

Location: `availability-form/` (with byte-identical copies in `availability-form-main/` and nested inside `v2/`). The newer `v2/` rebuild has **no music pages at all** — none of the above were carried over.

---

## 2. How it is built

Deliberately, aggressively low-tech:

- **One self-contained HTML file per app.** Markup, CSS and JS in one file. No imports between pages, no shared components in the music pages.
- **No build step. No npm, no bundler, no framework.** Vanilla DOM JS, `innerHTML` string templating, global functions wired via inline `onclick`.
- **Static hosting** — GitHub Pages at `https://esherchurch.github.io/availability-form/` (101 cross-references to that origin). Also surfaced through SharePoint at `esherchurch.sharepoint.com/sites/EGBCWorshipandAV`.
- **Firebase as the entire backend.** Project `egbc-worship-planner`, bucket `egbc-worship-planner.firebasestorage.app`. Firestore for data, Storage for files. Config is inlined in each page (public web API key — normal for Firebase; security rests on rules).
- **Mixed Firebase SDK versions**, a real inconsistency: `8.10.1` compat/global style (`firebase.firestore()`) in Library/uploader/batchupload, `10.7.1`/`10.12.2` modular ESM (`import { getFirestore }`) in song-summary and PlayThrough.
- **Shared design tokens**, copy-pasted into every page rather than linked:
  ```css
  --canvas:#eef4f3; --surface:#fff; --ink:#14201f; --body:#3a4d4c;
  --muted:#6b8281; --hairline:#dde7e6; --brand:#3d6263; --brand-dark:#2e4c4d;
  --brand-tint:#e7f0ef; --success:#3b7d23; --danger:#b0392c; --gold:#b07d2e;
  --r-sm:8px; --r-md:12px; --r-lg:18px; --r-pill:999px;
  ```
  Font: Montserrat 400–800. Uppercase 11px letterspaced labels, 26px/800 headings, soft shadows, rounded cards.
- **Defensive helpers** repeated in each file: `escapeHtml()`, `safeUrl()`, `jsAttr()`.

### The v2 platform (worth building into)

`v2/` is a partial rebuild that finally gave the suite shared infrastructure:

- `egbc-auth.js` (36 KB) — Firebase Auth plus a team/role model. Roles ladder: `member < leader < admin < owner`, checked per team via `roleAtLeast(userRoles, team, needed)`. Teams include AV Team, Kids Church, Worship. Page-level gating via a guard call with `{team, role}`.
- `egbc-shell.js` (16 KB) — injects a consistent top bar (logo, page title, back link, signed-in user) into any page with one script tag: `<script src="egbc-shell.js" data-title="Live Rota"></script>`. Its own comment notes: *"Before this, not one of the 47 pages linked anywhere: navigation lived entirely in SharePoint."*
- `egbc-guard.js`, `hub-app.js` (110 KB), `hub.html` — the team hub.
- `firebase.json` configures Firestore rules, Storage rules, and local emulators (auth 9099, firestore 8080, storage 9199, UI 4000).

A new app should almost certainly be a v2 page using `egbc-auth.js` + `egbc-shell.js`, not another orphan HTML file.

---

## 3. Data model (Firestore)

### `songs/{docId}`

Doc ID is derived from the title, and **every writer must agree on the scheme**:

```js
const docId = title.toLowerCase()
                   .replace(/[\\/]/g, "-")   // illegal in doc ids / storage paths
                   .replace(/\s+/g, "-");
```

```jsonc
{
  "title":      "Great Is Thy Faithfulness",
  "normalized": "great is thy faithfulness",   // lowercased, used for prefix search
  "artist":     "Chris Tomlin",                // often auto-scraped from YouTube
  "youtube":    "https://youtu.be/...",
  "ccli":       "1234567",
  "files": [
    {
      "name": "Great Is Thy Faithfulness (G).pdf",
      "url":  "https://firebasestorage.googleapis.com/...",  // download URL
      "type": "Chord Sheet",
      "key":  "G"
    }
  ]
}
```

- `type` is one of `Lead Sheet` | `Chord Sheet` | `Lyrics` | `Bass Tabs` | `Sheet Music` | `Other` — note the uploader and the library offer slightly different lists, a small existing bug.
- `key` is one of 34 values: 17 major (`C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B`) and the same 17 with `m` appended for minor.
- Title search uses `orderBy("normalized").startAt(n).endAt(n + "")` — prefix-only, no full-text index.

### `services/{id}`

```jsonc
{
  "date":  "2026-05-04",
  "order": [ { "type": "song", "title": "..." }, { "type": "item", "title": "Welcome" } ]
}
```

Song usage stats are computed **client-side** by pulling every service doc and scanning `order[]` for title matches — see `Library.html` → `getSongUsageStats()`. It reports all-time count, count in the last 3 months, and last-used date, and warns when a song has been used 2–3+ times recently. It is an O(all services) scan per song, cached in `servicesCache`.

### `songSummaries/{YYYY-MM-DD}`

```jsonc
{ "worshipLeader": "...",
  "items": [ { "type":"song", "idx":1, "title":"...", "ccli":"...", "keys":["G","A"], "notes":"..." } ] }
```
Legacy docs use a `songs` array instead of `items`; readers support both.

### Firebase Storage

```
songs/{docId}/{original-filename}
```

PDFs only. Written with `ref.put(file)` then `getDownloadURL()`; the resulting URL is denormalised into the Firestore `files[]` entry.

---

## 4. Existing cleverness worth stealing

- **Key detection from filename** (`music-uploader.html` → `detectKey`, `batchupload.html` → `detectKey`) — regex over 34 key names with word-boundary matching, longest-first search order so `C#` beats `C`.
- **Title cleaning** (`batchupload.html` → `cleanTitle`) — strips `.pdf`, bracketed text, `in G` / `key of Bb`, the words chord/lead/lyrics/bass/tab/sheet, and any bare key token, then normalises whitespace.
- **Fuzzy song matching with confidence** (`getMatches` / `getConfidence`) — word-overlap ratio against every known title, top 5 kept, scored high ≥0.7 / medium ≥0.4 / low.
- **Artist scraping** (`Library.html` → `smartScanArtist`) — `noembed.com/embed` against the YouTube URL, splits the video title on ` - `, ` | `, ` // `, ` — `, works out which half is the artist by comparing against the known song title, strips "lyrics/official video/live/HD/4k", falls back to `author_name` minus "- Topic". Never overwrites a hand-entered artist.
- **Lyrics search** (`handleLyricsSearch`) — iTunes Search API turns a lyric fragment into candidate track names, then keyword-overlap against the local library.

---

## 5. THE IMPORTANT PART FOR A DJ APP

### 5a. What the music suite gives you: nothing audio-related

Be blunt about this when planning:

- **No audio files.** Storage contains PDFs. Not one mp3/wav.
- **No BPM/tempo on any song record.**
- **No track duration, beat grid, downbeat, cue points, or energy data.**
- **No detected key.** `key` is per-PDF (the key that sheet is written in), hand-picked or guessed from the filename — it is not the key of a recording.
- **No playback UI anywhere in the music pages.**
- The YouTube link is the only pointer to a recording, and it is a URL, not a file you can decode. YouTube audio cannot legitimately be pulled into Web Audio in the browser.

So the song library is useful as a **catalogue and metadata spine**, and its Firestore/Storage/auth infrastructure is reusable — but the DJ app needs its own audio ingestion path from day one.

### 5b. What the wider suite gives you: two real audio codebases

**`availability-form/Videoeditor.html` (442 KB, self-described "v3")** — a full in-browser multitrack non-linear video editor. This is the closest existing thing to a DJ app and the single most valuable file to read. It already has:

- `generateWaveform()` (line ~1258) — fetch → `arrayBuffer` → `decodeAudioData` → 512 peak buckets (max-abs per block) cached in `_waveformCache`, drawn to a per-clip `<canvas>` by `drawWaveform()` (line ~1285).
- A **multitrack timeline model**: tracks → clips, with drag, snapping, trim, per-track mute, undo/redo, thumbnails.
- **Mixdown** (line ~4997): creates a 48 kHz stereo `AudioBuffer` sized to the export duration and sums every clip's samples into `outL`/`outR` manually, skipping clips outside the export range.
- **A fallback decoder** (line ~5050) for files `decodeAudioData` rejects: route an `<audio>` element through a realtime `AudioContext` → `createMediaElementSource` → `MediaRecorder`, capture WebM/Opus, then decode that. The in-file comment notes this is needed because `OfflineAudioContext` has no `createMediaElementSource`.
- `createMediaElementSource` graph wiring, buffer caching by URL, WebCodecs export.
- Audio extensions already handled: `.mp3 .wav .aac .ogg .flac .m4a`.

**`availability-form/EGBC-PlayThrough.html`** — genuine DSP, already shipped:

- Uploads an audio file, decodes it, and runs **chroma-based chord detection**: `fftSize = 4096`, `hopSize = 2048`, sliding window every 0.5 s over the raw PCM, manual DFT per window, energy folded into 12 pitch classes, normalised, mapped to a chord — producing a chord timeline broken down by song section.
- Uses `OfflineAudioContext` and an `AnalyserNode`.
- Arrangements carry a `tempo` field rendered as `"{n} BPM"` — but it defaults to `null` and is **hand-entered, not detected**.

**Chroma extraction is already half of harmonic mixing**, and the same windowed analysis loop is the natural place to bolt on spectral-flux onset detection.

### 5c. What genuinely has to be built new

- **Beat/tempo detection** — onset detection (spectral flux over the existing FFT windows) → tempo estimation (autocorrelation or comb filter) → phase/downbeat alignment → beat grid. Options: hand-roll on the PlayThrough loop, or `web-audio-beat-detector`, `aubiojs`, `essentia.js` (WASM).
- **Time-stretching independent of pitch.** This is the big one. `AudioBufferSourceNode.playbackRate` changes pitch along with speed, which is not acceptable for beat matching across tracks. You need a phase vocoder or WSOLA: `SoundTouchJS`, Rubber Band compiled to WASM, or `signalsmith-stretch`. Decide this early — it shapes the whole audio graph and the export path.
- **Sample-accurate scheduling** — everything scheduled against `AudioContext.currentTime` with a look-ahead scheduler, never `setTimeout`.
- **Deck/mixer graph** — per-deck gain, 3-band EQ (`BiquadFilterNode`), crossfader curve, cue/pre-listen on a second output.
- **Cue points, loops, a transition planner**, and a persisted setlist.
- **Key detection of recordings + Camelot wheel** for harmonic mixing — the chroma work in PlayThrough is the starting point.

### 5d. Constraints to design around

- **Static hosting, no server, no build step.** Any WASM/library has to be CDN-loadable or vendored into the repo. All heavy DSP runs client-side — use `AudioWorklet` + Web Workers so analysis does not block the UI.
- **File size discipline.** These are single HTML files; Videoeditor is already 442 KB in one. A DJ app is probably where the suite should finally split into modules, or at least a separate `.js` alongside, as v2 does.
- **Storage cost and quota change character.** Going from PDFs (tens of KB) to audio (tens of MB per track) is a materially different Firebase Storage bill and a different rules/CORS posture. Confirm the plan tier before designing around cloud-stored audio — a local-file / File System Access API model may be better, with only metadata and beat grids in Firestore.
- **CORS**: `fetch` + `decodeAudioData` on Storage download URLs works today for the video editor, so the pattern is proven, but cross-origin audio needs the bucket CORS config kept correct.
- **Auth**: reuse `egbc-auth.js` roles rather than inventing new ones.
- **Naming/ID conventions**: if the DJ app touches `songs/`, it must use the exact same doc-ID derivation (§3) or it will silently fork the library.

### 5e. Suggested new data shape (does not exist yet)

```jsonc
// tracks/{trackId}
{
  "songId": "great-is-thy-faithfulness",  // optional link back to songs/
  "title": "...", "artist": "...",
  "audioUrl": "...", "durationSec": 214.7, "sampleRate": 44100,
  "bpm": 128.02, "bpmConfidence": 0.91,
  "firstBeatSec": 0.412,                  // beat grid = firstBeat + n*(60/bpm)
  "beatGrid": [],                         // explicit beat times for variable-tempo material
  "musicalKey": "8A",                     // Camelot
  "peaks": "...",                         // downsampled waveform, base64 Float32
  "cuePoints": [ { "name": "drop", "sec": 64.2 } ],
  "analysedAt": "2026-09-05T00:00:00Z"
}
// setlists/{id}: ordered track refs + per-transition { type, bars, startBeat }
```

---

## 6. Quick reading order for the new project

1. `availability-form/Videoeditor.html` — timeline model, waveforms, mixdown, decoder fallback. **Read this first.**
2. `availability-form/EGBC-PlayThrough.html` — the FFT/chroma analysis loop.
3. `v2/egbc-auth.js` + `v2/egbc-shell.js` — the platform to build into.
4. `availability-form/Library.html` — the song data model and house UI style.
5. `availability-form/batchupload.html` — filename parsing and fuzzy matching, directly reusable for importing a folder of audio.

---

## 7. Honest summary in one line

The music suite is a Firebase-backed **PDF sheet-music library** with good metadata hygiene and no audio; the beat-matching app inherits its infrastructure, auth, design language and catalogue, but inherits its *audio engine* from `Videoeditor.html` and its *DSP* from `EGBC-PlayThrough.html` — and still needs tempo detection and time-stretching built from scratch.
