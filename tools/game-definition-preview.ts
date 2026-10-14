import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { controllerProfileFromGameDefinition, resolveControllerLayout, GAME_DEFINITION_MAX_BYTES } from '@forgesworn/joystick-protocol'
import type { GamestrGameDefinition, ResolvedPlacement } from '@forgesworn/joystick-protocol'

interface ReviewDefinition extends GamestrGameDefinition {
  description: string
  developer: string
  genres: string[]
  accent: string
  heroUrl: string
  logoUrl?: string
  tagline?: string
  controlHints: string[]
}

interface PreviewGame {
  slug: string
  name: string
  description: string
  tagline?: string
  accent: string
  art: { hero: string; logo?: string }
  keys: string[][]
  livePhone: boolean
  profileStatus: string
  draft: ReviewDefinition
  resolved: Record<string, { width: number; height: number; slots: Record<string, ResolvedPlacement> }>
}

const slugs = ['pallasite', 'neon-sentinel', 'hang-on-fren', 'takemetoyourledger'] as const
const dimensions = [
  ['portrait', 360, 560], ['landscape', 760, 300],
  ['ipadPortrait', 700, 850], ['ipadLandscape', 1024, 620],
] as const

/** Review drafts are separate from the live catalogue's compatibility declarations. */
export async function definitionPreview(projectRoot: string) {
  const schema = JSON.parse(await readFile(join(projectRoot, 'schemas/game-manifest-v2.schema.json'), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
  addFormats(ajv)
  const validate = ajv.compile<ReviewDefinition>(schema)
  const rows: PreviewGame[] = []
  for (const slug of slugs) {
    const draftText = await readFile(join(projectRoot, 'examples/game-definitions/600', slug, 'game.json'), 'utf8')
    const draft: unknown = JSON.parse(draftText)
    const current = JSON.parse(await readFile(join(projectRoot, 'games', slug, 'game.json'), 'utf8'))
    const profile = controllerProfileFromGameDefinition(draft)
    if (Buffer.byteLength(draftText, 'utf8') > GAME_DEFINITION_MAX_BYTES || !validate(draft) || !profile) {
      throw new Error(`Invalid ${slug} review definition: ${JSON.stringify(validate.errors)}`)
    }
    if (!draft.description || !draft.developer || !draft.accent || !draft.heroUrl || !draft.genres?.length || !draft.controlHints?.length) {
      throw new Error(`${slug} review needs artwork, description, developer, genres and keyboard hints`)
    }
    for (const key of ['gameId', 'name', 'url']) {
      if (draft[key] !== current[key]) throw new Error(`${slug} review ${key} differs from the catalogue`)
    }
    const resolved = Object.fromEntries(dimensions.map(([orientation, width, height]) => {
      const slots = resolveControllerLayout(profile, width, height)
      if (!slots) throw new Error(`${slug} review layout overlaps at ${width} × ${height}`)
      return [orientation, { width, height, slots }]
    }))
    const keys = draft.controlHints.map((hint: string) => {
      const pair = hint.split(' = ')
      if (pair.length !== 2) throw new Error(`${slug} review keyboard hint needs an action and keys`)
      return [pair[0].charAt(0) + pair[0].slice(1).toLowerCase(), pair[1]]
    })
    const livePhone = current.controller?.phoneProtocol === 'gamestr-controller-v1'
    if (livePhone && !isDeepStrictEqual(profile, current.controller.profile)) throw new Error(`${slug} existing review profile differs from the live profile`)
    rows.push({ slug, name: draft.name, description: draft.description, tagline: draft.tagline,
      accent: draft.accent, art: { hero: draft.heroUrl, logo: draft.logoUrl }, keys, livePhone,
      profileStatus: livePhone ? 'Existing layout' : 'Proposed layout', draft, resolved })
  }
  return rows
}
