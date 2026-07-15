import { describe, it, expect } from 'vitest'
import { scanGames } from '../src/main/scanner'
import { join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const DIR = join(import.meta.dirname, 'fixtures/games')
const REAL_GAMES = join(import.meta.dirname, '..', 'games')

describe('scanGames', () => {
  it('reads a web game from game.json and skips empty folders', async () => {
    const games = await scanGames(DIR)
    const neon = games.find(g => g.id === 'neon')
    expect(neon).toBeTruthy()
    expect(neon!.kind).toBe('web')
    expect(neon!.url).toBe('https://example.test/neon')
    expect(neon!.gameId).toBe('neon-sentinel')
    expect(games.find(g => g.id === 'zzz-empty')).toBeUndefined()
    // A normal web game is not download-only.
    expect(neon!.downloadOnly).toBeUndefined()
    expect(neon!.downloadUrl).toBeUndefined()
    expect(neon!.available).toBe(true)
    expect(neon!.network).toBe('optional')
    expect(neon).toMatchObject({
      manifestVersion: 2,
      developer: 'Test Studio',
      genres: ['arcade', 'shooter'],
      inputModes: ['gamepad', 'keyboard'],
      controlHints: ['D-PAD = MOVE', 'A = FIRE'],
      sessionMinutes: 5,
      players: { min: 1, max: 2 },
      ageRating: 'ALL AGES',
      capabilities: { nostrSign: true, walletPay: false, persistentStorage: true },
      rewardRules: { enabled: true, label: 'TOP SCORE REWARD' },
      allowedOrigins: ['https://example.test', 'https://cdn.example.test'],
    })
  })

  it('reads downloadOnly + downloadUrl from game.json', async () => {
    const games = await scanGames(DIR)
    const g = games.find(g => g.id === 'dlonly')
    expect(g).toBeTruthy()
    expect(g!.kind).toBe('web')
    expect(g!.downloadOnly).toBe(true)
    expect(g!.downloadUrl).toBe('https://example.test/dlonly/download')
  })

  it('textLogo:true forces an empty logo so the shell renders its neon wordmark', async () => {
    // Even with a resolver that would return art, textLogo wins (logo stays '').
    const games = await scanGames(DIR, async () => '/resolved/should-not-be-used.png')
    const g = games.find(g => g.id === 'dlonly')
    expect(g!.logo).toBe('')
    // A game without the flag still gets its resolved logo.
    const neon = games.find(g => g.id === 'neon')
    expect(neon!.logo).toBe('/resolved/should-not-be-used.png')
  })

  it('reads a native tile from game.json.exec (absolute path)', async () => {
    const games = await scanGames(DIR)
    const g = games.find(g => g.id === 'exec-only')
    expect(g).toBeTruthy()
    expect(g!.kind).toBe('appimage')
    expect(g!.exec).toBe('/some/absolute/path/Game.AppImage')
    expect(g!.gameId).toBe('exec-only')
    expect(g!.available).toBe(false)
    expect(g!.availabilityReason).toBe('Native game file is missing.')
  })

  it('reads a native tile from game.json.exec (relative path - resolved to folder)', async () => {
    const games = await scanGames(DIR)
    const g = games.find(g => g.id === 'exec-relative')
    expect(g).toBeTruthy()
    expect(g!.kind).toBe('appimage')
    // Relative exec is resolved against the tile folder (fixtures/games/exec-relative/)
    expect(g!.exec).toBe(join(DIR, 'exec-relative', '../../fake-game.AppImage'))
  })

  it('a loose *.AppImage in the folder takes precedence over game.json.exec', async () => {
    // exec-only has no loose AppImage in its folder - verify it used exec
    // (this is the complement: if there were a loose AppImage it would win)
    const games = await scanGames(DIR)
    const g = games.find(g => g.id === 'exec-only')
    expect(g!.exec).toBe('/some/absolute/path/Game.AppImage')
  })

  it('sorts by order then name', async () => {
    const games = await scanGames(DIR)
    expect(games.map(g => g.order)).toEqual([...games.map(g => g.order)].sort((a, b) => a - b))
  })

  it('blocks plaintext remote URLs while allowing a local offline mirror', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gamestr-scanner-'))
    try {
      await Promise.all([
        mkdir(join(root, 'remote-http')),
        mkdir(join(root, 'loopback-http')),
      ])
      await Promise.all([
        writeFile(join(root, 'remote-http', 'game.json'), JSON.stringify({ url: 'http://games.example.test/play' })),
        writeFile(join(root, 'loopback-http', 'game.json'), JSON.stringify({ url: 'http://127.0.0.1:8090/' })),
      ])

      const games = await scanGames(root)
      expect(games.find(game => game.id === 'remote-http')?.available).toBe(false)
      expect(games.find(game => game.id === 'loopback-http')?.available).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('prefers a cinematic hero reel over the static fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gamestr-scanner-'))
    try {
      const dir = join(root, 'reel-game')
      await mkdir(dir)
      await Promise.all([
        writeFile(join(dir, 'game.json'), JSON.stringify({ name: 'Reel Game', url: 'https://example.test' })),
        writeFile(join(dir, 'hero.png'), ''),
        writeFile(join(dir, 'hero.mp4'), ''),
      ])

      const [game] = await scanGames(root)
      expect(game.hero).toBe(join(dir, 'hero.mp4'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('uses optimized WebP sibling art without a network resolver', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gamestr-scanner-'))
    try {
      const dir = join(root, 'webp-game')
      await mkdir(dir)
      await Promise.all([
        writeFile(join(dir, 'game.json'), JSON.stringify({ name: 'WebP Game', url: 'https://example.test' })),
        writeFile(join(dir, 'logo.webp'), ''),
        writeFile(join(dir, 'hero.webp'), ''),
      ])
      const [game] = await scanGames(root)
      expect(game.logo).toBe(join(dir, 'logo.webp'))
      expect(game.hero).toBe(join(dir, 'hero.webp'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('the shipped Pallasite tile', () => {
  it('falls back to its web build when the optional native package is not installed', async () => {
    const games = await scanGames(REAL_GAMES)
    const pallasite = games.find(g => g.id === 'pallasite')
    expect(pallasite, 'pallasite tile should be scanned from games/').toBeTruthy()
    // On a booth with Pallasite.AppImage beside game.json the native build wins;
    // a source checkout has no 376 MB binary, so the playable URL is used.
    expect(pallasite!.kind).toBe('web')
    expect(pallasite!.url).toBe('https://pallasite.app/')
    expect(pallasite!.available).toBe(true)
    expect(pallasite!.gameId).toBe('pallasite')
    expect(pallasite!.order).toBe(1)
    expect(pallasite!.accent).toBe('#7cf3ff')
    // Author-declared tips address - the post-game zap ask goes to the developer.
    expect(pallasite!.tips).toBe('profusemeat89@walletofsatoshi.com')
    expect(pallasite!.developer).toBe('The Crypto Donkey')
  })

  it('ships the official key-art hero alongside the cyan logo', async () => {
    const games = await scanGames(REAL_GAMES)
    const pallasite = games.find(g => g.id === 'pallasite')
    // The og-image hero was once removed as too busy behind the showcase text;
    // the showcase now carries its own scrim + text shadows, so the key art is
    // back as a deliberate full-bleed hero.
    expect(pallasite!.hero).toMatch(/pallasite\/hero\.webp$/)
    // The clean cyan logo is still present for the logo-on-left treatment.
    expect(pallasite!.logo).toMatch(/pallasite\/logo\.png$/)
  })
})
