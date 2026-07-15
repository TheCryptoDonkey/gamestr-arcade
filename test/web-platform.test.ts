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
    expect(source).toContain('/challenge/')
    expect(source).toContain('challengePage(current.id!)')
    expect(source).toContain("slug.startsWith('naddr1')")
    expect(source).toContain("decoded.data.identifier")
    expect(source).toContain('legacyScore')
  })

  it('keeps social preferences local and invitations structured', async () => {
    const social = await read('src/web/social-state.ts')
    const invitation = await read('src/web/game-invitation.ts')
    expect(social).toContain("gamestr:social:v1")
    expect(invitation).toContain('GAME_INVITE_KIND = 23033')
    expect(invitation).toContain("content: ''")
    expect(invitation).toContain('signatureIsValid(event)')
  })

  it('derives signed challenge standings from verified score timestamps', async () => {
    const source = await read('src/web/main.ts')
    const challenge = await read('src/web/game-challenge.ts')
    expect(challenge).toContain('GAME_CHALLENGE_KIND = 23034')
    expect(challenge).toContain('signatureIsValid(event)')
    expect(source).toContain('entry.at >= challenge.startsAt && entry.at <= challenge.endsAt')
    expect(source).toContain("boardFor(eligible")
  })

  it('uses only a user-provided WebLN wallet for exact-amount rewards', async () => {
    const source = await read('src/web/lightning-reward.ts')
    const page = await read('src/web/main.ts')
    expect(source).toContain('provider.enable()')
    expect(source).toContain('provider.sendPayment')
    expect(source).toContain("invoiceAmountMsats(invoicePayload.pr) !== BigInt(amount)")
    expect(source).toContain("kind: 9734")
    expect(source).toContain('lud06Endpoint')
    expect(source).toContain("callback.searchParams.set('nostr'")
    expect(page).toContain('(window as NostrWindow).webln')
    expect(page).not.toContain('NWC_URI')
    expect(page).not.toContain('phoenixd')
    expect(page).toContain('To receive zaps, players need to add a lightning address (lud16) or LNURL (lud06)')
    expect(page).toContain('VIEW ORIGINAL ON GAMESTR.IO')
  })

  it('ships canonical clone metadata without claiming the upstream domain', async () => {
    const html = await read('src/web/index.html')
    const caddy = await read('deploy/web/gamestr-web.Caddyfile')
    const config = await read('vite.web.config.ts')
    expect(html).toContain('rel="canonical" href="https://gamestr.95-217-39-110.sslip.io/"')
    expect(html).not.toContain('rel="canonical" href="https://gamestr.io/"')
    expect(html).toContain('property="og:title"')
    expect(caddy).toContain('gamestr.95-217-39-110.sslip.io {')
    expect(caddy).not.toContain('gamestr.io {')
    expect(config).toContain("process.env.GAMESTR_WEB_ORIGIN")
    expect(config).toContain('prerenderRoutes(games)')
    expect(caddy).toContain('{path}/index.html')
  })

  it('uses real external play links so publisher frame policies cannot break play', async () => {
    const source = await read('src/web/main.ts')
    expect(source).toContain('function playLink')
    expect(source).toContain("link.target = '_blank'")
    expect(source).toContain("link.rel = 'noopener noreferrer'")
    expect(source).not.toContain("el('iframe')")
    expect(source).not.toContain('openGame(')
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
    expect(source).toContain("verifyEvent(canonical)")
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
    expect((editorial.hero as Record<string, string>)['neon-sentinel']).toMatch(/^\/editorial\//)
    expect((editorial.logo as Record<string, string>)['neon-sentinel']).toMatch(/^\/editorial\//)
    expect((editorial.hero as Record<string, string>)['hang-on-fren']).toMatch(/^\/editorial\//)
    expect((editorial.logo as Record<string, string>)['hang-on-fren']).toMatch(/^\/editorial\//)
    expect((editorial.hero as Record<string, string>)['nogames-miner-v1']).toMatch(/^\/editorial\//)
    expect((editorial.hero as Record<string, string>)['nogames-snake-v1']).toMatch(/^\/editorial\//)
  })

  it('defines the 600 Billion site as a strict web edition instead of a fork', async () => {
    const editions = JSON.parse(await read('web.editions.json')) as Record<string, Record<string, unknown>>
    const config = await read('vite.web.config.ts')
    const edition = editions['600']
    expect(edition.defaultOrigin).toBe('https://arcade.600.wtf')
    expect(edition.outDir).toBe('dist-web-600')
    expect(edition.gameSlugs).toEqual(['pallasite', 'neon-sentinel', 'hang-on-fren'])
    expect(edition.themeColor).toBe('#f7931a')
    expect(config).toContain('allowedGames')
    expect(config).toContain('!allowedGames.has(entry.name)')
    expect(config).toContain('__GAMESTR_WEB_EDITION__')
  })
})
