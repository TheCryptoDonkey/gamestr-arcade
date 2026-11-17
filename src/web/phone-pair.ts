import { parsePhoneInvitation, decodePhonePairing, confirmationCode, PLAYER_MS, randomToken, signedFor } from '../shared/phone-signing'
import { npubEncode } from 'nostr-tools/nip19'
import { PhoneSigner, newPhoneSigner, initialApproval, androidApprovalUrl, acceptPhoneApproval, type PhoneSignerState } from '../shared/phone-signer'

const root = document.getElementById('phone-pair')!
const prefix = 'gamestr:phone-pair:'
const owner = randomToken()
let state: PhoneSignerState | undefined, phone: PhoneSigner | undefined, sessionId = '', interval: ReturnType<typeof setInterval> | undefined

function message(text: string): void {
  const p = document.createElement('p'); p.textContent = text; p.setAttribute('role', 'status'); root.append(p)
}
function heading(text: string): void {
  root.replaceChildren()
  const brand = document.createElement('p'); brand.className = 'brand'; brand.textContent = 'GAMESTR · PHONE APPROVAL'
  const h1 = document.createElement('h1'); h1.textContent = text; root.append(brand, h1)
}
function save(): void {
  if (!state) return
  const current = localStorage.getItem(prefix + sessionId)
  if (current && JSON.parse(current).owner !== owner) throw new Error('This phone session moved to another tab.')
  localStorage.setItem(prefix + sessionId, JSON.stringify({ owner, state }))
}
function ended(): void {
  const stored = localStorage.getItem(prefix + sessionId)
  if (stored && JSON.parse(stored).owner === owner) localStorage.removeItem(prefix + sessionId)
  clearInterval(interval); state = undefined
  history.replaceState(null, '', '/phone-pair/')
  heading('You’re disconnected.')
  message('Your phone approval connection has been cleared. Play as guest or scan a fresh code on the TV.')
}
function nativeLink(label: string, cambium: boolean): HTMLAnchorElement {
  const link = document.createElement('a'); link.className = cambium ? 'action' : 'alternative'; link.textContent = label
  link.href = androidApprovalUrl(state!, location.origin, cambium)
  link.onclick = () => { save(); phone?.pause(); message('Approve in your signer, then return here. If you backed out, you can retry or decline below.') }
  return link
}
function render(): void {
  if (!state) return
  heading(state.proof ? state.pending ? 'Approve this game action.' : 'Your phone is connected.' : 'Connect with Cambium.')
  if (state.proof) {
    message('Account confirmation code')
    const code = document.createElement('strong'); code.className = 'code'; code.textContent = confirmationCode(state.proof); root.append(code)
    message('Check this code matches the TV before continuing there.')
  } else message('A confirmation code will appear after you approve.')
  message('Cambium asks Heartwood to sign; your identity key stays on Heartwood.')
  if (state.proof) { const npub = npubEncode(state.proof.pubkey); message(`Your account: ${npub.slice(0, 16)}…${npub.slice(-8)}`) }
  if (!/android/i.test(navigator.userAgent)) { message('Cambium needs an Android phone. On the TV, choose My Signet, another Nostr signer, or guest play.'); return }
  if (!state.proof && !state.pending) { initialApproval(state); save() }
  if (state.pending) {
    const pending = state.pending
    const names: Record<number, string> = { 21236: 'Sign in', 30762: 'Game score', 5555: 'Game score', 27235: 'Game request', 23033: 'Game invitation', 23034: 'Game challenge', 9734: 'Zap request' }
    message(names[pending.template.kind] ?? 'Game action')
    const game = pending.template.tags.find(tag => tag[0] === 'game')?.[1]
    if (game) message(`Game: ${game}`)
    const details = document.createElement('details'), summary = document.createElement('summary'), payload = document.createElement('pre')
    summary.textContent = 'Review the exact request'; payload.textContent = JSON.stringify(pending.template, null, 2); details.append(summary, payload); root.append(details)
    root.append(nativeLink('Approve with Cambium', true), nativeLink('Choose another Android signer', false))
    const decline = document.createElement('button'); decline.textContent = 'Decline'; decline.onclick = () => {
      if (pending.id === 'login') { phone?.end(); if (state) ended() }
      else void phone?.start().then(() => phone?.decline()).then(render).catch(() => message('Cannot reach the TV. Finish the session and reconnect.'))
    }; root.append(decline)
  } else message('Confirm your account on the TV. Keep this page open during play; game actions will ask for your approval here.')
  const finish = document.createElement('button'); finish.className = 'finish'; finish.textContent = 'Finish / disconnect'; finish.onclick = () => { phone?.end(); if (state) ended() }; root.append(finish)
}

