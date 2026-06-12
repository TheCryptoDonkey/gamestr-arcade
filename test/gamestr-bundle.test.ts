/**
 * Tests for the gamestr.io bundle catalogue parser + fetch (src/main/gamestr-catalogue.ts).
 * NOTE: distinct from gamestr-catalogue.test.ts, which tests the leaderboard
 * score subscription `createGamestrCatalogue`. This covers extracting game
 * metadata (name/art/genres/play-url) from gamestr.io's minified frontend bundle.
 */

import { describe, it, expect } from 'vitest'
import { parseGamestrCatalogue, fetchGamestrCatalogue, type CatalogueDeps } from '../src/main/gamestr-catalogue'
import type { GamestrCatalogueResult } from '../src/shared/types'

// A representative slice of gamestr.io's minified bundle, covering both catalogue
// shapes, minified booleans (!0/!1), relative + absolute images, genres, an
// entry with no play url (must be skipped), and unrelated code around it.
const FIXTURE = `
const X={"bb1f62f00f67dec2182ac7c40d046979d7c8ca698951cb9e509bdcb3d0a85f8a:btcrally":{name:"BTC Rally",description:"A Kart-style racing game — pay sats to enter.",image:"https://img.itch.zone/x.png",genres:["racing","multiplayer","action"],url:"https://mandelduckstudio.itch.io/btcrally",developer:"npub1yreyumw",featured:!0,trending:!0,newRelease:!0},"a97c337110c3573dc246e272b8e25e5de9c2c60e2a7dba2a2bc76087e2856c6b:mempool-breaker":{name:"Mempool Breaker",description:"Mine live mempool blocks.",image:"/games/mempool-breaker.png",genres:["arcade","bitcoin","action"],url:"https://games.noderunners.network/mempoolbreaker/",developer:"a97c33",featured:!1,trending:!0,newRelease:!0},"nopubkey:wordswithzaps":{name:"Words With Zaps",description:"A competitive word game.",image:"/games/wordswithzaps.png",genres:["word","multiplayer"],url:"https://wordswithzaps.example/",developer:"nopubkey",featured:!1,trending:!0,newRelease:!0},"deadbeef:nourlgame":{name:"No URL Game",description:"has no play url",genres:["x"],developer:"deadbeef",featured:!1}};
const Si={word5:{scoreField:"streak",scoreDirection:"desc",metadata:{name:"Word5",description:"A daily word puzzle game.",image:"https://pexels.example/p.jpeg?w=800",genres:["puzzle","casual"],url:"https://word5.otherstuff.ai",developer:"otherstuff.ai",featured:!1,trending:!1,newRelease:!0}},unicornvssnakes:{scoreField:"score",scoreDirection:"desc",metadata:{name:"Unicorn vs Snakes",description:"Who put all these snakes on the field?",image:"/games/uvs.png",genres:["arcade"],url:"https://uvs.example/",developer:"dev",featured:!1,trending:!1,newRelease:!1}}};
function consider(e){return e.tags.find(t=>t[0]==="game")}
`

