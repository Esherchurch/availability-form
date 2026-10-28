/* WHICH CHURCH A DECK IS (H-6; the events window). The hub's presentConvert
 * says which church, from the presenter's sign-in; nobody else can call the
 * converter (Cloud Run requires the hub's own service account). A church's
 * decks and notes are in churches/<id>/..., its files under
 * churches/<id>/present/<deck>/. No church: EGBC's top level, as before.
 * The same rules as the hub's church-scope.js scopedDb and church-files.js
 * churchBucket, copied because the converter is deployed on its own.
 */
export const validChurchId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(id) && id !== 'egbc';

export function churchDb(db, churchId) {
  if (!churchId) return db;
  const root = db.collection('churches').doc(churchId);
  return {
    churchId,
    collection: (name) => root.collection(name),
    doc: (p) => db.doc('churches/' + churchId + '/' + String(p).replace(/^\/+/, '')),
    batch: () => db.batch(),
    runTransaction: (fn, o) => db.runTransaction(fn, o)
  };
}

export function churchBucket(bucket, churchId) {
  if (!churchId) return bucket;
  const pre = 'churches/' + churchId + '/';
  const p = (x) => { x = String(x == null ? '' : x).replace(/^\/+/, ''); return x.startsWith(pre) ? x : pre + x; };
  return {
    name: bucket.name, churchId, raw: bucket,
    file: (x, o) => bucket.file(p(x), o),
    getFiles: (o = {}) => bucket.getFiles(Object.assign({}, o, { prefix: p(o.prefix) })),
    deleteFiles: (o = {}) => bucket.deleteFiles(Object.assign({}, o, { prefix: p(o.prefix) }))
  };
}
