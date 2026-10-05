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
