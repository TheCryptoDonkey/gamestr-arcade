import { describe, expect, it } from 'vitest'
import { gamepadDiagnosticsEnabled } from '../src/shared/diagnostics'

describe('production diagnostics policy', () => {
  it('enables controller telemetry only for the exact operator flag', () => {
    expect(gamepadDiagnosticsEnabled('1')).toBe(true)
    expect(gamepadDiagnosticsEnabled(undefined)).toBe(false)
    expect(gamepadDiagnosticsEnabled('0')).toBe(false)
    expect(gamepadDiagnosticsEnabled('true')).toBe(false)
    expect(gamepadDiagnosticsEnabled(1)).toBe(false)
  })
})
