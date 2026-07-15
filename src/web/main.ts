import './style.css'
import { createGamestrCatalogue } from '../renderer/src/leaderboard/gamestr'
import { boardFor } from '../renderer/src/leaderboard/gamestr-reduce'
import { avatarCss, hexToNpub, lightningDestination, playerIdentity, resolveProfiles, shortenNpub, type Profile } from '../renderer/src/leaderboard/profiles'
import type { LeaderboardEntry } from '../shared/types'
import { decodeInvitation, encodeInvitation, invitationTemplate, parseInvitation, type GameInvitationEvent } from './game-invitation'
import { challengeTemplate, decodeChallenge, encodeChallenge, parseChallenge } from './game-challenge'
import { readSocialState, toggleSocialItem, writeSocialState } from './social-state'
import { rewardLightningAddress, type WebLNProvider } from './lightning-reward'
import { decode as decodeNip19 } from 'nostr-tools/nip19'
import { WEB_EDITION } from './web-edition'

interface WebGame {
  slug: string; gameId: string; name: string; tagline: string; description?: string; developer?: string
  genres: string[]; url: string; accent: string; hero?: string; logo?: string
  featured: boolean; trending: boolean; newRelease: boolean; walletPay: boolean
  players?: { min: number; max: number }; scoreKind?: number; scoreField?: string; scoreDir?: 'asc' | 'desc'
}

interface NostrWindow extends Window {
  nostr?: {
    getPublicKey(): Promise<string>
    signEvent(event: { created_at: number; kind: number; tags: string[][]; content: string }): Promise<GameInvitationEvent>
  }
  webln?: WebLNProvider
}

