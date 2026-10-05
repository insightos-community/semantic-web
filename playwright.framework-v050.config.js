// Copyright 2026 InsightOS
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.V050_WEB_PORT || 4185)
const externalWeb = process.env.V050_WEB_BASE_URL || ''
const baseURL = externalWeb || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/integration',
  testMatch: 'devices-framework-v050.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  outputDir: process.env.V050_PLAYWRIGHT_OUTPUT_DIR || 'test-results/framework-v050',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalWeb
    ? undefined
    : {
        command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          VITE_STUDIO_FIXTURES: 'false',
          VITE_DEVICE_FIXTURES: 'false',
          VITE_SERVER_HTTP: process.env.V050_FRAMEWORK_HTTP || 'http://127.0.0.1:8080',
          VITE_SERVER_WS: process.env.V050_FRAMEWORK_WS || 'ws://127.0.0.1:8081'
        }
      }
})
