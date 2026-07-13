const status = document.querySelector('#wallet-status')
const form = document.querySelector('#payment-form')
const invoice = document.querySelector('#invoice')
const pay = document.querySelector('#pay')
const repeat = document.querySelector('#repeat')
const clear = document.querySelector('#clear')
const log = document.querySelector('#log')

let lastInvoice = ''
let sequence = 0

function record(tone, message) {
  const item = document.createElement('li')
  item.className = tone
  item.textContent = `${String(++sequence).padStart(2, '0')} · ${message}`
  log.prepend(item)
}

async function checkWallet() {
  if (!window.webln) {
    status.value = 'Unavailable — booth wallet is not configured or this capability was denied.'
    status.className = 'status error'
    pay.disabled = true
    repeat.disabled = true
    return
  }
  try {
    await window.webln.enable()
    const info = await window.webln.getInfo()
    status.value = `Ready — ${info.methods.join(', ')}`
    status.className = 'status success'
  } catch {
    status.value = 'Unavailable — WebLN initialization failed.'
    status.className = 'status error'
  }
}

async function send(raw) {
  const bolt11 = raw.trim()
  if (!bolt11) return record('error', 'No invoice supplied.')
  pay.disabled = true
  repeat.disabled = true
  record('pending', `Submitting ${bolt11.slice(0, 18)}…`)
  try {
    const result = await window.webln.sendPayment(bolt11)
    lastInvoice = bolt11
    const receipt = result?.preimage ? `${result.preimage.slice(0, 16)}…` : 'wallet acknowledged'
    record('success', `Payment accepted: ${receipt}`)
  } catch (error) {
    record('error', error instanceof Error ? error.message : 'Payment refused.')
  } finally {
    pay.disabled = false
    repeat.disabled = !lastInvoice
  }
}

form.addEventListener('submit', event => {
  event.preventDefault()
  void send(invoice.value)
})
repeat.addEventListener('click', () => void send(lastInvoice))
clear.addEventListener('click', () => { log.replaceChildren(); sequence = 0 })
void checkWallet()
