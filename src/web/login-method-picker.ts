import type { LoginPickerMethod } from 'signet-login'
export type ArcadeLoginMethod = Exclude<LoginPickerMethod, 'nsec' | 'amber'> | 'android-signer'

export function pickLoginMethod(signingRequired = false): Promise<ArcadeLoginMethod | null> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog')
    dialog.className = 'login-method-dialog'
    const title = document.createElement('h2'); title.id = 'arcade-login-title'; title.textContent = 'Connect your Nostr account'
    dialog.setAttribute('aria-labelledby', title.id)
    const description = document.createElement('p'); description.textContent = 'Choose where you approve. Your private key stays with your signer.'
    dialog.append(title, description)
    const choices: [ArcadeLoginMethod, string][] = [['local-signet', 'My Signet on this device'], ['remote-signet', 'My Signet on another device (QR)']]
    if ('nostr' in window) choices.push(['nip07', 'Browser extension'])
    if (!signingRequired && /android/i.test(navigator.userAgent)) choices.push(['android-signer', 'Cambium or Amber (Android signer)'])
    if (signingRequired && /android/i.test(navigator.userAgent)) {
      const note = document.createElement('p'); note.textContent = 'Cambium and Amber can verify your identity. To approve actions in this arcade, connect My Signet or a NIP-46 signer.'; dialog.append(note)
    }
    choices.push(['nostrconnect', 'Connect a Nostr signer (NIP-46 QR)'], ['bunker', 'Connect a bunker URI'])
    let result: ArcadeLoginMethod | null = null
    for (const [method, label] of choices) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.dataset.choice = method; button.textContent = label
      button.addEventListener('click', () => { result = method; dialog.close() })
      dialog.append(button)
    }
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => dialog.close()); dialog.append(cancel)
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result) }, { once: true })
    document.body.append(dialog)
    dialog.showModal()
  })
}
