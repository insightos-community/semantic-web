import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  testMatch: /studio-evidence\.spec\.js/,
  outputDir: '.output/studio-evidence-e2e',
  workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4176' },
  webServer: {
    command:
      'VITE_STUDIO_FIXTURES=true VITE_SERVER_HTTP=http://127.0.0.1:1 VITE_SERVER_WS=ws://127.0.0.1:1 npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
    timeout: 60000
  }
})
