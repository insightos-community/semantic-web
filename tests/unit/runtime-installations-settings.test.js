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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'

vi.mock('@/api/simulation', () => ({
  listRuntimeInstallations: vi.fn(),
  probeRuntimeInstallation: vi.fn(),
  testRuntimeInstallation: vi.fn(),
  stopRuntimeInstallation: vi.fn(),
  setRuntimeInstallationEnabled: vi.fn()
}))
vi.mock('vue3-toastify', () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  })
}))

import * as api from '@/api/simulation'
import RuntimeInstallationsSettings from '@/components/settings/RuntimeInstallationsSettings.vue'

const apps = []

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

function mount() {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const app = createApp(RuntimeInstallationsSettings)
  app.use(createPinia())
  app.use(ElementPlus)
  app.mount(element)
  apps.push(app)
  return element
}

describe('Runtime 安装设置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    api.listRuntimeInstallations.mockResolvedValue({
      runtime_installations: [
        {
          installation_id: 'local-native-mujoco',
          profile_id: 'native-mujoco',
          name: 'Native MuJoCo',
          engine: 'mujoco',
          loader: 'native',
          launch_mode: 'uv',
          enabled: true,
          status: 'offline',
          capabilities: {
            viewer: true,
            editable_scene: true,
            robot_models: ['r1_pro_chassis']
          }
        }
      ]
    })
    api.probeRuntimeInstallation.mockResolvedValue({ runtime: { state: 'ready' } })
  })

  afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
  })

  it('展示脱敏安装信息，并通过固定 API 诊断连接', async () => {
    const element = mount()
    await settle()
    expect(element.textContent).toContain('Native MuJoCo')
    expect(element.textContent).toContain('uv 受管进程')
    expect(element.textContent).toContain('r1_pro_chassis')
    expect(element.textContent).not.toContain('http://127.0.0.1')

    const probe = [...element.querySelectorAll('button')].find((button) =>
      button.textContent.includes('诊断连接')
    )
    probe.click()
    await settle()
    expect(api.probeRuntimeInstallation).toHaveBeenCalledWith('local-native-mujoco')
  })
})
