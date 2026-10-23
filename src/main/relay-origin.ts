/**
 * The owner's hosted relay accepts game screens (the host role) only from the
 * owner's own sites, judged by the Origin header. The Electron shell loads from a
 * file, which sends no usable Origin, so WebSockets to the production relay
 * carry the arcade's own web origin instead. Nothing else is rewritten, and a
 * relay the operator points the arcade at (their own broker) is left alone.
 */
export const ARCADE_RELAY_ORIGIN = 'https://arcade.600.wtf'

const PRODUCTION_RELAY_HOSTS = new Set(['controller.pallasite.app', 'controller.forgesworn.dev'])

/** The webRequest URL pattern for the production relay, or null when `relay` is some other broker. */
export function productionRelayPattern(relay: string): string | null {
  let url: URL
  try { url = new URL(relay) } catch { return null }
  if (url.protocol !== 'wss:' || !PRODUCTION_RELAY_HOSTS.has(url.hostname) || url.port) return null
  return `wss://${url.host}/*`
}
