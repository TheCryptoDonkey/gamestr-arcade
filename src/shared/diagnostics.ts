/** Controller telemetry is deliberately opt-in on production cabinets. */
export function gamepadDiagnosticsEnabled(value: unknown): boolean {
  return value === '1'
}
