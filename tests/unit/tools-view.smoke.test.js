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
// 工具目录组件回归：全局“已安装”与会话 Agent“实际可用”必须分开，
// 否则 execute_host 会在未授权时被误认为已注入，Middleware/AgentTool 又会遗漏。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

vi.mock('@/api/tools', () => ({
  listTools: vi.fn(),
  listSessionAgentTools: vi.fn()
}))
vi.mock('@/api/agents', () => ({
  listAgents: vi.fn(),
  listSessionAgents: vi.fn(),
  updateAgentModels: vi.fn(),
  updateSessionAgentModel: vi.fn()
}))

import * as agentsApi from '@/api/agents'
import * as toolsApi from '@/api/tools'
import { useChatStore } from '@/stores/chat'
import ToolsView from '@/views/ToolsView.vue'

function mountWithSession() {
  const pinia = createPinia()
  setActivePinia(pinia)
  useChatStore().currentSessionId = 'cs-tools'
  const target = document.createElement('div')
  document.body.appendChild(target)
  const app = createApp(ToolsView)
  app.use(pinia)
  app.use(ElementPlus)
  app.mount(target)
  return { app, target }
}

describe('ToolsView · 已安装与当前有效工具', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    toolsApi.listTools.mockResolvedValue({
      sources: [
        {
          kind: 'builtin',
          tools: [
            {
              name: 'execute',
              namespace: 'execute',
              description: 'Docker 执行',
              risk: 'high',
              health: 'healthy'
            },
            {
              name: 'execute_host',
              namespace: 'execute_host',
              description: '宿主执行',
              risk: 'high',
              health: 'healthy'
            }
          ]
        }
      ]
    })
    toolsApi.listSessionAgentTools.mockResolvedValue({
      session_id: 'cs-tools',
      agent_id: 'leader',
      role: 'leader',
      tool_search_active: false,
      tools: [
        {
          name: 'ask_query',
          model_name: 'ask_query',
          namespace: 'ask_query',
          description: '系统状态与产物查询助手',
          risk: 'low',
          source: 'agent',
          delivery: 'agent_tool'
        },
        {
          name: 'read_file',
          model_name: 'read_file',
          namespace: 'filesystem',
          description: '读取 Project 文件',
          risk: 'low',
          source: 'filesystem',
          delivery: 'middleware'
        },
        {
          name: 'execute',
          model_name: 'execute',
          namespace: 'execute',
          description: 'Docker 执行',
          risk: 'high',
          source: 'builtin',
          delivery: 'direct'
        }
      ]
    })
    agentsApi.listAgents.mockResolvedValue({
      agents: [{ id: 'leader', role: 'leader', status: 'idle' }]
    })
    agentsApi.listSessionAgents.mockResolvedValue({
      agents: [{ agent_id: 'leader', role: 'leader', endpoint_id: 'mock', busy: false }]
    })
  })

  it('默认显示当前会话有效工具，切换后才显示全局已安装的 execute_host', async () => {
    const { app, target } = mountWithSession()
    await vi.waitFor(() => expect(target.textContent).toContain('ask_query'))
    expect(target.textContent).toContain('read_file')
    expect(target.textContent).not.toContain('execute_host')
    expect(toolsApi.listSessionAgentTools).toHaveBeenCalledWith('cs-tools', 'leader')

    const installedButton = [...target.querySelectorAll('.el-radio-button')].find((button) =>
      button.textContent.includes('全局已安装')
    )
    installedButton.click()
    await vi.waitFor(() => expect(target.textContent).toContain('execute_host'))
    expect(target.textContent).toContain('不代表当前 Agent 或会话已经启用')
    app.unmount()
  })
})
