// A missing fixture key handler must fail the real packaged input gate.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'

assert.equal(process.platform, 'linux', 'The packaged negative requires private Linux Xvfb')
const artifact = resolve(process.argv[2] ?? '')
assert(process.argv[2], 'Pass the checked AppImage')
const reportPath = process.argv[3] ? resolve(process.argv[3]) : null
const project = mkdtempSync(join(tmpdir(), 'gamestr-input-negative-'))
try {
  mkdirSync(join(project, 'scripts'))
  for (const name of ['smoke-appimage.sh', 'runtime-native-focus.mjs', 'runtime-system-input.mjs']) {
    cpSync(resolve('scripts', name), join(project, 'scripts', name))
  }
  cpSync(resolve('package.json'), join(project, 'package.json'))
  symlinkSync(resolve('node_modules'), join(project, 'node_modules'), 'dir')
  const source = readFileSync('scripts/appimage-journeys.mjs', 'utf8')
  const handler = "addEventListener('keydown', event => fixtureKeys.push({ key: event.key, trusted: event.isTrusted }));"
  assert.equal(source.split(handler).length, 2, 'Expected exactly one fixture key handler')
  writeFileSync(join(project, 'scripts', 'appimage-journeys.mjs'), source.replace(handler, '/* Controlled negative: no game key handler. */'))
  const result = spawnSync('bash', ['scripts/smoke-appimage.sh', artifact], {
    cwd: project, encoding: 'utf8', timeout: 100000, maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error) throw result.error
  assert.equal(result.status, 1, 'The missing-key negative must fail the smoke gate')
  const prefix = 'Packaged runtime failure diagnostics: '
  const line = (result.stderr ?? '').split('\n').find(value => value.startsWith(prefix))
  assert(line, 'The negative must retain structured failure diagnostics')
  const failure = JSON.parse(line.slice(prefix.length))
  assert.equal(failure.stage, 'first game trusted ArrowUp')
  assert.match(failure.error, /Timeout/)
  assert.deepEqual(failure.pages.game.keys, [])
  assert.equal(failure.systemInput.attempted, true)
  assert.equal(failure.systemInput.trustedPageKeyObserved, false)
  assert(failure.systemInput.nativeStateAfterInput.nativeInputEvents.some(event =>
    event.role === 'game' && event.type === 'keyDown' && event.key === 'ArrowUp'))
  const report = { controlledNegative: 'missing game key handler', gateRejected: true,
    nativeGameKeyObserved: true, trustedGameKeyObserved: false,
    originalFailureStage: failure.stage, physicalControllerAcceptance: 'pending' }
  if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally {
  rmSync(project, { recursive: true, force: true })
}
