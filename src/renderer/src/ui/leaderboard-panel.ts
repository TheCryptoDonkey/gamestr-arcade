/**
 * gamestr-arcade — live leaderboard panel (right-side cabinet board).
 *
 * Deliberately mounted on the RIGHT to balance the left-heavy hero showcase and
 * fill the empty right third of the frame. Styled as part of the same cabinet:
 * accent-themed, glowing, condensed display type, sitting under the CRT.
 *
 * Behaviour on each carousel selection:
 *   1. Render the cached board for the new game INSTANTLY (no empty flash).
 *   2. Subscribe to the live provider for that `gameId`; the first live update
 *      replaces the cache and is persisted back.
 *   3. Kick off async kind-0 resolution for the visible pubkeys, live-patching
 *      names / pictures in without ever blocking the score render.
 *
 * The provider + profile-resolver + relays are injected so the same panel runs
 * against real relays in Electron and against deterministic mocks in a browser
 * (see `wireLeaderboard`), and so the connection logic stays out of the DOM.
 */

import type { ArcadeConfig, LeaderboardEntry, LeaderboardProvider, ScoreScoring } from '../../../shared/types'
import { createGamestrCatalogue, type GamestrCatalogue } from '../leaderboard/gamestr'
import { boardFor, type Period } from '../leaderboard/gamestr-reduce'
import { readCachedBoard, writeCachedBoard } from '../leaderboard/cache'
import { avatarCss, resolveProfiles, shortenNpub, type Profile } from '../leaderboard/profiles'
import { ProfileCache } from '../leaderboard/profile-cache'

export interface LeaderboardPanelOptions {
  /** The relays profile resolution should query (score relays come via the provider). */
  relays: string[]
  /**
   * Builds a provider for a given relay set.
   * `onStatus` is called with `'up'`/`'down'` when socket connectivity changes,
   * allowing the provider to drive the LIVE indicator independently of score updates.
   */
  makeProvider: (relays: string[], onStatus?: (s: 'up' | 'down') => void) => LeaderboardProvider
  /** Profile resolver — swappable so browser mode can no-op or mock it. */
  resolve?: typeof resolveProfiles
  /** Pre-seeded profile cache (24h TTL). Defaults to a fresh instance. */
  profileCache?: ProfileCache
  /** Heading + sub-heading copy (kept here so the booth can re-theme it). */
  title?: string
  subtitle?: string
  /** Max entries to show on the board (default 10). */
  topN?: number
}

type ConnState = 'live' | 'reconnecting'

