import { describe, expect, it } from 'vitest'
import { publicManifestErrors, submissionEvent, type PublicGameManifest } from '../src/web/developer-submission'

const manifest: PublicGameManifest = {
  manifestVersion: 2,
  name: 'Sovereign Racer',
  gameId: 'sovereign-racer',
  url: 'https://play.example.com/',
  description: 'A signed-score racing game.',
  genres: ['racing'],
  scoreKind: 30762,
}

describe('signed developer submissions', () => {
  it('builds a replaceable NIP-89 submission carrying the validated manifest', () => {
    const event = submissionEvent(manifest, 1_700_000_000)
    expect(event.kind).toBe(31990)
    expect(event.created_at).toBe(1_700_000_000)
    expect(event.tags).toContainEqual(['d', 'gamestr-game:sovereign-racer'])
    expect(event.tags).toContainEqual(['k', '30762'])
    expect(event.tags).toContainEqual(['web', manifest.url])
    expect(JSON.parse(event.content)).toMatchObject({ name: manifest.name, gamestr_manifest: manifest })
  })

  it('rejects identifiers and origins that are unsafe for a public catalogue', () => {
    expect(publicManifestErrors(manifest)).toEqual([])
    expect(publicManifestErrors({ ...manifest, gameId: '../escape' })).toContain('Public gameId must be a lowercase slug using letters, numbers, and hyphens.')
    expect(publicManifestErrors({ ...manifest, url: 'http://play.example.com/' })).toContain('Public submissions require a credential-free HTTPS game URL.')
    expect(publicManifestErrors({ ...manifest, url: 'https://user:pass@play.example.com/' })).toContain('Public submissions require a credential-free HTTPS game URL.')
  })
})

describe('game-owned controller definitions', () => {
  const profile = { version: 1 as const, name: 'Sovereign Racer', slots: { joyL: { mode: 'xy' as const, label: 'Steer' }, A: { label: 'Brake' } } }
  const game: PublicGameManifest = { ...manifest, controller: { adapter: 'native', phoneProtocol: 'gamestr-controller-v1', profile } }
  it('publishes the controller in the same signed record as the game identity and URL', () => {
    expect(publicManifestErrors(game)).toEqual([])
    const event=submissionEvent(game,1_700_000_000)
    expect(event.kind).toBe(31990)
    expect(JSON.parse(event.content).gamestr_manifest.controller.profile).toEqual(profile)
  })
  it('rejects invalid or oversized profile data before requesting a signature', () => {
    expect(publicManifestErrors({...game,controller:{...game.controller!,phoneProtocol:undefined}})).toContain('Controller profile is invalid or its phone protocol is missing.')
    const bad={...profile,layout:{version:1 as const,portrait:{A:{x:.8,y:.7,size:64}}}}
    expect(publicManifestErrors({...game,controller:{...game.controller!,profile:bad}})).toContain('Controller profile is invalid or its phone protocol is missing.')
  })
})
