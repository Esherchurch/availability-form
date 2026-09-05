/* Bridge between the renderer and Node, same shape as ChurchShow's:
   contextIsolation on, nodeIntegration off, one named surface. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  isElectron: true,

  // audio, read straight off the user's disk — nothing is copied anywhere
  pickAudioFolder: () => ipcRenderer.invoke('audio:pickFolder'),
  scanAudioFolder: (folder) => ipcRenderer.invoke('audio:scanFolder', folder),
  readAudio: (p) => ipcRenderer.invoke('audio:read', p),
  audioExists: (p) => ipcRenderer.invoke('audio:exists', p),

  // the project is a file, not a browser database
  projectAutoSave: (json) => ipcRenderer.invoke('project:autoSave', json),
  projectAutoLoad: () => ipcRenderer.invoke('project:autoLoad'),
  projectSaveAs: (json) => ipcRenderer.invoke('project:saveAs', json),
  projectOpen: () => ipcRenderer.invoke('project:open'),

  // the finished mix
  saveMix: (bytes, suggested) => ipcRenderer.invoke('mix:save', bytes, suggested),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),

  appVersion: () => ipcRenderer.invoke('app:version'),
  userData: () => ipcRenderer.invoke('app:userData')
});
