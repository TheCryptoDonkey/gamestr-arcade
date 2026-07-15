import { avatarCss, type Profile } from '../renderer/src/leaderboard/profiles'

export interface AccountIdentityOptions {
  pubkey: string
  profile?: Profile
  open: boolean
  busy: boolean
  onToggle(): void
  onProfile(): void
  onLogout(): void
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function accountIdentity(options: AccountIdentityOptions): HTMLElement {
  const name = options.profile?.name || options.profile?.nip05?.split('@')[0] || 'NOSTR PROFILE'
  const wrapper = element('div', 'identity-menu')
  const trigger = element('button', 'identity-button identity-trigger')
  trigger.type = 'button'
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', String(options.open))
  trigger.setAttribute('aria-label', `${options.open ? 'Close' : 'Open'} account menu for ${name}`)
  trigger.addEventListener('click', options.onToggle)

  const avatar = element('span', 'identity-avatar')
  avatar.style.background = avatarCss(options.pubkey)
  if (options.profile?.picture) {
    const image = element('img')
    image.src = options.profile.picture
    image.alt = ''
    image.referrerPolicy = 'no-referrer'
    avatar.replaceChildren(image)
  }

  const copy = element('span', 'identity-copy')
  copy.append(element('strong', '', name))
  if (options.profile?.nip05) copy.append(element('small', '', options.profile.nip05))
  trigger.append(avatar, copy, element('span', 'identity-chevron', options.open ? '▲' : '▼'))
  wrapper.append(trigger)

  if (options.open) {
    const menu = element('div', 'identity-dropdown')
    menu.setAttribute('role', 'menu')
    const profile = element('button', '', 'VIEW PROFILE')
    profile.type = 'button'
    profile.setAttribute('role', 'menuitem')
    profile.addEventListener('click', options.onProfile)
    const logout = element('button', 'logout-button', options.busy ? 'LOGGING OUT...' : 'LOG OUT')
    logout.type = 'button'
    logout.setAttribute('role', 'menuitem')
    logout.disabled = options.busy
    logout.addEventListener('click', options.onLogout)
    menu.append(profile, logout)
    wrapper.append(menu)
  }

  return wrapper
}
