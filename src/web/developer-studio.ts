import { verifyEvent } from 'nostr-tools/pure'
import validateSchema from 'virtual:gamestr-manifest-validator'
import { publicManifestErrors, submissionEvent, type PublicGameManifest } from './developer-submission'
export { publicManifestErrors, submissionEvent, type PublicGameManifest } from './developer-submission'

interface SignedEvent {
  id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string
}

interface NostrSigner {
  getPublicKey(): Promise<string>
  signEvent(event: { created_at: number; kind: number; tags: string[][]; content: string }): Promise<SignedEvent>
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  manifest?: PublicGameManifest
}

const MAX_MANIFEST_CHARS = 32_768

export async function validateManifestJson(raw: string): Promise<ValidationResult> {
  if (raw.length > MAX_MANIFEST_CHARS) return { ok: false, errors: ['Manifest exceeds 32 KB.'] }
  let manifest: unknown
  try { manifest = JSON.parse(raw) } catch { return { ok: false, errors: ['Manifest is not valid JSON.'] } }
  if (!validateSchema(manifest)) {
    return { ok: false, errors: (validateSchema.errors ?? []).slice(0, 12).map(error => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`) }
  }
  const game = manifest as PublicGameManifest
  const publicErrors = publicManifestErrors(game)
  if (publicErrors.length) return { ok: false, errors: publicErrors }
  return { ok: true, errors: [], manifest: game }
}

export async function publishEvent(event: SignedEvent, relays: string[], timeoutMs = 8_000): Promise<{ accepted: string[]; rejected: string[] }> {
  const canonical = { id: event.id, pubkey: event.pubkey, created_at: event.created_at, kind: event.kind, tags: event.tags, content: event.content, sig: event.sig }
  if (!verifyEvent(canonical) || event.kind !== 31990) throw new Error('Signer returned an invalid event.')
  const unique = Array.from(new Set(relays)).filter(url => url.startsWith('wss://')).slice(0, 6)
  const outcomes = await Promise.all(unique.map(url => new Promise<{ url: string; ok: boolean }>(resolve => {
    let settled = false
    let socket: WebSocket | undefined
    const finish = (ok: boolean) => { if (settled) return; settled = true; clearTimeout(timer); try { socket?.close() } catch { /* noop */ }; resolve({ url, ok }) }
    const timer = setTimeout(() => finish(false), timeoutMs)
    try {
      const relaySocket = new WebSocket(url)
      socket = relaySocket
      relaySocket.onopen = () => relaySocket.send(JSON.stringify(['EVENT', event]))
      relaySocket.onmessage = message => {
        let payload: unknown
        try { payload = JSON.parse(typeof message.data === 'string' ? message.data : '') } catch { return }
        if (Array.isArray(payload) && payload[0] === 'OK' && payload[1] === event.id) finish(payload[2] === true)
      }
      relaySocket.onerror = () => finish(false)
    } catch { finish(false) }
  })))
  return { accepted: outcomes.filter(item => item.ok).map(item => item.url), rejected: outcomes.filter(item => !item.ok).map(item => item.url) }
}

const TEMPLATE = {
  manifestVersion: 2,
  name: 'My Nostr Game',
  gameId: 'my-nostr-game',
  url: 'https://play.example.com/',
  tagline: 'A one-line reason to play.',
  description: 'What makes the game distinctive, how it plays, and what players own.',
  developer: 'Your studio or npub',
  genres: ['arcade'],
  inputModes: ['keyboard', 'pointer'],
  players: { min: 1, max: 1 },
  network: 'required',
  capabilities: { nostrSign: true, walletPay: false, persistentStorage: false, externalNavigation: false },
  scoreKind: 30762,
  scoreDir: 'desc',
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

export function mountDeveloperStudio(host: HTMLElement, relays: string[]): void {
  const studio = node('section', 'manifest-studio')
  studio.append(node('p', 'kicker', 'MANIFEST STUDIO'), node('h2', '', 'Validate locally. Sign deliberately. Publish openly.'))
  studio.append(node('p', 'studio-lede', 'The manifest is checked against the same schema used by cabinets and CI. Publishing creates a replaceable NIP-89 event under your Nostr key; it does not grant automatic editorial approval.'))
  const workspace = node('div', 'studio-workspace')
  const editor = node('div', 'studio-editor')
  const label = node('label', '', 'Manifest v2 JSON')
  label.htmlFor = 'manifest-json'
  const textarea = node('textarea'); textarea.id = 'manifest-json'; textarea.spellcheck = false; textarea.value = JSON.stringify(TEMPLATE, null, 2)
  const actions = node('div', 'hero-actions')
  const validateButton = node('button', 'secondary', 'VALIDATE'); validateButton.type = 'button'
  const publishButton = node('button', 'primary', 'SIGN & PUBLISH'); publishButton.type = 'button'; publishButton.disabled = true
  actions.append(validateButton, publishButton)
  const status = node('output', 'studio-status'); status.setAttribute('aria-live', 'polite')
  editor.append(label, textarea, actions, status)
  const preview = node('article', 'studio-preview'); preview.append(node('span', 'preview-label', 'LISTING PREVIEW'), node('h3', '', 'Waiting for validation'), node('p', '', 'Your safe preview appears here.'))
  workspace.append(editor, preview); studio.append(workspace); host.append(studio)

  let validated: PublicGameManifest | undefined
  const runValidation = async () => {
    publishButton.disabled = true; status.className = 'studio-status'; status.textContent = 'Validating against Manifest v2…'
    let result: ValidationResult
    try { result = await validateManifestJson(textarea.value) }
    catch (error) { result = { ok: false, errors: [`Manifest validation could not start: ${error instanceof Error ? error.message : 'unknown error'}`] } }
    if (!result.ok || !result.manifest) {
      validated = undefined; status.className = 'studio-status error'; status.textContent = result.errors.join(' · ')
      preview.replaceChildren(node('span', 'preview-label', 'NEEDS WORK'), node('h3', '', 'Manifest rejected'), node('p', '', result.errors[0] ?? 'Unknown validation error.'))
      return
    }
    validated = result.manifest; status.className = 'studio-status success'; status.textContent = 'Valid Manifest v2. Ready for your Nostr signature.'; publishButton.disabled = false
    preview.replaceChildren(node('span', 'preview-label', result.manifest.genres?.join(' · ').toUpperCase() ?? 'GAME'), node('h3', '', result.manifest.name), node('p', '', result.manifest.tagline ?? result.manifest.description ?? 'No description supplied.'), node('code', '', result.manifest.url))
  }
  validateButton.addEventListener('click', () => void runValidation())
  textarea.addEventListener('input', () => { validated = undefined; publishButton.disabled = true; status.textContent = 'Manifest changed. Validate again before signing.' })
  publishButton.addEventListener('click', async () => {
    if (!validated) return
    const signer = (window as Window & { nostr?: NostrSigner }).nostr
    if (!signer) { status.className = 'studio-status error'; status.textContent = 'A NIP-07 signer is required. No private key is accepted by this page.'; return }
    publishButton.disabled = true; status.className = 'studio-status'; status.textContent = 'Waiting for your Nostr signer…'
    try {
      const signed = await signer.signEvent(submissionEvent(validated))
      const result = await publishEvent(signed, relays)
      if (!result.accepted.length) throw new Error('No relay accepted the signed event.')
      status.className = 'studio-status success'
      status.textContent = `Published ${signed.id.slice(0, 12)}… to ${result.accepted.length} relay${result.accepted.length === 1 ? '' : 's'}. The public event is now your portable submission receipt; curated review remains explicit.`
    } catch (error) {
      status.className = 'studio-status error'; status.textContent = error instanceof Error ? error.message : 'Submission failed.'; publishButton.disabled = false
    }
  })
  void runValidation()
}
