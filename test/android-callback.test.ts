// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { restoreNostrAccess, disconnectNostrAccess, currentNostrGameSession } from '../src/web/nostr-access'

const key = new Uint8Array(32).fill(7)
const challenge = 'a'.repeat(64)
const pendingKey = 'signet:login.pendingRedirect'
function callback(encoding: 'json' | 'base64', stale = false) {
  const origin = window.location.origin
  const event = finalizeEvent({ kind: 21236, created_at: Math.floor(Date.now() / 1000), content: '', tags: [['challenge', challenge], ['origin', origin], ['app', 'Arcade']] }, key)
  localStorage.setItem(pendingKey, JSON.stringify({ challenge, origin, appName: 'Arcade', createdAt: Date.now() - (stale ? 600_000 : 0) }))
  const url = new URL('/game/pallasite?mode=play&signet_amber=1', origin)
  url.searchParams.set('event', encoding === 'json' ? JSON.stringify(event) : btoa(JSON.stringify(event)))
  window.history.replaceState(null, '', url)
}

describe('real SDK validation of Android signer returns', () => {
  beforeEach(async () => { await disconnectNostrAccess(); localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })
  for (const encoding of ['json', 'base64'] as const) {
    it(`validates ${encoding} returns without a previously saved identity and removes auth parameters`, async () => {
      callback(encoding)
      expect(await restoreNostrAccess([])).toMatchObject({ pubkey: getPublicKey(key), canSignEvents: false })
      expect(window.location.pathname).toBe('/game/pallasite')
      expect(window.location.search).toBe('?mode=play')
      expect(localStorage.getItem(pendingKey)).toBeNull()
      expect(currentNostrGameSession()?.pubkey).toBe(getPublicKey(key))
    })
  }
  it('rejects expired, tampered and replayed callbacks', async () => {
    callback('json', true)
    expect(await restoreNostrAccess([])).toBeNull()
    expect(currentNostrGameSession()).toBeUndefined()
    callback('json')
    const returned = window.location.href
    const params = new URL(returned)
    const event = JSON.parse(params.searchParams.get('event')!)
    event.content = 'tampered'; params.searchParams.set('event', JSON.stringify(event)); window.history.replaceState(null, '', params)
    expect(await restoreNostrAccess([])).toBeNull()
    window.history.replaceState(null, '', returned)
    expect(await restoreNostrAccess([])).toBeNull()
    expect(currentNostrGameSession()).toBeUndefined()
  })
  it('handles a denied callback and cleans the URL', async () => {
    callback('json')
    window.history.replaceState(null, '', '/scores?signet_amber=1&error=denied')
    expect(await restoreNostrAccess([])).toBeNull()
    expect(window.location.pathname).toBe('/scores')
    expect(window.location.search).toBe('')
  })
})
