import { describe, it, expect } from 'vitest'
import { resolveIcon, type IconDeps } from '../src/main/icons'

function deps(over: Partial<IconDeps>): IconDeps {
  return {
    exists: async () => false,
    mtime: async () => 0,
    extractDirIcon: async () => false,
    placeholder: (slug) => `/placeholder/${slug}.png`,
    ...over
  }
}

describe('resolveIcon', () => {
  it('prefers a sibling logo.png when present', async () => {
    const out = await resolveIcon({ slug: 'a', siblingLogo: '/g/a/logo.png' }, '/cache', deps({ exists: async p => p === '/g/a/logo.png' }))
    expect(out).toBe('/g/a/logo.png')
  })
  it('uses cached png when fresh (cache mtime >= appimage mtime)', async () => {
    const out = await resolveIcon({ slug: 'a', appImagePath: '/g/a.AppImage' }, '/cache',
      deps({ exists: async p => p === '/cache/a.png', mtime: async p => (p === '/cache/a.png' ? 200 : 100) }))
    expect(out).toBe('/cache/a.png')
  })
  it('extracts then returns cache png when no cache exists', async () => {
    let extracted = false
    const out = await resolveIcon({ slug: 'a', appImagePath: '/g/a.AppImage' }, '/cache',
      deps({ extractDirIcon: async () => { extracted = true; return true } }))
    expect(extracted).toBe(true)
    expect(out).toBe('/cache/a.png')
  })
  it('falls back to placeholder when extraction fails', async () => {
    const out = await resolveIcon({ slug: 'a', appImagePath: '/g/a.AppImage' }, '/cache', deps({}))
    expect(out).toBe('/placeholder/a.png')
  })
})
