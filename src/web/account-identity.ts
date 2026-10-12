import { avatarCss, type Profile } from '../renderer/src/leaderboard/profiles'

export interface AccountIdentityOptions {
  pubkey: string
  profile?: Profile
  open: boolean
  busy: boolean
  signerStatus?: string
  onReconnect?(): void
  onSyncPreferences?(): void
  onImportDevicePreferences?(): void
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
  trigger.type = 'button'; trigger.id = 'account-menu-trigger'
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
  if (options.signerStatus) copy.append(element('small', 'signer-status', options.signerStatus))
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
    menu.append(profile)
    if (options.signerStatus) {
      menu.append(element('p', 'signer-status', options.signerStatus))
      if (options.onReconnect) {
        const reconnect = element('button', '', 'RECONNECT SIGNER'); reconnect.type = 'button'; reconnect.setAttribute('role', 'menuitem'); reconnect.disabled = options.busy
        reconnect.addEventListener('click', options.onReconnect); menu.append(reconnect)
      }
    }
    if (options.onSyncPreferences) {
      const sync = element('button', '', 'SYNC ARCADE PREFERENCES'); sync.id = 'account-sync-preferences'; sync.type = 'button'; sync.setAttribute('role', 'menuitem'); sync.addEventListener('click', options.onSyncPreferences); menu.append(sync)
    }
    if (options.onImportDevicePreferences) {
      const copy = element('button', '', 'IMPORT DEVICE PREFERENCES'); copy.id = 'account-import-preferences'; copy.type = 'button'; copy.setAttribute('role', 'menuitem'); copy.addEventListener('click', options.onImportDevicePreferences); menu.append(copy)
    }
    menu.append(logout)
    wrapper.append(menu)
  }

  return wrapper
}
