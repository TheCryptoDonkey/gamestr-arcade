#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const root = resolve(import.meta.dirname, '..')
const configPath = resolve(process.argv[2] ?? process.env.ARCADE_CONFIG ?? join(root, 'arcade.config.json'))
const schema = JSON.parse(await readFile(join(root, 'schemas', 'arcade-config.schema.json'), 'utf8'))
const config = JSON.parse(await readFile(configPath, 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validate = ajv.compile(schema)

if (!validate(config)) {
  console.error(`Configuration validation failed (${configPath}):`)
  for (const issue of validate.errors ?? []) {
    console.error(`  - ${issue.instancePath || '/'} ${issue.message}`)
  }
  process.exitCode = 1
} else {
  console.log(`Validated arcade configuration: ${configPath}`)
}
