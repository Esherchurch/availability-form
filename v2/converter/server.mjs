/* ===================================================================
   EGBC Present - the converter's web service (Cloud Run; F-242)
   ===================================================================

   POST /convert  { deckId }   -> { count }
   Called only by the hub's presentConvert function. Cloud Run is set to
   require sign-in ("--no-allow-unauthenticated"), so nobody else can call
   it; it runs as a service account that may read and write the project's
   Storage and Firestore. It scales to zero: no cost while nobody converts.

   Deploy (Martin), once, from v2/converter:
     gcloud run deploy egbc-converter --source . --region europe-west2 \
       --no-allow-unauthenticated --memory 2Gi --cpu 2 --timeout 300 \
       --min-instances 0 --max-instances 2
   then give the hub's functions its address (CONVERTER_URL) and the
   "Cloud Run Invoker" role on it.
   Fonts a deck uses but does not carry (Aptos, Office's own cloud font):
   put the font files the church may use in Storage at converter-fonts/
   (Firebase console, Storage, a folder of that name). A new instance adds
   them before its first deck.
   =================================================================== */
import http from 'node:http';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { convertDeck, loadChurchFonts } from './convert.mjs';

const BUCKET = process.env.BUCKET || 'egbc-worship-planner.firebasestorage.app';
if (!getApps().length) initializeApp({ storageBucket: BUCKET });

export function makeServer({ render } = {}) {
  return http.createServer((req, res) => {
    const done = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST' || req.url !== '/convert') return done(404, { error: 'not found' });
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on('end', async () => {
      let deckId = '';
      try { deckId = String(JSON.parse(raw || '{}').deckId || ''); } catch (e) { return done(400, { error: 'bad request' }); }
      if (!/^[A-Za-z0-9_-]{6,60}$/.test(deckId)) return done(400, { error: 'which deck?' });
      if (!render) await loadChurchFonts(getStorage().bucket());
      try { done(200, await convertDeck({ db: getFirestore(), bucket: getStorage().bucket(), deckId, render })); }
      catch (e) { done(422, { error: String(e.message || e) }); }
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  makeServer().listen(process.env.PORT || 8080, () => console.log('converter ready'));
}