describe('parseGamestrCatalogue', () => {
  const entries = parseGamestrCatalogue(FIXTURE)
  const bySlug = new Map(entries.map(e => [e.slug, e]))

  it('extracts both bundle shapes', () => {
    expect(bySlug.has('btcrally')).toBe(true) // shape 1 (hex pubkey key)
    expect(bySlug.has('wordswithzaps')).toBe(true) // shape 1 (nopubkey key)
    expect(bySlug.has('word5')).toBe(true) // shape 2 (Si.metadata)
    expect(bySlug.has('unicornvssnakes')).toBe(true) // shape 2
  })

  it('skips entries with no play url', () => {
    expect(bySlug.has('nourlgame')).toBe(false)
  })

  it('parses name, url, genres and decodes em-dashes', () => {
    const btc = bySlug.get('btcrally')!
    expect(btc.name).toBe('BTC Rally')
    expect(btc.url).toBe('https://mandelduckstudio.itch.io/btcrally')
    expect(btc.genres).toEqual(['racing', 'multiplayer', 'action'])
    expect(btc.description).toContain('—')
  })

  it('resolves relative images against the gamestr origin, keeps absolute ones', () => {
    expect(bySlug.get('mempool-breaker')!.image).toBe('https://gamestr.io/games/mempool-breaker.png')
    expect(bySlug.get('btcrally')!.image).toBe('https://img.itch.zone/x.png')
  })

  it('decodes minified booleans (!0 = true, !1 = false)', () => {
    expect(bySlug.get('btcrally')!.trending).toBe(true)
    expect(bySlug.get('mempool-breaker')!.featured).toBe(false)
    expect(bySlug.get('word5')!.newRelease).toBe(true)
    expect(bySlug.get('word5')!.trending).toBe(false)
  })

  it('extracts kind-5555 scoring config for shape-2 (Other Stuff) games', () => {
    const w = bySlug.get('word5')!
    expect(w.scoreKind).toBe(5555)
    expect(w.scoreField).toBe('streak')
    expect(w.scoreDir).toBe('desc')
    const u = bySlug.get('unicornvssnakes')!
    expect(u.scoreKind).toBe(5555)
    expect(u.scoreField).toBe('score')
    expect(u.scoreDir).toBe('desc')
  })

  it('leaves shape-1 games on the default scoring (no scoreKind)', () => {
    expect(bySlug.get('btcrally')!.scoreKind).toBeUndefined()
    expect(bySlug.get('btcrally')!.scoreField).toBeUndefined()
  })

  it('returns the full distinct set with no duplicates', () => {
    const slugs = entries.map(e => e.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.sort()).toEqual(
      ['btcrally', 'mempool-breaker', 'unicornvssnakes', 'word5', 'wordswithzaps'].sort(),
    )
  })
})

describe('fetchGamestrCatalogue', () => {
  function deps(over: Partial<CatalogueDeps>): CatalogueDeps {
    return {
      fetchText: async () => '',
      now: () => 1_000_000,
      readCache: async () => null,
      writeCache: async () => {},
      ...over,
    }
  }

  it('fetches the bundle from the homepage script tag, parses, and caches', async () => {
    let written: GamestrCatalogueResult | null = null
    const res = await fetchGamestrCatalogue(
      deps({
        fetchText: async url =>
          url.endsWith('/') ? '<script src="/assets/index-D0MiOxOb.js"></script>' : FIXTURE,
        writeCache: async r => {
          written = r
        },
      }),
    )
    expect(res.source).toBe('live')
    expect(res.entries.length).toBe(5)
    expect(written).not.toBeNull()
    expect(written!.entries.length).toBe(5)
  })

  it('serves a fresh-enough cache without hitting the network', async () => {
    let fetched = false
    const cache: GamestrCatalogueResult = {
      entries: [{ slug: 'pallasite', name: 'Pallasite', genres: [], url: 'https://x' }],
      source: 'live',
      fetchedAt: 1_000_000,
    }
    const res = await fetchGamestrCatalogue(
      deps({
        now: () => 1_000_000 + 1000,
        readCache: async () => cache,
        fetchText: async () => {
          fetched = true
          return ''
        },
      }),
    )
    expect(fetched).toBe(false)
    expect(res.source).toBe('cache')
    expect(res.entries[0].slug).toBe('pallasite')
  })

  it('falls back to stale cache when the live fetch fails', async () => {
    const cache: GamestrCatalogueResult = {
      entries: [{ slug: 'pallasite', name: 'Pallasite', genres: [], url: 'https://x' }],
      source: 'live',
      fetchedAt: 0,
    }
    const res = await fetchGamestrCatalogue(
      deps({
        now: () => 999_999_999,
        readCache: async () => cache,
        fetchText: async () => {
          throw new Error('offline')
        },
      }),
    )
    expect(res.source).toBe('cache')
    expect(res.entries[0].slug).toBe('pallasite')
  })
})
