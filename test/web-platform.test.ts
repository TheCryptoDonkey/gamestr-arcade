import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

describe('public web platform boundaries', () => {
  it('keeps operator diagnostics out of the generated public catalogue', async () => {
    const config = await read('vite.web.config.ts')
    expect(config).toContain("entry.name === 'payment-lab'")
    expect(config).toContain("manifest.url.startsWith('https://')")
  })

  it('does not use HTML injection for catalogue or relay content', async () => {
    const source = await read('src/web/main.ts')
    expect(source).not.toContain('.innerHTML')
    expect(source).not.toContain('insertAdjacentHTML')
    expect(source).not.toContain('document.write')
  })

  it('provides canonical player and score deep-link routes', async () => {
    const source = await read('src/web/main.ts')
    expect(source).toContain('/player/')
    expect(source).toContain('/score/')
    expect(source).toContain("current.name === 'player'")
    expect(source).toContain('scorePage(current.id!)')
    expect(source).toContain('/invite/')
    expect(source).toContain('invitationPage(current.id!)')
  })

  it('keeps social preferences local and invitations structured', async () => {
    const social = await read('src/web/social-state.ts')
    const invitation = await read('src/web/game-invitation.ts')
    expect(social).toContain("gamestr:social:v1")
    expect(invitation).toContain('GAME_INVITE_KIND = 23033')
    expect(invitation).toContain("content: ''")
    expect(invitation).toContain('verifyEvent(event)')
  })

  it('sandboxes embedded games without top-navigation authority', async () => {
    const source = await read('src/web/main.ts')
    const sandbox = source.match(/setAttribute\('sandbox', '([^']+)'\)/)?.[1]
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(source).toContain("original.rel = 'noopener noreferrer'")
  })

  it('keeps the service worker same-origin and GET-only', async () => {
    const worker = await read('src/web/public/sw.js')
    expect(worker).toContain("event.request.method !== 'GET'")
    expect(worker).toContain('url.origin !== self.location.origin')
  })

  it('uses the canonical schema and NIP-07 for signed submissions without collecting keys', async () => {
    const source = await read('src/web/developer-studio.ts')
    const eventSource = await read('src/web/developer-submission.ts')
    const config = await read('vite.web.config.ts')
    expect(eventSource).toContain("kind: 31990")
    expect(source).toContain("signer.signEvent")
    expect(source).toContain("verifyEvent(event)")
    expect(source).not.toMatch(/type=["']password["']/)
    expect(source).not.toContain('nsec')
    expect(config).toContain('schemas/game-manifest-v2.schema.json')
  })

  it('has unique editorial collections with no operator game', async () => {
    const editorial = JSON.parse(await read('web.editorial.json')) as Record<string, unknown>
    for (const key of ['featured', 'trending', 'new']) {
      const values = editorial[key] as string[]
      expect(values.length).toBeGreaterThan(0)
      expect(new Set(values).size).toBe(values.length)
      expect(values).not.toContain('payment-lab')
    }
  })
})
