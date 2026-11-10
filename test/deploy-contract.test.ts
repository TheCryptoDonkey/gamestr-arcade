import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const deployPath = resolve('scripts/deploy.sh')
const deploy = readFileSync(deployPath, 'utf8')
const service = readFileSync(resolve('systemd/gamestr-arcade.service'), 'utf8')

// Execute the real deploy script with transport stubs. Catalogue rsync still
// runs locally, so these checks exercise its overwrite/delete/exclude behaviour
// without contacting or modifying a booth.
function withBoothFixture(check: (fixture: {
  games: string
  syncLog: string
  run: (...args: string[]) => SpawnSyncReturns<string>
}) => void) {
  const root = mkdtempSync(join(tmpdir(), 'gamestr-deploy-'))
  try {
    const repo = join(root, 'repo')
    const bin = join(root, 'bin')
    const games = join(root, 'booth-games')
    const syncLog = join(root, 'rsync.log')
    for (const directory of ['scripts', 'systemd', 'games/pallasite']) mkdirSync(join(repo, directory), { recursive: true })
    mkdirSync(join(games, 'pallasite/site'), { recursive: true })
    mkdirSync(bin)
    copyFileSync(deployPath, join(repo, 'scripts/deploy.sh'))
    writeFileSync(join(repo, 'systemd/gamestr-arcade.service'), service)
    writeFileSync(join(repo, 'games/pallasite/game.json'), 'repository manifest\n')
    writeFileSync(join(games, 'pallasite/game.json'), 'booth manifest with physical certification\n')
    writeFileSync(join(games, 'pallasite/site/index.html'), 'installed offline game\n')
    writeFileSync(join(games, 'pallasite/local-certification.json'), 'booth-only certification\n')
    writeFileSync(join(games, 'pallasite/game.AppImage'), 'installed native game\n')
    writeFileSync(syncLog, '')
    const artifact = join(repo, 'fixture.AppImage')
    writeFileSync(artifact, 'fixture arcade artifact\n')
    const sha = createHash('sha256').update(readFileSync(artifact)).digest('hex')
    const rsync = spawnSync('bash', ['-c', 'command -v rsync'], { encoding: 'utf8' }).stdout.trim()
    expect(rsync, 'fixture requires rsync, as does catalogue deployment').not.toBe('')

    const stubs = {
      ssh: `#!/usr/bin/env bash
set -eu
command="\${!#}"
if [[ "$command" == 'chmod +x '* ]]; then printf '%s  artifact\\n' "$FIXTURE_SHA"; fi
`,
      scp: '#!/usr/bin/env bash\nexit 0\n',
      rsync: `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$@" >> "$FIXTURE_SYNC_LOG"
args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    -e) shift; shift ;;
    fixture@invalid:gamestr-games/) args+=("$FIXTURE_GAMES/"); shift ;;
    *) args+=("$1"); shift ;;
  esac
done
exec "$FIXTURE_RSYNC" "\${args[@]}"
`,
    }
    for (const [name, contents] of Object.entries(stubs)) {
      writeFileSync(join(bin, name), contents)
      chmodSync(join(bin, name), 0o755)
    }
    check({
      games,
      syncLog,
      run: (...args) => spawnSync('bash', [join(repo, 'scripts/deploy.sh'), '--ship-only', '--artifact', artifact, ...args], {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          BOOTH: 'fixture@invalid',
          DEST: '.',
          FIXTURE_SHA: sha,
          FIXTURE_GAMES: games,
          FIXTURE_SYNC_LOG: syncLog,
          FIXTURE_RSYNC: rsync,
        },
      }),
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('booth deploy contract', () => {
  it('is valid Bash and requires an exact ship-only artifact', () => {
    expect(spawnSync('bash', ['-n', deployPath], { encoding: 'utf8' }).status).toBe(0)
    const result = spawnSync('bash', [deployPath, '--ship-only', '--no-games'], {
      encoding: 'utf8',
      env: { ...process.env, BOOTH: 'nobody@127.0.0.1' },
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--ship-only requires --artifact PATH')
    expect(deploy).not.toContain('ls -t')
  })

  it('retains a previous artifact and treats failed readiness as terminal', () => {
    expect(deploy).toContain('$BASENAME.previous')
    expect(deploy).toContain('renderer did not become ready')
    expect(deploy).toContain('attempting AppImage rollback')
    expect(deploy).not.toContain('health check reported a problem')
  })

  it('binds renderer readiness to the systemd runtime directory', () => {
    expect(service).toContain('ExecStartPre=-/usr/bin/rm -f %t/gamestr-arcade.ready')
    expect(service).toContain('Environment=ARCADE_READY_FILE=%t/gamestr-arcade.ready')
    expect(deploy).toContain('/run/user/$(id -u)/gamestr-arcade.ready')
  })

  it.each([
    { args: [], name: 'the default arguments' },
    { args: ['--no-games'], name: 'legacy --no-games' },
    { args: ['--sync-games', '--no-games'], name: 'a later --no-games override' },
  ])('preserves the installed catalogue with $name', ({ args }) => {
    withBoothFixture(({ games, syncLog, run }) => {
      const result = run(...args)
      expect(result.status, String(result.stderr)).toBe(0)
      expect(readFileSync(syncLog, 'utf8')).toBe('')
      expect(readFileSync(join(games, 'pallasite/game.json'), 'utf8')).toContain('physical certification')
      expect(readFileSync(join(games, 'pallasite/site/index.html'), 'utf8')).toBe('installed offline game\n')
      expect(readFileSync(join(games, 'pallasite/local-certification.json'), 'utf8')).toBe('booth-only certification\n')
      expect(readFileSync(join(games, 'pallasite/game.AppImage'), 'utf8')).toBe('installed native game\n')
    })
  })

  it('reconciles the catalogue only with explicit --sync-games, while protecting native AppImages', () => {
    withBoothFixture(({ games, syncLog, run }) => {
      const result = run('--sync-games')
      expect(result.status, String(result.stderr)).toBe(0)
      expect(result.stdout).toContain('overwrites booth-edited manifests/certifications and deletes booth-only files')
      expect(readFileSync(syncLog, 'utf8')).toContain('--exclude=*.AppImage')
      expect(readFileSync(join(games, 'pallasite/game.json'), 'utf8')).toBe('repository manifest\n')
      expect(existsSync(join(games, 'pallasite/site/index.html'))).toBe(false)
      expect(existsSync(join(games, 'pallasite/local-certification.json'))).toBe(false)
      expect(readFileSync(join(games, 'pallasite/game.AppImage'), 'utf8')).toBe('installed native game\n')
    })
  })
})
