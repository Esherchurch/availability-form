/* A CHURCH'S FILES: Storage under churches/<id>/ (H-6; the events window).
 *
 * A church's files sit under churches/<id>/ with the same path below as
 * EGBC's (storage.churches.rules is generated that way; EGBCAuth.storage()
 * and egbc-db.js's storage write there). churchBucket(bucket, id) is the
 * bucket a function hands its code, as scopedDb is the db: .file(path),
 * .getFiles({ prefix }) and .deleteFiles({ prefix }) reach the church's own
 * folder, and a path that already carries the church is left as it is. For
 * EGBC (no id) it is the bucket itself, exactly as before.
 *
 * converter/church.mjs is the same, for the converter (deployed apart).
 */
import { validChurchId } from './hq-directory.js';

export function churchBucket(bucket, churchId) {
  if (!churchId) return bucket;
  if (!validChurchId(churchId)) throw new Error('Not a church id: ' + churchId);
  const pre = 'churches/' + churchId + '/';
  const p = (x) => { x = String(x == null ? '' : x).replace(/^\/+/, ''); return x.startsWith(pre) ? x : pre + x; };
  return {
    name: bucket.name, churchId, raw: bucket,
    file: (x, o) => bucket.file(p(x), o),
    getFiles: (o = {}) => bucket.getFiles(Object.assign({}, o, { prefix: p(o.prefix) })),
    deleteFiles: (o = {}) => bucket.deleteFiles(Object.assign({}, o, { prefix: p(o.prefix) }))
  };
}
