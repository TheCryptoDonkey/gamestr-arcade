import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/browser',
  timeout: 30_000,
  workers: 1,
  use: { headless: true, launchOptions: process.env.GAMESTR_CHROMIUM ? { executablePath: process.env.GAMESTR_CHROMIUM } : {} },
  webServer: [
    { command: 'GAMESTR_WEB_ORIGIN=http://127.0.0.1:4174 npm run dev:web -- --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
    { command: 'GAMESTR_WEB_EDITION=600 GAMESTR_WEB_ORIGIN=http://127.0.0.1:4175 npm run dev:web -- --host 127.0.0.1 --port 4175 --strictPort', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
  ],
})
