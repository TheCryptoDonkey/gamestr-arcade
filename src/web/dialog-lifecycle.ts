const activeDialogs = new Set<HTMLElement>()
let inertRoot: HTMLElement | null = null
let originalInert = false

/** Trap keyboard focus and clean up listeners on every way a dialog is removed. */
export function activateDialog(modal: HTMLElement): void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  if (!activeDialogs.size) {
    inertRoot = document.getElementById('app')
    originalInert = inertRoot?.inert ?? false
    if (inertRoot) inertRoot.inert = true
  }
  activeDialogs.add(modal)
  const selector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
  const onKey = (event: KeyboardEvent) => {
    // A signer picker above this form owns its keyboard interaction.
    if (document.querySelector('dialog[open]') || [...activeDialogs].at(-1) !== modal) return
    if (event.key === 'Escape') { event.preventDefault(); modal.remove(); return }
    if (event.key !== 'Tab') return
    const controls = [...modal.querySelectorAll<HTMLElement>(selector)].filter(node => !node.hidden && node.getClientRects().length)
    const first = controls[0]; const last = controls.at(-1)
    if (!first || !last) { event.preventDefault(); return }
    if (!modal.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus()
    }
  }
  window.addEventListener('keydown', onKey)
  const observer = new MutationObserver(() => {
    if (modal.isConnected) return
    window.removeEventListener('keydown', onKey)
    observer.disconnect()
    activeDialogs.delete(modal)
    if (!activeDialogs.size && inertRoot) { inertRoot.inert = originalInert; inertRoot = null }
    const replacement = previous?.id ? document.getElementById(previous.id) : undefined
    const returnTo = previous?.isConnected ? previous : replacement ?? (previous?.id.startsWith('account-') ? document.getElementById('account-menu-trigger') : undefined)
    if (returnTo && !activeDialogs.size) returnTo.focus({ preventScroll: true })
  })
  observer.observe(document.body, { childList: true })
  modal.querySelector<HTMLElement>(selector)?.focus()
}
