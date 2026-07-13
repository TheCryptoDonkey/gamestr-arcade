import process from 'node:process'
import http from 'node:http'
import { getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { getConversationKey, encrypt, decrypt } from 'nostr-tools/nip44'
import { Relay } from 'nostr-tools/relay'
import WebSocket from 'ws'
import {
  JsonStateStore, PaymentAuthority, RESPONSE_KIND, positiveInt, requiredHex, validateRequestEvent,
} from './gateway.mjs'

globalThis.WebSocket = WebSocket
const hexBytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'))
const bridgeSecret = hexBytes(requiredHex('BRIDGE_SECRET', process.env.BRIDGE_SECRET))
const clientPubkey = getPublicKey(hexBytes(requiredHex('CLIENT_SECRET', process.env.CLIENT_SECRET)))
const bridgePubkey = getPublicKey(bridgeSecret)
const relayUrl = new URL(process.env.RELAY ?? '')
if (relayUrl.protocol !== 'wss:') throw new Error('RELAY must use wss')
const phoenixdUrl = new URL(process.env.PHOENIXD_URL ?? 'http://phoenixd:9740')
const phoenixdPassword = process.env.PHOENIXD_PASSWORD
if (!phoenixdPassword) throw new Error('PHOENIXD_PASSWORD is required')

async function phoenixd(method, path, body) {
  const headers = { Authorization: `Basic ${Buffer.from(`:${phoenixdPassword}`).toString('base64')}` }
  const options = { method, headers, signal: AbortSignal.timeout(30_000) }
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    options.body = new URLSearchParams(body).toString()
  }
  const response = await fetch(new URL(path, phoenixdUrl), options)
  if (!response.ok) throw new Error(`phoenixd request failed (${response.status})`)
  return response.json()
}

const authority = new PaymentAuthority({
  phoenixd,
  store: new JsonStateStore(process.env.STATE_PATH ?? '/data/state.json'),
  maxPaymentSats: positiveInt('MAX_PAYMENT_SATS', process.env.MAX_PAYMENT_SATS, 100, 100_000),
  dailyBudgetSats: positiveInt('DAILY_BUDGET_SATS', process.env.DAILY_BUDGET_SATS, 5_000, 1_000_000),
  maxPaymentsPerMinute: positiveInt('MAX_PAYMENTS_PER_MINUTE', process.env.MAX_PAYMENTS_PER_MINUTE, 5, 60),
})

let relayReady = false
const healthServer = http.createServer(async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/healthz') {
    response.writeHead(404).end()
    return
  }
  try {
    if (!relayReady) throw new Error('relay unavailable')
    await phoenixd('GET', '/getbalance')
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end('{"status":"ok"}\n')
  } catch {
    response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end('{"status":"unavailable"}\n')
  }
})
healthServer.listen(8080, '127.0.0.1')

function decryptRequest(event) {
  const key = getConversationKey(bridgeSecret, event.pubkey)
  return JSON.parse(decrypt(event.content, key))
}

function responseEvent(request, resultType, result, error) {
  const key = getConversationKey(bridgeSecret, request.pubkey)
  const payload = error
    ? { result_type: resultType, error: { code: 'RESTRICTED', message: error } }
    : { result_type: resultType, result }
  return finalizeEvent({
    kind: RESPONSE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', request.pubkey], ['e', request.id]],
    content: encrypt(JSON.stringify(payload), key),
  }, bridgeSecret)
}

async function run() {
  const relay = await Relay.connect(relayUrl.toString())
  relayReady = true
  console.log(JSON.stringify({ event: 'ready', relay: relayUrl.origin, bridgePubkey, clientPubkey }))
  let queue = Promise.resolve()
  const sub = relay.subscribe([{ kinds: [23194], '#p': [bridgePubkey], since: Math.floor(Date.now() / 1000) - 10 }], {
    onevent(event) {
      queue = queue.then(async () => {
        let request
        try {
          validateRequestEvent(event, { bridgePubkey, clientPubkey, nowSeconds: Math.floor(Date.now() / 1000), verify: verifyEvent })
          request = decryptRequest(event)
          const result = await authority.handle(request)
          await relay.publish(responseEvent(event, request.method, result))
          console.log(JSON.stringify({ event: 'request_complete', method: request.method }))
        } catch (cause) {
          console.warn(JSON.stringify({ event: 'request_rejected', reason: cause.message }))
          if (request && event.pubkey === clientPubkey && verifyEvent(event)) {
            await relay.publish(responseEvent(event, request.method, null, cause.message)).catch(() => undefined)
          }
        }
      }).catch(cause => console.error(JSON.stringify({ event: 'handler_error', reason: cause.message })))
    },
  })
  const shutdown = () => { relayReady = false; sub.close(); relay.close(); healthServer.close(() => process.exit(0)) }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  relay.onclose = () => { relayReady = false; process.exit(1) }
}

run().catch(cause => { console.error(JSON.stringify({ event: 'fatal', reason: cause.message })); process.exit(1) })
