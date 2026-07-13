const { app, BrowserWindow } = require('electron')
const { mkdir, writeFile } = require('node:fs/promises')
const { dirname } = require('node:path')

const target = process.env.WEB_CAPTURE_URL || 'http://127.0.0.1:4174/'
const output = process.env.WEB_CAPTURE_OUTPUT || '.design-shots/web-platform.png'
const width = Number(process.env.WEB_CAPTURE_WIDTH || 1440)
const height = Number(process.env.WEB_CAPTURE_HEIGHT || 1000)
const scrollY = Number(process.env.WEB_CAPTURE_SCROLL_Y || 0)
const inspectSelector = process.env.WEB_CAPTURE_INSPECT_SELECTOR

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width, height, show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  const errors = []
  window.webContents.on('console-message', (...args) => {
    const details = args.find(value => value && typeof value === 'object' && 'level' in value && 'message' in value)
    if (details?.level === 'error') errors.push(details.message)
  })
  await window.loadURL(target)
  await new Promise(resolve => setTimeout(resolve, 2500))
  if (scrollY) {
    await window.webContents.executeJavaScript(`window.scrollTo({ top: ${JSON.stringify(scrollY)}, behavior: 'instant' })`)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (inspectSelector) {
    const inspected = await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(inspectSelector)})?.textContent || 'selector not found'`)
    console.log(inspected)
  }
  const image = await window.webContents.capturePage()
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, image.toPNG())
  if (errors.length) console.error(errors.join('\n'))
  window.destroy()
  app.exit(errors.length ? 1 : 0)
}).catch(error => { console.error(error); app.exit(1) })
