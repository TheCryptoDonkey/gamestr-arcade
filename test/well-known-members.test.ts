import { describe, expect, it, vi } from 'vitest'
import { loadWellKnownMembers, parseWellKnownMembers, SIX_HUNDRED_MEMBER_DIRECTORY } from '../src/web/well-known-members'

const ALICE = 'a'.repeat(64)

describe('600 well-known members', () => {
  it('reverses valid NIP-05 names into a pubkey membership map', () => {
    const members = parseWellKnownMembers({ names: {
      alice: ALICE.toUpperCase(),
      alias: ALICE,
      broken: 'not-a-pubkey',
      '<unsafe>': '1'.repeat(64),
    } })

    expect(Array.from(members.entries())).toEqual([[ALICE, 'alice']])
  })

  it('rejects malformed directory payloads', () => {
    expect(parseWellKnownMembers(null).size).toBe(0)
    expect(parseWellKnownMembers({ names: [] }).size).toBe(0)
    expect(parseWellKnownMembers({ names: 'alice' }).size).toBe(0)
  })

  it('loads the canonical 600.wtf directory without credentials', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ names: { alice: ALICE } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const members = await loadWellKnownMembers(undefined, fetcher as typeof fetch)

    expect(members.get(ALICE)).toBe('alice')
    expect(fetcher).toHaveBeenCalledWith(SIX_HUNDRED_MEMBER_DIRECTORY, expect.objectContaining({
      cache: 'no-cache',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }))
  })
})
