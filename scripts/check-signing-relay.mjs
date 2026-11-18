// Live transport acceptance, separate from local protocol fixtures. No user key.
import { SimplePool } from 'nostr-tools/pool'
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { getConversationKey, encrypt, decrypt } from 'nostr-tools/nip44'
import { writeFile } from 'node:fs/promises'

const relay = process.argv[2]
if (!relay || new URL(relay).protocol !== 'wss:') throw new Error('Pass the intended wss:// signing relay')
const key = generateSecretKey(), peerKey = generateSecretKey(), pubkey = getPublicKey(key), peer = getPublicKey(peerKey)
const pool = new SimplePool({ enableReconnect: false }), phone = new SimplePool({ enableReconnect: false })
pool.automaticallyAuth = () => async template => finalizeEvent(template, key)
phone.automaticallyAuth = () => async template => finalizeEvent(template, peerKey)
const id = crypto.randomUUID(), conversation = getConversationKey(key, peer)
let subscription, timer
try {
  await Promise.all([pool.ensureRelay(relay, { connectionTimeout: 8000 }), phone.ensureRelay(relay, { connectionTimeout: 8000 })])
  const received = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('No encrypted NIP-46 delivery in 12 seconds')), 12000)
    subscription = phone.subscribeMany([relay], { kinds: [24133], '#p': [peer], since: Math.floor(Date.now() / 1000) - 2 }, {
      onevent: event => { try { const message = JSON.parse(decrypt(event.content, getConversationKey(peerKey, pubkey))); if (event.pubkey === pubkey && message.id === id) resolve(message) } catch {} },
    })
  })
  // A publish refusal must not leave an unobserved receive timeout.
  received.catch(() => {})
  const event = finalizeEvent({ kind: 24133, created_at: Math.floor(Date.now() / 1000), tags: [['p', peer], ['expiration', String(Math.floor(Date.now() / 1000) + 120)]], content: encrypt(JSON.stringify({ id, method: 'ping', params: [] }), conversation) }, key)
  await Promise.all([Promise.any(pool.publish([relay], event, { maxWait: 8000 })), received])
  const report = { at: new Date().toISOString(), relay, boundary: 'Real relay NIP-46/NIP-44 delivery between two disposable connection keys and sockets; no user identity or signer app', delivered: true }
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { clearTimeout(timer); subscription?.close(); pool.destroy(); phone.destroy(); key.fill(0); peerKey.fill(0) }
