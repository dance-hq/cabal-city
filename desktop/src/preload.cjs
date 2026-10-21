const { contextBridge, ipcRenderer } = require('electron')

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? ''

function listen(channel, wrap) {
  return (cb) => {
    if (typeof cb !== 'function') return () => {}
    const handler = (_event, ...args) => wrap(cb, ...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('cabalDesktop', {
  version: arg('cabal-version'),
  platform: process.platform,
  launchedAt: Number(arg('cabal-launched')) || undefined,
  setSession: (startedAt) => ipcRenderer.send('cabal:session', startedAt === null ? null : Number(startedAt)),
  setBuddies: (list) => ipcRenderer.send('cabal:buddies', list),
  onBuddyAction: listen('cabal:buddy-action', (cb, action) => cb(action)),
  show: () => ipcRenderer.send('cabal:show'),
  setBadge: (count) => ipcRenderer.send('cabal:badge', Number(count) || 0),
  getSettings: () => ipcRenderer.invoke('cabal:get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('cabal:set-settings', patch),
  quit: () => ipcRenderer.send('cabal:quit'),
  retry: () => ipcRenderer.send('cabal:retry'),
  onPower: listen('cabal:power', (cb, state) => cb(state)),
  onNavigate: listen('cabal:navigate', (cb, target) => cb(target)),
  getUpdate: () => ipcRenderer.invoke('cabal:get-update'),
  installUpdate: () => ipcRenderer.send('cabal:install-update'),
  onUpdate: listen('cabal:update', (cb, info) => cb(info)),
  // The page gets a moment to say it's leaving (so friends see you go offline) before the app quits.
  onBeforeQuit: listen('cabal:before-quit', async (cb) => {
    try {
      await cb()
    } finally {
      ipcRenderer.send('cabal:quit-ready')
    }
  }),
})
