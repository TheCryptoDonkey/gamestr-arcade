/**
 * gamestr-arcade — remote art fetch + cache helpers.
 *
 * Provides:
 *   - `extractArtUrls` — pure HTML parser: picks hero/logo URLs from og:image, favicons, etc.
 *   - `fetchAndCache`  — fetch a remote image, validate it, and persist it under cacheDir.
 */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { stat, readFile, writeFile, mkdir } from 'node:fs/promises'

// ── HTML art extraction ───────────────────────────────────────────────────────

/**
 * Extract hero and logo image URLs from an HTML page.
 *
 * hero  ← og:image (fallback: twitter:image)
 * logo  ← apple-touch-icon (fallback: rel="icon" / rel="shortcut icon")
 *
 * Relative `href`/`content` values are resolved against `baseUrl`.
 * Returns `{}` when nothing is found.
 */
export function extractArtUrls(html: string, baseUrl: string): { hero?: string; logo?: string } {
  const result: { hero?: string; logo?: string } = {}

  // ── hero: og:image then twitter:image ──────────────────────────────────────
  // Match <meta property="og:image" content="..."> in any attribute order.
  const ogImage = metaContent(html, /og:image/)
  const twitterImage = !ogImage ? metaContent(html, /twitter:image/) : undefined
  const heroRaw = ogImage ?? twitterImage
  if (heroRaw) {
    const resolved = safeResolve(heroRaw, baseUrl)
    if (resolved) result.hero = resolved
  }

  // ── logo: apple-touch-icon then icon / shortcut icon ───────────────────────
  const appleIcon = linkHref(html, /apple-touch-icon/)
  const fallbackIcon = !appleIcon ? linkHref(html, /(?:shortcut\s+)?icon/) : undefined
  const logoRaw = appleIcon ?? fallbackIcon
  if (logoRaw) {
    const resolved = safeResolve(logoRaw, baseUrl)
    if (resolved) result.logo = resolved
  }

  return result
}

/** Extract `content` from a `<meta>` tag whose attributes contain `namePattern`. */
function metaContent(html: string, namePattern: RegExp): string | undefined {
  // Match <meta …> tags (non-greedy, handles multi-line attributes).
  const metaRe = /<meta\s([^>]+?)>/gis
  let m: RegExpExecArray | null
  while ((m = metaRe.exec(html)) !== null) {
    const attrs = m[1]
    if (!namePattern.test(attrs)) continue
    const content = attrValue(attrs, 'content')
    if (content) return content
  }
  return undefined
}

/** Extract `href` from a `<link>` tag whose `rel` attribute contains `relPattern`. */
function linkHref(html: string, relPattern: RegExp): string | undefined {
  const linkRe = /<link\s([^>]+?)>/gis
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const attrs = m[1]
    const rel = attrValue(attrs, 'rel')
    if (!rel || !relPattern.test(rel)) continue
    const href = attrValue(attrs, 'href')
    if (href) return href
  }
  return undefined
}

/** Extract the value of a named attribute (handles single/double quotes and unquoted). */
function attrValue(attrs: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*?)"|'([^']*?)'|([^\\s>]+))`, 'i')
  const m = re.exec(attrs)
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

function safeResolve(href: string, base: string): string | undefined {
  try { return new URL(href, base).href } catch { return undefined }
}

// ── Fetch + cache ─────────────────────────────────────────────────────────────

export interface FetchResult {
  ok: boolean
  contentType: string
  bytes: Buffer
}

/** Injectable network call so tests never hit the network. */
export type FetchUrl = (url: string) => Promise<FetchResult>

/** Image magic-byte signatures (first 4 bytes). */
const IMAGE_MAGIC: ReadonlyArray<readonly number[]> = [
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff],        // JPEG
  [0x47, 0x49, 0x46],        // GIF
  [0x52, 0x49, 0x46, 0x46], // WebP (RIFF…)
]

function looksLikeImage(contentType: string, bytes: Buffer): boolean {
  if (contentType.startsWith('image/')) return true
  return IMAGE_MAGIC.some(sig => sig.every((b, i) => bytes[i] === b))
}

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 h

/**
 * Fetch `url` and cache it under `cacheDir`, keyed by SHA-1 of the URL.
 *
 * Returns the absolute path to the cached file on success, or `null` on any
 * failure (bad content-type, network error, non-image bytes, etc.).
 *
 * If a cached file exists and is younger than 24 h the injected `fetchFn` is
 * NOT called — the cached path is returned immediately.
 */
export async function fetchAndCache(
  url: string,
  cacheDir: string,
  fetchFn: FetchUrl,
): Promise<string | null> {
  try {
    const key = createHash('sha1').update(url).digest('hex')
    const cachePath = join(cacheDir, key)

    // Return cached file if still fresh.
    const fileAge = await stat(cachePath)
      .then(s => Date.now() - s.mtimeMs)
      .catch(() => Infinity)
    if (fileAge < CACHE_MAX_AGE_MS) return cachePath

    const result = await fetchFn(url)
    if (!result.ok) return null
    if (!looksLikeImage(result.contentType, result.bytes)) return null

    await mkdir(cacheDir, { recursive: true })
    await writeFile(cachePath, result.bytes)
    return cachePath
  } catch {
    return null
  }
}

// ── Production fetch implementation ──────────────────────────────────────────

/** Production `FetchUrl` using the global `fetch` with a 5 s timeout. */
export const realFetchUrl: FetchUrl = async (url) => {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 5_000)
  try {
    const res = await fetch(url, { signal: ac.signal })
    if (!res.ok) return { ok: false, contentType: '', bytes: Buffer.alloc(0) }
    const ab = await res.arrayBuffer()
    return {
      ok: true,
      contentType: res.headers.get('content-type') ?? '',
      bytes: Buffer.from(ab),
    }
  } catch {
    return { ok: false, contentType: '', bytes: Buffer.alloc(0) }
  } finally {
    clearTimeout(timer)
  }
}
