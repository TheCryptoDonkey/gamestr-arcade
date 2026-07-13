import process from 'node:process'
import { getPublicKey, finalizeEvent, verifyEvent } from 'nostr-tools/pure'
import { getConversationKey, encrypt, decrypt } from 'nostr-tools/nip44'
import { Relay } from 'nostr-tools/relay'
import WebSocket from 'ws'
import { REQUEST_KIND, RESPONSE_KIND, requiredHex } from './gateway.mjs'

globalThis.WebSocket = WebSocket
const invoice = process.env.PAYMENT_INVOICE
if (!invoice) throw new Error('PAYMENT_INVOICE is required')
const expectedError = process.env.EXPECT_ERROR
const bytes = hex => Uint8Array.from(Buffer.from(hex, 'hex'))
const bridgePubkey = getPublicKey(bytes(requiredHex('BRIDGE_SECRET', process.env.BRIDGE_SECRET)))
const clientSecret = bytes(requiredHex('CLIENT_SECRET', process.env.CLIENT_SECRET))
const clientPubkey = getPublicKey(clientSecret)
const conversationKey = getConversationKey(clientSecret, bridgePubkey)
const event = finalizeEvent({
  kind: REQUEST_KIND,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['p', bridgePubkey]],
  content: encrypt(JSON.stringify({ method: 'pay_invoice', params: { invoice } }), conversationKey),
}, clientSecret)

const relay = await Relay.connect(process.env.RELAY)
let response
const sub = relay.subscribe([{ kinds: [RESPONSE_KIND], '#p': [clientPubkey], '#e': [event.id], since: event.created_at }], {
  onevent(candidate) { response = candidate },
})
await relay.publish(event)
for (let attempt = 0; attempt < 40 && !response; attempt += 1) await new Promise(resolve => setTimeout(resolve, 250))
sub.close()
relay.close()
if (!response || !verifyEvent(response) || response.pubkey !== bridgePubkey) throw new Error('missing valid gateway response')
const payload = JSON.parse(decrypt(response.content, conversationKey))
if (expectedError) {
  if (!payload.error?.message?.includes(expectedError)) throw new Error('expected payment rejection was not returned')
  console.log(JSON.stringify({ payment: 'rejected_as_expected', reason: expectedError }))
} else {
  if (payload.error || payload.result_type !== 'pay_invoice') throw new Error(payload.error?.message ?? 'unexpected payment response')
  console.log(JSON.stringify({ payment: 'paid', preimagePresent: Boolean(payload.result?.preimage) }))
}
