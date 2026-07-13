#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('../dist-web/', import.meta.url)
const fail = message => { throw new Error(`web build validation failed: ${message}`) }
const read = path => readFile(new URL(path, root), 'utf8')

const [html, manifest, catalogue] = await Promise.all([
  read('index.html'),
  read('manifest.webmanifest').then(JSON.parse),
  read('catalogue.json').then(JSON.parse),
])

if (!Array.isArray(catalogue) || catalogue.length < 10) fail('catalogue must contain at least ten games')
const slugs = new Set()
for (const game of catalogue) {
  if (!game || typeof game !== 'object') fail('catalogue entries must be objects')
  if (!/^[a-z0-9-]+$/.test(game.slug) || slugs.has(game.slug)) fail(`invalid or duplicate slug: ${game.slug}`)
  slugs.add(game.slug)
  if (game.slug === 'payment-lab') fail('operator diagnostics must never enter the public catalogue')
  if (typeof game.url !== 'string' || !game.url.startsWith('https://')) fail(`${game.slug} needs an HTTPS URL`)
  if (!Array.isArray(game.genres) || game.genres.length === 0) fail(`${game.slug} needs genres`)
}
if (!catalogue.some(game => game.featured) || !catalogue.some(game => game.trending) || !catalogue.some(game => game.newRelease)) {
  fail('editorial featured, trending, and new collections must all be populated')
}

if (!html.includes('Content-Security-Policy') || !html.includes("script-src 'self'")) fail('strict script CSP is missing')
if (!html.includes('manifest.webmanifest')) fail('PWA manifest link is missing')
if (manifest.display !== 'standalone' || manifest.start_url !== '/') fail('PWA manifest is not installable')
for (const icon of manifest.icons ?? []) {
  await stat(new URL(icon.src.replace(/^\//, ''), root)).catch(() => fail(`manifest icon is missing: ${icon.src}`))
}
await stat(new URL('sw.js', root)).catch(() => fail('service worker is missing'))
const schema = await read('schemas/game-manifest-v2.schema.json').then(JSON.parse).catch(() => fail('Manifest v2 schema is missing'))
if (schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema' || schema?.properties?.manifestVersion?.const !== 2) fail('Manifest v2 schema is not canonical')

const assetFiles = await readdir(new URL('assets/', root))
for (const name of assetFiles.filter(name => name.endsWith('.js') && !name.endsWith('.js.map'))) {
  const info = await stat(new URL(`assets/${name}`, root))
  if (info.size > 150_000) fail(`JavaScript entry exceeds 150 KB: ${name}`)
  const source = await read(`assets/${name}`)
  if (source.includes('require(')) fail(`browser script contains a CommonJS runtime dependency: ${name}`)
}

console.log(`Validated web build: ${catalogue.length} games, canonical submission schema, installable PWA, bounded scripts, strict script CSP.`)
