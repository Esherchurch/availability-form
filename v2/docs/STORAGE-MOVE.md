# Moving file storage to London

GOING-LIVE item 3. The hub's files (song PDFs, pictures, sermon audio, documents) are in a bucket in Iowa, USA (`egbc-worship-planner.firebasestorage.app`, US-CENTRAL1). The spec sheet promises London. This moves them to a new bucket in London (europe-west2).

**Nothing is ever deleted.** The old bucket stays exactly as it is, and keeps working, for as long as anything still uses it.

The tool is `tools/storage-move.mjs`. It has three steps:

| Step | What it does |
|---|---|
| `copy` | Copies every file into the London bucket, with its download key, so every existing link works there. Also gives the new bucket the old one's web settings (CORS), and lists empty (0-byte) files. |
| `tokens` | Before the day, on the old bucket: a stored link whose download key isn't the file's current one is pointed at its current key. The bucket isn't changed, so it is safe for the original site. |
| `check` | Reads only: opens a sample of stored links from London and lists any that don't open, and why. |
| `links` | Rewrites every stored download link in the database, top level and every church's, from the old bucket to the new one, repairing its key the same way. `--reverse` takes them back. |
| `switch` | Changes the code so new uploads go to London: one commit. |

**Download keys are never added to a file or changed.** Only the stored links change, to the key the file already has.

Each step only **reports** what it would do, unless you add `--apply`. Each is safe to run again: a second run does only what is left.

Run `copy` and `links` from `v2/functions`, signed in with `gcloud auth application-default login`. Run `switch` from `v2`.

## Why the order matters

The original site keeps uploading to the old bucket, and reading from it, until its rules lock on going-live day (step 10). Its song links must keep working. So:
- the old bucket is never touched: old links keep opening;
- the London bucket is filled **before** anything points at it;
- a file uploaded to the old bucket after a copy is picked up by the next run. Run `copy` and then `links` again, and the dry run shows how many are left.

## Step 1: make the London bucket (Martin, in the console, any time before)

1. Go to **console.firebase.google.com** and open **egbc-worship-planner**.
2. In the left-hand menu, choose **Build**, then **Storage**.
3. At the top of the Files tab, open the bucket menu (it shows `gs://egbc-worship-planner.firebasestorage.app`) and choose **Add bucket**.
4. Choose **Set up a bucket without a default name**, then type the name **egbc-worship-planner-london**.
5. For **Location**, choose **Region**, then **europe-west2 (London)**.
6. Leave the storage class as **Standard** and press **Create**.
7. Check: the bucket menu now lists both buckets, and the new one says **europe-west2**.

Adding the bucket from Firebase (not from Google Cloud) links it to Firebase, which download links need.

## Step 2: the first copy (any time before; it can take a while)

```
node ../tools/storage-move.mjs copy --to egbc-worship-planner-london
node ../tools/storage-move.mjs copy --to egbc-worship-planner-london --apply
```

The first command says how many files and MB there are to copy. Run the second when happy.
- **Check:** run the first command again. It should say "still to copy: 0".
- **Check:** open the London bucket in the console and see the same folders as the old one: songs, kb, sermons, church...
- **Empty files:** the copy lists any 0-byte files (they are empty in the old bucket too). Upload those songs again from the computer.

## Step 2b: repair stored links whose key is out of date (before the day)

Some stored links carry a download key the file no longer has (for example after a file was replaced). They open today only because the old bucket's rules are wide open, and they would not open from London. This points them at the file's current key, on the old bucket, without moving anything:

```
node ../tools/storage-move.mjs tokens
node ../tools/storage-move.mjs tokens --apply
```

The dry run lists each link it would repair. Run it again until it lists none.

## Step 2c: sample links from London (the going-live test, after the first copy)

```
node ../tools/storage-move.mjs check --to egbc-worship-planner-london --count 200
```

This reads only. It opens up to 200 stored links from London and lists any that don't open: a key out of date (run `tokens`), an empty file, or a file not copied yet (run `copy`).
- **Check:** "N open", with nothing listed except files you already know are empty.

## Step 3: on the day, before the rules (GOING-LIVE item 3)

1. **The code switch** (the main window, or whoever is on duty), from `v2`:
   ```
   node tools/storage-move.mjs switch --to egbc-worship-planner-london
   node tools/storage-move.mjs switch --to egbc-worship-planner-london --apply
   ```
   This changes `storageBucket` in egbc-auth.js and egbc-db.js, the functions' `initializeApp`, the converter's default, and `firebase.json`, so the storage rules go on both buckets.
   - Bump egbc-auth.js's stamp on every page.
   - The tool lists the tests that name the old bucket; move them in the same commit.
   - Commit and push.
2. **Deploy:**
   - the functions: `--only functions:hub`;
   - the converter;
   - **today's storage rules on the London bucket**: `firebase deploy --only storage`, with the new firebase.json. A new bucket refuses uploads until it has rules, and these are the rules the old bucket has now, not the locked ones.
   - From this moment, the new hub uploads to London.
3. **Copy what came in since step 2:** `copy`, then `copy --apply`.
4. **Rewrite the links:** `links` reports how many there are and in which collections. Then `links --apply`.
   - Run it at a quiet time: each rewritten record counts as a change, and anything watching it runs as for an edit.
5. **Check:** `links` again says "0 old links". `copy` again says "still to copy: 0".

## Step 4: after the rules lock (going-live step 10)

From step 10, the original site can no longer upload. Anything it uploaded between step 3 and step 10 is in the old bucket only, with old links. So:
1. `copy`, then `copy --apply`.
2. `links`, then `links --apply`.
3. **Check:** both dry runs say 0.

Repeat whenever a dry run finds something; it is always safe.

## Going back (only if London has to be abandoned on the day)

If uploads or downloads fail on London and can't be fixed on the day:
1. Put back the code: revert the switch commit, bump egbc-auth.js's stamp, push, and deploy the functions and the converter again.
2. Put back the old bucket's open rules if the locked rules were already deployed, so the original site keeps working: deploy the previous `storage.rules` to the old bucket.
3. Take the links back:
   ```
   node ../tools/storage-move.mjs links --to egbc-worship-planner-london --reverse
   node ../tools/storage-move.mjs links --to egbc-worship-planner-london --reverse --apply
   ```
4. Files uploaded to London in the meantime are only in London. Copy them back by hand, from the console, before switching again.

Nothing is deleted either way: both buckets keep their files.

## What happens to...

- **Files uploaded between a copy and the switch:** they are in the old bucket only. Their links open, because the old bucket keeps working. The next `copy` brings them over, and the next `links` points their links at London.
- **Files deleted from the old bucket after they were copied:** their London copy stays. Nothing is deleted, and nothing points at it any more.
- **Links written into pages' own code** (some old pages' logos): they keep opening from the old bucket, which stays.
- **Other buckets** named in stored links: `links` reports them and leaves them alone.

## Checks, all together

- `copy` dry run: "still to copy: 0".
- `links` dry run: "0 old links".
- A new upload (a picture on Home, a song PDF) lands in the London bucket in the console.
- A sample of old pictures, sermon audio and kb videos still open from their links.
