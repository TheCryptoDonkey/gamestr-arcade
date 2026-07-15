import { describe, it, expect } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { parseScoreEvent, collapseToBest, parseAnyScoreEvent, parse5555Event, boardFor, isScoreEvent, type ScoreEvent } from '../src/renderer/src/leaderboard/gamestr-reduce'

const P1 = 'a'.repeat(64), P2 = 'b'.repeat(64), P3 = 'c'.repeat(64), GAME = 'g'.repeat(64)
const NOW = Math.floor(Date.now() / 1000)
function ev(over: Partial<ScoreEvent>): ScoreEvent {
  return { id: 'i', pubkey: GAME, kind: 30762, created_at: NOW, content: '', sig: 's',
    tags: [['game', 'pallasite'], ['p', P1], ['score', '500']], ...over }
}

describe('parseScoreEvent', () => {
  it('parses a valid game-signed event (player from p tag)', () => {
    const e = parseScoreEvent(ev({}), 'pallasite')!
    expect(e.pubkey).toBe(P1); expect(e.score).toBe(500)
  })
  it('retains the player name and NIP-05 protected by the game-signed score', () => {
    const entry = parseScoreEvent(ev({ tags: [
      ['game', 'pallasite'], ['p', P1], ['score', '500'],
      ['playerName', ' ArcadePlayer '], ['nip05', 'Player@example.com'],
    ] }), 'pallasite')!
    expect(entry).toMatchObject({ signedName: 'ArcadePlayer', signedNip05: 'player@example.com' })
  })
  it('falls back to the signed player tag and ignores malformed optional identity', () => {
    const named = parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', '500'], ['player', 'DAZ']] }), 'pallasite')!
    expect(named.signedName).toBe('DAZ')
    const malformed = parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', '500'], ['playerName', '\n'], ['nip05', 'not-an-id']] }), 'pallasite')!
    expect(malformed).toMatchObject({ signedName: undefined, signedNip05: undefined })
  })
  it('rejects wrong game, cheated, and non-positive scores', () => {
    expect(parseScoreEvent(ev({ tags: [['game', 'other'], ['p', P1], ['score', '500']] }), 'pallasite')).toBeNull()
    expect(parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['cheated', 'true'], ['p', P1], ['score', '9']] }), 'pallasite')).toBeNull()
    expect(parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', '0']] }), 'pallasite')).toBeNull()
  })
  it('falls back to event.pubkey when no p tag', () => {
    const e = parseScoreEvent(ev({ pubkey: P2, tags: [['game', 'pallasite'], ['score', '10']] }), 'pallasite')!
    expect(e.pubkey).toBe(P2)
  })
  it('rejects fractional, suffixed, unsafe, duplicate, and malformed sats values', () => {
    for (const score of ['1.5', '12pts', '9007199254740992']) {
      expect(parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', score]] }), 'pallasite')).toBeNull()
    }
    expect(parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['score', '1'], ['score', '2']] }), 'pallasite')).toBeNull()
    expect(parseScoreEvent(ev({ tags: [['game', 'pallasite'], ['score', '1'], ['sats', '-2']] }), 'pallasite')).toBeNull()
  })
  it('rejects the wrong schema kind and unreasonable timestamps', () => {
    expect(parseScoreEvent(ev({ kind: 5555 }), 'pallasite')).toBeNull()
    expect(parseScoreEvent(ev({ created_at: 1 }), 'pallasite')).toBeNull()
    expect(parseScoreEvent(ev({ created_at: NOW + 3_600 }), 'pallasite')).toBeNull()
  })
})

describe('isScoreEvent', () => {
  const signed = finalizeEvent({
    kind: 30762,
    created_at: NOW,
    content: '',
    tags: [['game', 'pallasite'], ['score', '10']],
  }, new Uint8Array(32).fill(1))

  it('accepts a well-formed signed event only for the expected kind', () => {
    expect(isScoreEvent(signed, 30762, NOW)).toBe(true)
    expect(isScoreEvent(signed, 5555, NOW)).toBe(false)
  })

  it('rejects malformed IDs/signatures and future timestamps before crypto work', () => {
    expect(isScoreEvent({ ...signed, id: 'bad' }, 30762, NOW)).toBe(false)
    expect(isScoreEvent({ ...signed, sig: 'bad' }, 30762, NOW)).toBe(false)
    expect(isScoreEvent({ ...signed, created_at: NOW + 601 }, 30762, NOW)).toBe(false)
  })
})

describe('collapseToBest', () => {
  it('keeps highest score per pubkey, sorts desc, slices topN', () => {
    const events = [
      ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', '300']] }),
      ev({ tags: [['game', 'pallasite'], ['p', P1], ['score', '900']] }),
      ev({ tags: [['game', 'pallasite'], ['p', P2], ['score', '500']] })
    ]
    const top = collapseToBest(events, 'pallasite', 5)
    expect(top.map(e => [e.pubkey, e.score])).toEqual([[P1, 900], [P2, 500]])
  })
})

