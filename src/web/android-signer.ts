import type { SignetStorage } from 'signet-login'

/** NIP-55 web transport shared by Cambium and Amber; Android chooses the handler. */
export function androidSignerRequest(appName: string, challenge: string, href: string, now = Date.now()): { url: string; pending: string } {
  if (!/^[0-9a-f]{64}$/.test(challenge)) throw new Error('Invalid login challenge.')
  const callback = new URL(href)
  if (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname))) throw new Error('Android login requires HTTPS.')
  callback.hash = ''
  for (const key of ['event', 'pubkey', 'signature', 'eventId', 'error']) callback.searchParams.delete(key)
  callback.searchParams.set('signet_amber', '1')
  const template = { kind: 21236, created_at: Math.floor(now / 1000), content: '', tags: [['challenge', challenge], ['origin', callback.origin], ['app', appName]] }
  const params = new URLSearchParams({ type: 'sign_event', compressionType: 'none', returnType: 'event', callbackUrl: `${callback.href}&event=` })
  return {
    url: `nostrsigner:${encodeURIComponent(JSON.stringify(template))}?${params}`,
    pending: JSON.stringify({ challenge, origin: callback.origin, appName, createdAt: now }),
  }
}

export async function startAndroidSignerLogin(appName: string, storage: SignetStorage): Promise<null> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const challenge = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  const request = androidSignerRequest(appName, challenge, window.location.href)
  await storage.setItem('signet:login.pendingRedirect', request.pending)
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener('pageshow', finish)
      void storage.removeItem('signet:login.pendingRedirect')
      resolve(null)
    }
    // Back/cancel or an unhandled scheme must not leave CONNECT stuck forever.
    const timer = setTimeout(finish, 60_000)
    window.addEventListener('pageshow', finish)
    try { window.location.href = request.url } catch { finish() }
  })
}
