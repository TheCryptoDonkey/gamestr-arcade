/**
 * gamestr-arcade — Nostr profile (kind-0) resolution for the leaderboard.
 *
 * Scores arrive as bare hex pubkeys; this module turns them into a friendly
 * identity WITHOUT ever blocking the score render:
 *
 *   - `shortenNpub` / `avatarSeed` / `avatarGradient` are pure, deterministic
 *     helpers used for the instant placeholder (a shortened npub + a generated
 *     gradient identicon). These are unit-tested.
 *   - `resolveProfiles` opens a short-lived raw-WS `REQ {kinds:[0]}` across the
 *     configured relays and resolves display name, picture, NIP-05 and
 *     Lightning receive metadata as they arrive, de-duplicating to the newest
 *     kind-0 per author. It is fire-and-forget: the panel renders placeholders
 *     immediately and live-patches identities in.
 *
 * No DOM is touched at module load (WebSocket is referenced lazily inside the
 * resolver) so the pure helpers import cleanly in a Node test environment.
 */

import { verifyEvent } from 'nostr-tools/pure'
import { bech32 } from '@scure/base'
import { isReasonableEventTimestamp } from './gamestr-reduce'
import type { LeaderboardEntry } from '../../../shared/types'

// ── bech32 (npub) encoding — minimal, npub-only ───────────────────────────────
// BIP-173 / NIP-19. Just enough to render `npub1…` from a 32-byte hex pubkey.

const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const b = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) chk ^= (b >> i) & 1 ? GEN[i] : 0
  }
  return chk
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5)
  out.push(0)
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31)
  return out
}

function createChecksum(hrp: string, data: number[]): number[] {
  const values = hrpExpand(hrp).concat(data, [0, 0, 0, 0, 0, 0])
  const mod = bech32Polymod(values) ^ 1
  const out: number[] = []
  for (let i = 0; i < 6; i++) out.push((mod >> (5 * (5 - i))) & 31)
  return out
}

/** Convert a byte array to 5-bit groups (8→5 bit) for bech32 payloads. */
function to5Bit(bytes: number[]): number[] {
  let acc = 0
  let bits = 0
  const out: number[] = []
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out.push((acc >> bits) & 31)
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31)
  return out
}

function hexToBytes(hex: string): number[] {
  const clean = hex.length % 2 ? '0' + hex : hex
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16))
  return out
}

/** Encode a 64-char hex pubkey as a bech32 `npub1…` string. */
export function hexToNpub(hex: string): string {
  const data = to5Bit(hexToBytes(hex))
  const checksum = createChecksum('npub', data)
  let out = 'npub1'
  for (const d of data.concat(checksum)) out += BECH32_ALPHABET[d]
  return out
}

/**
 * A compact, recognisable identity label for an unresolved pubkey:
 * `npub1qy2…w3kx` — keeps the human-memorable head and tail, elides the middle.
 * Falls back gracefully for anything that is not a clean 64-hex key.
 */
export function shortenNpub(pubkey: string, head = 8, tail = 4): string {
  const npub = /^[0-9a-f]{64}$/i.test(pubkey) ? hexToNpub(pubkey) : pubkey
  if (npub.length <= head + tail + 1) return npub
  return `${npub.slice(0, head)}…${npub.slice(-tail)}`
}

// ── Deterministic identicon (gradient avatar) ─────────────────────────────────

/**
 * A stable 32-bit seed derived from a pubkey (FNV-1a over the hex string).
 * Same pubkey → same seed → same avatar, on every machine, with no network.
 */
