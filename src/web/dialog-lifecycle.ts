/** Trap keyboard focus and clean up listeners on every way a dialog is removed. */
export function activateDialog(modal: HTMLElement): void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  const selector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); modal.remove(); return }
    if (event.key !== 'Tab') return
    const controls = [...modal.querySelectorAll<HTMLElement>(selector)].filter(node => !node.hidden)
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
    if (previous?.isConnected) previous.focus({ preventScroll: true })
  })
  observer.observe(document.body, { childList: true })
  modal.querySelector<HTMLElement>(selector)?.focus()
}
