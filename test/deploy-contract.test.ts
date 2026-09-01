import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const deployPath = resolve('scripts/deploy.sh')
const deploy = readFileSync(deployPath, 'utf8')
const service = readFileSync(resolve('systemd/gamestr-arcade.service'), 'utf8')

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
})
