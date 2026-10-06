/* ===================================================================
   EGBC Suite — knowledge-base video upload, transcription and replace
   ===================================================================

   WHY THIS EXISTS. All four knowledge-base pages hold the same shape of
   record — title, assetType, contentURL, storagePath, category, tags,
   transcript, bullets, published, createdAt — but only Troubleshoot AV could
   ever put a video into Firebase. How-To AV took a SharePoint embed URL and
   nothing else; Play-Through pointed at a SharePoint folder by filename. The
   decision is that every knowledge-base video lives in Firebase Storage, so
   the one page that could do it now does it for all four, from here.

   Pasting Troubleshoot's uploader into three more pages would be four copies
   of a 500 MB upload path and four copies of a speech engine.

   Add to a page (a classic script — the speech model is pulled in with a
   dynamic import, so the page itself does not have to be a module):

     <script src="egbc-kbupload.js"></script>

   Then:

     EGBCKBUpload.uploadVideo({ file, storagePath: 'kb/howto-av', onProgress })
       -> { url, path }

     EGBCKBUpload.transcribe(file, onProgress)      -> transcript text
     EGBCKBUpload.buildBullets(transcript)          -> the summary lines
     EGBCKBUpload.parseVTT(text)                    -> VTT to [hh:mm:ss] lines

     EGBCKBUpload.replaceVideoFile({ collection, id, file, storagePath,
                                     onProgress, transcribe })
       -> swaps that entry's contentURL to Firebase, keeping its id and
          everything else. This is how a SharePoint entry moves across
          without becoming a second entry.

     EGBCKBUpload.isSharePointURL(url)              -> true for the old links

   Storage: paths are `kb/<page>/<file>`, which `storage.rules` already
   allows (`match /kb/{page}/{fileName}`, images and video, under 500 MB).
   Nothing here changes a rule.

   The browser side is a lock on the cupboard, not the building — the
   Firestore and Storage rules are what actually stop a write.
   =================================================================== */

