const { contextBridge, ipcRenderer } = require('electron')

function listen(channel) {
  return (cb) => {
    if (typeof cb === 'function') ipcRenderer.on(channel, (_event, value) => cb(value))
  }
}

// The corner hears when the session started, whether it's open, and the buddy
// list the Cabal window hands over. It can move or open itself, bring Cabal
// back, and ask for a short list of buddy-list changes (checked again in main).
function session(v) {
  if (v?.status === 'running' && Number.isFinite(v.startedAt)) return { status: 'running', startedAt: v.startedAt }
  if (v?.status === 'paused' && Number.isFinite(v.workedMs)) return { status: 'paused', workedMs: v.workedMs }
  return null
}

contextBridge.exposeInMainWorld('cabalOverlay', {
  onSession: (cb) => listen('cabal:overlay-session')((v) => cb(session(v))),
  onExpanded: (cb) => listen('cabal:overlay-expanded')((v) => cb(v === true)),
  onBuddies: (cb) => listen('cabal:overlay-buddies')((v) => cb(v && typeof v === 'object' ? v : null)),
  open: () => ipcRenderer.send('cabal:overlay-open'),
  setExpanded: (value) => ipcRenderer.send('cabal:overlay-expand', value === true),
  setHeight: (height) => ipcRenderer.send('cabal:overlay-height', Number(height)),
  dragStart: () => ipcRenderer.send('cabal:overlay-drag', 'start'),
  dragEnd: () => ipcRenderer.send('cabal:overlay-drag', 'end'),
  act: (action) => ipcRenderer.send('cabal:overlay-action', action),
})