describe('parseAnyScoreEvent', () => {
  it('extracts game from the event\'s own game tag', () => {
    const e = ev({ tags: [['game', 'sats-man'], ['p', P1], ['score', '500']] })
    const result = parseAnyScoreEvent(e)
    expect(result).not.toBeNull()
    expect(result!.gameId).toBe('sats-man')
    expect(result!.entry.pubkey).toBe(P1)
    expect(result!.entry.score).toBe(500)
    expect(result!.entry.eventId).toBe(e.id)
  })
  it('returns null when game tag is absent', () => {
    const e = ev({ tags: [['p', P1], ['score', '500']] })
    expect(parseAnyScoreEvent(e)).toBeNull()
  })
  it('rejects cheated events', () => {
    const e = ev({ tags: [['game', 'sats-man'], ['cheated', 'true'], ['p', P1], ['score', '500']] })
    expect(parseAnyScoreEvent(e)).toBeNull()
  })
  it('accepts score of 0 (gamestr.io shows 0s)', () => {
    const e = ev({ tags: [['game', 'sats-man'], ['p', P1], ['score', '0']] })
    const result = parseAnyScoreEvent(e)
    expect(result).not.toBeNull()
    expect(result!.entry.score).toBe(0)
  })
  it('rejects negative scores', () => {
    const e = ev({ tags: [['game', 'sats-man'], ['p', P1], ['score', '-1']] })
    expect(parseAnyScoreEvent(e)).toBeNull()
  })
})

describe('boardFor', () => {
  // Use a real UTC midnight so the setHours(0,0,0,0) boundary is predictable.
  // 1_800_000_000 doesn't fall on a day boundary, so we derive midnight from today.
  const TODAY_START = Math.floor(Date.now() / 86400000) * 86400
  const NOW_SEC = TODAY_START + 3600

  const entries: import('../src/shared/types').LeaderboardEntry[] = [
    { pubkey: P1, score: 900, at: TODAY_START + 100, sats: 0 },
    { pubkey: P1, score: 400, at: TODAY_START + 50,  sats: 0 },
    { pubkey: P2, score: 700, at: TODAY_START + 200, sats: 0 },
    { pubkey: P3, score: 999, at: TODAY_START - 1,   sats: 0 },
  ]

  it('period=all returns best-per-pubkey, sorted desc, sliced to topN', () => {
    const board = boardFor(entries, 'all', 3, NOW_SEC)
    expect(board).toHaveLength(3)
    expect(board[0]).toMatchObject({ pubkey: P3, score: 999 })
    expect(board[1]).toMatchObject({ pubkey: P1, score: 900 })
    expect(board[2]).toMatchObject({ pubkey: P2, score: 700 })
  })

  it('period=today excludes entries before start of day', () => {
    const board = boardFor(entries, 'today', 10, NOW_SEC)
    expect(board).toHaveLength(2)
    expect(board.every(e => e.at >= TODAY_START)).toBe(true)
    expect(board[0]).toMatchObject({ pubkey: P1, score: 900 })
    expect(board[1]).toMatchObject({ pubkey: P2, score: 700 })
  })

  it('period=today returns [] when all entries are before today', () => {
    const board = boardFor(
      [{ pubkey: P1, score: 999, at: TODAY_START - 100, sats: 0 }],
      'today', 10, NOW_SEC
    )
    expect(board).toEqual([])
  })

  it('topN limits the result', () => {
    const board = boardFor(entries, 'all', 1, NOW_SEC)
    expect(board).toHaveLength(1)
    expect(board[0].score).toBe(999)
  })

  it('keeps only best score per pubkey across multiple entries', () => {
    const board = boardFor(entries, 'today', 10, NOW_SEC)
    const p1Entry = board.find(e => e.pubkey === P1)!
    expect(p1Entry.score).toBe(900)
  })

  it('dir=asc ranks lower scores first and keeps the lowest per pubkey', () => {
    const asc = boardFor(
      [
        { pubkey: P1, score: 90, at: NOW_SEC, sats: 0 },
        { pubkey: P1, score: 40, at: NOW_SEC, sats: 0 },
        { pubkey: P2, score: 70, at: NOW_SEC, sats: 0 },
      ],
      'all', 10, NOW_SEC, 'asc',
    )
    expect(asc.map(e => e.score)).toEqual([40, 70]) // P1's best (lowest) then P2
  })
})

describe('parse5555Event (Other Stuff schema)', () => {
  function ev5555(over: Partial<ScoreEvent>): ScoreEvent {
    return {
      id: 'i', pubkey: P1, kind: 5555, created_at: NOW, content: '', sig: 's',
      tags: [['game', 'word5'], ['t', 'word5'], ['streak', '7'], ['maxStreak', '14']],
      ...over,
    }
  }

  it('reads the configured score field and uses event.pubkey as the player', () => {
    const e = parse5555Event(ev5555({}), 'word5', 'streak')!
    expect(e.pubkey).toBe(P1)
    expect(e.score).toBe(7)
  })

  it('prefers a p tag over the signer pubkey when present', () => {
    const e = parse5555Event(ev5555({ tags: [['game', 'word5'], ['p', P2], ['streak', '3']] }), 'word5', 'streak')!
    expect(e.pubkey).toBe(P2)
  })

  it('rejects a wrong game or a missing score field', () => {
    expect(parse5555Event(ev5555({}), 'pallasite', 'streak')).toBeNull()
    expect(parse5555Event(ev5555({ tags: [['game', 'word5']] }), 'word5', 'streak')).toBeNull()
  })
})
