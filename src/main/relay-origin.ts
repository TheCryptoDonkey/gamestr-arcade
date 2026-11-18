/**
 * The owner's hosted relay accepts game screens (the host role) only from the
 * owner's own sites, judged by the Origin header. The Electron shell loads from a
 * file, which sends no usable Origin, so the trusted shell's host WebSocket
 * handshakes to the production relay carry the arcade's own web origin instead. A
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

interface RelayRequest {
  url: string
  resourceType: string
  webContentsId?: number
  requestHeaders: Record<string, string>
}

/** Only the trusted shell's host handshake may present the arcade origin. */
export function controllerRelayHeaders(details: RelayRequest, shellId: number | undefined): Record<string, string> {
  if (shellId === undefined || details.webContentsId !== shellId || details.resourceType !== 'webSocket') return details.requestHeaders
  let url: URL
  try { url = new URL(details.url) } catch { return details.requestHeaders }
  if (!productionRelayPattern(url.href) || url.searchParams.get('r') !== 'host') return details.requestHeaders
  // Header names are case insensitive: replace any existing spelling rather
  // than sending two different Origin fields to the relay.
  return { ...Object.fromEntries(Object.entries(details.requestHeaders).filter(([name]) => name.toLowerCase() !== 'origin')), Origin: ARCADE_RELAY_ORIGIN }
}
