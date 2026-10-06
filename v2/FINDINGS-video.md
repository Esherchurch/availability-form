# Findings — knowledge-base videos onto Firebase (Step V)

Numbered for the Code windows. Every claim about existing code was made after
opening the file named; every measurement was taken in the emulator.

Opened 2026-10-06.

---

## V-001 — the four pages had to move onto the shared connection first

Not a choice. The shared uploader puts files through `EGBCAuth.storage()`, and
`NEXT-BRIEF.md` §0 forbids pressing anything that saves on a page that starts
its own Firebase app, because on localhost that app is the **live** database.
All four knowledge-base pages did exactly that, so Step V could not have been
proved against the emulator without moving them.

So they are now on the one signed-in connection, the same way CoreTeamApp was
in Step B: own `initializeApp` removed, `db` and `storage` pointed at
`EGBCAuth`. That takes the Step B count from 29 outstanding to 25.

All four were also loading **`firebase-app-compat.js` twice**, the same fault
found on CoreTeamApp in Step B — the second load replaces the global namespace
and invalidates the app `egbc-auth.js` made, which is what makes
`EGBCAuth.storage()` throw. De-duplicated, and `firebase-storage-compat.js`
added to the three that had never needed it before.

## V-002 — one uploader, and the proof that it is one

`v2/egbc-kbupload.js` holds the upload, the replace, the transcript helpers and
the speech engine. The engine was **moved** out of `EGBC-Troubleshoot-AV.html`,
not rewritten — 132 lines deleted there, the same code here, still exposing
`window.KBTranscribe` so nothing else on that page had to change. It is pulled
in with a dynamic `import()`, so the file can stay a classic script and any page
can load it with one plain tag.

The upload and replace UI is mounted by the shared file too
(`EGBCKBUpload.mountPanel`), so the four pages carry a container and one call
rather than four copies of a form.

**The break test is what shows it is genuinely shared.** With one line broken in
`egbc-kbupload.js`, all four pages fail both their upload and their replace
checks — 20/20 passing becomes 8/20. The file restored byte-identical.

## V-003 — "Replace video file" keeps the entry, and that is the point

An entry that still plays from SharePoint keeps its id, title, category, tags,
transcript and bullets; only `contentURL` and `storagePath` change. Replacing
rather than re-adding is what stops the pages filling with duplicates as the
videos move across, and it means no link anybody has already shared breaks.

A transcript is only made when there is not one already, so replacing a file can
never quietly throw away somebody's corrections.

## V-004 — what the proof did and did not cover

Against the emulator, on each of the four pages: a synthetic video uploaded
through the panel, stored under that page's own `kb/...` path, an entry created
with a transcript and bullets; then "Replace video file" on a seeded SharePoint
entry, which ended with a Firebase URL, the same id, and title, category, tags
and transcript unchanged. **20 of 20.**

**Whisper itself was not run.** The model is about 150 MB and downloads on first
use, which is not something to do in a headless test on every run. The transcript
path is exercised by substituting `EGBCKBUpload.transcribe`, which proves the
page stores what comes back. The engine is unchanged code moved from a page that
has been using it in production.

The files uploaded were a few bytes of synthetic data. **None of Martin's real
videos were touched**, as the brief required.

## V-005 — the SharePoint gate, and what it cannot see

`v2/check-sharepoint.mjs` is rerunnable and lists every `sharepoint.com`
reference in v2 that would do something at run time. It blanks out comments
first, so the notes in `egbc-shell.js` and `hub-app.js` do not read as links,
and it ignores `SharepointHeader.html`, which exists to be embedded *inside*
SharePoint and is not touched or deleted.

It reads **0**. Six functional references went:

| Where | Was |
|---|---|
| How-To AV, Play-Through, Worship Training | `SP_SITE`, and the call that fetched a Stream transcript |
| Play-Through | a direct-URL autofill that built a SharePoint path from the title |
| Play-Through | `SP_VIDEO_BASE` / `generateDirectURL`, which guessed a video's location |
| `trainingportalhub.html` | the "Hub Home" button, now pointing at `hub.html` |

All four pages now refuse a SharePoint link if one is pasted into the old embed
box, and say to upload the file instead.

**What the gate cannot see is the database.** Entries whose `contentURL` is
still a SharePoint link live in Firestore. Those are data, and each moves when
somebody uses "Replace video file". The Replace list marks them —
"— on SharePoint" against the title — and `window.kbSharePointLeft()` on any of
the four pages returns the ones left, so nobody has to go through them by hand.

## V-006 — the transcript fetch is gone, not replaced

How-To AV, Play-Through and Worship Training used to pull the transcript out of
Stream when an embed code was pasted. That call is removed rather than
reimplemented: the transcript now comes from the uploader, made on the computer
doing the upload, with timings. Pasting an embed code still works for anything
that is not a SharePoint link, and the transcript box is still there to paste
into by hand.

## V-007 — Play-Through's chord analysis is untouched

Checked rather than assumed: the file button that analyses audio for chords is a
separate path that never stored the video, and nothing in this step went near
it. Only the SharePoint URL guessing was removed from that page.
