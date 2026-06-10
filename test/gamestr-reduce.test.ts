import { describe, it, expect } from 'vitest'
import { parseScoreEvent, collapseToBest, type ScoreEvent } from '../src/renderer/src/leaderboard/gamestr-reduce'

const P1 = 'a'.repeat(64), P2 = 'b'.repeat(64), GAME = 'g'.repeat(64)
function ev(over: Partial<ScoreEvent>): ScoreEvent {
  return { id: 'i', pubkey: GAME, kind: 30762, created_at: 100, content: '', sig: 's',
    tags: [['game', 'pallasite'], ['p', P1], ['score', '500']], ...over }
}

describe('parseScoreEvent', () => {
  it('parses a valid game-signed event (player from p tag)', () => {
    const e = parseScoreEvent(ev({}), 'pallasite')!
    expect(e.pubkey).toBe(P1); expect(e.score).toBe(500)
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
