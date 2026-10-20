# Unsplash: applying for Production

Screenshots for Church HQ's Production application. They are made by
`tests/check-unsplash-pages.mjs` (Unsplash answered by a pretend server,
with drawn pictures and made-up photographer names). Once the key is set,
take them again with real photos for the application: the same steps on the
live hub.

| Screenshot | What it shows Unsplash |
|---|---|
| 1-search.png | Searching from the e-news editor. Each picture shows "Photo by <name> on Unsplash", both linked with `utm_source=church_hq&utm_medium=referral`. The footer links to Unsplash and the Unsplash License. |
| 2-editor.png | A chosen picture as the week's picture, shown from images.unsplash.com. Its credit sits under it and in the side panel. |
| 3-email.png | The email as sent: the picture is hotlinked and "Photo by <name> on Unsplash" sits under it, both linked. |
| 4-card-maker.png | The card maker drawing a social-media card from an Unsplash picture, with the credit noted. |
| 5-caption.png | The card's caption ending "Photo by <name> on Unsplash". |

How Church HQ follows the API guidelines (functions/unsplash.js):

- **Hotlinking.** Pictures are always shown from the `urls` Unsplash returns. They are never copied into our storage.
- **Download tracking.** When someone puts a picture on a card or into an email, the server calls that photo's `links.download_location`. A ping that can't go straight away waits, and goes with the next call.
- **Attribution.** "Photo by <name> on Unsplash" appears in the picker, in the email and in the caption, with the UTM tags.
- **The key.** It is held only on the server, in Secret Manager as `UNSPLASH_ACCESS_KEY`, and never sent to a page.
- **Demo mode's 50 requests an hour.** Each search is kept for a day. The server stops at 45 an hour, then answers from what it has kept, or asks people to try again later.
- **Name.** The app is named Church HQ, not anything that could be taken for Unsplash.

Suggested description for the application: "Church HQ is a church's
administration hub. The church office uses Unsplash to find pictures for its
weekly e-news emails and its social-media cards. Pictures are hotlinked and
credited to their photographers, and each use is reported through the
download endpoint."
