// Read-only inspection of the isolated smoke-test Electron process. The main
// inspector is enabled only by the test launcher, bound to loopback.
export async function connectNativeFocusInspector(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })
  const endpoints = await response.json()
  const endpoint = new URL(endpoints[0].webSocketDebuggerUrl)
  if (endpoint.hostname !== '127.0.0.1' || endpoint.port !== String(port)) throw new Error('Unexpected native inspector endpoint')
  const socket = new WebSocket(endpoint)
  const pending = new Map()
  let sequence = 0
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Native inspector did not open')) }, 3000)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Native inspector connection failed')) }, { once: true })
  })
  socket.addEventListener('message', event => {
    const frame = JSON.parse(event.data)
    const request = pending.get(frame.id)
    if (!request) return
    pending.delete(frame.id)
    clearTimeout(request.timer)
    request.resolve(frame)
  })
  const rejectPending = () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Native inspector closed')) }
    pending.clear()
  }
  socket.addEventListener('close', rejectPending)
  return {
    async read() {
      const frame = await new Promise((resolve, reject) => {
        const id = ++sequence
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native focus inspection timed out')) }, 3000)
        pending.set(id, { resolve, reject, timer })
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: {
          expression: `(() => {
            const electron = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('electron');
            return {
              windows: electron.BrowserWindow.getAllWindows().map(window => ({
                id: window.id, focused: window.isFocused(), visible: window.isVisible(),
                bounds: window.getBounds(),
                children: window.contentView.children.map(view => ({
                  contentsId: view.webContents?.id ?? null,
                  visible: view.getVisible(), bounds: view.getBounds()
                }))
              })),
              contents: electron.webContents.getAllWebContents().map(contents => {
                const url = contents.getURL();
                return { id: contents.id, focused: contents.isFocused(), loading: contents.isLoading(),
                  type: contents.getType(), role: url.startsWith('file:') ? 'shell' : url ? 'game' : 'loading' };
              })
            };
          })()`, returnByValue: true,
        } }))
      })
      const value = frame.result?.result?.value
      if (!Array.isArray(value?.windows) || !Array.isArray(value?.contents)) throw new Error('Native inspector returned no focus metadata')
      return value
    },
    close() { rejectPending(); socket.close() },
  }
}
