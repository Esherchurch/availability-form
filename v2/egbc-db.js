/* ===================================================================
   EGBC Suite — the one signed-in data connection (modular SDK)
   ===================================================================

   For pages written with the modular Firebase SDK. Compat pages do not need
   this: they use EGBCAuth.db, which is the same connection by another handle.

   WHY THIS EXISTS. Firebase keeps the signed-in user per app. A page that
   called initializeApp(config) made a second, nameless app, and that app had
   nobody signed in - so its reads and writes went out unauthenticated even
   though the page had just checked the login. The rules allow that today,
   which is the only reason those pages work, and it is what stops
   firestore.rules being deployed.

   It also meant "served from localhost" did not imply "talking to the
   emulator", because the emulator hook lives in egbc-auth.js, on the shared
   app only. That is how five test records reached the live database.

   WHAT WAS MEASURED. Reading a document that needs an active member, in the
   emulator with firestore.rules loaded:

     the shared compat connection (EGBCAuth.db) ....... allowed
     a modular app with its own name ................. denied
     a modular app named 'egbc', no modular Auth ..... denied
     a modular app named 'egbc' WITH modular Auth .... allowed, same uid

   So sharing the app name is not enough on its own. The name decides which
   stored session is read, but something has to read it: without an Auth
   instance for that app there is no token, and the request goes out anonymous.
   Hence getAuth below, and `ready`.

   HOW TO USE IT. Replace the page's own config and initializeApp with:

     import { db, ready } from './egbc-db.js';
     await ready;          // the user is known from here on

   and drop the page's firebaseConfig block. Everything else about the page
   stays as it is - the same collection(), onSnapshot(), addDoc() calls.

   Await `ready` before the first read or write. Firestore will happily send a
   query before the session has been restored, and that one goes out anonymous
   even though every later one is fine.
   =================================================================== */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage, connectStorageEmulator } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { getAuth, connectAuthEmulator, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

/* The same project, and the same app name egbc-auth.js uses. The name is the
   whole point: it is what makes this the same session rather than a new one. */
const CONFIG = {
  apiKey: 'AIzaSyCl2enA5LPKrHcxYP1K64c1ZNK744RO9R4',
  authDomain: 'egbc-worship-planner.firebaseapp.com',
  projectId: 'egbc-worship-planner',
  storageBucket: 'egbc-worship-planner.firebasestorage.app',
  messagingSenderId: '199442060489',
  appId: '1:199442060489:web:7eaf85a76334c753db6918'
};
const APP_NAME = 'egbc';

export const app = getApps().find(a => a.name === APP_NAME) || initializeApp(CONFIG, APP_NAME);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/* Local work talks to the emulator, exactly as egbc-auth.js does for the
   compat side - ports from firebase.json. Without this a page served from
   localhost writes to the live database, which is not a theoretical risk:
   it has happened. Must run before the first operation, which is why it is
   here at import time rather than in a start function. */
export const usingEmulator =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1';

if (usingEmulator) {
  try {
    connectFirestoreEmulator(db, 'localhost', 8181);
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectStorageEmulator(storage, 'localhost', 9199);
    console.info('EGBCDb: using local emulators');
  } catch (e) {
    console.warn('EGBCDb: emulator not available', e.message);
  }
}

/* Resolves once the session has been restored, with the user or null. Await
   it before the first read or write. */
export const ready = new Promise(resolve => {
  const stop = onAuthStateChanged(auth, user => { stop(); resolve(user); });
});

/* So a page, or a test, can say which database it is actually talking to. */
export function connectionInfo() {
  let host = 'unknown';
  try { host = (db.toJSON && db.toJSON().settings && db.toJSON().settings.host) || (db._settings && db._settings.host) || 'unknown'; }
  catch (e) {}
  return { app: app.name, host: host, emulator: usingEmulator, uid: (auth.currentUser && auth.currentUser.uid) || null };
}
