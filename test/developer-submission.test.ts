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
