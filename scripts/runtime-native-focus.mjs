// Inspect native state and observe input in the isolated smoke-test process.
// The loopback main inspector and passive listeners exist only in this test.
// No observer prevents input, changes focus or replaces an application listener.
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
  async function evaluate(expression) {
    const frame = await new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native inspection timed out')) }, 3000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
    if (frame.error || frame.result?.exceptionDetails) throw new Error('Native inspection failed');
    return frame.result?.result?.value;
  }
  return {
    async systemInputContext() {
      return evaluate(`(() => {
        if (process.platform !== 'linux') return null;
        const electron = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('electron');
        const window = electron.BrowserWindow.getFocusedWindow();
        if (!window) return null;
        return { pid: process.pid, windowId: window.getNativeWindowHandle().readUInt32LE(0),
          display: process.env.DISPLAY, xauthority: process.env.XAUTHORITY };
      })()`);
    },
    async observeInput() {
      await evaluate(`(() => {
        if (globalThis.__gamestrRuntimeInputObservation) return true;
        const electron = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('electron');
        const state = { events: [], listeners: new Map(), onCreated: null };
        const observe = contents => {
          if (state.listeners.has(contents)) return;
          const listener = (_event, input) => {
            const url = contents.getURL();
            state.events.push({ id: contents.id, role: url.startsWith('file:') ? 'shell' : url ? 'game' : 'loading',
              type: input.type, key: input.key, code: input.code, repeat: input.isAutoRepeat });
            if (state.events.length > 64) state.events.shift();
          };
          state.listeners.set(contents, listener);
          contents.on('before-input-event', listener);
          contents.once('destroyed', () => state.listeners.delete(contents));
        };
        state.onCreated = (_event, contents) => observe(contents);
        electron.app.on('web-contents-created', state.onCreated);
        electron.webContents.getAllWebContents().forEach(observe);
        globalThis.__gamestrRuntimeInputObservation = state;
        return true;
      })()`);
    },
    async read() {
      const value = await evaluate(`(() => {
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
              nativeInputEvents: globalThis.__gamestrRuntimeInputObservation?.events ?? [],
              contents: electron.webContents.getAllWebContents().map(contents => {
                const url = contents.getURL();
                return { id: contents.id, focused: contents.isFocused(), loading: contents.isLoading(),
                  type: contents.getType(), role: url.startsWith('file:') ? 'shell' : url ? 'game' : 'loading' };
              })
            };
          })()`);
      if (!Array.isArray(value?.windows) || !Array.isArray(value?.contents)) throw new Error('Native inspector returned no focus metadata');
      return value;
    },
    async close() {
      try {
        await evaluate(`(() => {
          const state = globalThis.__gamestrRuntimeInputObservation;
          if (!state) return true;
          const electron = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('electron');
          electron.app.off('web-contents-created', state.onCreated);
          for (const [contents, listener] of state.listeners) contents.off('before-input-event', listener);
          delete globalThis.__gamestrRuntimeInputObservation;
          return true;
        })()`);
      } catch { /* The isolated process is also terminated by the test launcher. */ }
      finally { rejectPending(); socket.close(); }
    },
  }
}
