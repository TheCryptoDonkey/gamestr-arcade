import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const release = join(root, 'release')
const output = join(release, 'cabinet-games')
const sources = [
  {
    id: 'pallasite',
    repository: 'pallasite',
    revision: '2de0e60fd8f743ecf06fd042e308da10df5ce4fb',
    icon: 'icon-512.png',
  },
  {
    id: 'neon-sentinel',
    repository: 'neon-sentinel',
    revision: '120b5adc449b1eea2b45cf9e8bc4e1e277586954',
    icon: 'brand/icon-512.png',
  },
  {
    id: 'hang-on-fren',
    repository: 'hang-on-fren-public',
    revision: '41e63a8717db19fc1e54aad772a3baabab3dbc7d',
    icon: 'icons/icon-512.png',
  },
]

function run(cwd, command, args, env = process.env) {
  return execFileSync(command, args, { cwd, env, stdio: ['ignore', 'inherit', 'inherit'] })
}

function runNpm(cwd, args, env = process.env) {
  // Invoking the npm CLI through Node also works when npm on PATH is a Windows .cmd file.
  const npmCli = process.env.npm_execpath
  return npmCli ? run(cwd, process.execPath, [npmCli, ...args], env) : run(cwd, 'npm', args, env)
}

function replaceOnce(source, anchor, replacement) {
  if (source.split(anchor).length !== 2) throw new Error(`Cabinet patch anchor changed: ${anchor}`)
  return source.replace(anchor, replacement)
}

async function patchCabinetClient(directory, id) {
  const main = join(directory, 'src', 'main.ts')
  let source = await readFile(main, 'utf8')
  if (id === 'pallasite') {
    source = replaceOnce(source, "// Lose focus → release keys & pause\nwindow.addEventListener('blur', () => {",
      '// Release keys and pause after losing focus or cabinet input.\nconst pauseForInputLoss = () => {')
    source = replaceOnce(source, '});\n\n// Two-tier silence:',
      "}\nwindow.addEventListener('blur', pauseForInputLoss);\nwindow.addEventListener('gamestr:controller-lost', pauseForInputLoss);\n\n// Two-tier silence:")
  } else if (id === 'neon-sentinel') {
    source = replaceOnce(source, 'function resumeRun(): void {',
      "window.addEventListener('gamestr:controller-lost', pauseRun);\n\nfunction resumeRun(): void {")
  } else if (id === 'hang-on-fren') {
    // Reuse the publisher's guest-only adapters with the regular web assets.
    source = replaceOnce(source, "from './nostr.js';", "from './napplet/nostr.js';")
    source = replaceOnce(source, "from './bitcoin.js';", "from './napplet/bitcoin.js';")
    source = replaceOnce(source, "if (state.phase === 'title' && shouldAskV4v()) {",
      "if (!NAPPLET && state.phase === 'title' && shouldAskV4v()) {")
    source = replaceOnce(source, "if (state.phase === 'playing') state.paused = true;\n}\nwindow.addEventListener('blur', onFocusLost);",
      "if (state.phase === 'playing') setPaused(true);\n}\nwindow.addEventListener('blur', onFocusLost);\nwindow.addEventListener('gamestr:controller-lost', onFocusLost);")
    // Arcade uses Escape to return to the game list.
    source = replaceOnce(source, "if (k === 'escape') {\n      setPaused(!state.paused);",
      "if (k === 'p' || (state.paused && k === 'enter')) {\n      setPaused(!state.paused);")
    source = replaceOnce(source, "} else if (state.phase === 'gameover' && menuEdge && !state.qualifies) {",
      "} else if (state.phase === 'playing' && state.paused && menuEdge) {\n    setPaused(false);\n  } else if (state.phase === 'gameover' && menuEdge && !state.qualifies) {")
    source = replaceOnce(source, 'state.paused = on;\n  clearAllInput();',
      'state.paused = on;\n  if (on) padPrevMenu = readGamepad().menu;\n  clearAllInput();')
    source = replaceOnce(source, 'if (state.paused) {\n    updateEngine',
      'if (state.paused) {\n    pollPadMenu();\n    updateEngine')
    source = replaceOnce(source, "'ESC \u2014 RESUME'", "'ENTER / A TO RESUME'")
  }
  await writeFile(main, source)
}

async function buildGame(work, target, { id, repository, revision, icon }) {
  const source = join(work, id)
  const bundled = join(target, id)
  const site = join(bundled, 'site')
  const remote = `https://github.com/TheCryptoDonkey/${repository}.git`
  await mkdir(source)
  run(source, 'git', ['init', '--quiet'])
  // Keep the pinned sources in their published byte form on Windows as well.
  run(source, 'git', ['config', 'core.autocrlf', 'false'])
  run(source, 'git', ['remote', 'add', 'origin', remote])
  run(source, 'git', ['config', 'remote.origin.promisor', 'true'])
  run(source, 'git', ['config', 'remote.origin.partialclonefilter', 'blob:none'])
  run(source, 'git', ['sparse-checkout', 'set', '--no-cone', '/*', '!/originals/', '!/art-originals/'])
  run(source, 'git', ['fetch', '--quiet', '--depth=1', '--filter=blob:none', 'origin', revision])
  run(source, 'git', ['checkout', '--quiet', '--detach', revision], { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' })
  await patchCabinetClient(source, id)
  if (id === 'pallasite') {
    const pnpm = ['exec', '--yes', '--package=pnpm@9.0.0', '--', 'pnpm']
    runNpm(source, [...pnpm, 'install', '--frozen-lockfile'])
    // The vendored browser SDK comes from the pinned game revision, like its
    // game assets. The publisher's moving-latest gate is for website releases.
    runNpm(source, [...pnpm, 'exec', 'tsc', '--noEmit'])
    runNpm(source, [...pnpm, 'exec', 'vite', 'build'], { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_SHA: revision })
  } else if (id === 'neon-sentinel') {
    runNpm(source, ['ci'])
    runNpm(source, ['run', 'typecheck'])
    runNpm(source, ['run', 'build:client'], { ...process.env, NEON_SOURCE_REVISION: revision })
  } else if (id === 'hang-on-fren') {
    runNpm(source, ['ci'])
    runNpm(source, ['run', 'build', '--', '--mode', 'napplet'], { ...process.env, HOF_SOURCE_REVISION: revision })
  }
  await mkdir(bundled, { recursive: true })
  await cp(join(source, 'dist'), site, { recursive: true })
  await cp(join(site, icon), join(bundled, 'logo.png'))
  await cp(join(root, 'games', id, 'game.json'), join(bundled, 'game.json'))
  await cp(join(source, 'LICENSE'), join(bundled, 'LICENSE'))
  await writeFile(join(bundled, 'revision'), `${revision}\n`)
  console.log(`Bundled ${id} from ${remote} at ${revision}`)
}

await mkdir(release, { recursive: true })
const working = await mkdtemp(join(release, '.cabinet-build-'))
try {
  const staging = join(working, 'packages')
  for (const game of sources) await buildGame(working, staging, game)
  // This exact directory is generated by this script. Keep the previous build
  // available until all replacement packages have completed successfully.
  await rm(output, { recursive: true, force: true })
  await rename(staging, output)
} finally {
  await rm(working, { recursive: true, force: true })
}
