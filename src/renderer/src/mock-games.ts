/**
 * gamestr-arcade — mock games for browser-only design verification.
 *
 * Used ONLY when `window.arcade` is undefined (i.e. the renderer is served in a
 * plain browser via Vite, not inside Electron). Lets us screenshot the carousel
 * at 1920×1080 with varied accents and text-logo / gradient-hero fallbacks,
 * without touching the real IPC path. Never imported on the Electron path.
 */

import type { Game } from '../../shared/types'

// Real shipped art, imported as Vite asset URLs so the browser design-preview is
// representative of the Electron build (which loads these same files over
// `media://`). Dev-only — this module is never imported on the Electron path.
import pallasiteLogo from '../../../games/pallasite/logo.png?url'
import spaceZappersLogo from '../../../games/space-zappers/logo.png?url'
import spaceZappersHero from '../../../games/space-zappers/hero.png?url'
import satsManLogo from '../../../games/sats-man/logo.png?url'

/**
 * A data-URI SVG hero so the browser preview has real full-bleed art (the
 * Electron build loads bitmap heroes over `media://`). Tuned per game to look
 * like a distinct cabinet attract backdrop, not a flat gradient.
 */
function svgHero(opts: {
  base: string
  glow: string
  accent: string
  motif: 'rings' | 'grid' | 'shards' | 'waves' | 'orbit'
}): string {
  const { base, glow, accent, motif } = opts
  const motifSvg = renderMotif(motif, accent)
  // Layered, cinematic backdrop: a bright off-centre subject bloom (right of
  // centre, where a hero render would sit), a broad accent wash low-right, a
  // faint accent bleed into the left third so the frame is never dead black,
  // plus a deep vertical base. The motif sits between the wash and the bloom.
  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920 1080'>
  <defs>
    <radialGradient id='bloom' cx='62%' cy='42%' r='62%'>
      <stop offset='0%' stop-color='${accent}' stop-opacity='0.5'/>
      <stop offset='14%' stop-color='${glow}' stop-opacity='0.85'/>
      <stop offset='40%' stop-color='${glow}' stop-opacity='0.45'/>
      <stop offset='72%' stop-color='${base}' stop-opacity='0'/>
    </radialGradient>
    <radialGradient id='wash' cx='90%' cy='96%' r='95%'>
      <stop offset='0%' stop-color='${accent}' stop-opacity='0.42'/>
      <stop offset='55%' stop-color='${base}' stop-opacity='0'/>
    </radialGradient>
    <radialGradient id='bleed' cx='6%' cy='30%' r='60%'>
      <stop offset='0%' stop-color='${accent}' stop-opacity='0.14'/>
      <stop offset='60%' stop-color='${base}' stop-opacity='0'/>
    </radialGradient>
    <linearGradient id='bg' x1='0' y1='0' x2='30%' y2='100%'>
      <stop offset='0%' stop-color='${base}'/>
      <stop offset='100%' stop-color='#03040a'/>
    </linearGradient>
  </defs>
  <rect width='1920' height='1080' fill='url(#bg)'/>
  <rect width='1920' height='1080' fill='url(#bleed)'/>
  <rect width='1920' height='1080' fill='url(#wash)'/>
  <g opacity='0.9'>${motifSvg}</g>
  <rect width='1920' height='1080' fill='url(#bloom)' opacity='0.85'/>
</svg>`.trim()
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function renderMotif(motif: string, accent: string): string {
  switch (motif) {
    case 'rings':
      return [0, 1, 2, 3, 4, 5, 6]
        .map(
          i =>
            `<circle cx='1190' cy='470' r='${120 + i * 125}' fill='none' stroke='${accent}' stroke-opacity='${0.4 - i * 0.045}' stroke-width='${i === 1 ? 4 : 2}'/>`,
        )
        .join('')
    case 'grid': {
      const lines: string[] = []
      // Perspective floor grid receding to a horizon — strong arcade signature.
      for (let y = 560; y <= 1080; y += 30)
        lines.push(
          `<line x1='0' y1='${y}' x2='1920' y2='${y}' stroke='${accent}' stroke-opacity='${0.06 + (y - 560) / 2600}' stroke-width='2'/>`,
        )
      for (let x = -400; x <= 2320; x += 110)
        lines.push(
          `<line x1='${(x + 760) / 2 + 380}' y1='560' x2='${x}' y2='1080' stroke='${accent}' stroke-opacity='0.12' stroke-width='2'/>`,
        )
      return lines.join('')
    }
    case 'shards':
      return [
        `<polygon points='1320,120 1660,360 1380,600 1120,320' fill='${accent}' fill-opacity='0.16'/>`,
        `<polygon points='1520,420 1820,700 1460,820' fill='${accent}' fill-opacity='0.22'/>`,
        `<polygon points='1000,520 1240,720 940,860' fill='${accent}' fill-opacity='0.12'/>`,
        `<polygon points='1640,160 1840,300 1700,520' fill='none' stroke='${accent}' stroke-opacity='0.3' stroke-width='2'/>`,
      ].join('')
    case 'waves': {
      const paths: string[] = []
      for (let i = 0; i < 8; i++) {
        const y = 520 + i * 64
        paths.push(
          `<path d='M0 ${y} C 520 ${y - 110}, 1040 ${y + 110}, 1920 ${y - 50}' fill='none' stroke='${accent}' stroke-opacity='${0.32 - i * 0.03}' stroke-width='${i === 2 ? 4 : 2.5}'/>`,
        )
      }
      return paths.join('')
    }
    case 'orbit':
      return [
        `<ellipse cx='1200' cy='450' rx='560' ry='200' fill='none' stroke='${accent}' stroke-opacity='0.3' stroke-width='2.5' transform='rotate(-18 1200 450)'/>`,
        `<ellipse cx='1200' cy='450' rx='400' ry='140' fill='none' stroke='${accent}' stroke-opacity='0.36' stroke-width='2' transform='rotate(24 1200 450)'/>`,
        `<ellipse cx='1200' cy='450' rx='220' ry='80' fill='none' stroke='${accent}' stroke-opacity='0.5' stroke-width='2' transform='rotate(-6 1200 450)'/>`,
        `<circle cx='1200' cy='450' r='54' fill='${accent}' fill-opacity='0.3'/>`,
      ].join('')
    default:
      return ''
  }
}

export const MOCK_GAMES: Game[] = [
  // ── Real art (representative of the Electron build) ─────────────────────────
  // Pallasite: square cyan crystal logo + NO hero → exercises logo-on-left over
  // the fancy accent backdrop (its busy og-image hero was removed deliberately).
  {
    id: 'pallasite',
    name: 'Pallasite',
    tagline: 'Cosmic arcade Asteroids — mine the belt, top the chain.',
    kind: 'web',
    url: 'https://pallasite.app/',
    gameId: 'pallasite',
    order: 0,
    accent: '#7cf3ff',
    logo: pallasiteLogo,
  },
  // Space Zappers: real photographic hero + square logo → logo-on-left coexisting
  // with a clean full-bleed hero background.
  {
    id: 'space-zappers',
    name: 'Space Zappers',
    tagline: 'Zap the alien invaders — Space Invaders on Nostr.',
    kind: 'web',
    url: 'https://www.spacezappers.com/',
    gameId: 'space-zappers',
    order: 1,
    accent: '#06b6d4',
    logo: spaceZappersLogo,
    hero: spaceZappersHero,
  },
  // Sats-Man: WIDE gold wordmark logo + NO hero → exercises the wide-logo caps
  // over the fancy backdrop with a warm accent.
  {
    id: 'sats-man',
    name: 'Sats-Man',
    tagline: 'Bitcoin-themed Pac-Man arcade on Nostr.',
    kind: 'web',
    url: 'https://sats-man.com/',
    gameId: 'sats-man',
    order: 2,
    accent: '#eab308',
    logo: satsManLogo,
  },
  // ── Synthetic entries — exercise the remaining paths ────────────────────────
  // A synthetic photographic-style hero (SVG) + logo-less → name-wordmark fallback
  // rendered ON a hero. Confirms the fallback wordmark reads on busy art.
  {
    id: 'hash-dash',
    name: 'Hash Dash',
    tagline: 'A neon sprint through the proof-of-work grid.',
    kind: 'web',
    url: 'https://example.test/hash-dash',
    gameId: 'hash-dash',
    order: 3,
    accent: '#9b5cff',
    logo: '',
    hero: svgHero({ base: '#0c0820', glow: '#2a1a5e', accent: '#9b5cff', motif: 'grid' }),
  },
  // Logo-less + NO hero → name-wordmark fallback over the fancy accent backdrop.
  {
    id: 'lumen-drift',
    name: 'Lumen Drift',
    tagline: 'Drift the lightlanes. Bank the sats. Never brake.',
    kind: 'web',
    url: 'https://example.test/lumen-drift',
    gameId: 'lumen-drift',
    order: 4,
    accent: '#ffb547',
    logo: '',
  },
  // Download-only → greyed artwork + DOWNLOAD ONLY ribbon; pressing play opens
  // the QR panel (downloadUrl). Real logo + hero so the desaturation shows.
  {
    id: 'cosmic-forge',
    name: 'Cosmic Forge',
    tagline: 'A native desktop epic — grab the build, play it at home.',
    kind: 'web',
    url: 'https://example.test/cosmic-forge',
    downloadOnly: true,
    downloadUrl: 'https://example.test/cosmic-forge/download',
    gameId: 'cosmic-forge',
    order: 5,
    accent: '#34d399',
    logo: satsManLogo,
    hero: svgHero({ base: '#04140e', glow: '#0b3a2a', accent: '#34d399', motif: 'orbit' }),
  },
]
