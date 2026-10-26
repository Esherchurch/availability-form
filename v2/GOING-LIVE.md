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
  signing in. Every other church already has the Permissions screen's
  answer (storage.churches.rules). **The change, one line in
  `storage.rules`:**
  `function kbMayUpload() { return true; }` becomes
  `function kbMayUpload() { return request.auth != null && 'kbUpload' in request.auth.token.get('perms', {}).get('egbc', []); }`,
  then `node tools/rules-build.mjs` (the church build swaps the function by
  its exact text, so update the build's `KB_EGBC` to the new line too).
  The claim is on everyone's sign-in already (functions/permissions.js).
- **The ChurchSuite import, private part** (F-177): only after the rules
  are live.
- **Each event's leaders kept by member id** (FINDINGS-events F-287): at the
  same moment as the Firestore rules, run `node tools/migrate-leader-info.mjs`
  (it lists what it would change), check the list, then run it again with
  `--write`. The reviewing window runs it. Not before the rules: the rules
  live today would refuse later saves of a migrated record.
- **Apps and downloads (`hub_resources`)**: shared with the original site's
  hubresources.html, which edits it with a password written into its own
  page. v2's page lists the hub app and the web links only, and changes
  nothing. With the rules live, only master admins can change the list;
  give v2's page an editor for master admins then, and take out the old
  app entries once the original site has retired.
