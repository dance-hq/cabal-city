const { contextBridge, ipcRenderer } = require('electron')

// The corner timer only ever hears when the session started, and can only
// ask for the Cabal window to come back.
contextBridge.exposeInMainWorld('cabalOverlay', {
  onSession: (cb) => {
    if (typeof cb !== 'function') return
    ipcRenderer.on('cabal:overlay-session', (_event, startedAt) => cb(typeof startedAt === 'number' ? startedAt : null))
  },
  open: () => ipcRenderer.send('cabal:overlay-open'),
})
