// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { createNostrGameLaunch, installNostrGameBridge, openNostrGame, revokeNostrGameBridges, GAME_AUTH_PROTOCOL } from '../src/web/game-auth-handoff'

const key = new Uint8Array(32).fill(7)
let sign = vi.fn(async (template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(template, key))
installNostrGameBridge(() => ({ signEvent: template => sign(template) }))
function connect() {
  const now = Math.floor(Date.now() / 1000)
  const proof = finalizeEvent({ kind: 21236, created_at: now, tags: [['origin', window.location.origin], ['app', 'Arcade']], content: '' }, key)
  const child = { location: { replace: vi.fn() } } as unknown as Window
  vi.spyOn(window, 'open').mockReturnValue(child)
  const launch = createNostrGameLaunch({ gameId: 'testgame', targetUrl: 'https://game.example/', sourceOrigin: window.location.origin, sourceApp: 'Arcade', session: { pubkey: getPublicKey(key), canSignEvents: true, authEvent: proof }, signKinds: [30762, 27235] })!
  openNostrGame(launch)
  const port = { onmessage: null as ((event: MessageEvent) => Promise<void>) | null, postMessage: vi.fn(), start: vi.fn(), close: vi.fn() }
  window.dispatchEvent(new MessageEvent('message', { origin: launch.targetOrigin, source: child, ports: [port as unknown as MessagePort], data: { protocol: GAME_AUTH_PROTOCOL, type: 'connect', channel: launch.channel } }))
  const request = (content = '') => ({ data: { protocol: GAME_AUTH_PROTOCOL, type: 'sign', id: 'test', event: { kind: 30762, created_at: now, content, tags: [['game', 'testgame'], ['score', '10']] } } }) as MessageEvent
  return { port, request }
}

describe('game capability revocation', () => {
  beforeEach(() => { revokeNostrGameBridges(); sign = vi.fn(async template => finalizeEvent(template, key)) })
  afterEach(() => { revokeNostrGameBridges(); vi.restoreAllMocks() })
  it('closes established ports and never reactivates them after a new launch', async () => {
    const { port, request } = connect()
    expect(port.onmessage).not.toBeNull()
    await port.onmessage!(request())
    expect(sign).toHaveBeenCalledTimes(1)
    revokeNostrGameBridges()
    expect(port.onmessage).toBeNull()
    expect(port.close).toHaveBeenCalled()
    const newPort = connect()
    await newPort.port.onmessage!(newPort.request())
    expect(sign).toHaveBeenCalledTimes(2)
    expect(port.onmessage).toBeNull()
  })
  it('does not deliver an in-flight signature after revocation', async () => {
    let resolve!: (value: ReturnType<typeof finalizeEvent>) => void
    sign.mockImplementation(() => new Promise(done => { resolve = done }))
    const { port, request } = connect()
    const signing = port.onmessage!(request())
    revokeNostrGameBridges()
    resolve(finalizeEvent(request().data.event, key))
    await signing
    expect(port.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
  })
  it('rejects unrelated kinds, game claims and concurrent approvals before signing', async () => {
    const { port, request } = connect()
    const wrong = request(); wrong.data.event.kind = 3
    await port.onmessage!(wrong)
    expect(sign).not.toHaveBeenCalled()
    const wrongGame = request(); wrongGame.data.event.tags[0][1] = 'another-game'
    await port.onmessage!(wrongGame)
    expect(sign).not.toHaveBeenCalled()
    let resolve!: (value: ReturnType<typeof finalizeEvent>) => void
    sign.mockImplementation(() => new Promise(done => { resolve = done }))
    const first = port.onmessage!(request())
    await port.onmessage!(request())
    expect(sign).toHaveBeenCalledTimes(1)
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ error: 'signing-in-progress' }))
    resolve(finalizeEvent(request().data.event, key)); await first
  })
})
