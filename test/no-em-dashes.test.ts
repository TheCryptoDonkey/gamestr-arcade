import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('copy style', () => {
  it('contains no em dash characters in tracked files', () => {
    const emDash = String.fromCodePoint(0x2014)
    const result = spawnSync('git', ['grep', '-n', emDash], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    expect(result.status, result.stdout || result.stderr).toBe(1)
  })
})