export function avatarSeed(pubkey: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < pubkey.length; i++) {
    h ^= pubkey.charCodeAt(i)
    // FNV prime, kept in 32-bit range via Math.imul.
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A deterministic identicon descriptor: two hues + a rotation, all from the seed. */
export interface AvatarGradient {
  hueA: number
  hueB: number
  angle: number
}

/**
 * Derive a pleasing two-stop gradient from a pubkey. Hues are pulled from
 * different byte-lanes of the seed so they diverge (never a flat single-hue
 * smear), with a fixed neon-friendly saturation/lightness applied in CSS.
 */
export function avatarGradient(pubkey: string): AvatarGradient {
  const seed = avatarSeed(pubkey)
  const hueA = seed % 360
  // Offset the second hue by a seed-derived amount in [60,300) so the pair is
  // always visibly distinct (a complementary-ish neon sweep).
  const hueB = (hueA + 60 + ((seed >> 9) % 240)) % 360
  const angle = (seed >> 17) % 360
  return { hueA, hueB, angle }
}

/** Ready-to-use CSS `background` value for the identicon avatar. */
export function avatarCss(pubkey: string): string {
  const { hueA, hueB, angle } = avatarGradient(pubkey)
  return `linear-gradient(${angle}deg, hsl(${hueA} 85% 58%), hsl(${hueB} 80% 42%))`
}

// ── kind-0 resolution (raw WS, fire-and-forget) ───────────────────────────────

export interface Profile {
  name?: string
  picture?: string
  nip05?: string
  lud16?: string
  lud06?: string
}

export interface PlayerIdentity {
  label: string
  nip05?: string
  isNpub: boolean
}

/** Kind-0 wins, then legacy pre-filled data, then identity signed by the game. */
export function playerIdentity(pubkey: string, entry?: LeaderboardEntry, profile?: Profile): PlayerIdentity {
  const nip05 = profile?.nip05 ?? entry?.signedNip05
  const friendly = profile?.name ?? entry?.name ?? entry?.signedName ?? nip05
  return {
    label: friendly ?? shortenNpub(pubkey),
    nip05: nip05 && nip05 !== friendly ? nip05 : undefined,
    isNpub: !friendly,
  }
}

export function lightningDestination(profile?: Profile): string | undefined {
  return profile?.lud16 ?? profile?.lud06
}

/** A resolved-profiles map keyed by hex pubkey. */
export type ProfileMap = Map<string, Profile>

interface Kind0Event {
  id: string
  kind: number
  pubkey: string
  created_at: number
  content: string
  tags: string[][]
  sig: string
}

function isKind0(v: unknown): v is Kind0Event {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return e.kind === 0
    && typeof e.id === 'string' && /^[0-9a-f]{64}$/.test(e.id)
    && typeof e.pubkey === 'string' && /^[0-9a-f]{64}$/.test(e.pubkey)
    && typeof e.sig === 'string' && /^[0-9a-f]{128}$/.test(e.sig)
    && typeof e.created_at === 'number' && isReasonableEventTimestamp(e.created_at)
    && typeof e.content === 'string' && e.content.length <= 64 * 1024
    && Array.isArray(e.tags) && e.tags.length <= 64
    && e.tags.every(tag => Array.isArray(tag)
      && tag.length <= 16
      && tag.every(part => typeof part === 'string' && part.length <= 2_048))
}

/** Sanitise a raw picture string: must be an http(s) URL. Absent if not. */
export function sanitisePicture(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 2_048) return undefined
  try {
    const url = new URL(trimmed)
    // Only accept http / https — reject ipfs, data, nostr, etc.
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : undefined
  } catch {
    return undefined
  }
}

export function sanitiseLightningAddress(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.trim().toLowerCase()
  if (value.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9.-]+$/.test(value)) return undefined
  const [name, domain] = value.split('@')
  if (!name || !domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return undefined
  try {
    const url = new URL(`https://${domain}/`)
    if (url.hostname !== domain || url.username || url.password) return undefined
  } catch { return undefined }
  return value
}

export function sanitiseNip05(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return
  const value = raw.trim().toLowerCase()
  if (value.length > 254 || !/^[a-z0-9._-]{1,64}@[a-z0-9.-]+$/.test(value)) return
  const [, domain] = value.split('@')
  if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return
  try {
    const url = new URL(`https://${domain}/`)
    if (url.hostname !== domain || url.username || url.password) return
  } catch { return }
  return value
}

/** Validate that a lud06 value is a bech32 LNURL which decodes to an HTTPS endpoint. */
export function sanitiseLnurl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return
  const value = raw.trim().toLowerCase()
  if (!value.startsWith('lnurl1') || value.length > 2_000) return
  try {
    const decoded = bech32.decode(value as `${string}1${string}`, 2_000)
    if (decoded.prefix !== 'lnurl') return
    const endpoint = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bech32.fromWords(decoded.words)))
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.username || url.password) return
    return value
  } catch { return }
}