(function (global) {
  'use strict';
  if (global.EGBCKBUpload) return;

  /* ---- where the data lives ----------------------------------------
     EGBCAuth owns the one signed-in connection. A page that reached for
     firebase.firestore() would get a different app with nobody signed in. */
  function db() {
    if (typeof EGBCAuth === 'undefined' || !EGBCAuth.db) {
      throw new Error('egbc-kbupload: egbc-auth.js must be loaded first.');
    }
    return EGBCAuth.db;
  }
  function storage() {
    if (typeof EGBCAuth === 'undefined' || !EGBCAuth.storage) {
      throw new Error('egbc-kbupload: egbc-auth.js must be loaded first.');
    }
    return EGBCAuth.storage();
  }

  /* ---- the old links ------------------------------------------------
     v2 does not use SharePoint at all. The links already saved keep playing
     ones already there keep playing until somebody replaces the file. */
  var SHAREPOINT = /sharepoint\.com|\/_layouts\/|stream\.microsoft\.com/i;
  function isSharePointURL(url) { return SHAREPOINT.test(String(url || '')); }

  /* ---- upload -------------------------------------------------------- */

  function safeStem(name) {
    return String(name || 'video').replace(/\.[^.]+$/, '').replace(/[^\w\-]/g, '-').slice(0, 80) || 'video';
  }

  function uploadVideo(opts) {
    var file = opts.file;
    var base = String(opts.storagePath || '').replace(/\/+$/, '');
    if (!file) return Promise.reject(new Error('No file given.'));
    if (!base) return Promise.reject(new Error('No storage path given.'));

    var ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
    var path = base + '/' + Date.now() + '-' + safeStem(file.name) + '.' + ext;

    var task = storage().ref(path).put(file, {
      contentType: file.type || 'video/mp4',
      cacheControl: 'public,max-age=31536000'
    });

    if (opts.onProgress) {
      task.on('state_changed', function (s) {
        opts.onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100));
      });
    }

    return task.then(function () {
      return storage().ref(path).getDownloadURL();
    }).then(function (url) {
      return { url: url, path: path };
    });
  }

  /* ---- replace the file on an entry that already exists ---------------
     The point of this one: an entry pointing at SharePoint keeps its id, its
     title, category, tags, transcript and bullets, and only its contentURL
     and storagePath change. Replacing rather than re-adding is what stops
     the pages filling up with duplicates as the videos move across. */
  function replaceVideoFile(opts) {
    var collection = opts.collection, id = opts.id;
    if (!collection || !id) return Promise.reject(new Error('Which entry?'));

    var ref = db().collection(collection).doc(id);
    var before;

    return ref.get().then(function (snap) {
      if (!snap.exists) throw new Error('That entry no longer exists.');
      before = snap.data() || {};
      return uploadVideo({ file: opts.file, storagePath: opts.storagePath, onProgress: opts.onProgress });
    }).then(function (up) {
      /* Only make a transcript if there is not one already - replacing the
         file should never quietly throw away someone's corrections. */
      var wantTranscript = opts.transcribe !== false && !String(before.transcript || '').trim();
      var work = wantTranscript
        ? global.EGBCKBUpload.transcribe(opts.file, opts.onTranscribeProgress).catch(function () { return ''; })
        : Promise.resolve('');

      return work.then(function (text) {
        var update = {
          contentURL: up.url,
          storagePath: up.path,
          assetType: before.assetType || 'Video',
          replacedAt: new Date().toISOString()
        };
        if (text && text.trim()) {
          update.transcript = text.trim();
          update.bullets = buildBullets(text.trim());
        }
        return ref.update(update).then(function () {
          return { id: id, url: up.url, path: up.path, transcribed: !!(text && text.trim()) };
        });
      });
    });
  }

  /* ---- transcripts ---------------------------------------------------- */

  function buildBullets(transcript) {
    if (!transcript) return '';
    var lines = transcript.split('\n')
      .map(function (l) { return l.replace(/^\s*\[[\d:]+\]\s*/, '').trim(); })
      .filter(function (l) { return l.length > 20 && !l.match(/^\d+:\d+$/); });
    var instructional = lines.filter(function (l) {
      return /\b(press|click|select|go to|open|choose|set|turn|make sure|check|you need|you can|will|should|next|then|now|first|after|here|this)\b/i.test(l);
    });
    var source = instructional.length >= 3 ? instructional : lines;
    return source.slice(0, 8).map(function (l) { return '• ' + l; }).join('\n');
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function parseVTT(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line, i, all) {
      var m = line.match(/^(\d{2}):(\d{2}):(\d{2})[.,]\d+\s*-->/);
      if (!m) return;
      var body = [];
      for (var j = i + 1; j < all.length && all[j].trim(); j++) body.push(all[j].trim());
      if (body.length) out.push('[' + m[1] + ':' + m[2] + ':' + m[3] + '] ' + body.join(' '));
    });
    return out.join('\n');
  }

  /* ---- the speech engine ---------------------------------------------
     Moved here from EGBC-Troubleshoot-AV.html unchanged in behaviour.
     Whisper runs locally through Transformers.js - WebGPU where there is
     one, WASM otherwise. The model downloads once (~150 MB) and the browser
     caches it, so later videos need no network. Nothing is sent anywhere.

     Pulled in with a dynamic import so this file can stay a classic script
     and any page can load it with one plain <script> tag. */

  var MODEL = 'onnx-community/whisper-base.en';
  var transcriberPromise = null;
  var device = null;

  function setEngineStatus(msg) {
    var el = document.getElementById('engineStatus');
    if (el) el.textContent = msg;
  }

  function detectDevice() {
    if (device) return Promise.resolve(device);
    return Promise.resolve().then(function () {
      if (!navigator.gpu) return null;
      return navigator.gpu.requestAdapter();
    }).then(function (a) {
      device = a ? 'webgpu' : 'wasm';
      return device;
    }).catch(function () { device = 'wasm'; return device; });
  }

  function getTranscriber() {
    if (transcriberPromise) return transcriberPromise;
    transcriberPromise = (function () {
      var dev, pipeline;
      return import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3')
        .then(function (mod) {
          mod.env.allowLocalModels = false;
          pipeline = mod.pipeline;
          return detectDevice();
        })
        .then(function (d) {
          dev = d;
          setEngineStatus(dev === 'webgpu' ? 'Loading speech engine (GPU)…' : 'Loading speech engine (CPU)…');
          var options = {
            device: dev,
            progress_callback: function (p) {
              if (p.status === 'progress' && p.total) {
                setEngineStatus('Downloading speech model — ' + Math.round((p.loaded / p.total) * 100) + '%');
              } else if (p.status === 'ready') {
                setEngineStatus(dev === 'webgpu' ? 'Speech engine ready (GPU)' : 'Speech engine ready (CPU)');
              }
            }
          };
          if (dev === 'webgpu') options.dtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' };
          return pipeline('automatic-speech-recognition', MODEL, options);
        })
        .then(function (t) {
          setEngineStatus(dev === 'webgpu' ? 'Speech engine ready (GPU)' : 'Speech engine ready (CPU) — slower');
          return t;
        });
    })();
    return transcriberPromise;
  }

  /* Decode the file's audio and resample to the 16 kHz mono Whisper wants. */
  function extractAudio(file) {
    return file.arrayBuffer().then(function (buffer) {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx.decodeAudioData(buffer).then(function (decoded) {
        ctx.close();
        var offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
        var source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start(0);
        return offline.startRendering();
      }, function (e) { ctx.close(); throw e; });
    }).then(function (rendered) { return rendered.getChannelData(0); });
  }

  function chunksToTranscript(chunks) {
    return chunks.filter(function (c) { return c.text && c.text.trim(); })
      .map(function (c) {
        var sec = Math.max(0, Math.floor((c.timestamp && c.timestamp[0]) || 0));
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return '[' + pad(h) + ':' + pad(m) + ':' + pad(s) + '] ' + c.text.trim();
      }).join('\n');
  }

  function transcribe(file, onProgress) {
    var durationSec = 0;
    return getTranscriber().then(function (transcriber) {
      return extractAudio(file).then(function (audio) {
        durationSec = audio.length / 16000;
        return transcriber(audio, {
          return_timestamps: true,
          chunk_length_s: 30,
          stride_length_s: 5,
          callback_function: function () { if (onProgress) onProgress(null); },
          chunk_callback: function (chunk) {
            if (onProgress && chunk && chunk.finalised !== undefined) {
              var end = (chunk.offset || 0) + 30;
              onProgress(Math.min(99, Math.round((end / durationSec) * 100)));
            }
          }
        });
      });
    }).then(function (output) {
      if (!output.chunks || !output.chunks.length) return (output.text || '').trim();
      return chunksToTranscript(output.chunks);
    });
  }

  /* ---- the panel ------------------------------------------------------
     One piece of UI the three pages mount, rather than three copies of the
     same form. Each page says which collection and which kb/ path it uses:

       EGBCKBUpload.mountPanel({
         container: 'kb-upload-panel',
         collection: 'kb_howto_av',
         storagePath: 'kb/howto-av'
       });

     Two jobs. Upload a new video, which creates the entry. And replace the
     file on an entry that is already there - which is how a SharePoint entry
     moves to Firebase without becoming a second entry. */

  var PANEL_CSS =
    '.kbu{font-family:Inter,system-ui,sans-serif;color:#374151}' +
    '.kbu h4{font-size:15px;font-weight:600;color:#111827;margin:0 0 2px}' +
    '.kbu p.kbu-hint{font-size:12px;color:#6b7280;margin:0 0 10px;line-height:1.5}' +
    '.kbu .kbu-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:12px}' +
    '.kbu label{display:block;font-size:12px;font-weight:600;color:#6b7280;margin:10px 0 4px}' +
    '.kbu input[type=text],.kbu select,.kbu input[type=file]{width:100%;box-sizing:border-box;height:40px;' +
    'border:1px solid #d1d5db;border-radius:8px;padding:0 10px;font:400 14px Inter,sans-serif;color:#111827;background:#fff}' +
    '.kbu input[type=file]{padding:8px 10px;height:auto}' +
    '.kbu .kbu-row{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}' +
    '.kbu button{height:36px;padding:0 14px;border-radius:8px;border:1px solid #3d6263;background:#3d6263;' +
    'color:#fff;font:500 13px Inter,sans-serif;cursor:pointer}' +
    '.kbu button[disabled]{opacity:.55;cursor:default}' +
    '.kbu .kbu-note{font-size:12px;color:#6b7280;margin-top:8px;line-height:1.5}' +
    '.kbu .kbu-bar{height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-top:10px;display:none}' +
    '.kbu .kbu-bar span{display:block;height:100%;background:#3d6263;width:0}' +
    '.kbu .kbu-tick{display:flex;align-items:center;gap:7px;font-size:13px;color:#374151;margin-top:10px}' +
    '.kbu .kbu-tick input{width:16px;height:16px}';

  function mountPanel(opts) {
    var host = typeof opts.container === 'string' ? document.getElementById(opts.container) : opts.container;
    if (!host) return;
    var collection = opts.collection, storagePath = opts.storagePath;

    if (!document.getElementById('kbu-css')) {
      var st = document.createElement('style');
      st.id = 'kbu-css'; st.textContent = PANEL_CSS;
      document.head.appendChild(st);
    }

    host.className = 'kbu';
    host.innerHTML =
      '<div class="kbu-card">' +
        '<h4>Upload a video</h4>' +
        '<p class="kbu-hint">The file goes into Firebase. Links to SharePoint cannot be added any more — ' +
          'existing ones keep playing until their file is replaced below.</p>' +
        '<label for="kbu-file">Video file</label>' +
        '<input type="file" id="kbu-file" accept="video/*">' +
        '<label for="kbu-title">Title</label>' +
        '<input type="text" id="kbu-title" placeholder="What this video shows">' +
        '<label for="kbu-cat">Category (optional)</label>' +
        '<input type="text" id="kbu-cat" placeholder="e.g. Sound desk">' +
        '<div class="kbu-tick"><input type="checkbox" id="kbu-tr" checked><label for="kbu-tr" style="margin:0">Make a transcript (runs on this computer)</label></div>' +
        '<div class="kbu-row"><button id="kbu-go">Upload and publish</button></div>' +
        '<div class="kbu-bar" id="kbu-bar"><span></span></div>' +
        '<div class="kbu-note" id="kbu-status"></div>' +
        '<div class="kbu-note" id="engineStatus"></div>' +
      '</div>' +
      '<div class="kbu-card">' +
        '<h4>Replace the file on an entry</h4>' +
        '<p class="kbu-hint">For moving a video off SharePoint. The entry keeps its id, title, category, tags ' +
          'and transcript — only the file changes, so nothing is duplicated and no link breaks.</p>' +
        '<label for="kbu-entry">Entry</label>' +
        '<select id="kbu-entry"><option value="">Loading…</option></select>' +
        '<label for="kbu-rfile">New video file</label>' +
        '<input type="file" id="kbu-rfile" accept="video/*">' +
        '<div class="kbu-row"><button id="kbu-rgo">Replace video file</button></div>' +
        '<div class="kbu-bar" id="kbu-rbar"><span></span></div>' +
        '<div class="kbu-note" id="kbu-rstatus"></div>' +
      '</div>';

    var $ = function (id) { return document.getElementById(id); };
    function say(el, msg) { $(el).textContent = msg || ''; }
    function bar(el, pct) {
      var b = $(el);
      b.style.display = pct === null ? 'none' : 'block';
      if (pct !== null) b.firstChild.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }

    /* The list of entries, newest first, marking the ones still on SharePoint
       because those are the ones somebody is here to move. */
    function fillEntries() {
      return db().collection(collection).orderBy('createdAt', 'desc').get().then(function (snap) {
        var opts2 = ['<option value="">Choose an entry…</option>'];
        snap.forEach(function (d) {
          var a = d.data() || {};
          var where = isSharePointURL(a.contentURL) ? ' — on SharePoint' : (a.storagePath ? ' — on Firebase' : '');
          opts2.push('<option value="' + d.id + '">' + String(a.title || '(no title)').replace(/[<&]/g, '') + where + '</option>');
        });
        $('kbu-entry').innerHTML = opts2.join('');
      }).catch(function (e) {
        $('kbu-entry').innerHTML = '<option value="">Could not load entries — ' + e.message + '</option>';
      });
    }
    fillEntries();

    $('kbu-go').onclick = function () {
      var file = $('kbu-file').files[0];
      var title = $('kbu-title').value.trim();
      if (!file) return say('kbu-status', 'Choose a video file first.');
      if (!title) return say('kbu-status', 'Give it a title first.');
      var btn = $('kbu-go'); btn.disabled = true;
      say('kbu-status', 'Uploading…'); bar('kbu-bar', 0);

      uploadVideo({ file: file, storagePath: storagePath, onProgress: function (p) { bar('kbu-bar', p); } })
        .then(function (up) {
          bar('kbu-bar', null);
          if (!$('kbu-tr').checked) return { up: up, text: '' };
          say('kbu-status', 'Uploaded. Making a transcript — this runs here, not on a server…');
          return global.EGBCKBUpload.transcribe(file, function (p) { if (p !== null) say('kbu-status', 'Transcribing — ' + p + '%'); })
            .then(function (t) { return { up: up, text: t || '' }; })
            .catch(function () { return { up: up, text: '' }; });
        })
        .then(function (r) {
          return db().collection(collection).add({
            title: title,
            assetType: 'Video',
            contentURL: r.up.url,
            storagePath: r.up.path,
            category: $('kbu-cat').value.trim(),
            tags: '',
            transcript: (r.text || '').trim(),
            bullets: r.text ? buildBullets(r.text) : '',
            description: '',
            published: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }).then(function () { return r; });
        })
        .then(function (r) {
          say('kbu-status', 'Published' + (r.text ? ' with a transcript.' : ' (no transcript).'));
          $('kbu-file').value = ''; $('kbu-title').value = '';
          btn.disabled = false;
          fillEntries();
          if (typeof window.loadAssets === 'function') window.loadAssets();
        })
        .catch(function (e) {
          bar('kbu-bar', null); btn.disabled = false;
          say('kbu-status', 'Could not publish — ' + e.message);
        });
    };

    $('kbu-rgo').onclick = function () {
      var id = $('kbu-entry').value;
      var file = $('kbu-rfile').files[0];
      if (!id) return say('kbu-rstatus', 'Choose which entry to replace.');
      if (!file) return say('kbu-rstatus', 'Choose the new video file.');
      var btn = $('kbu-rgo'); btn.disabled = true;
      say('kbu-rstatus', 'Uploading…'); bar('kbu-rbar', 0);

      replaceVideoFile({
        collection: collection, id: id, file: file, storagePath: storagePath,
        onProgress: function (p) { bar('kbu-rbar', p); },
        onTranscribeProgress: function (p) { if (p !== null) say('kbu-rstatus', 'Transcribing — ' + p + '%'); }
      }).then(function (r) {
        bar('kbu-rbar', null); btn.disabled = false;
        say('kbu-rstatus', 'Replaced — the entry now plays from Firebase' +
          (r.transcribed ? ', and it has a transcript now.' : '. Its transcript was left as it was.'));
        $('kbu-rfile').value = '';
        fillEntries();
        if (typeof window.loadAssets === 'function') window.loadAssets();
      }).catch(function (e) {
        bar('kbu-rbar', null); btn.disabled = false;
        say('kbu-rstatus', 'Could not replace — ' + e.message);
      });
    };
  }


  global.EGBCKBUpload = {
    uploadVideo: uploadVideo,
    replaceVideoFile: replaceVideoFile,
    transcribe: transcribe,
    buildBullets: buildBullets,
    parseVTT: parseVTT,
    isSharePointURL: isSharePointURL,
    setEngineStatus: setEngineStatus,
    mountPanel: mountPanel
  };

  /* The pages were written against window.KBTranscribe; keep that name
     working so nothing has to change twice. */
  global.KBTranscribe = transcribe;
  global.KBTranscribeAvailable = true;

  detectDevice().then(function (d) {
    setEngineStatus(d === 'webgpu'
      ? 'Speech engine ready to load (GPU accelerated)'
      : 'Speech engine ready to load (CPU — slower on long videos)');
  });
})(window);