async function boot(): Promise<void> {
  const url = new URL(location.href), hash = new URLSearchParams(url.hash.slice(1))
  const returned = url.searchParams.get('event'), token = url.searchParams.get('request')
  // Expired temporary connection records are discarded on every visit. No
  // account key, Cambium bunker URI or Heartwood pairing secret is stored here.
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index)!
    if (!key.startsWith(prefix)) continue
    try { if (JSON.parse(localStorage.getItem(key)!).state.expiresAt <= Date.now()) localStorage.removeItem(key) } catch { localStorage.removeItem(key) }
  }
  let completed: { id: string; event: ReturnType<typeof acceptPhoneApproval> } | undefined
  if (hash.has('pairing')) {
    const invitation = decodePhonePairing(hash.get('pairing')!, location.origin)
    sessionId = new URL(invitation.uri).hostname
    if (localStorage.getItem(prefix + sessionId)) throw new Error('This pairing has already been opened. Show a fresh code on the TV.')
    state = newPhoneSigner(invitation)
  } else {
    sessionId = url.searchParams.get('session') ?? hash.get('session') ?? ''
    if (!/^[0-9a-f]{64}$/.test(sessionId)) throw new Error('Scan the Cambium pairing code on the arcade TV.')
    const stored = JSON.parse(localStorage.getItem(prefix + sessionId) ?? 'null')
    state = stored?.state as PhoneSignerState | undefined
    if (!state || state.expiresAt <= Date.now() || state.expiresAt > Date.now() + PLAYER_MS || !Array.isArray(state.answered)) throw new Error('Phone session expired. Scan a fresh code on the TV.')
    parsePhoneInvitation(state.invitation, location.origin, Math.min(Date.now(), state.invitation.expiresAt - 1))
    if (new URL(state.invitation.uri).hostname !== sessionId || state.proof && !signedFor(state.proof, state.invitation.proof)) throw new Error('Invalid saved phone session.')
    if (returned !== null) {
      const id = state.pending?.id
      if (!id) throw new Error('This approval was already used.')
      const event = acceptPhoneApproval(state, token ?? '', returned)
      if (id !== 'login') { completed = { id, event }; state.answered.push(id) }
    }
  }
  // Remove invitation and signed callback before establishing any relay contact.
  history.replaceState(null, '', `/phone-pair/#session=${sessionId}`)
  localStorage.setItem(prefix + sessionId, JSON.stringify({ owner, state }))
  phone = new PhoneSigner(state, { save, pending: render, ended, error: message })
  window.addEventListener('storage', event => {
    if (event.key !== prefix + sessionId) return
    let nextOwner: string | undefined
    try { nextOwner = JSON.parse(event.newValue ?? 'null')?.owner } catch { /* Another tab invalidated the record. */ }
    if (nextOwner !== owner) { phone?.pause(); clearInterval(interval); state = undefined; heading('Continue in the other tab.'); message('Your signer returned to another browser tab. This tab no longer handles approvals.') }
  })
  window.addEventListener('pagehide', () => phone?.pause(), { once: true })
  window.addEventListener('pageshow', () => { if (state?.proof) void phone?.start().catch(() => message('Reconnect on the TV if the signing relay is unavailable.')) })
  interval = setInterval(() => {
    if (!state) return
    if (state.expiresAt <= Date.now()) { phone?.end(); return }
    if (state.pending && state.pending.expiresAt <= Date.now()) void phone?.decline().then(render).catch(() => message('Request expired. Return to the TV and reconnect.'))
  }, 1000)
  render()
  if (state.proof) {
    await phone.start()
    if (completed) await phone.complete(completed.id, completed.event)
  }
}

void boot().catch(() => {
  // No malformed callback or missing browser storage can create a signing session.
  phone?.pause(); clearInterval(interval)
  history.replaceState(null, '', '/phone-pair/')
  heading('Let’s try a fresh pairing code.')
  message('The link expired, the signer returned a different request, or this browser could not save the temporary connection. Return to the TV and try again, or play as guest.')
})
