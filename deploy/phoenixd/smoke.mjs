import process from 'node:process'
import { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { getConversationKey, encrypt, decrypt } from 'nostr-tools/nip44'
import { Relay } from 'nostr-tools/relay'
import WebSocket from 'ws'
import { REQUEST_KIND, RESPONSE_KIND, requiredHex } from './gateway.mjs'

globalThis.WebSocket = WebSocket
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'))
const bridgeSecret = bytes(requiredHex('BRIDGE_SECRET', process.env.BRIDGE_SECRET))
const bridgePubkey = getPublicKey(bridgeSecret)
const clientSecret = bytes(requiredHex('CLIENT_SECRET', process.env.CLIENT_SECRET))
const relay = await Relay.connect(process.env.RELAY)

function request(secret, payload = { method: 'get_info', params: {} }) {
  const pubkey = getPublicKey(secret)
  const key = getConversationKey(secret, bridgePubkey)
  return finalizeEvent({
    kind: REQUEST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', bridgePubkey]],
    content: encrypt(JSON.stringify(payload), key),
  }, secret)
}

async function expectResponse(event, secret, shouldRespond) {
  let response = null
  const sub = relay.subscribe([{ kinds: [RESPONSE_KIND], '#p': [getPublicKey(secret)], '#e': [event.id], since: event.created_at }], {
    onevent(candidate) { response = candidate },
  })
  await relay.publish(event)
  await new Promise(resolve => setTimeout(resolve, shouldRespond ? 4_000 : 2_000))
  sub.close()
  if (!shouldRespond) {
    if (response) throw new Error('gateway responded to an unauthorised client')
    return null
  }
  if (!response || !verifyEvent(response) || response.pubkey !== bridgePubkey) throw new Error('missing valid gateway response')
  const key = getConversationKey(secret, bridgePubkey)
  const payload = JSON.parse(decrypt(response.content, key))
  return payload
}

const info = await expectResponse(request(clientSecret), clientSecret, true)
if (info.error || info.result_type !== 'get_info' || !info.result?.methods?.includes('pay_invoice')) throw new Error('unexpected gateway response')
const attacker = generateSecretKey()
await expectResponse(request(attacker), attacker, false)
relay.close()
console.log(JSON.stringify({ authorizedGetInfo: 'ok', unauthorizedClient: 'rejected' }))
