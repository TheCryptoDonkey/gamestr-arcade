import editions from '../../web.editions.json'

export interface WebEdition {
  key: string
  defaultOrigin: string
  outDir: string
  gameSlugs: string[] | null
  featured: string[] | null
  trending: string[] | null
  newReleases: string[] | null
  brandMark: string
  brandName: string
  brandBadge: string
  brandAriaLabel: string
  brandGraphic: string | null
  heroGraphic: string | null
  heroGraphicAlt: string
  heroKicker: string
  heroTitle: string
  heroDescription: string
  siteTitle: string
  titleSuffix: string
  siteDescription: string
  themeColor: string
  pwaName: string
  pwaShortName: string
  footerName: string
  footerDescription: string
  footerLink: { label: string; url: string } | null
}

const configuredEditions = editions as Record<string, WebEdition>

export const WEB_EDITION = configuredEditions[__GAMESTR_WEB_EDITION__]

if (!WEB_EDITION) throw new Error(`Unknown Gamestr web edition: ${__GAMESTR_WEB_EDITION__}`)

document.documentElement.dataset.webEdition = WEB_EDITION.key
