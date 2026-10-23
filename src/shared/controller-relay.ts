/**
 * The controller relay the arcade pairs phones through. The Joystick SDK has no
 * default relay, so the arcade names its own explicitly: `controllerRelay` in
 * `arcade.config.json`, falling back to the owner's hosted relay.
 */
export const DEFAULT_CONTROLLER_RELAY = 'wss://controller.pallasite.app/'

/** A usable relay URL: ws or wss, with no credentials, query or fragment. Anything else gives the default. */
export function parseControllerRelay(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_CONTROLLER_RELAY
  try {
    const url = new URL(raw.trim())
    if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return DEFAULT_CONTROLLER_RELAY
    return url.href
  } catch {
    return DEFAULT_CONTROLLER_RELAY
  }
}
