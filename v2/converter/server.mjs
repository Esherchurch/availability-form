/* ===================================================================
   EGBC Present - the converter's web service (Cloud Run; F-242)
   ===================================================================

   POST /convert  { deckId }         -> { count }   (the PowerPoint already uploaded)
   POST /convert  { deckId, link }   -> { count }   a OneDrive/SharePoint link: fetched
                  here first (up to 1 GB, streamed into Storage - fetch.mjs)
                  either may carry churchId: a church's deck, in that church's
                  own data and files (church.mjs; H-6)
   Called only by the hub's presentConvert function. Cloud Run is set to
   require sign-in ("--no-allow-unauthenticated"), so nobody else can call
   it; it runs as a service account that may read and write the project's
   Storage and Firestore. It scales to zero: no cost while nobody converts.

   Deploy (Martin), once, from v2/converter:
     gcloud run deploy egbc-converter --source . --region europe-west2 \
       --no-allow-unauthenticated --memory 4Gi --cpu 2 --timeout 900 \
       --min-instances 0 --max-instances 2 --concurrency 1
   then give the hub's functions its address (CONVERTER_URL) and the
   "Cloud Run Invoker" role on it.
   MICROSOFT 365 (F-252): with these the slides are drawn by Microsoft's own
   PowerPoint (Aptos and all), LibreOffice only if that fails:
     --set-env-vars MS_TENANT_ID=...,MS_CLIENT_ID=...,MS_SITE=esherchurch.sharepoint.com:/sites/<site>
     --set-secrets MS_CLIENT_SECRET=egbc-ms-client-secret:latest
   (the app registration and its one permission: FINDINGS F-252, microsoft.mjs).
   Fonts a deck uses but does not carry, for the LibreOffice route: font
   files the church is licensed to use, in Storage at converter-fonts/
   (Firebase console, Storage, a folder of that name) - not Aptos, whose
   licence does not cover a server (Martin, 20 Oct); the Microsoft route
   draws Aptos itself. A new instance adds them before its first deck.
   =================================================================== */
import http from 'node:http';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { runJob, loadChurchFonts } from './convert.mjs';
import { validChurchId, churchDb, churchBucket } from './church.mjs';

const BUCKET = process.env.BUCKET || 'egbc-worship-planner.firebasestorage.app';
if (!getApps().length) initializeApp({ storageBucket: BUCKET });

export function makeServer({ render, allowLocal = false } = {}) {
  return http.createServer((req, res) => {
    const done = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST' || req.url !== '/convert') return done(404, { error: 'not found' });
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on('end', async () => {
      let deckId = '', link = '', churchId = '';
      try { const b = JSON.parse(raw || '{}'); deckId = String(b.deckId || ''); link = String(b.link || ''); churchId = String(b.churchId || ''); } catch (e) { return done(400, { error: 'bad request' }); }
      if (!/^[A-Za-z0-9_-]{6,60}$/.test(deckId)) return done(400, { error: 'which deck?' });
      if (churchId && !validChurchId(churchId)) return done(400, { error: 'which church?' });
      /* the fonts are the project's own (converter-fonts/), for every church */
      if (!render) await loadChurchFonts(getStorage().bucket());
      const out = await runJob({ db: churchDb(getFirestore(), churchId), bucket: churchBucket(getStorage().bucket(), churchId), deckId, link, render, allowLocal });
      done(out.status, out.body);
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  makeServer().listen(process.env.PORT || 8080, () => console.log('converter ready'));
}
