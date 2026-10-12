/** Restore the carousel after Chromium finishes restoring the shell view. */
export function restoreCarouselFocus(host: HTMLElement, canRestore: () => boolean): void {
  host.focus()
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('keydown', stop, true)
    window.removeEventListener('pointerdown', stop, true)
  }
  // Removing the game view can restore its predecessor's last focused button
  // after the return IPC handler. Reconcile at the next paint, unless the player
  // has already chosen another control or opened a panel/game.
  window.addEventListener('keydown', stop, true)
  window.addEventListener('pointerdown', stop, true)
  frame = requestAnimationFrame(() => {
    stop()
    const active = document.activeElement
    if (canRestore() && (active === host || (active instanceof HTMLElement &&
      host.contains(active) && active.matches('.cta')))) host.focus()
  })
}
