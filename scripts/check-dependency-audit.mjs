import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const audit = spawnSync('npm', ['audit', '--audit-level=high', '--json'], { encoding: 'utf8' })
if (audit.error) throw audit.error
if (audit.stderr) process.stderr.write(audit.stderr)
process.stdout.write(audit.stdout)

const report = JSON.parse(audit.stdout)
if (report.error || !report.vulnerabilities || ![0, 1].includes(audit.status)) {
  throw new Error('npm audit did not return a usable vulnerability report.')
}

const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
const { packages } = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const findings = Object.values(report.vulnerabilities).flatMap(entry => entry.via
  .filter(cause => typeof cause === 'object' && ['high', 'critical'].includes(cause.severity))
  .map(cause => ({ cause, nodes: entry.nodes })))

// No upstream patch is available. Build tools use repository-controlled globs.
// Retire this exception when the locked Picomatch release has a published fix.
const accepted = findings.filter(({ cause, nodes }) =>
  cause.name === 'picomatch' && cause.url === advisory && cause.severity === 'high'
  && nodes.length > 0 && nodes.every(path => packages[path]?.dev === true && packages[path].version === '4.0.7'))

if (findings.length > accepted.length || (audit.status !== 0 && accepted.length === 0)) {
  process.exitCode = 1
} else if (accepted.length) {
  console.warn(`Accepted ${advisory} for the locked dev-only Picomatch 4.0.7. The production audit runs separately.`)
}
