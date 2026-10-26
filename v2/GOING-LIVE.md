# Going live: what changes on the day

What waits for the hub to go live, because doing it sooner would change
how the original site works. Each item says what it goes with. The events
window's own list is SWITCHOVER-events.md.

## With the rules (Firestore and Storage)

The rules go live when the hub goes live, never before.

- **`kb/` uploads only for the people the Permissions screen allows**
  (FINDINGS-churchhq H-13, H-14; Martin: "only admins and core team").
  Today anyone can upload a video or picture to `kb/` with no sign-in: it
  cannot be deleted, and every upload is a public link on the church's
  bucket. It stays open until then because the original site's
  EGBC-Troubleshoot-AV.html uploads to `kb/troubleshoot-av` without
  signing in. The change: the `kb/{page}/{fileName}` write in
  `storage.rules` asks for the `kbUpload` permission (H-14's claim), then
  `node tools/rules-build.mjs` (both rulesets are built from it). If H-14
  is not built by then, `request.auth != null` at the least.
- **The ChurchSuite import, private part** (F-177): only after the rules
  are live.
