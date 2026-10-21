const { contextBridge, ipcRenderer } = require('electron')

// A chat window opened from the corner buddy list. It can close itself or hand
// the conversation over to the main Cabal window. Main checks who's asking.
contextBridge.exposeInMainWorld('cabalChat', {
  openInCabal: () => ipcRenderer.send('cabal:chat-open-in-cabal'),
  close: () => ipcRenderer.send('cabal:chat-close'),
})
