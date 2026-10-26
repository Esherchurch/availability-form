# Going live: what changes on the day

What waits for the hub to go live, because doing it sooner would change
how the original site works. Each item says what it goes with. The events
window's own list is SWITCHOVER-events.md.

## With the rules (Firestore and Storage)

The rules go live when the hub goes live, never before.

- **`kb/` uploads require sign-in** (FINDINGS-churchhq H-13). Today anyone
  can upload a video or picture to `kb/` with no sign-in: it cannot be
  deleted, and every upload is a public link on the church's bucket. It
  stays open until then because the original site's
  EGBC-Troubleshoot-AV.html uploads to `kb/troubleshoot-av` without
  signing in. The change: `request.auth != null` on the `kb/{page}/{fileName}`
  write in `storage.rules`, then `node tools/rules-build.mjs` (both
  rulesets are built from it). v2's How-to and Play-through pages already
  sign in, so they keep working.
- **The ChurchSuite import, private part** (F-177): only after the rules
  are live.