/** Format a score with thin-space grouping (e.g. 184 320) — condensed, arcade. */
function formatScore(n: number): string {
  return Math.trunc(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Compact sats label (e.g. 21 000 → "21K", 1 200 000 → "1.2M"). */
function formatSats(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K'
  return String(n)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export class LeaderboardPanel {
  private readonly root: HTMLElement
  private readonly listEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly opts: Required<Pick<LeaderboardPanelOptions, 'title' | 'subtitle'>> & LeaderboardPanelOptions

  private currentGameId: string | null = null
  private currentRelays: string[]
  private unsubscribeScores: (() => void) | null = null
  private unsubscribeProfiles: (() => void) | null = null
  private entries: LeaderboardEntry[] = []
  private readonly profiles = new Map<string, Profile>()
  /** 24h persistent cache — shared across all game selections in the session. */
  private readonly profileCache: ProfileCache
  private gotLive = false
  private period: Period = 'today'
  /** True once the player explicitly picks a period — auto-fallback then stands down. */
  private periodPinned = false
  /** True while the panel is showing All Time only because Today was empty. */
  private autoFellBack = false
  private scoring: ScoreScoring | undefined
  private rawEntries: LeaderboardEntry[] = []
  private readonly topN: number
  private keyHandler: ((e: KeyboardEvent) => void) | null = null
  private connectTimer: number | null = null

  constructor(host: HTMLElement, opts: LeaderboardPanelOptions) {
    this.opts = {
      title: 'GLOBAL TOP SCORES',
      subtitle: 'PLAY TO WIN SATS',
      ...opts,
    }
    this.currentRelays = [...opts.relays]
    this.profileCache = opts.profileCache ?? new ProfileCache()
    this.topN = opts.topN ?? 10

    this.root = document.createElement('aside')
    this.root.className = 'leaderboard'
    this.root.setAttribute('aria-label', 'Leaderboard')
    this.root.innerHTML = `
      <div class="lb-frame">
        <header class="lb-head">
          <div class="lb-title-row">
            <span class="lb-bars"><i></i><i></i><i></i></span>
            <h2 class="lb-title">${escapeHtml(this.opts.title)}</h2>
          </div>
          <div class="lb-sub-row">
            <span class="lb-subtitle">${escapeHtml(this.opts.subtitle)}</span>
            <span class="lb-status" data-state="reconnecting"><span class="lb-status-dot"></span><span class="lb-status-text">SYNC</span></span>
            <span class="lb-period-toggle">
              <button class="lb-period-btn lb-period-active" data-period="today" aria-pressed="true">TODAY</button>
              <span class="lb-period-sep">|</span>
              <button class="lb-period-btn" data-period="all" aria-pressed="false">ALL TIME</button>
            </span>
          </div>
        </header>
        <ol class="lb-list"></ol>
      </div>
    `
    host.appendChild(this.root)
    this.listEl = this.root.querySelector('.lb-list') as HTMLElement
    this.statusEl = this.root.querySelector('.lb-status') as HTMLElement
    const toggleBtns = this.root.querySelectorAll('.lb-period-btn')
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const p = (btn as HTMLElement).dataset.period as Period
        if (p) this.setPeriod(p)
      })
    })
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') {
        this.setPeriod(this.period === 'today' ? 'all' : 'today')
      }
    }
    document.addEventListener('keydown', this.keyHandler)
  }

  /** Switch the board to a new game: cache-first paint, then live subscribe.
   *  `scoring` describes how to read + rank this game's scores (kind / field /
   *  direction); omit for the kind-30762 `score`, higher-wins default. */
  show(gameId: string, scoring?: ScoreScoring): void {
    if (gameId === this.currentGameId) return
    this.teardownSubscriptions()
    this.currentGameId = gameId
    this.scoring = scoring
    // Reset to Today on each game switch so users always land on the most relevant view.
    if (this.period !== 'today') {
      this.period = 'today'
      this.syncPeriodButtons()
    }
    this.periodPinned = false
    this.autoFellBack = false
    this.gotLive = false
    this.profiles.clear()

    // 1. Cache-first: instant board, no empty flash.
    this.rawEntries = readCachedBoard(gameId)
    this.entries = boardFor(this.rawEntries, this.period, this.topN, Math.floor(Date.now() / 1000), this.boardDir())
    this.applyAutoPeriod()
    this.render()
    this.setStatus('reconnecting')

    // 2. Live scores.
    // Pass an onStatus hook so the provider can drive the indicator when sockets
    // reconnect even if no new scores arrive (fixes the LIVE indicator staying
    // after a relay drop).
    const provider = this.opts.makeProvider(this.currentRelays, (s) => {
      if (gameId !== this.currentGameId) return
      if (s === 'up' && this.gotLive) this.setStatus('live')
      if (s === 'down') this.setStatus('reconnecting')
    })
    this.unsubscribeScores = provider.subscribe(gameId, raw => {
      if (gameId !== this.currentGameId) return
      this.gotLive = true
      this.rawEntries = raw
      this.entries = boardFor(raw, this.period, this.topN, Math.floor(Date.now() / 1000), this.boardDir())
      this.applyAutoPeriod()
      this.setStatus('live')
      writeCachedBoard(gameId, raw)
      this.render()
      this.resolveVisibleProfiles()
    }, this.scoring)

    // Fallback: if no live update lands shortly, drop the dot to "reconnecting"
    // so the indicator is honest rather than implying a healthy link.
    this.connectTimer = window.setTimeout(() => {
      if (!this.gotLive) this.setStatus('reconnecting')
    }, 4000)

    // 3. Resolve names for whatever we already have (cache) immediately.
    this.resolveVisibleProfiles()
  }

  /**
   * Switch to a new relay set (called by the relay admin panel on changes).
   * Tears down and re-subscribes so the live feed uses the new set immediately.
   */
  setRelays(relays: string[]): void {
    this.currentRelays = [...relays]
    if (this.currentGameId) {
      // Force a re-subscribe by resetting currentGameId first; keep the scoring.
      const gameId = this.currentGameId
      const scoring = this.scoring
      this.currentGameId = null
      this.show(gameId, scoring)
    }
  }

  /** Tear everything down (call on teardown / app exit). */
  destroy(): void {
    this.teardownSubscriptions()
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler)
    this.root.remove()
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Ranking direction for the current game (default higher-wins). */
  private boardDir(): 'asc' | 'desc' {
    return this.scoring?.dir ?? 'desc'
  }

  private teardownSubscriptions(): void {
    this.unsubscribeScores?.()
    this.unsubscribeProfiles?.()
    this.unsubscribeScores = null
    this.unsubscribeProfiles = null
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  private resolveVisibleProfiles(): void {
    const resolve = this.opts.resolve ?? resolveProfiles

    // Apply already-cached profiles immediately (no network needed).
    for (const e of this.entries) {
      const cached = this.profileCache.get(e.pubkey)
      if (cached && !this.profiles.has(e.pubkey)) {
        this.profiles.set(e.pubkey, cached)
      }
    }

    // Only fetch pubkeys not already in the local session map.
    const unfetched = this.entries.map(e => e.pubkey).filter(pk => !this.profiles.has(pk))
    if (unfetched.length > 0) this.render() // paint cached names immediately before network
    if (unfetched.length === 0) return

    this.unsubscribeProfiles?.()
    // Capture the gameId at subscription time so stale callbacks from a previous
    // game's resolution are silently dropped on rapid navigation.
    const guardGameId = this.currentGameId
    this.unsubscribeProfiles = resolve(this.currentRelays, unfetched, (pubkey, profile) => {
      // Guard: ignore if the user has navigated away since this subscription started.
      if (guardGameId !== this.currentGameId) return
      // Persist to 24h cache for future sessions.
      this.profileCache.set(pubkey, profile)
      this.profiles.set(pubkey, profile)
      this.patchRow(pubkey, profile)
    })
  }

  private setStatus(state: ConnState): void {
    this.statusEl.dataset.state = state
    const text = this.statusEl.querySelector('.lb-status-text') as HTMLElement
    text.textContent = state === 'live' ? 'LIVE' : 'SYNC'
  }

  private setPeriod(p: Period): void {
    if (p === this.period) return
    // An explicit player choice always wins over the empty-Today auto-fallback.
    this.periodPinned = true
    this.autoFellBack = false
    this.period = p
    this.syncPeriodButtons()
    this.entries = boardFor(this.rawEntries, this.period, this.topN, Math.floor(Date.now() / 1000), this.boardDir())
    this.render()
    this.resolveVisibleProfiles()
  }

  private syncPeriodButtons(): void {
    this.root.querySelectorAll('.lb-period-btn').forEach(btn => {
      const el = btn as HTMLElement
      const active = el.dataset.period === this.period
      el.classList.toggle('lb-period-active', active)
      el.setAttribute('aria-pressed', String(active))
    })
  }

  /**
   * Keep the board alive at a fresh booth: with no scores today and no explicit
   * player choice, show All Time rather than an empty panel — and snap back to
   * Today the moment a today score lands.
   */
  private applyAutoPeriod(): void {
    if (this.periodPinned) return
    const now = Math.floor(Date.now() / 1000)
    if (this.autoFellBack && this.period === 'all') {
      // Snap back when a today score lands — or when live data withdraws the
      // all-time history that justified the fallback in the first place.
      const today = boardFor(this.rawEntries, 'today', this.topN, now, this.boardDir())
      if (today.length > 0 || this.entries.length === 0) {
        this.period = 'today'
        this.autoFellBack = false
        this.entries = today
        this.syncPeriodButtons()
      }
      return
    }
    if (this.period === 'today' && this.entries.length === 0) {
      const allTime = boardFor(this.rawEntries, 'all', this.topN, now, this.boardDir())
      if (allTime.length > 0) {
        this.period = 'all'
        this.autoFellBack = true
        this.entries = allTime
        this.syncPeriodButtons()
      }
    }
  }

  /** Live-patch a single row's name/picture once its profile resolves. */
  private patchRow(pubkey: string, profile: Profile): void {
    const row = this.listEl.querySelector(`[data-pubkey="${pubkey}"]`)
    if (!row) return
    const nameEl = row.querySelector('.lb-name') as HTMLElement | null
    if (nameEl && profile.name) {
      nameEl.textContent = profile.name
      nameEl.classList.remove('lb-name-npub')
    }
    if (profile.picture) {
      const av = row.querySelector('.lb-avatar') as HTMLElement | null
      if (av && !av.querySelector('img')) {
        const img = document.createElement('img')
        img.className = 'lb-avatar-img'
        img.src = profile.picture
        img.alt = ''
        img.loading = 'lazy'
        img.addEventListener('error', () => img.remove()) // fall back to gradient
        av.appendChild(img)
      }
    }
  }

  private render(): void {
    if (this.entries.length === 0) {
      this.renderEmpty()
      return
    }
    const frag = document.createDocumentFragment()
    this.entries.forEach((e, i) => frag.appendChild(this.renderRow(e, i)))
    if (this.autoFellBack) {
      const nudge = document.createElement('li')
      nudge.className = 'lb-nudge'
      nudge.innerHTML = `<span class="lb-nudge-star">★</span> TODAY IS WIDE OPEN — BE THE FIRST`
      frag.appendChild(nudge)
    }
    this.listEl.replaceChildren(frag)
  }

  private renderRow(e: LeaderboardEntry, index: number): HTMLElement {
    const rank = index + 1
    const li = document.createElement('li')
    li.className = 'lb-row' + (rank <= 3 ? ` lb-row-medal lb-row-r${rank}` : '')
    li.dataset.pubkey = e.pubkey

    const resolved = this.profiles.get(e.pubkey)
    const displayName = resolved?.name ?? e.name
    const label = displayName ?? shortenNpub(e.pubkey)
    const isNpub = !displayName

    const sats = e.sats && e.sats > 0 ? `<span class="lb-sats"><span class="lb-sats-bolt">⚡</span>${formatSats(e.sats)}</span>` : ''

    li.innerHTML = `
      <span class="lb-rank">${String(rank).padStart(2, '0')}</span>
      <span class="lb-avatar" style="background:${avatarCss(e.pubkey)}"></span>
      <span class="lb-ident">
        <span class="lb-name${isNpub ? ' lb-name-npub' : ''}">${escapeHtml(label)}</span>
        ${sats}
      </span>
      <span class="lb-score">${formatScore(e.score)}</span>
    `

    // Use the resolved profile picture first, then fall back to the entry-level
    // picture (populated from kind-0 resolution or pre-filled by mock data).
    const picture = resolved?.picture ?? e.picture
    if (picture) {
      const av = li.querySelector('.lb-avatar') as HTMLElement
      const img = document.createElement('img')
      img.className = 'lb-avatar-img'
      img.src = picture
      img.alt = ''
      img.loading = 'lazy'
      img.addEventListener('error', () => img.remove())
      av.appendChild(img)
    }
    return li
  }

  private renderEmpty(): void {
    const li = document.createElement('li')
    li.className = 'lb-empty'
    if (this.period === 'today') {
      li.innerHTML = `
        <span class="lb-empty-mark">★</span>
        <span class="lb-empty-head">NO SCORES YET TODAY</span>
        <span class="lb-empty-sub">BE THE FIRST</span>
      `
    } else {
      li.innerHTML = `
        <span class="lb-empty-mark">★</span>
        <span class="lb-empty-head">BE THE FIRST</span>
        <span class="lb-empty-sub">PLAY TO CLAIM THE TOP SPOT</span>
      `
    }
    this.listEl.replaceChildren(li)
  }
}

