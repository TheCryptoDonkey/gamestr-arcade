/**
 * gamestr.io catalogue — fetch + parse.
 *
 * gamestr.io has no game-registry API and publishes nothing about its catalogue
 * to Nostr (scores only — see the detector). The catalogue (name, art, genres,
 * and crucially the external PLAY URL for each game) is hardcoded in its
 * frontend JS bundle. This module fetches that bundle and extracts the
 * catalogue so the arcade can offer one-tap "add this gamestr game".
 *
 * Two entry shapes coexist in the bundle:
 *
 *   1. "<devPubkey|nopubkey>:<slug>": { name, description, image, genres, url, … }
 *   2. <slug>: { scoreField, …, metadata: { name, description, image, genres, url, … } }
 *
 * `parseGamestrCatalogue` handles both. It is PURE and unit-tested against a
 * captured fixture, so a gamestr redeploy that changes the bundle shape fails a
 * test rather than the booth. The Electron-coupled fetch lives behind the
 * injected `CatalogueDeps` so it is testable too, and a last-good on-disk cache
 * keeps the importer working when the booth is offline.
 */

import type { GamestrCatalogueEntry, GamestrCatalogueResult } from '../shared/types'

export const GAMESTR_ORIGIN = 'https://gamestr.io'

// ── Parser ────────────────────────────────────────────────────────────────────

/** Resolve a possibly-relative bundle image path to an absolute URL. */
function absImage(src: string | undefined): string | undefined {
  if (!src) return undefined
  if (/^https?:\/\//i.test(src)) return src
  return GAMESTR_ORIGIN + (src.startsWith('/') ? src : '/' + src)
}

/** Minimal JS string-literal unescape — the bundle uses \" \\ \/ \n and \uXXXX. */
function unescapeJs(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\(["'\\/])/g, '$1')
}

/** Read the `{…}` object literal at/after `from`, string-aware (ignores braces
 *  and quotes inside string values). Returns the literal text or null. */
function readObject(js: string, from: number): string | null {
  const open = js.indexOf('{', from)
  if (open === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = open; i < js.length; i++) {
    const c = js[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return js.slice(open, i + 1)
    }
  }
  return null
}

function strField(body: string, name: string): string | undefined {
  const m = new RegExp(name + ':"((?:[^"\\\\]|\\\\.)*)"').exec(body)
  return m ? unescapeJs(m[1]) : undefined
}

/** Minified booleans are `!0` (true) / `!1` (false); also accept literal forms. */
function boolField(body: string, name: string): boolean | undefined {
  const bang = new RegExp(name + ':!([01])').exec(body)
  if (bang) return bang[1] === '0'
  const lit = new RegExp(name + ':(true|false)\\b').exec(body)
  return lit ? lit[1] === 'true' : undefined
}

function genresField(body: string): string[] {
  const m = /genres:\[([^\]]*)\]/.exec(body)
  if (!m) return []
  return Array.from(m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g), x => unescapeJs(x[1]))
}

/** Build an entry from an object-literal body. Requires name + url (a play
 *  URL is the whole point — entries without one are not addable). */
function entryFrom(slug: string, body: string): GamestrCatalogueEntry | null {
  const name = strField(body, 'name')
  const url = strField(body, 'url')
  if (!name || !url) return null
  return {
    slug,
    name,
    description: strField(body, 'description'),
    image: absImage(strField(body, 'image')),
    genres: genresField(body),
    url,
    developer: strField(body, 'developer'),
    featured: boolField(body, 'featured'),
    trending: boolField(body, 'trending'),
    newRelease: boolField(body, 'newRelease'),
  }
}

/**
 * Extract every gamestr game from its frontend bundle. Tolerant of the two
 * known shapes; ignores anything that isn't a catalogue entry (no name/url).
 * First-seen wins, so a slug present in both shapes keeps the richer shape-1
 * entry.
 */
export function parseGamestrCatalogue(js: string): GamestrCatalogueEntry[] {
  const out = new Map<string, GamestrCatalogueEntry>()

  // Shape 1 — "<prefix>:<slug>":{ … }. The quoted key has a colon; shape-2 keys
  // are bare identifiers, so the two passes never collide.
  const keyRe = /"[^"]*?:([a-z0-9][a-z0-9-]*)":(?=\{)/g
  let m: RegExpExecArray | null
  while ((m = keyRe.exec(js))) {
    if (out.has(m[1])) continue
    const body = readObject(js, m.index + m[0].length)
    if (!body) continue
    const e = entryFrom(m[1], body)
    if (e) out.set(m[1], e)
  }

  // Shape 2 — <slug>:{scoreField:…,metadata:{ … }}.
  const cfgRe = /([a-z0-9][a-z0-9-]*):\{scoreField:/g
  while ((m = cfgRe.exec(js))) {
    if (out.has(m[1])) continue
    const metaIdx = js.indexOf('metadata:', m.index)
    if (metaIdx === -1) continue
    const body = readObject(js, metaIdx)
    if (!body) continue
    const e = entryFrom(m[1], body)
    if (e) out.set(m[1], e)
  }

  return Array.from(out.values())
}

// ── Fetch (with offline cache) ──────────────────────────────────────────────────

export interface CatalogueDeps {
  /** Fetch a URL as text (Electron `net.fetch` in production). */
  fetchText(url: string): Promise<string>
  /** Current time in unix ms. */
  now(): number
  /** Read the last-good cached result, or null. */
  readCache(): Promise<GamestrCatalogueResult | null>
  /** Persist a fresh result (best-effort). */
  writeCache(result: GamestrCatalogueResult): Promise<void>
}

const HOMEPAGE = GAMESTR_ORIGIN + '/'
// Bundle filename carries a content hash that changes per deploy — discover it
// from the homepage rather than hard-coding it.
const BUNDLE_RE = /assets\/index-[A-Za-z0-9_-]+\.js/

const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6h — booths refresh a few times a day

/**
 * Return the gamestr catalogue, preferring a fresh-enough cache, then a live
 * fetch+parse, then any stale cache (offline fallback). Throws only when there
 * is neither a live result nor any cache.
 */
export async function fetchGamestrCatalogue(
  deps: CatalogueDeps,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): Promise<GamestrCatalogueResult> {
  const cached = await deps.readCache().catch(() => null)
  if (cached && cached.entries.length && deps.now() - cached.fetchedAt < maxAgeMs) {
    return { ...cached, source: 'cache' }
  }
  try {
    const html = await deps.fetchText(HOMEPAGE)
    const hit = BUNDLE_RE.exec(html)
    if (!hit) throw new Error('gamestr bundle <script> not found in homepage')
    const js = await deps.fetchText(GAMESTR_ORIGIN + '/' + hit[0])
    const entries = parseGamestrCatalogue(js)
    if (!entries.length) throw new Error('gamestr catalogue parsed empty (bundle shape changed?)')
    const result: GamestrCatalogueResult = { entries, source: 'live', fetchedAt: deps.now() }
    await deps.writeCache(result).catch(() => {})
    return result
  } catch (err) {
    if (cached && cached.entries.length) return { ...cached, source: 'cache' }
    throw err
  }
}
