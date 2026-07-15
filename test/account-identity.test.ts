// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { accountIdentity } from '../src/web/account-identity'

const PUBKEY = 'a'.repeat(64)

describe('web account identity', () => {
  it('shows kind 0 image, name, and NIP-05 without exposing the npub', () => {
    const control = accountIdentity({
      pubkey: PUBKEY,
      profile: { name: 'Alice', nip05: 'alice@example.com', picture: 'https://example.com/alice.webp' },
      open: false,
      busy: false,
      onToggle: vi.fn(),
      onProfile: vi.fn(),
      onLogout: vi.fn(),
    })

    expect(control.querySelector<HTMLImageElement>('.identity-avatar img')?.src).toBe('https://example.com/alice.webp')
    expect(control.querySelector('.identity-copy strong')?.textContent).toBe('Alice')
    expect(control.querySelector('.identity-copy small')?.textContent).toBe('alice@example.com')
    expect(control.textContent).not.toContain('npub')
  })

  it('opens profile and logout actions from the name control', () => {
    const onToggle = vi.fn()
    const onProfile = vi.fn()
    const onLogout = vi.fn()
    const control = accountIdentity({
      pubkey: PUBKEY,
      profile: { name: 'Alice' },
      open: true,
      busy: false,
      onToggle,
      onProfile,
      onLogout,
    })

    control.querySelector<HTMLButtonElement>('.identity-trigger')?.click()
    control.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[0]?.click()
    control.querySelector<HTMLButtonElement>('.logout-button')?.click()

    expect(onToggle).toHaveBeenCalledOnce()
    expect(onProfile).toHaveBeenCalledOnce()
    expect(onLogout).toHaveBeenCalledOnce()
  })
})
