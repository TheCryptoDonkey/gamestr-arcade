const HEX_PUBKEY = /^[0-9a-f]{64}$/i
const MEMBER_NAME = /^[a-z0-9._-]{1,64}$/i

export const SIX_HUNDRED_MEMBER_DIRECTORY = 'https://600.wtf/.well-known/nostr.json'

export function parseWellKnownMembers(payload: unknown): Map<string, string> {
  const members = new Map<string, string>()
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return members
  const names = (payload as { names?: unknown }).names
  if (typeof names !== 'object' || names === null || Array.isArray(names)) return members

  for (const [name, value] of Object.entries(names).slice(0, 10_000)) {
    if (!MEMBER_NAME.test(name) || typeof value !== 'string' || !HEX_PUBKEY.test(value)) continue
    const pubkey = value.toLowerCase()
    if (!members.has(pubkey)) members.set(pubkey, name)
  }
  return members
}

export async function loadWellKnownMembers(
  endpoint = SIX_HUNDRED_MEMBER_DIRECTORY,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  const response = await fetchImpl(endpoint, {
    cache: 'no-cache',
    credentials: 'omit',
    headers: { accept: 'application/json' },
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw new Error(`member directory ${response.status}`)
  return parseWellKnownMembers(await response.json())
}
