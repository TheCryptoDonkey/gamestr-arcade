import type { SignetSession } from 'signet-login'
import { npubEncode } from 'nostr-tools/nip19'
import type { ConferencePlayer, PlayerState } from '../conference-player'
import { pairingCode, phonePairingUrl, type PhoneInvitation } from '../phone-signing'
import './player-pairing.css'

export interface PairingActions {
  start(): Promise<PhoneInvitation>
  confirm(): Promise<SignetSession | void>
  end(): void
}

/** Used by both the browser and cabinet; all approval controls stay local to the TV. */
export function showPlayerPairing(actions: PairingActions, origin: string): { update(state: PlayerState): void; result: Promise<SignetSession | null>; close(): void } {
  const dialog = document.createElement('dialog'); dialog.className = 'player-pairing'; dialog.setAttribute('aria-labelledby', 'player-pair-title')
  dialog.addEventListener('keydown', event => {
    event.stopPropagation()
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.hidden && !button.disabled)
    const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1
    controls[(controls.indexOf(document.activeElement as HTMLButtonElement) + direction + controls.length) % controls.length]?.focus()
  })
  const title = document.createElement('h2'); title.id = 'player-pair-title'; title.textContent = 'Your phone. Your identity. Your score.'
  const lede = document.createElement('p'); lede.textContent = 'Connect your signer or jump straight into a game. Your private key stays with your signer.'
  const body = document.createElement('div'); body.className = 'player-pair-body'
  const progress = document.createElement('div'); progress.className = 'player-pair-progress'
  const choices = document.createElement('div'); choices.className = 'player-pair-choices'
  const qr = document.createElement('img'); qr.alt = 'Scan to connect your signer'; qr.hidden = true
  const code = document.createElement('strong'); code.className = 'player-pair-code'
  const status = document.createElement('p'); status.setAttribute('role', 'status')
  const identity = document.createElement('p'); identity.className = 'player-pair-identity'
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = 'That’s me. Let’s play'; confirm.hidden = true
  const guest = document.createElement('button'); guest.type = 'button'; guest.className = 'player-pair-guest'; guest.textContent = 'Play as guest'
  let finish!: (session: SignetSession | null) => void
  let accepted = false, closed = false, generation = 0, phonePage = false
  const result = new Promise<SignetSession | null>(resolve => { finish = resolve })
  const buttons: HTMLButtonElement[] = []
  for (const [method, label, detail] of [
    ['signet', 'My Signet', 'Scan with My Signet on your phone'],
    ['cambium', 'Cambium', 'Approve on Android. Heartwood keeps your key'],
    ['other', 'Another Nostr signer', 'NIP-46 compatible, including Amber'],
  ] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'player-pair-choice'
    const name = document.createElement('strong'); name.textContent = label
    const note = document.createElement('span'); note.textContent = detail; button.append(name, note)
    button.onclick = async () => {
      const epoch = ++generation
      phonePage = method === 'cambium'
      for (const choice of buttons) choice.disabled = true
      confirm.hidden = true; identity.textContent = ''; qr.hidden = true; status.textContent = 'Preparing a fresh pairing code…'
      try {
        const invitation = await actions.start()
        const { encode, toSvg } = await import('@forgesworn/qr')
        if (closed || epoch !== generation) return
        const payload = method === 'cambium' ? phonePairingUrl(origin, invitation)
          : method === 'signet' ? `https://mysignet.app/?nostrconnect=${encodeURIComponent(invitation.uri)}` : invitation.uri
        qr.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(encode(payload, { ecc: 'L', mode: 'byte' }), { margin: 4 }))}`
        qr.hidden = false; code.textContent = pairingCode(invitation)
        status.textContent = method === 'cambium' ? 'Scan with your phone camera, then choose Cambium. Keep the phone page open while playing.' : `Scan with ${method === 'signet' ? 'My Signet' : 'your NIP-46 signer'}, then approve on your phone.`
      } catch { if (!closed && epoch === generation) status.textContent = 'Cannot start pairing. Try again or play as guest.' }
      finally { if (!closed && epoch === generation) for (const choice of buttons) choice.disabled = false }
    }
    buttons.push(button); choices.append(button)
  }
  guest.onclick = () => dialog.close()
  confirm.onclick = async () => {
    confirm.disabled = true
    try { const session = await actions.confirm(); accepted = true; finish(session ?? null); dialog.close() }
    catch { status.textContent = 'Pairing expired. Show a fresh code and try again.'; confirm.hidden = true }
    finally { confirm.disabled = false }
  }
  progress.append(qr, code, status, identity, confirm)
  body.append(choices, progress)
  dialog.append(title, lede, body, guest)
  const cleanup = () => { if (closed) return; closed = true; ++generation; if (!accepted) actions.end(); dialog.remove(); finish(null) }
  dialog.addEventListener('close', cleanup, { once: true })
  document.body.append(dialog); dialog.showModal(); buttons[0].focus()
  return {
    result,
    update(state) {
      if (closed) return
      if (state.status === 'confirm') {
        qr.hidden = true
        const npub = npubEncode(state.pubkey!)
        identity.textContent = `Player ${npub.slice(0, 16)}…${npub.slice(-8)}`
        if (phonePage) code.textContent = state.confirmationCode ?? ''
        status.textContent = phonePage ? 'Check this confirmation code matches your phone, then continue on this TV.' : 'Check that this is your account before continuing on this TV.'
        confirm.hidden = false; confirm.focus()
      } else if (state.status === 'unavailable') { qr.hidden = true; confirm.hidden = true; status.textContent = state.message ?? 'Reconnect or play as guest.' }
    },
    close: () => dialog.close(),
  }
}

export async function connectConferencePlayer(options: { appName: string; origin: string; onEnded(): void }): Promise<SignetSession | null> {
  const { ConferencePlayer } = await import('../conference-player')
  let accepted = false
  let modal: ReturnType<typeof showPlayerPairing> | undefined
  const player: ConferencePlayer = new ConferencePlayer({ ...options, onChange: state => {
    modal?.update(state)
    if (accepted && state.status !== 'connected') {
      accepted = false
      window.removeEventListener('pagehide', onPagehide)
      options.onEnded()
    }
  } })
  modal = showPlayerPairing({ start: () => player.start(), confirm: async () => { const session = player.confirm(); accepted = true; return session }, end: () => player.end() }, options.origin)
  const onPagehide = () => { player.end(); modal?.close() }
  window.addEventListener('pagehide', onPagehide, { once: true })
  const session = await modal.result
  if (!session) window.removeEventListener('pagehide', onPagehide)
  return session
}
