#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const gamesRoot = process.argv[2] ? resolve(process.argv[2]) : join(root, 'games')
const entries = await readdir(gamesRoot, { withFileTypes: true })
const manifests = []

for (const entry of entries) {
  if (!entry.isDirectory()) continue
  const path = join(gamesRoot, entry.name, 'game.json')
  try {
    manifests.push({ slug: entry.name, path, manifest: JSON.parse(await readFile(path, 'utf8')) })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const players = manifests.filter(({ manifest }) => manifest.operatorOnly !== true && manifest.downloadOnly !== true)
const controllerGames = players.filter(({ manifest }) => manifest.inputModes?.includes('gamepad'))
const names = entries => entries.map(({ manifest, slug }) => manifest.name || slug).sort().join(', ')
const blockers = []
const warnings = []

const missingControllerInput = players.filter(({ manifest }) => !manifest.inputModes?.includes('gamepad'))
if (missingControllerInput.length) {
  blockers.push(`Player title is not controller-playable: ${names(missingControllerInput)}`)
}

const missingAdapter = controllerGames.filter(({ manifest }) => !manifest.controller?.adapter)
if (missingAdapter.length) blockers.push(`Missing controller adapter: ${names(missingAdapter)}`)

const notHardwareCertified = controllerGames.filter(({ manifest }) => manifest.controller?.certification?.level !== 'hardware')
if (notHardwareCertified.length) blockers.push(`Physical booth certification required: ${names(notHardwareCertified)}`)

const missingMappingProfiles = controllerGames.filter(({ manifest }) => {
  const profiles = manifest.controller?.certification?.profiles ?? []
  return manifest.controller?.certification?.level === 'hardware'
    && (!profiles.includes('standard') || !profiles.includes('linux-hat'))
})
if (missingMappingProfiles.length) {
  blockers.push(`Both Chromium controller profiles not exercised: ${names(missingMappingProfiles)}`)
}

const missingHints = controllerGames.filter(({ manifest }) => !Array.isArray(manifest.controlHints) || manifest.controlHints.length === 0)
if (missingHints.length) blockers.push(`Missing player-facing control hints: ${names(missingHints)}`)

const paymentLab = manifests.find(({ slug }) => slug === 'payment-lab')
if (paymentLab && paymentLab.manifest.operatorOnly !== true) {
  blockers.push('Operator Payment Lab is visible to players')
}

const word5 = manifests.find(({ slug }) => slug === 'word5')
if (word5 && word5.manifest.url !== 'https://otherstuff.ai/word5/') {
  blockers.push('Word5 does not launch at its final non-redirecting origin')
}

const networkRequired = players.filter(({ manifest }) => manifest.network === 'required')
if (networkRequired.length) warnings.push(`${networkRequired.length}/${players.length} player games require conference connectivity`)

const outageFallbacks = players.filter(({ manifest }) => {
  return manifest.network === 'optional' || manifest.network === 'offline'
})
if (players.length && outageFallbacks.length === 0) {
  blockers.push('No player title declares an offline-capable conference fallback')
}

const hardwareCertified = controllerGames.length - notHardwareCertified.length
console.log(`Conference status: ${blockers.length ? 'BLOCKED' : 'READY'}`)
console.log(`Player catalogue: ${players.length} games (${controllerGames.length} controller titles)`)
console.log(`Physical controller certification: ${hardwareCertified}/${controllerGames.length}`)
for (const blocker of blockers) console.log(`BLOCKER: ${blocker}`)
for (const warning of warnings) console.log(`WARNING: ${warning}`)

if (blockers.length) process.exitCode = 1
