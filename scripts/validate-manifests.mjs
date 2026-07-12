#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const root = resolve(import.meta.dirname, '..')
const schemaPath = join(root, 'schemas', 'game-manifest-v2.schema.json')
const roots = process.argv.slice(2).map(path => resolve(path))
if (!roots.length) roots.push(join(root, 'games'), join(root, 'examples', 'games'))

const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
addFormats(ajv)
const validate = ajv.compile(schema)

let checked = 0
const failures = []

for (const gamesRoot of roots) {
  let entries = []
  try {
    entries = await readdir(gamesRoot, { withFileTypes: true })
  } catch (error) {
    failures.push(`${gamesRoot}: ${error.message}`)
    continue
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(gamesRoot, entry.name, 'game.json')
    let manifest
    try {
      manifest = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') continue
      failures.push(`${path}: ${error.message}`)
      continue
    }

    // The runtime remains backwards compatible; schema enforcement starts only
    // when a manifest explicitly opts into the v2 contract.
    if (manifest.manifestVersion !== 2) continue
    checked += 1
    if (!validate(manifest)) {
      for (const issue of validate.errors ?? []) {
        failures.push(`${path}${issue.instancePath || '/'} ${issue.message}`)
      }
    }
  }
}

if (failures.length) {
  console.error(`Manifest validation failed:\n${failures.map(line => `  - ${line}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Validated ${checked} manifest v2 file${checked === 1 ? '' : 's'}.`)
}
