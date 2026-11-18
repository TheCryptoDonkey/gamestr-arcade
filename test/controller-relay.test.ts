import { describe, it, expect } from 'vitest'
import { DEFAULT_CONTROLLER_RELAY, parseControllerRelay } from '../src/shared/controller-relay'
import { ARCADE_RELAY_ORIGIN, controllerRelayHeaders, productionRelayPattern } from '../src/main/relay-origin'
import { parseConfig } from '../src/main/config'

describe('controller relay', () => {
  it('is named explicitly, defaulting to the hosted relay', () => {
    expect(DEFAULT_CONTROLLER_RELAY).toBe('wss://controller.pallasite.app/')
    expect(parseConfig({}).controllerRelay).toBe(DEFAULT_CONTROLLER_RELAY)
    expect(parseConfig({ controllerRelay: 'wss://relay.example.test/' }).controllerRelay).toBe('wss://relay.example.test/')
  })
  it('refuses anything that is not a plain ws or wss URL', () => {
    for (const bad of ['https://relay.example.test/', 'wss://user:secret@relay.example.test/', 'wss://relay.example.test/?x=1', 'wss://relay.example.test/#x', '', 'nonsense', 5, null]) {
      expect(parseControllerRelay(bad)).toBe(DEFAULT_CONTROLLER_RELAY)
    }
    expect(parseControllerRelay('ws://127.0.0.1:8788/')).toBe('ws://127.0.0.1:8788/')
  })
  it('shows its web origin only to the production relay', () => {
    expect(ARCADE_RELAY_ORIGIN).toBe('https://arcade.600.wtf')
    expect(productionRelayPattern('wss://controller.pallasite.app/')).toBe('wss://controller.pallasite.app/*')
    expect(productionRelayPattern('wss://controller.forgesworn.dev/')).toBe('wss://controller.forgesworn.dev/*')
    for (const other of ['wss://relay.example.test/', 'ws://controller.pallasite.app/', 'wss://controller.pallasite.app:8443/', 'wss://main.relay.gamestr.io/', 'ws://127.0.0.1:8788/', '', 'nonsense']) {
      expect(productionRelayPattern(other)).toBeNull()
    }
  })
  it('rewrites only the trusted shell host WebSocket and preserves other headers', () => {
    const request = { url: 'wss://controller.pallasite.app/?s=ABCDEF&r=host&v=2', resourceType: 'webSocket', webContentsId: 7, requestHeaders: { origin: 'file://', 'Sec-WebSocket-Version': '13' } }
    expect(controllerRelayHeaders(request, 7)).toEqual({ Origin: ARCADE_RELAY_ORIGIN, 'Sec-WebSocket-Version': '13' })
    expect(request.requestHeaders.origin).toBe('file://')
    for (const change of [
      { webContentsId: 8 }, { webContentsId: undefined }, { resourceType: 'xhr' },
      { url: 'wss://controller.pallasite.app/?r=phone' },
      { url: 'wss://controller.pallasite.app/?r=peer' },
      { url: 'wss://controller.pallasite.app/' },
      { url: 'wss://controller.pallasite.app.evil.test/?r=host' },
      { url: 'wss://controller.pallasite.app:8443/?r=host' },
      { url: 'ws://127.0.0.1:8788/?r=host' },
      { url: 'invalid' },
    ]) expect(controllerRelayHeaders({ ...request, ...change }, 7)).toBe(request.requestHeaders)
    expect(controllerRelayHeaders(request, undefined)).toBe(request.requestHeaders)
  })
})
