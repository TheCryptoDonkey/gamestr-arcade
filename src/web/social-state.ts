export interface SocialState {
  favourites: string[]
  follows: string[]
}

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

const LEGACY_KEY = 'gamestr:social:v1'
function keyFor(pubkey: string): string { return `gamestr:social:v2:${/^[0-9a-f]{64}$/.test(pubkey) ? pubkey : 'guest'}` }
const MAX_ITEMS = 250
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
const PUBKEY = /^[0-9a-f]{64}$/

export function readSocialState(storage?: StorageLike, pubkey = ''): SocialState {
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(keyFor(pubkey)) ?? (!pubkey ? (storage ?? localStorage).getItem(LEGACY_KEY) : null) ?? '{}') as Partial<SocialState>
    return {
      favourites: Array.isArray(value.favourites) ? Array.from(new Set(value.favourites.filter(item => typeof item === 'string' && SLUG.test(item)))).slice(0, MAX_ITEMS) : [],
      follows: Array.isArray(value.follows) ? Array.from(new Set(value.follows.filter(item => typeof item === 'string' && PUBKEY.test(item)))).slice(0, MAX_ITEMS) : [],
    }
  } catch { return { favourites: [], follows: [] } }
}

export function toggleSocialItem(state: SocialState, field: keyof SocialState, value: string): SocialState {
  const current = state[field]
  const next = current.includes(value) ? current.filter(item => item !== value) : [value, ...current].slice(0, MAX_ITEMS)
  return { ...state, [field]: next }
}

export function writeSocialState(state: SocialState, storage?: StorageLike, pubkey = ''): boolean {
  try { (storage ?? localStorage).setItem(keyFor(pubkey), JSON.stringify(state)); return true }
  catch { return false }
}
