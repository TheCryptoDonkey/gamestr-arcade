// Sandboxed Electron preloads only have Electron's restricted require surface.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
for(const name of ['index','webgame']) {
  const source=await readFile(new URL(`../out/preload/${name}.cjs`,import.meta.url),'utf8')
  const modules=[...source.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map(match=>match[1])
  assert(modules.every(name=>name==='electron'),`${name} preload contains unavailable sandbox modules: ${modules.join(', ')}`)
}
console.log('Sandbox preloads include their controller dependencies.')
