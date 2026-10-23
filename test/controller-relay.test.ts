import { describe, it, expect } from 'vitest'
import { DEFAULT_CONTROLLER_RELAY, parseControllerRelay } from '../src/shared/controller-relay'
import { ARCADE_RELAY_ORIGIN, productionRelayPattern } from '../src/main/relay-origin'
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
})
