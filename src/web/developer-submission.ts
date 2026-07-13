export interface PublicGameManifest {
  manifestVersion: 2
  name: string
  gameId: string
  url: string
  tagline?: string
  description?: string
  developer?: string
  genres?: string[]
  logoUrl?: string
  heroUrl?: string
  capabilities?: { nostrSign?: boolean; walletPay?: boolean; persistentStorage?: boolean; externalNavigation?: boolean }
  scoreKind?: number
  scoreField?: string
  scoreDir?: 'asc' | 'desc'
  [key: string]: unknown
}

export function publicManifestErrors(game: PublicGameManifest): string[] {
  const errors: string[] = []
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(game.gameId)) errors.push('Public gameId must be a lowercase slug using letters, numbers, and hyphens.')
  try {
    const url = new URL(game.url)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error()
  } catch { errors.push('Public submissions require a credential-free HTTPS game URL.') }
  return errors
}

export function submissionEvent(manifest: PublicGameManifest, nowSeconds = Math.floor(Date.now() / 1000)) {
  const scoreKind = manifest.scoreKind === 5555 ? 5555 : 30762
  const metadata = {
    name: manifest.name,
    about: manifest.description ?? manifest.tagline ?? '',
    picture: manifest.logoUrl ?? manifest.heroUrl,
    website: manifest.url,
    gamestr_manifest: manifest,
  }
  return {
    kind: 31990,
    created_at: nowSeconds,
    tags: [
      ['d', `gamestr-game:${manifest.gameId}`],
      ['k', String(scoreKind)],
      ['web', manifest.url],
      ['t', 'gamestr-game'],
      ['r', manifest.url],
      ['alt', `Gamestr game submission: ${manifest.name}`],
    ],
    content: JSON.stringify(metadata),
  }
}
