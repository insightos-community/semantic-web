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

import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// 全前端唯一的后端配置点：只代理到 semantic-server。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const server = process.env.VITE_SERVER_HTTP || env.VITE_SERVER_HTTP || 'http://127.0.0.1:8080'
  const serverWs = process.env.VITE_SERVER_WS || env.VITE_SERVER_WS || 'ws://127.0.0.1:8081'
  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
    },
    server: {
      host: true, // 监听 0.0.0.0：允许局域网其他机器访问（http://<本机IP>:3000）
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': { target: server, changeOrigin: true },
        '/ws': { target: serverWs, ws: true }
      }
    },
    preview: {
      host: '127.0.0.1',
      port: 4185,
      strictPort: true,
      proxy: {
        '/api': { target: server, changeOrigin: true },
        '/ws': { target: serverWs, ws: true }
      }
    },
    build: { outDir: 'dist' },
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.js']
    }
  }
})
