const root = document.getElementById('games')
let orientation = 'landscape'
let noticeTimer
let resizeTimer
const releases = new Set()

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function notify(message) {
  const status = document.querySelector('.status')
  status.textContent = message
  status.classList.add('show')
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => status.classList.remove('show'), 1800)
}

function controller(game, container) {
  const data = game.resolved[orientation]
  const profile = game.draft.controller.profile
  const frame = element('div', 'frame')
  const head = element('div', 'frame-head')
  head.append(element('span', '', game.name.toUpperCase()), element('span', 'green', 'LAYOUT PREVIEW'))
  frame.append(head)
  const viewport = element('div', 'viewport')
  const surface = element('div', 'surface')
  surface.style.width = `${data.width}px`
  surface.style.height = `${data.height}px`
  viewport.append(surface)
  frame.append(viewport)
  container.append(frame)
  const width = orientation === 'portrait' ? 176 : Math.min(600, container.clientWidth - 30)
  const scale = width / data.width
  viewport.style.width = `${width}px`
  viewport.style.height = `${data.height * scale}px`
  surface.style.transform = `scale(${scale})`
  frame.style.setProperty('--background', profile.theme.background)
  frame.style.setProperty('--accent', profile.theme.accent)
  for (const [key, placement] of Object.entries(data.slots)) {
    const slot = profile.slots[key]
    const stick = key.startsWith('joy')
    const control = element('button', `slot${stick ? ' joy' : ''}${placement.shape === 'rounded' ? ' rounded' : ''}`)
    control.type = 'button'
    control.dataset.slot = key
    control.setAttribute('aria-label', `${game.name}: ${slot.label || key}`)
    control.style.left = `${placement.x - placement.size / 2}px`
    control.style.top = `${placement.y - placement.size / 2}px`
    control.style.width = `${placement.size}px`
    control.style.height = `${placement.size}px`
    control.style.setProperty('--colour', slot.colour || profile.theme.accent)
    if (stick) control.append(element('span', '', slot.label))
    else {
      if (slot.icon) control.append(element('span', 'glyph', slot.icon))
      control.append(element('span', 'label', slot.label || key))
    }
    surface.append(control)
    let pointer = null
    const neutral = event => {
      if (pointer === null || event && event.pointerId !== pointer) return
      const released = pointer
      pointer = null
      control.classList.remove('pressed')
      control.style.setProperty('--dx', '0px')
      control.style.setProperty('--dy', '0px')
      if (control.hasPointerCapture(released)) control.releasePointerCapture(released)
    }
    releases.add(neutral)
    control.addEventListener('pointerdown', event => {
      if (pointer !== null) return
      event.preventDefault()
      pointer = event.pointerId
      control.setPointerCapture(pointer)
      if (!stick) control.classList.add('pressed')
      notify(`${slot.label || key}: preview only`)
    })
    control.addEventListener('pointermove', event => {
      if (pointer !== event.pointerId || !stick) return
      const box = control.getBoundingClientRect()
      const x = (event.clientX - box.left - box.width / 2) / scale
      const y = (event.clientY - box.top - box.height / 2) / scale
      const factor = Math.min(1, placement.size * .28 / (Math.hypot(x, y) || 1))
      control.style.setProperty('--dx', `${x * factor}px`)
      control.style.setProperty('--dy', `${y * factor}px`)
    })
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) control.addEventListener(type, neutral)
  }
}

function render(games) {
  for (const release of releases) release()
  releases.clear()
  root.replaceChildren()
  for (const game of games) {
    const article = element('article', 'game')
    article.dataset.slug = game.slug
    article.style.setProperty('--accent', game.accent)
    const art = element('div', 'art')
    const image = element('img', 'hero')
    image.src = game.art.hero
    image.alt = `${game.name} selected Arcade artwork`
    art.append(image)
    if (game.art.logo) {
      const logo = element('img', 'logo')
      logo.src = game.art.logo
      logo.alt = ''
      art.append(logo)
    }
    article.append(art)
    const body = element('div', 'game-body')
    const title = element('div', 'game-title')
    title.append(element('h2', '', game.name), element('span', `pill${game.livePhone ? ' live' : ''}`, game.profileStatus))
    body.append(title)
    const description = element('p', 'description', game.description)
    body.append(description)
    if (game.description.length > 200) {
      const expand = element('button', 'description-toggle', 'Read full description')
      expand.setAttribute('aria-expanded', 'false')
      expand.onclick = () => {
        const expanded = expand.getAttribute('aria-expanded') !== 'true'
        description.classList.toggle('expanded', expanded)
        expand.setAttribute('aria-expanded', String(expanded))
        expand.textContent = expanded ? 'Show less' : 'Read full description'
      }
      body.append(expand)
    }
    body.append(element('p', 'details-line', `${game.draft.genres.join(' / ')} · ${game.draft.developer}`))
    const heading = element('div', 'layout-heading')
    heading.append(element('b', '', 'PHONE CONTROLLER'), element('span', '', orientation.toUpperCase()))
    body.append(heading)
    const preview = element('div', 'controller-wrap')
    body.append(preview)
    const actions = Object.values(game.draft.controller.profile.slots).map(slot => slot.label).join(' · ')
    body.append(element('p', 'stick-note', actions))
    const table = element('table', 'keys')
    table.append(element('caption', '', 'CURRENT KEYBOARD ACTIONS'))
    for (const [action, keys] of game.keys) {
      const row = element('tr')
      const name = element('th', '', action)
      name.scope = 'row'
      row.append(name, element('td', '', keys))
      table.append(row)
    }
    body.append(table)
    body.append(element('p', 'note', game.livePhone
      ? 'Existing live layout. The draft also includes the selected Arcade artwork and direction/fire key overrides.'
      : 'Proposed phone layout, matched to this game’s current gamepad actions. Publisher phone handoff still needs integration.'))
    const buttons = element('div', 'actions')
    const download = element('a', 'download', 'Download draft game.json')
    download.href = `./drafts/${game.slug}/game.json`
    download.download = `${game.slug}-draft-game.json`
    const inspect = element('button', '', 'Inspect definition')
    const link = element('a', '', 'Open current game ↗')
    link.href = game.draft.url
    link.target = '_blank'
    link.rel = 'noopener'
    const code = element('pre', 'definition', JSON.stringify(game.draft, null, 2))
    inspect.setAttribute('aria-expanded', 'false')
    inspect.onclick = () => {
      const visible = code.classList.toggle('visible')
      inspect.textContent = visible ? 'Close definition' : 'Inspect definition'
      inspect.setAttribute('aria-expanded', String(visible))
    }
    buttons.append(download, inspect, link)
    body.append(buttons, code)
    article.append(body)
    root.append(article)
    controller(game, preview)
  }
}

try {
  const response = await fetch(new URL('./games.json', import.meta.url))
  if (!response.ok) throw new Error('Definitions are unavailable. Reload to try again.')
  const games = await response.json()
  for (const selected of ['portrait', 'landscape']) document.getElementById(selected).onclick = () => {
    orientation = selected
    for (const name of ['portrait', 'landscape']) document.getElementById(name).setAttribute('aria-pressed', String(name === selected))
    render(games)
  }
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => render(games), 120)
  })
  window.addEventListener('blur', () => { for (const release of releases) release() })
  document.addEventListener('visibilitychange', () => { if (document.hidden) for (const release of releases) release() })
  render(games)
} catch (error) {
  root.append(element('p', 'note', error.message || 'Could not load the definitions. Reload to try again.'))
}
