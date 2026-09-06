/* ===================================================================
   Mix Builder — desktop adapter
   ===================================================================

   Loaded before mix-ui.js. When the page is running inside Electron
   this redirects two things and nothing else:

     1. Where the project lives — a file on disk, not IndexedDB.
     2. Where audio comes from — read from the folder by path, not
        dropped in and re-linked every session.

   The DSP, the render, the layout and the UI are untouched. In a
   browser this file does nothing at all and the page behaves exactly
   as before, so the web version stays usable as a fallback.
   =================================================================== */

(function (global) {
  'use strict';

  var api = global.api;
  if (!api || !api.isElectron) { global.MixDesktop = null; return; }

  var MP = global.MixProject;
  var currentPath = null;          // the .mixproj file, once saved somewhere

  /* ------------------------------------------------ project storage --- */
  /* MixProject.loadProject/saveProject look for this and use it instead of
     IndexedDB. Same shape, so nothing calling them has to change. */

  function loadProject() {
    return api.projectAutoLoad().then(function (json) {
      if (!json) return null;
      try { return JSON.parse(json); } catch (e) { return null; }
    });
  }

  function saveProject(project) {
    return api.projectAutoSave(JSON.stringify(project));
  }

  function saveProjectAs(project) {
    return api.projectSaveAs(JSON.stringify(project, null, 2)).then(function (p) {
      if (p) currentPath = p;
      return p;
    });
  }

  function openProjectFile() {
    return api.projectOpen().then(function (r) {
      if (!r) return null;
      currentPath = r.path;
      try { return JSON.parse(r.json); } catch (e) { return null; }
    });
  }

  /* --------------------------------------------------------- audio --- */

  function pickFolder() { return api.pickAudioFolder(); }
  function scanFolder(folder) { return folder ? api.scanAudioFolder(folder) : Promise.resolve([]); }

  /* Read one file off disk and hand back something the existing ingest code
     already understands. A File built from the bytes behaves exactly like one
     that came from a drop, so decode(), the fallback decoder and the analysis
     cache all work unchanged. */
  function fileFor(entry) {
    return api.readAudio(entry.path).then(function (bytes) {
      var buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return new File([buf], entry.name, { type: guessType(entry.name) });
    });
  }

  function guessType(name) {
    var ext = String(name).split('.').pop().toLowerCase();
    return ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac',
              ogg: 'audio/ogg', aac: 'audio/aac', aif: 'audio/aiff', aiff: 'audio/aiff' })[ext] || '';
  }

  /* ----------------------------------------------------- the mix --- */

  function saveMix(blob, suggested) {
    return blob.arrayBuffer().then(function (ab) {
      return api.saveMix(new Uint8Array(ab), suggested);
    });
  }

  global.MixDesktop = {
    isDesktop: true,
    loadProject: loadProject,
    saveProject: saveProject,
    saveProjectAs: saveProjectAs,
    openProjectFile: openProjectFile,
    currentPath: function () { return currentPath; },
    pickFolder: pickFolder,
    scanFolder: scanFolder,
    fileFor: fileFor,
    audioExists: function (p) { return api.audioExists(p); },
    pathForFile: function (f) { return api.pathForFile ? api.pathForFile(f) : null; },
    /* The folder a file sits in. Must handle backslashes — these are Windows
       paths, and a forward-slash-only pattern silently returns the whole path
       unchanged, which then fails to scan as a directory. */
    folderOf: function (p) {
      if (!p) return null;
      var m = String(p).match(/^(.*)[\\/][^\\/]*$/);
      return m ? m[1] : null;
    },
    saveMix: saveMix,
    showItem: function (p) { return api.showItem(p); },
    version: function () { return api.appVersion(); }
  };

  /* MixProject is loaded before this file, so redirect its storage now. The
     rest of the codebase keeps calling loadProject/saveProject and never has
     to know which it is talking to. */
  if (MP) {
    var idbLoad = MP.loadProject, idbSave = MP.saveProject;
    MP.loadProject = function () {
      return loadProject().then(function (p) {
        // First run on the desktop: fall back to anything the browser build
        // left behind, so an existing project is not stranded.
        if (p) return p;
        return idbLoad().then(function (old) {
          return (old && old.tracks && old.tracks.length) ? old : MP.emptyProject();
        });
      });
    };
    MP.saveProject = function (project, immediate) {
      project.modified = new Date().toISOString();
      return saveProject(project);
    };
  }

})(typeof window !== 'undefined' ? window : globalThis);
