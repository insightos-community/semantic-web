import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

// 独立的 fixture 服务不复用开发中的 Server，不读取或修改本地 semantic.db。
export default defineConfig({
  ...base,
  testMatch: /studio-(workbench|conversation|recipients|v020|v030)\.spec\.js/,
  outputDir: '.output/studio-e2e',
  workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command:
      'VITE_STUDIO_FIXTURES=true VITE_SERVER_HTTP=http://127.0.0.1:1 VITE_SERVER_WS=ws://127.0.0.1:1 npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 60000
  }
})
