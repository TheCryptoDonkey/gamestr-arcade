import { describe, expect, it } from 'vitest'
import { androidSignerRequest } from '../src/web/android-signer'

describe('Cambium and Amber NIP-55 web request', () => {
  it('uses uncompressed JSON and an appendable callback, preserving the destination', () => {
    const request = androidSignerRequest('600 Billion Arcade', 'a'.repeat(64), 'https://arcade.600.wtf/game/pallasite?mode=play#old', 1_800_000_000_000)
    const separator = request.url.indexOf('?')
    const template = JSON.parse(decodeURIComponent(request.url.slice('nostrsigner:'.length, separator)))
    const params = new URLSearchParams(request.url.slice(separator + 1))
    expect(params.get('compressionType')).toBe('none')
    expect(params.get('returnType')).toBe('event')
    expect(template).toMatchObject({ kind: 21236, created_at: 1_800_000_000 })
    const callback = params.get('callbackUrl')!
    expect(callback).toBe('https://arcade.600.wtf/game/pallasite?mode=play&signet_amber=1&event=')
    // Cambium appends URI-encoded event JSON rather than inventing a query parameter.
    const returned = new URL(callback + encodeURIComponent(JSON.stringify(template)))
    expect(JSON.parse(returned.searchParams.get('event')!)).toEqual(template)
    expect(JSON.parse(request.pending).origin).toBe('https://arcade.600.wtf')
  })
  it('rejects insecure origins and malformed challenges', () => {
    expect(() => androidSignerRequest('Arcade', 'a'.repeat(64), 'http://example.com/')).toThrow('HTTPS')
    expect(() => androidSignerRequest('Arcade', 'bad', 'https://example.com/')).toThrow('challenge')
  })
})
