# The ease test, on this PC

The aim (plan D10): someone who knows Mailchimp makes a normal week's e-news in under 30 minutes, without help. The live editor can't save until switch-over, so the test runs on this PC.

## Before the tester arrives (about two minutes)

1. Open a terminal in the repo's `v2` folder.
2. Run:

   ```
   node ease-test/run.mjs
   ```

3. Wait for **READY**, about a minute the first time. Chrome then opens with a fresh profile of its own, not anyone's usual one:
   - **The hub's home page,** signed in as the church office.
   - **"Inbox (this PC)",** a second tab. "Send me a test" lands here. Nothing leaves the PC.
   - **Behind them, already set up:**
     - this week's e-news, drafted by the hub from What's On (four events), Sunday and a notice;
     - six pictures in the church's picture library.
4. **The tester** gets `v2/ease-test/task-sheet.html`, printed or open on another screen.
5. **The person watching** opens http://localhost:5701/ease-test/observer.html in their own browser. Their notes are kept there, so they survive the test stopping.

The login, if it ever asks, is `tester@example.invalid`, password `ease-test-only`. It exists only in this PC's test emulator.

## Afterwards

- In the observer's form, press **Copy the results** and paste them into FINDINGS-comms (or send them to the comms window).
- **Ctrl+C** in the terminal, or closing that Chrome, stops everything: Chrome, the emulator and the web server. Nothing is kept.
- **For the next tester,** run the same command again. It starts afresh.

## Notes

- **Its own emulator.** `firebase.ease.json` uses Firestore 8392, Auth 9392 and functions 5393, so no other window's emulator or check is disturbed.
- **Everything is made up.** The church week is invented, and the pictures are drawn. No real people are involved, and nothing touches the live hub.
- **Search Unsplash** isn't part of the test. It can't search here, because this PC has no Unsplash key.
- **Checking the set-up works:** `node ease-test/run.mjs --self-check` runs the same set-up in a hidden Chrome. It checks the draft, sign-in, the pictures, the Bible and the test email reaching the Inbox, then stops.