/** A live board fed from an explicit list of entries (browser/mock mode). */
function staticProvider(boardFor: (gameId: string) => LeaderboardEntry[]): LeaderboardProvider {
  return {
    subscribe(gameId, onUpdate) {
      // Emit on the next tick so the cache-first paint happens first, mirroring
      // the async arrival of real relay data.
      const t = setTimeout(() => onUpdate(boardFor(gameId)), 60)
      return () => clearTimeout(t)
    },
  }
}

/**
 * Build and mount the leaderboard panel for the current environment, returning
 * a `(gameId) => void` to drive from the carousel's `onChange` (or `null` when
 * the configured provider is `none`, so the caller can skip wiring entirely).
 *
 * Also returns the `LeaderboardPanel` instance itself so the relay admin panel
 * can call `setRelays()` to re-subscribe without needing a full remount.
 *
 * - Electron + gamestr → real relay sockets + live kind-0 resolution.
 * - Browser preview     → deterministic mock board, no real network, so the
 *                         panel is fully populated and offline for screenshots.
 */
export function mountLeaderboard(
  host: HTMLElement,
  config: ArcadeConfig,
  inElectron: boolean,
): { show: (gameId: string, scoring?: ScoreScoring) => void; panel: LeaderboardPanel | null } {
  if (config.leaderboard.provider === 'none') return { show: () => {}, panel: null }
  const { relays, topN } = config.leaderboard

  if (!inElectron) {
    // Lazy-load mock data so it is tree-shaken out of the Electron bundle.
    let boards: ((gameId: string) => LeaderboardEntry[]) | null = null
    const ready = import('../mock-leaderboard').then(m => {
      boards = m.mockBoardFor
    })
    const panel = new LeaderboardPanel(host, {
      relays,
      makeProvider: () => staticProvider(gameId => (boards ? boards(gameId) : [])),
      resolve: () => () => {}, // names are pre-filled in the mock; no relay calls
    })
    let pending: { gameId: string; scoring?: ScoreScoring } | null = null
    void ready.then(() => {
      if (pending) panel.show(pending.gameId, pending.scoring)
    })
    return {
      show: (gameId, scoring) => {
        pending = { gameId, scoring }
        if (boards) panel.show(gameId, scoring)
      },
      panel,
    }
  }

  let catalogue: GamestrCatalogue | null = null
  let relayKey = ''
  let statusSink: ((state: 'up' | 'down') => void) | undefined
  const sharedProvider = (activeRelays: string[], onStatus?: (state: 'up' | 'down') => void): GamestrCatalogue => {
    statusSink = onStatus
    const nextKey = JSON.stringify(activeRelays)
    if (!catalogue || nextKey !== relayKey) {
      catalogue?.dispose()
      relayKey = nextKey
      catalogue = createGamestrCatalogue(activeRelays, {
        onStatus: state => statusSink?.(state),
      })
    }
    return catalogue
  }

  const panel = new LeaderboardPanel(host, {
    relays,
    topN,
    makeProvider: sharedProvider,
    resolve: resolveProfiles,
  })
  window.addEventListener('beforeunload', () => catalogue?.dispose(), { once: true })
  return { show: (gameId, scoring) => panel.show(gameId, scoring), panel }
}
