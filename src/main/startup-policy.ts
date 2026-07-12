import { dirname, resolve } from 'node:path'

/** Resolve explicit env paths from cwd; otherwise resolve beside the config file. */
export function resolveStartupGamesDir(
  configPath: string,
  configuredGamesDir: string,
  envOverride: string | undefined,
  cwd = process.cwd(),
): string {
  if (envOverride?.trim()) return resolve(cwd, envOverride.trim())
  return resolve(dirname(configPath), configuredGamesDir)
}

/** ARCADE_KIOSK is an explicit restart-time override; config applies otherwise. */
export function resolveStartupKiosk(configured: boolean, envOverride: string | undefined): boolean {
  return envOverride === undefined ? configured : envOverride !== '0'
}