const RELAYS = ['wss://relay.gamestr.io', 'wss://relay.trotters.cc', 'wss://nos.lol', 'wss://relay.damus.io']
const GAMESTR_ORIGIN = 'https://gamestr.io'
const app = document.querySelector<HTMLDivElement>('#app')!
const state = {
  games: [] as WebGame[], query: '', filter: 'all', genre: 'all', selected: null as WebGame | null,
  scores: new Map<string, LeaderboardEntry[]>(), relay: 'connecting' as 'connecting' | 'up' | 'down',
  pubkey: localStorage.getItem('gamestr:pubkey') ?? '',
  profiles: new Map<string, Profile>(), profileRequests: new Set<string>(),
  social: readSocialState(), activityMode: 'all' as 'all' | 'following',
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function route(): { name: 'home' | 'scores' | 'developers' | 'game' | 'player' | 'score' | 'invite' | 'challenge'; slug?: string; id?: string } {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/scores') return { name: 'scores' }
  if (path === '/developers') return { name: 'developers' }
  const game = /^\/game\/([a-zA-Z0-9_-]+)$/.exec(path)
  if (game) return { name: 'game', slug: game[1] }
  const player = /^\/player\/([0-9a-f]{64})$/.exec(path)
  if (player) return { name: 'player', id: player[1] }
  const legacyScore = /^\/score\/[0-9a-f]{64}\/[a-zA-Z0-9_-]+\/([0-9a-f]{64})$/.exec(path)
  if (legacyScore) return { name: 'score', id: legacyScore[1] }
  const score = /^\/score\/([0-9a-f]{64})$/.exec(path)
  if (score) return { name: 'score', id: score[1] }
  const invite = /^\/invite\/([A-Za-z0-9_-]{1,4096})$/.exec(path)
  if (invite) return { name: 'invite', id: invite[1] }
  const challenge = /^\/challenge\/([A-Za-z0-9_-]{1,4096})$/.exec(path)
  return challenge ? { name: 'challenge', id: challenge[1] } : { name: 'home' }
}

function toggleFavourite(game: WebGame): void {
  state.social = toggleSocialItem(state.social, 'favourites', game.slug); writeSocialState(state.social); render()
  toast(state.social.favourites.includes(game.slug) ? `${game.name} added to your arcade.` : `${game.name} removed from your arcade.`, 'good')
}

function toggleFollow(pubkey: string): void {
  state.social = toggleSocialItem(state.social, 'follows', pubkey); writeSocialState(state.social); render()
  toast(state.social.follows.includes(pubkey) ? 'Player followed on this device.' : 'Player unfollowed.', 'good')
}

function navigate(path: string): void {
  history.pushState({}, '', path)
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function button(label: string, className: string, action: () => void): HTMLButtonElement {
  const node = el('button', className, label)
  node.type = 'button'
  node.addEventListener('click', action)
  return node
}

function playLink(game: WebGame, label = 'PLAY', className = 'play-small'): HTMLAnchorElement {
  const link = el('a', `${className} button-link play-link`, label)
  link.href = game.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  return link
}

function header(): HTMLElement {
  const head = el('header', 'site-header')
  const brand = el('a', 'brand')
  brand.href = '/'
  brand.setAttribute('aria-label', WEB_EDITION.brandAriaLabel)
  brand.addEventListener('click', event => { event.preventDefault(); navigate('/') })
  if (WEB_EDITION.brandGraphic) {
    const graphic = el('img', 'brand-graphic')
    graphic.src = WEB_EDITION.brandGraphic
    graphic.alt = ''
    brand.append(graphic)
  } else brand.append(el('span', 'brand-mark', WEB_EDITION.brandMark))
  brand.append(el('span', 'brand-name', WEB_EDITION.brandName), el('span', 'brand-beta', WEB_EDITION.brandBadge))
  const nav = el('nav', 'site-nav')
  nav.setAttribute('aria-label', 'Primary')
  for (const [label, path] of [['Arcade', '/'], ['Scores', '/scores'], ['Build', '/developers']]) {
    const current = route().name
    const active = (path === '/' && current === 'home') || (path === '/scores' && current === 'scores') || (path === '/developers' && current === 'developers')
    const link = el('a', active ? 'active' : '', label)
    link.href = path
    link.addEventListener('click', event => { event.preventDefault(); navigate(path) })
    nav.append(link)
  }
  const relay = el('span', `relay-pill ${state.relay}`, state.relay === 'up' ? 'NOSTR LIVE' : state.relay === 'down' ? 'RELAYS OFFLINE' : 'CONNECTING')
  relay.title = 'Score events are verified locally before display'
  const identity = button(state.pubkey ? shortenNpub(state.pubkey) : 'CONNECT NOSTR', 'identity-button', state.pubkey ? () => navigate(`/player/${state.pubkey}`) : connectIdentity)
  head.append(brand, nav, relay, identity)
  return head
}

async function connectIdentity(): Promise<void> {
  const provider = (window as NostrWindow).nostr
  if (!provider) {
    toast('No NIP-07 signer found. Install a Nostr extension or continue anonymously.', 'warn')
    return
  }
  try {
    const pubkey = await provider.getPublicKey()
    if (!/^[0-9a-f]{64}$/.test(pubkey)) throw new Error('invalid public key')
    state.pubkey = pubkey
    localStorage.setItem('gamestr:pubkey', pubkey)
    render()
    toast('Nostr identity connected. Your secret key never entered Gamestr.', 'good')
  } catch { toast('Nostr connection was cancelled or refused.', 'warn') }
}

function hero(games: WebGame[]): HTMLElement {
  const featured = games.find(game => game.featured && game.hero) ?? games.find(game => game.hero) ?? games[0]
  const section = el('section', 'hero')
  if (featured?.hero) section.style.setProperty('--hero-image', `url("${featured.hero}")`)
  const copy = el('div', 'hero-copy')
  copy.append(el('p', 'kicker', WEB_EDITION.heroKicker), el('h1', '', WEB_EDITION.heroTitle))
  copy.append(el('p', 'hero-lede', WEB_EDITION.heroDescription))
  const actions = el('div', 'hero-actions')
  actions.append(button('EXPLORE GAMES', 'primary', () => document.querySelector('#games')?.scrollIntoView({ behavior: 'smooth' })))
  if (featured) actions.append(playLink(featured, `PLAY ${featured.name.toUpperCase()} ↗`, 'secondary'))
  copy.append(actions)
  const proof = el('dl', 'proof-strip')
  for (const [value, label] of [[String(games.length), 'PLAYABLE GAMES'], ['2', 'SCORE KINDS'], ['0', 'CUSTODIAL ACCOUNTS']]) {
    const item = el('div'); item.append(el('dt', '', value), el('dd', '', label)); proof.append(item)
  }
  copy.append(proof)
  section.append(copy)
  if (WEB_EDITION.heroGraphic) {
    const graphic = el('img', 'edition-hero-graphic')
    graphic.src = WEB_EDITION.heroGraphic
    graphic.alt = WEB_EDITION.heroGraphicAlt
    section.append(graphic)
  }
  return section
}

function filters(): HTMLElement {
  const wrap = el('section', 'discovery-controls')
  const search = el('label', 'search-box')
  search.append(el('span', 'sr-only', 'Search games'))
  const input = el('input')
  input.type = 'search'; input.placeholder = 'Search games, genres, developers…'; input.value = state.query
  input.addEventListener('input', () => { state.query = input.value; renderGameGrid() })
  search.append(input)
  const tabs = el('div', 'filter-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Game filters')
  for (const [key, label] of [['all', 'ALL'], ['favourites', `MY ARCADE${state.social.favourites.length ? ` (${state.social.favourites.length})` : ''}`], ['featured', 'FEATURED'], ['trending', 'TRENDING'], ['new', 'NEW']]) {
    tabs.append(button(label, state.filter === key ? 'selected' : '', () => { state.filter = key; renderGameGrid() }))
  }
  const genres = Array.from(new Set(state.games.flatMap(game => game.genres.map(g => g.toLowerCase())))).sort()
  const select = el('select'); select.setAttribute('aria-label', 'Filter by genre')
  for (const genre of ['all', ...genres]) { const option = el('option', '', genre === 'all' ? 'ALL GENRES' : genre.toUpperCase()); option.value = genre; option.selected = genre === state.genre; select.append(option) }
  select.addEventListener('change', () => { state.genre = select.value; renderGameGrid() })
  wrap.append(search, tabs, select)
  return wrap
}

function filteredGames(): WebGame[] {
  const q = state.query.trim().toLowerCase()
  return state.games.filter(game => {
    if (state.filter === 'featured' && !game.featured) return false
    if (state.filter === 'favourites' && !state.social.favourites.includes(game.slug)) return false
    if (state.filter === 'trending' && !game.trending) return false
    if (state.filter === 'new' && !game.newRelease) return false
    if (state.genre !== 'all' && !game.genres.some(g => g.toLowerCase() === state.genre)) return false
    return !q || [game.name, game.tagline, game.developer, ...game.genres].filter(Boolean).some(value => String(value).toLowerCase().includes(q))
  })
}

function gameCard(game: WebGame): HTMLElement {
  const card = el('article', 'game-card')
  card.style.setProperty('--accent', game.accent)
  const art = el('button', 'game-art'); art.type = 'button'; art.setAttribute('aria-label', `View ${game.name}`)
  if (game.hero) art.style.backgroundImage = `linear-gradient(180deg, transparent 20%, rgba(8,9,13,.92)), url("${game.hero}")`
  if (game.logo) { const img = el('img'); img.src = game.logo; img.alt = ''; img.loading = 'lazy'; art.append(img) }
  else art.append(el('span', 'wordmark', game.name))
  art.addEventListener('click', () => navigate(`/game/${game.slug}`))
  const flags = el('div', 'card-flags')
  if (game.featured) flags.append(el('span', '', 'FEATURED'))
  if (game.trending) flags.append(el('span', '', 'TRENDING'))
  if (game.newRelease) flags.append(el('span', '', 'NEW'))
  art.append(flags)
  const body = el('div', 'game-body')
  const titleRow = el('div', 'title-row'); titleRow.append(el('h3', '', game.name))
  const cardActions = el('div', 'card-actions')
  const favourite = button(state.social.favourites.includes(game.slug) ? '★' : '☆', 'favourite-button', () => toggleFavourite(game)); favourite.setAttribute('aria-label', `${state.social.favourites.includes(game.slug) ? 'Remove' : 'Add'} ${game.name} ${state.social.favourites.includes(game.slug) ? 'from' : 'to'} favourites`)
  cardActions.append(favourite, playLink(game)); titleRow.append(cardActions)
  body.append(titleRow, el('p', '', game.tagline))
  const tags = el('div', 'tags'); game.genres.slice(0, 3).forEach(genre => tags.append(el('span', '', genre.toUpperCase())))
  const scores = state.scores.get(game.gameId) ?? []
  const latest = [...scores].sort((a, b) => b.at - a.at)[0]
  if (latest) tags.append(el('span', 'score-chip', `LIVE · ${latest.score.toLocaleString()}`))
  body.append(tags); card.append(art, body)
  return card
}

function renderGameGrid(): void {
  const grid = document.querySelector<HTMLElement>('#game-grid')
  const count = document.querySelector<HTMLElement>('#game-count')
  if (!grid || !count) return
  const games = filteredGames(); count.textContent = `${games.length} GAME${games.length === 1 ? '' : 'S'}`
  grid.replaceChildren(...games.map(gameCard))
  if (!games.length) grid.append(el('p', 'empty-state', 'No games match that filter. Try clearing the search.'))
}

function activityPanel(): HTMLElement {
  const aside = el('aside', 'activity-panel')
  const heading = el('div', 'section-heading'); heading.append(el('div', '', state.activityMode === 'following' ? 'FOLLOWING' : 'GAMESTR.IO LIVE SCORES'), externalLink('GAMESTR.IO ↗', `${GAMESTR_ORIGIN}/scores`))
  const modes = el('div', 'activity-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Activity filter')
  for (const [mode, label] of [['all', 'ALL'], ['following', `FOLLOWING ${state.social.follows.length ? `(${state.social.follows.length})` : ''}`]] as const) {
    modes.append(button(label, state.activityMode === mode ? 'selected' : '', () => { state.activityMode = mode; document.querySelector('.activity-panel')?.replaceWith(activityPanel()) }))
  }
  const list = el('ol', 'activity-list')
  const latest = state.games.flatMap(game => (state.scores.get(game.gameId) ?? []).map(score => ({ game, score })))
    .filter(({ score }) => state.activityMode === 'all' || state.social.follows.includes(score.pubkey))
    .sort((a, b) => b.score.at - a.score.at).slice(0, 8)
  if (!latest.length) list.append(el('li', 'activity-empty', state.activityMode === 'following' && !state.social.follows.length ? 'Follow players from their profile to build your activity feed.' : state.relay === 'down' ? 'Relays are unavailable. Retrying…' : 'Listening for verified score events…'))
  latest.forEach(({ game, score }) => {
    ensureProfile(score.pubkey)
    const profile = state.profiles.get(score.pubkey)
    const identity = playerIdentity(score.pubkey, score, profile)
    const item = el('li'); const avatar = el('span', 'mini-avatar', identity.label.slice(0, 2).toUpperCase())
    avatar.style.background = avatarCss(score.pubkey)
    if (profile?.picture) { const image = el('img'); image.src = profile.picture; image.alt = ''; avatar.replaceChildren(image) }
    const text = el('span'); text.append(el('strong', '', identity.label))
    if (identity.nip05) text.append(el('small', 'player-nip05', identity.nip05))
    text.append(el('small', '', `${game.name} · ${new Date(score.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`))
    item.append(avatar, text, el('b', '', score.score.toLocaleString())); list.append(item)
  })
  const trust = el('div', 'trust-note'); trust.append(el('strong', '', 'GAMESTR.IO · VERIFIED LOCALLY'), el('p', '', 'These are Gamestr.io score events from Nostr. Every signature is checked in your browser; invalid and explicitly cheated events never reach the board.'))
  aside.append(heading, modes, list, trust); return aside
}

function linkButton(label: string, path: string): HTMLAnchorElement {
  const link = el('a', 'text-link', label); link.href = path; link.addEventListener('click', e => { e.preventDefault(); navigate(path) }); return link
}

function externalLink(label: string, url: string, className = 'text-link'): HTMLAnchorElement {
  const link = el('a', className, label); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link
}

function playerLink(player: string | LeaderboardEntry, className = 'player'): HTMLAnchorElement {
  const entry = typeof player === 'string' ? undefined : player
  const pubkey = typeof player === 'string' ? player : player.pubkey
  ensureProfile(pubkey)
  const identity = playerIdentity(pubkey, entry, state.profiles.get(pubkey))
  const link = el('a', className)
  link.append(el('span', 'player-primary', identity.label))
  if (identity.nip05) link.append(el('small', 'player-nip05', identity.nip05))
  link.href = `/player/${pubkey}`
  link.addEventListener('click', event => { event.preventDefault(); navigate(link.getAttribute('href')!) })
  return link
}

function scoreLink(entry: LeaderboardEntry): HTMLElement {
  if (!entry.eventId) return el('strong', '', entry.score.toLocaleString())
  const link = el('a', 'score-link', entry.score.toLocaleString())
  link.href = `/score/${entry.eventId}`
  link.addEventListener('click', event => { event.preventDefault(); navigate(link.getAttribute('href')!) })
  return link
}

function home(): HTMLElement {
  const main = el('main'); main.id = 'main'; main.append(hero(state.games))
  const layout = el('div', 'content-layout')
  const catalogue = el('div', 'catalogue'); catalogue.id = 'games'; catalogue.append(filters())
  const title = el('div', 'section-heading'); title.append(el('h2', '', 'ARCADE FLOOR'), el('span', '', '')); title.lastElementChild!.id = 'game-count'
  const grid = el('div', 'game-grid'); grid.id = 'game-grid'; catalogue.append(title, grid)
  layout.append(catalogue, activityPanel()); main.append(layout, developerCallout()); setTimeout(renderGameGrid)
  return main
}

function developerCallout(): HTMLElement {
  const section = el('section', 'developer-callout')
  const copy = el('div'); copy.append(el('p', 'kicker', 'SHIP ON AN OPEN ARCADE'), el('h2', '', 'One manifest. Global discovery. No permission slip.'), el('p', '', 'Publish scores to Nostr, keep hosting your own game, and become playable across web and physical cabinets.'))
  copy.append(button('READ THE DEVELOPER GUIDE', 'primary', () => navigate('/developers')))
  const code = el('pre'); code.textContent = '{\n  "manifestVersion": 2,\n  "gameId": "your-game",\n  "url": "https://play.example",\n  "capabilities": { "nostrSign": true }\n}'
  section.append(copy, code); return section
}

function scoresPage(): HTMLElement {
  const main = el('main', 'page'); main.id = 'main'
  main.append(el('p', 'kicker', 'GAMESTR.IO · CRYPTOGRAPHICALLY VERIFIED'), el('h1', '', 'Live score network'), el('p', 'page-lede', 'Gamestr.io scores, assembled from signed Nostr events rather than a platform database. Profiles come from each player’s signed kind-0 metadata, with the game-signed player name as the fallback.'), externalLink('OPEN THE SCORE NETWORK ON GAMESTR.IO ↗', `${GAMESTR_ORIGIN}/scores`, 'button-link gamestr-source-link'))
  const grid = el('div', 'score-boards')
  for (const game of state.games) {
    const entries = state.scores.get(game.gameId) ?? []
    const board = boardFor(entries, 'all', 5, Math.floor(Date.now() / 1000), game.scoreDir ?? 'desc')
    if (!board.length) continue
    const section = el('section', 'score-board'); const heading = el('div', 'section-heading'); heading.append(el('h2', '', game.name), playLink(game)); section.append(heading)
    const list = el('ol'); board.forEach((entry, index) => { const row = el('li'); row.append(el('span', 'rank', String(index + 1).padStart(2, '0')), playerLink(entry), scoreLink(entry)); list.append(row) }); section.append(list); grid.append(section)
  }
  if (!grid.children.length) grid.append(el('p', 'empty-state', 'Verified boards are syncing from Nostr relays…'))
  main.append(grid); return main
}

function developersPage(): HTMLElement {
  const main = el('main', 'page prose'); main.id = 'main'
  main.append(el('p', 'kicker', 'DEVELOPER GUIDE'), el('h1', '', 'Bring your game. Keep your sovereignty.'), el('p', 'page-lede', 'Gamestr is discovery and interoperability—not a hosting lock-in. Your URL, your code, your revenue, your player relationship.'))
  const steps = [
    ['1', 'Declare the game', 'Add a Manifest v2 file with a stable gameId, HTTPS URL, genres, art, controls, and only the capabilities you actually need.'],
    ['2', 'Publish signed scores', 'Emit kind 30762 with game and score tags, or kind 5555 with a declared score field. Sign as the player or use a clearly documented game authority.'],
    ['3', 'Submit without surrendering hosting', 'Validate below, approve a NIP-07 signature, and publish a portable NIP-89 submission. Curated listing remains an explicit review; your game stays on your origin.'],
  ]
  const list = el('div', 'dev-steps'); steps.forEach(([number, title, body]) => { const item = el('section'); item.append(el('b', '', number), el('h2', '', title), el('p', '', body)); list.append(item) }); main.append(list)
  const event = el('pre'); event.textContent = JSON.stringify({ kind: 30762, tags: [['game', 'your-game'], ['score', '4200'], ['sats', '21']], content: '' }, null, 2)
  const safety = el('section', 'dev-safety'); safety.append(el('h2', '', 'Trust boundary'), el('p', '', 'The web app validates structure and Schnorr signatures, bounds retained events, ignores cheated scores, and never asks for an nsec. Play links open the reviewed publisher origin directly in a separate tab.'))
  const studioHost = el('div'); studioHost.id = 'manifest-studio-host'
  main.append(el('h2', '', 'Canonical score event'), event, safety, studioHost)
  setTimeout(() => {
    const host = document.querySelector<HTMLElement>('#manifest-studio-host')
    if (host) void import('./developer-studio').then(({ mountDeveloperStudio }) => mountDeveloperStudio(host, RELAYS))
  })
  return main
}

function gamePage(slug: string): HTMLElement {
  let identifier = slug
  if (slug.startsWith('naddr1')) {
    try { const decoded = decodeNip19(slug); if (decoded.type === 'naddr') identifier = decoded.data.identifier } catch { /* invalid legacy link */ }
  }
  const aliases: Record<string, string> = { 'miner-v1': 'nogames-miner-v1', 'snake-v1': 'nogames-snake-v1' }
  identifier = aliases[identifier] ?? identifier
  const game = state.games.find(item => item.slug === identifier || item.gameId === identifier)
  if (!game) { const main = el('main', 'page retired-game'); main.id = 'main'; main.append(el('p', 'kicker', 'LEGACY GAME LINK'), el('h1', '', 'This cabinet moved on'), el('p', 'page-lede', 'The signed legacy link is recognised, but that game is not in the reviewed web catalogue. Nothing was silently substituted.'), linkButton('BROWSE CURRENT GAMES', '/')); return main }
  const main = el('main', 'game-detail'); main.id = 'main'; main.style.setProperty('--accent', game.accent)
  const art = el('div', 'detail-art')
  if (game.hero) art.style.backgroundImage = `linear-gradient(90deg, rgba(8,9,13,.2), #08090d), url("${game.hero}")`
  if (game.logo) { const image = el('img'); image.src = game.logo; image.alt = `${game.name} logo`; art.append(image) }
  const copy = el('div', 'detail-copy'); copy.append(el('p', 'kicker', game.genres.join(' · ').toUpperCase()), el('h1', '', game.name), el('p', 'page-lede', game.description ?? game.tagline))
  const actions = el('div', 'hero-actions'); actions.append(playLink(game, 'PLAY ON PUBLISHER SITE ↗', 'primary'), button(state.social.favourites.includes(game.slug) ? '★ IN MY ARCADE' : '☆ ADD TO MY ARCADE', 'secondary', () => toggleFavourite(game)), button('INVITE TO PLAY', 'secondary', () => void shareInvitation(game)), button('CREATE CHALLENGE', 'secondary', () => createChallengeDialog(game))); copy.append(actions)
  const facts = el('dl', 'game-facts'); for (const [label, value] of [['IDENTITY', 'NOSTR'], ['SCORES', 'VERIFIED'], ['WALLET', game.walletPay ? 'LIGHTNING' : 'OPTIONAL'], ['PLAYERS', game.players ? `${game.players.min}–${game.players.max}` : '1']]) { const item = el('div'); item.append(el('dt', '', label), el('dd', '', value)); facts.append(item) } copy.append(facts)
  main.append(art, copy)
  const board = el('section', 'detail-board')
  const boardHeading = el('div', 'section-heading'); boardHeading.append(el('h2', '', 'GAMESTR.IO LEADERBOARD'), externalLink('OPEN ON GAMESTR.IO ↗', `${GAMESTR_ORIGIN}/${encodeURIComponent(game.gameId)}`)); board.append(boardHeading)
  const entries = boardFor(state.scores.get(game.gameId) ?? [], 'all', 10, Math.floor(Date.now() / 1000), game.scoreDir ?? 'desc')
  const list = el('ol'); entries.forEach((entry, index) => { const item = el('li'); item.append(el('span', 'rank', String(index + 1).padStart(2, '0')), playerLink(entry), scoreLink(entry)); list.append(item) }); if (!entries.length) list.append(el('li', 'activity-empty', 'Syncing verified Gamestr.io scores…')); board.append(list); main.append(board)
  return main
}

const queuedProfiles = new Set<string>()
let profileBatchTimer: number | undefined
let profileRenderTimer: number | undefined

function scheduleProfileRender(): void {
  if (profileRenderTimer !== undefined) return
  profileRenderTimer = window.setTimeout(() => {
    profileRenderTimer = undefined
    render()
  }, 0)
}

function ensureProfile(pubkey: string): void {
  if (!/^[0-9a-f]{64}$/.test(pubkey) || state.profiles.has(pubkey) || state.profileRequests.has(pubkey)) return
  state.profileRequests.add(pubkey)
  queuedProfiles.add(pubkey)
  if (profileBatchTimer !== undefined) return
  profileBatchTimer = window.setTimeout(() => {
    profileBatchTimer = undefined
    const pubkeys = Array.from(queuedProfiles)
    queuedProfiles.clear()
    const dispose = resolveProfiles(RELAYS, pubkeys, (resolved, profile) => {
      state.profiles.set(resolved, profile)
      scheduleProfileRender()
    })
    setTimeout(dispose, 6_000)
  }, 0)
}

function latestPlayerEntry(pubkey: string): LeaderboardEntry | undefined {
  return state.games.flatMap(game => state.scores.get(game.gameId) ?? [])
    .filter(entry => entry.pubkey === pubkey)
    .sort((a, b) => b.at - a.at)[0]
}

function zapSetupNote(): HTMLElement {
  return el('p', 'zap-setup-note', 'To receive zaps, players need to add a lightning address (lud16) or LNURL (lud06) to their Nostr profile.')
}

function playerPage(pubkey: string): HTMLElement {
  ensureProfile(pubkey)
  const profile = state.profiles.get(pubkey)
  const scoreIdentity = latestPlayerEntry(pubkey)
  const identityLabel = playerIdentity(pubkey, scoreIdentity, profile)
  const main = el('main', 'page player-page'); main.id = 'main'
  const identity = el('section', 'player-identity')
  const avatar = el('div', 'player-avatar')
  if (profile?.picture) { const image = el('img'); image.src = profile.picture; image.alt = ''; avatar.append(image) }
  else avatar.style.background = avatarCss(pubkey)
  const copy = el('div'); copy.append(el('p', 'kicker', 'GAMESTR.IO PLAYER'), el('h1', '', identityLabel.label))
  if (identityLabel.nip05) copy.append(el('p', 'player-profile-nip05', identityLabel.nip05))
  copy.append(el('p', 'player-npub', hexToNpub(pubkey)))
  const external = el('a', 'button-link', 'VIEW ON NOSTR'); external.href = `https://njump.me/${hexToNpub(pubkey)}`; external.target = '_blank'; external.rel = 'noopener noreferrer'; copy.append(external)
  copy.append(externalLink('VIEW ON GAMESTR.IO ↗', `${GAMESTR_ORIGIN}/player/${pubkey}`, 'button-link gamestr-source-link'))
  if (pubkey !== state.pubkey) copy.append(button(state.social.follows.includes(pubkey) ? '✓ FOLLOWING' : '+ FOLLOW PLAYER', 'secondary follow-button', () => toggleFollow(pubkey)))
  if (lightningDestination(profile) && pubkey !== state.pubkey) copy.append(button('⚡ ZAP PLAYER', 'reward-button', () => rewardDialog(pubkey, profile!)))
  else if (pubkey !== state.pubkey) copy.append(zapSetupNote())
  identity.append(avatar, copy); main.append(identity)

  if (pubkey === state.pubkey) {
    const favouriteGames = state.games.filter(game => state.social.favourites.includes(game.slug))
    const favourites = el('section', 'player-favourites'); favourites.append(el('h2', '', 'MY ARCADE'))
    const grid = el('div', 'game-grid'); grid.append(...favouriteGames.map(gameCard)); if (!favouriteGames.length) grid.append(el('p', 'empty-state', 'Favourite games appear here. Add them from the arcade or a game page.'))
    favourites.append(grid); main.append(favourites)
  }

  const bests = state.games.map(game => {
    const entries = (state.scores.get(game.gameId) ?? []).filter(entry => entry.pubkey === pubkey)
    return { game, entry: boardFor(entries, 'all', 1, Math.floor(Date.now() / 1000), game.scoreDir ?? 'desc')[0] }
  }).filter(item => item.entry)
  const section = el('section', 'player-bests'); section.append(el('h2', '', 'PERSONAL BESTS'))
  const grid = el('div', 'score-boards')
  bests.forEach(({ game, entry }) => { const card = el('article', 'personal-best'); card.append(el('span', '', game.name), scoreLink(entry), playLink(game)); grid.append(card) })
  if (!bests.length) grid.append(el('p', 'empty-state', 'No verified scores have synced for this player yet.'))
  section.append(grid); main.append(section); return main
}

function scorePage(eventId: string): HTMLElement {
  let match: { game: WebGame; entry: LeaderboardEntry } | undefined
  for (const game of state.games) {
    const entry = (state.scores.get(game.gameId) ?? []).find(candidate => candidate.eventId === eventId)
    if (entry) { match = { game, entry }; break }
  }
  const main = el('main', 'page score-detail'); main.id = 'main'
  if (!match) { main.append(el('p', 'kicker', 'VERIFIED SCORE'), el('h1', '', 'Syncing event…'), el('p', 'page-lede', 'This score has not arrived from the configured relays yet. The app will continue reconnecting.')); return main }
  ensureProfile(match.entry.pubkey)
  const profile = state.profiles.get(match.entry.pubkey)
  const identity = playerIdentity(match.entry.pubkey, match.entry, profile)
  main.append(el('p', 'kicker', 'VERIFIED GAMESTR.IO SCORE'), el('h1', '', match.entry.score.toLocaleString()), el('p', 'page-lede', `${match.game.name} · ${new Date(match.entry.at * 1000).toLocaleString()}`))
  const facts = el('dl', 'score-facts')
  const factValues = [['PLAYER', identity.label], ...(identity.nip05 ? [['NIP-05', identity.nip05]] : []), ['SATS', String(match.entry.sats ?? 0)], ['SIGNATURE', 'VALID'], ['EVENT', eventId]]
  for (const [label, value] of factValues) { const item = el('div'); item.append(el('dt', '', label), el('dd', '', value)); facts.append(item) }
  main.append(facts, playerLink(match.entry, 'button-link'), playLink(match.game, `PLAY ${match.game.name.toUpperCase()} ↗`, 'primary'), externalLink('VIEW ORIGINAL ON GAMESTR.IO ↗', `${GAMESTR_ORIGIN}/${encodeURIComponent(match.game.gameId)}/score/${eventId}`, 'button-link gamestr-source-link'))
  if (lightningDestination(profile) && match.entry.pubkey !== state.pubkey) main.append(button('⚡ ZAP THIS SCORE', 'reward-button', () => rewardDialog(match!.entry.pubkey, profile!)))
  else if (match.entry.pubkey !== state.pubkey) main.append(zapSetupNote())
  return main
}

function invitationPage(encoded: string): HTMLElement {
  const main = el('main', 'page invitation-page'); main.id = 'main'
  const signed = decodeInvitation(encoded)
  const invitation = signed ? parseInvitation(signed) : undefined
  const game = invitation ? state.games.find(candidate => candidate.gameId === invitation.gameId && candidate.url === invitation.gameUrl) : undefined
  if (!invitation || !game) {
    main.append(el('p', 'kicker', 'SIGNED GAME INVITATION'), el('h1', '', 'Invitation unavailable'), el('p', 'page-lede', 'This link is invalid, expired, or points outside the reviewed Gamestr catalogue.'), linkButton('BROWSE THE ARCADE', '/'))
    return main
  }
  ensureProfile(invitation.event.pubkey)
  const inviter = playerIdentity(invitation.event.pubkey, undefined, state.profiles.get(invitation.event.pubkey)).label
  const card = el('section', 'invitation-card'); card.style.setProperty('--accent', game.accent)
  card.append(el('span', 'invite-proof', '✓ SIGNATURE VERIFIED'), el('p', 'kicker', `${inviter} INVITED YOU`), el('h1', '', game.name), el('p', 'page-lede', game.tagline))
  const facts = el('dl', 'game-facts')
  for (const [label, value] of [['FROM', inviter], ['EXPIRES', new Date(invitation.expiresAt * 1000).toLocaleDateString()], ['GAME', game.gameId], ['ORIGIN', new URL(game.url).host]]) { const item = el('div'); item.append(el('dt', '', label), el('dd', '', value)); facts.append(item) }
  const actions = el('div', 'hero-actions'); actions.append(playLink(game, 'ACCEPT & PLAY ↗', 'primary'), playerLink(invitation.event.pubkey, 'button-link'), linkButton('NOT NOW', '/'))
  card.append(facts, actions); main.append(card); return main
}

function challengePage(encoded: string): HTMLElement {
  const main = el('main', 'page challenge-page'); main.id = 'main'
  const signed = decodeChallenge(encoded)
  const challenge = signed ? parseChallenge(signed) : undefined
  const game = challenge ? state.games.find(candidate => candidate.gameId === challenge.gameId && candidate.url === challenge.gameUrl) : undefined
  if (!challenge || !game) {
    main.append(el('p', 'kicker', 'SIGNED CHALLENGE'), el('h1', '', 'Challenge unavailable'), el('p', 'page-lede', 'This challenge is invalid, too old, or points outside the reviewed Gamestr catalogue.'), linkButton('BROWSE THE ARCADE', '/'))
    return main
  }
  ensureProfile(challenge.event.pubkey)
  const creator = playerIdentity(challenge.event.pubkey, undefined, state.profiles.get(challenge.event.pubkey)).label
  const now = Math.floor(Date.now() / 1000)
  const phase = now < challenge.startsAt ? 'UPCOMING' : now <= challenge.endsAt ? 'LIVE NOW' : 'FINAL'
  const hero = el('section', 'challenge-hero'); hero.style.setProperty('--accent', game.accent)
  hero.append(el('span', 'invite-proof', '✓ SIGNED CHALLENGE'), el('p', 'kicker', `${phase} · ${game.name.toUpperCase()}`), el('h1', '', challenge.name), el('p', 'page-lede', `Created by ${creator}. Every standing comes from a locally verified Nostr score inside the signed time window.`))
  const facts = el('dl', 'game-facts')
  for (const [label, value] of [['STATUS', phase], ['START', new Date(challenge.startsAt * 1000).toLocaleString()], ['END', new Date(challenge.endsAt * 1000).toLocaleString()], ['ORIGIN', new URL(game.url).host]]) { const item = el('div'); item.append(el('dt', '', label), el('dd', '', value)); facts.append(item) }
  const actions = el('div', 'hero-actions'); actions.append(playLink(game, phase === 'FINAL' ? 'PLAY THIS GAME ↗' : 'ENTER & PLAY ↗', 'primary'), playerLink(challenge.event.pubkey, 'button-link')); hero.append(facts, actions); main.append(hero)
  const standings = el('section', 'challenge-standings'); const heading = el('div', 'section-heading'); heading.append(el('h2', '', phase === 'FINAL' ? 'FINAL STANDINGS' : 'LIVE STANDINGS'), el('span', '', `${new Date(challenge.startsAt * 1000).toLocaleDateString()} — ${new Date(challenge.endsAt * 1000).toLocaleDateString()}`)); standings.append(heading)
  const eligible = (state.scores.get(game.gameId) ?? []).filter(entry => entry.at >= challenge.startsAt && entry.at <= challenge.endsAt)
  const ranked = boardFor(eligible, 'all', 50, Math.min(now, challenge.endsAt), game.scoreDir ?? 'desc')
  const list = el('ol', 'challenge-board')
  ranked.forEach((entry, index) => { const row = el('li'); row.append(el('span', 'rank', String(index + 1).padStart(2, '0')), playerLink(entry), el('small', '', new Date(entry.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), scoreLink(entry)); list.append(row) })
  if (!ranked.length) list.append(el('li', 'activity-empty', phase === 'FINAL' ? 'No verified scores landed during this challenge.' : 'Waiting for the first verified score in this challenge window…'))
  standings.append(list); main.append(standings); return main
}

async function shareInvitation(game: WebGame): Promise<void> {
  const signer = (window as NostrWindow).nostr
  if (!signer) { toast('Connect a NIP-07 signer to create a verifiable invitation.', 'warn'); return }
  try {
    const signed = await signer.signEvent(invitationTemplate(game.gameId, game.url))
    if (!parseInvitation(signed)) throw new Error('invalid signed invitation')
    const url = `${location.origin}/invite/${encodeInvitation(signed)}`
    if (navigator.share) await navigator.share({ title: `Play ${game.name} on Gamestr`, text: `Join me for ${game.name}.`, url })
    else { await navigator.clipboard.writeText(url); toast('Signed invitation link copied.', 'good') }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    toast('Invitation signing or sharing was cancelled.', 'warn')
  }
}

function createChallengeDialog(game: WebGame): void {
  const modal = el('div', 'challenge-modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'challenge-title')
  const form = el('form', 'challenge-form')
  const heading = el('h2', '', `Challenge players in ${game.name}`); heading.id = 'challenge-title'
  const lede = el('p', '', 'Scores already signed by players during the challenge window become the live standings. No registration or tournament database.')
  const nameLabel = el('label', '', 'Challenge name'); const name = el('input'); name.type = 'text'; name.required = true; name.maxLength = 60; name.placeholder = `${game.name} Open`; nameLabel.append(name)
  const durationLabel = el('label', '', 'Duration'); const duration = el('select')
  for (const [seconds, label] of [['3600', '1 HOUR'], ['86400', '24 HOURS'], ['604800', '7 DAYS']]) { const option = el('option', '', label); option.value = seconds; if (seconds === '86400') option.selected = true; duration.append(option) }
  durationLabel.append(duration)
  const status = el('output', 'studio-status'); status.setAttribute('aria-live', 'polite')
  const actions = el('div', 'hero-actions'); const create = button('SIGN & CREATE', 'primary', () => undefined); create.type = 'submit'; const cancel = button('CANCEL', 'secondary', () => modal.remove()); actions.append(create, cancel)
  form.append(el('p', 'kicker', 'SIGNED CHALLENGE'), heading, lede, nameLabel, durationLabel, actions, status); modal.append(form); document.body.append(modal); name.focus()
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { modal.remove(); window.removeEventListener('keydown', escape) } }; window.addEventListener('keydown', escape)
  form.addEventListener('submit', async event => {
    event.preventDefault(); const signer = (window as NostrWindow).nostr
    if (!signer) { status.className = 'studio-status error'; status.textContent = 'Connect a NIP-07 signer before creating a challenge.'; return }
    create.disabled = true; status.className = 'studio-status'; status.textContent = 'Waiting for your Nostr signer…'
    try {
      const signed = await signer.signEvent(challengeTemplate(game.gameId, game.url, name.value, Number(duration.value)))
      if (!parseChallenge(signed)) throw new Error('Signer returned an invalid challenge.')
      const url = `${location.origin}/challenge/${encodeChallenge(signed)}`
      if (navigator.share) await navigator.share({ title: name.value.trim(), text: `Compete in ${name.value.trim()} on Gamestr.`, url })
      else { await navigator.clipboard.writeText(url); toast('Signed challenge link copied.', 'good') }
      modal.remove()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') { create.disabled = false; return }
      status.className = 'studio-status error'; status.textContent = error instanceof Error ? error.message : 'Challenge creation failed.'; create.disabled = false
    }
  })
}

function rewardDialog(pubkey: string, profile: Profile): void {
  const lightning = lightningDestination(profile)
  if (!lightning) return
  const modal = el('div', 'challenge-modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'reward-title')
  const form = el('form', 'challenge-form reward-form')
  const identity = playerIdentity(pubkey, latestPlayerEntry(pubkey), profile)
  const heading = el('h2', '', `Zap ${identity.label}`); heading.id = 'reward-title'
  const lede = el('p', '', 'Zap directly from your own WebLN wallet to the player’s lud16 Lightning address or lud06 LNURL. This arcade never sees wallet credentials or routes this through the cabinet wallet.')
  const amountLabel = el('label', '', 'Amount in sats'); const amount = el('input'); amount.type = 'number'; amount.min = '1'; amount.max = '100000'; amount.step = '1'; amount.required = true; amount.value = '21'; amountLabel.append(amount)
  const presets = el('div', 'reward-presets'); for (const value of [21, 100, 500, 1000]) presets.append(button(`${value} SATS`, 'secondary', () => { amount.value = String(value) }))
  const zapLabel = el('label', 'zap-option'); const publicZap = el('input'); publicZap.type = 'checkbox'; zapLabel.append(publicZap, el('span', '', 'Create a public Nostr zap receipt (reveals your signing identity)'))
  const destination = el('p', 'reward-destination', `TO ${lightning}`)
  const privacy = el('p', 'reward-privacy', 'Your browser contacts the recipient’s Lightning service only after you approve. The wallet still shows the final invoice for authorization.')
  const status = el('output', 'studio-status'); status.setAttribute('aria-live', 'polite')
  const actions = el('div', 'hero-actions'); const pay = button('OPEN MY WALLET', 'primary', () => undefined); pay.type = 'submit'; const cancel = button('CANCEL', 'secondary', () => modal.remove()); actions.append(pay, cancel)
  form.append(el('p', 'kicker', 'USER-OWNED LIGHTNING'), heading, lede, amountLabel, presets, zapLabel, destination, privacy, actions, status); modal.append(form); document.body.append(modal); amount.focus(); amount.select()
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { modal.remove(); window.removeEventListener('keydown', escape) } }; window.addEventListener('keydown', escape)
  form.addEventListener('submit', async event => {
    event.preventDefault(); const provider = (window as NostrWindow).webln
    if (!provider) { status.className = 'studio-status error'; status.textContent = 'No WebLN wallet was found. Install or connect a WebLN-capable wallet and retry.'; return }
    pay.disabled = true; status.className = 'studio-status'; status.textContent = 'Requesting an exact-amount invoice from the player’s Lightning address…'
    try {
      const signer = (window as NostrWindow).nostr
      if (publicZap.checked && !signer) throw new Error('A NIP-07 signer is required for a public zap receipt.')
      await rewardLightningAddress(lightning, Number(amount.value), provider, fetch, publicZap.checked ? { zap: { recipientPubkey: pubkey, signer: signer!, relays: RELAYS } } : {})
      status.className = 'studio-status success'; status.textContent = `${Number(amount.value).toLocaleString()} sats sent directly to ${identity.label}.`
      setTimeout(() => modal.remove(), 1800)
    } catch (error) {
      status.className = 'studio-status error'; status.textContent = error instanceof Error ? error.message : 'Lightning reward failed or was cancelled.'; pay.disabled = false
    }
  })
}

function footer(): HTMLElement {
  const foot = el('footer'); const brand = el('div'); brand.append(el('strong', '', WEB_EDITION.footerName), el('p', '', WEB_EDITION.footerDescription))
  const links = el('div'); links.append(linkButton('ARCADE', '/'), linkButton('SCORES', '/scores'), linkButton('BUILD', '/developers'))
  links.append(externalLink('GAMESTR.IO ↗', GAMESTR_ORIGIN))
  if (WEB_EDITION.footerLink) {
    const external = el('a', 'text-link', WEB_EDITION.footerLink.label)
    external.href = WEB_EDITION.footerLink.url
    external.target = '_blank'
    external.rel = 'noopener noreferrer'
    links.append(external)
  }
  foot.append(brand, links, el('small', '', 'No custodial account · No nsec collection · No score database'))
  return foot
}

function toast(message: string, tone: 'good' | 'warn'): void {
  document.querySelector('.toast')?.remove(); const node = el('div', `toast ${tone}`, message); node.setAttribute('role', 'status'); document.body.append(node); setTimeout(() => node.remove(), 5000)
}

function updateMetadata(): void {
  const current = route()
  const game = current.name === 'game' ? state.games.find(item => item.slug === current.slug) : undefined
  const title = game ? `${game.name} — ${WEB_EDITION.titleSuffix}` : current.name === 'scores' ? `Verified scores — ${WEB_EDITION.titleSuffix}` : current.name === 'developers' ? 'Build for Gamestr' : current.name === 'challenge' ? `Signed challenge — ${WEB_EDITION.titleSuffix}` : current.name === 'invite' ? `Game invitation — ${WEB_EDITION.titleSuffix}` : current.name === 'player' ? `Nostr player — ${WEB_EDITION.titleSuffix}` : WEB_EDITION.siteTitle
  const description = game?.description ?? game?.tagline ?? WEB_EDITION.siteDescription
  document.title = title
  const canonical = `${location.origin}${location.pathname === '/' ? '/' : location.pathname}`
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', canonical)
  for (const [selector, value] of [['meta[name="description"]', description], ['meta[property="og:title"]', title], ['meta[property="og:description"]', description], ['meta[property="og:url"]', canonical]]) document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', value)
}

function render(): void {
  updateMetadata()
  const current = route()
  const content = current.name === 'home' ? home()
    : current.name === 'scores' ? scoresPage()
      : current.name === 'developers' ? developersPage()
        : current.name === 'game' ? gamePage(current.slug!)
          : current.name === 'player' ? playerPage(current.id!)
            : current.name === 'score' ? scorePage(current.id!)
              : current.name === 'invite' ? invitationPage(current.id!)
                : challengePage(current.id!)
  app.replaceChildren(header(), content, footer())
}

function refreshScores(): void {
  const current = route()
  if (current.name === 'developers') return
  if (current.name !== 'home') { render(); return }
  renderGameGrid()
  document.querySelector('.activity-panel')?.replaceWith(activityPanel())
}

function refreshRelayStatus(): void {
  const pill = document.querySelector<HTMLElement>('.relay-pill')
  if (!pill) return
  pill.className = `relay-pill ${state.relay}`
  pill.textContent = state.relay === 'up' ? 'NOSTR LIVE' : state.relay === 'down' ? 'RELAYS OFFLINE' : 'CONNECTING'
}

async function boot(): Promise<void> {
  try {
    const response = await fetch('/catalogue.json')
    if (!response.ok) throw new Error(`catalogue ${response.status}`)
    state.games = await response.json() as WebGame[]
  } catch {
    app.replaceChildren(el('main', 'fatal', 'The arcade catalogue could not be loaded. Please retry.'))
    return
  }
  const feed = createGamestrCatalogue(RELAYS, { onStatus: status => { state.relay = status; refreshRelayStatus() } })
  for (const game of state.games) {
    feed.subscribe(game.gameId, entries => { state.scores.set(game.gameId, entries); refreshScores() }, { kind: game.scoreKind, field: game.scoreField, dir: game.scoreDir })
  }
  window.addEventListener('popstate', render)
  window.addEventListener('beforeunload', () => feed.dispose(), { once: true })
  if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js')
  render()
}

void boot()