function parseProfileContent(content: string): Profile | null {
  try {
    const o = JSON.parse(content) as Record<string, unknown>
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null
    const rawName = typeof o.display_name === 'string' && o.display_name.trim()
      ? o.display_name
      : typeof o.name === 'string' ? o.name : undefined
    const name = rawName?.trim().slice(0, 80) || undefined
    const picture = sanitisePicture(o.picture)
    const nip05 = sanitiseNip05(o.nip05)
    const lud16 = sanitiseLightningAddress(o.lud16)
    const lud06 = sanitiseLnurl(o.lud06)
    if (!name && !picture && !nip05 && !lud16 && !lud06) return null
    return { name, picture, nip05, lud16, lud06 }
  } catch {
    return null
  }
}

/**
 * Maximum concurrent kind-0 WebSocket connections (one per relay, up to this
 * cap). In practice we open one socket per relay, so this caps the relay fan-out
 * during profile resolution — distinct from the score subscription which is
 * always opened against all relays.
 */
const MAX_PROFILE_RELAY_CONNECTIONS = 4

/**
 * Resolve identity and Lightning receive metadata for hex pubkeys across relays.
 *
 * Calls `onResolve(pubkey, profile)` each time a newer kind-0 is seen for a
 * requested author. Returns an unsubscribe that closes the sockets. Designed to
 * be cheap and disposable — call it per board, dispose on the next selection.
 *
 * Hardening:
 *   - Caps concurrent relay connections at `MAX_PROFILE_RELAY_CONNECTIONS`.
 *   - Ignores malformed kind-0 content (parseProfileContent returns null).
 *   - Rejects non-http(s) picture URLs (sanitisePicture).
 *   - De-duplicates to the newest kind-0 per author (newestAt).
 */
export function resolveProfiles(
  relays: string[],
  pubkeys: string[],
  onResolve: (pubkey: string, profile: Profile) => void,
): () => void {
  const authors = Array.from(new Set(pubkeys.map(p => p.toLowerCase())))
    .filter(p => /^[0-9a-f]{64}$/.test(p))
  if (relays.length === 0 || authors.length === 0) return () => {}
  const requestedAuthors = new Set(authors)

  const sockets: WebSocket[] = []
  const newestAt = new Map<string, number>()
  let closed = false

  // Cap relay fan-out to avoid excessive concurrent connections for profile resolution.
  const capped = relays.slice(0, MAX_PROFILE_RELAY_CONNECTIONS)

  for (const url of capped) {
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      continue
    }
    sockets.push(ws)
    const subId = 'pf' + Math.random().toString(36).slice(2, 10)
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(['REQ', subId, { kinds: [0], authors, limit: authors.length }]))
      } catch {
        /* socket may have closed between open and send */
      }
    }
    ws.onmessage = ev => {
      if (closed) return
      let msg: unknown
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
      } catch {
        return
      }
      if (!Array.isArray(msg) || msg[1] !== subId) return
      if (msg[0] === 'EOSE') {
        try {
          ws.send(JSON.stringify(['CLOSE', subId]))
        } catch {
          /* ignore */
        }
        return
      }
      if (msg[0] !== 'EVENT' || !isKind0(msg[2])) return
      const e = msg[2]
      // A malicious relay may ignore the authors filter; never surface an
      // unsolicited profile into the requested board.
      if (!requestedAuthors.has(e.pubkey)) return
      if (!verifyEvent(e)) return
      const prev = newestAt.get(e.pubkey)
      if (prev !== undefined && prev >= e.created_at) return
      const profile = parseProfileContent(e.content)
      if (!profile) return
      newestAt.set(e.pubkey, e.created_at)
      onResolve(e.pubkey, profile)
    }
    ws.onerror = () => {}
  }

  return () => {
    closed = true
    for (const s of sockets) {
      try {
        s.close()
      } catch {
        /* ignore */
      }
    }
  }
}
