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

// agents store（R6 Agent/Team 管理页）：roster 加载（首屏/静默）/ 状态与角色色映射 /
// 30s 轮询启停（契约以 internal/server/http/handlers/agents.go、
// internal/agent/runtime/roster.go 为准）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/agents', () => ({
  listAgents: vi.fn(),
  updateAgentModels: vi.fn(),
  listSessionAgents: vi.fn(),
  updateSessionAgentModel: vi.fn()
}))

import * as agentsApi from '@/api/agents'
import { agentStatusMeta, roleColor, useAgentsStore, POLL_INTERVAL } from '@/stores/agents'

// GET /agents 响应形态（roster.go AgentInfo，服务端已按 id 升序）
const roster = () => ({
  agents: [
    {
      id: 'leader',
      role: 'leader',
      mode: 'coordinator',
      status: 'idle',
      model: 'mock',
      activity: '待命',
      description: '主协调 Agent',
      tool_namespaces: ['system', 'artifact'],
      pinned_tools: ['system.echo'],
      tool_search: true,
      approval_required: ['artifact'],
      skill_names: ['echo-guide'],
      max_turns: 8,
      context_tokens: 32000,
      long_term_memory: false
    },
    {
      id: 'monitor-1',
      role: 'monitor',
      mode: 'observer',
      status: 'running',
      model: 'mock',
      activity: '订阅事件流'
    },
    {
      id: 'query-1',
      role: 'query',
      mode: 'service',
      status: 'idle',
      model: 'mock',
      activity: '待命：service 角色（M2.5 接入 agent-as-tool）'
    }
  ]
})

describe('agents store · 列表加载', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load：写入 roster 清单，loading 复位，运行中计数正确', async () => {
    agentsApi.listAgents.mockResolvedValue(roster())
    const agents = useAgentsStore()

    await agents.load()

    expect(agents.loading).toBe(false)
    expect(agents.error).toBe('')
    expect(agents.agents.map((a) => a.id)).toEqual(['leader', 'monitor-1', 'query-1'])
    expect(agents.agents[1]).toMatchObject({ role: 'monitor', mode: 'observer', status: 'running' })
    expect(agents.agents[0]).toMatchObject({
      description: '主协调 Agent',
      tool_namespaces: ['system', 'artifact'],
      pinned_tools: ['system.echo'],
      skill_names: ['echo-guide'],
      max_turns: 8,
      context_tokens: 32000
    })
    expect(agents.runningCount).toBe(1)
  })

  it('load 失败（首屏）：loading 复位、error 落态且错误原样抛出', async () => {
    agentsApi.listAgents.mockRejectedValue(new Error('网络异常，请稍后重试'))
    const agents = useAgentsStore()

    await expect(agents.load()).rejects.toThrow('网络异常，请稍后重试')
    expect(agents.loading).toBe(false)
    expect(agents.error).toBe('网络异常，请稍后重试')
    expect(agents.agents).toEqual([])
  })

  it('load 静默失败（轮询）：保留旧数据不抛出，error 记录供页面提示', async () => {
    agentsApi.listAgents.mockResolvedValue(roster())
    const agents = useAgentsStore()
    await agents.load()

    agentsApi.listAgents.mockRejectedValue(new Error('连接中断'))
    await agents.load({ silent: true })

    expect(agents.agents).toHaveLength(3) // 旧数据保留（防闪烁）
    expect(agents.error).toBe('连接中断')
  })

  it('load 静默刷新不触碰 loading（轮询不闪烁）', async () => {
    agentsApi.listAgents.mockResolvedValue(roster())
    const agents = useAgentsStore()

    const p = agents.load({ silent: true })
    expect(agents.loading).toBe(false) // 进行中也不置 loading
    await p
    expect(agents.loading).toBe(false)
  })
})

describe('agents store · 状态与角色色映射', () => {
  it('agentStatusMeta：starting 黄 / idle 灰 / running 绿 / stopped 红', () => {
    expect(agentStatusMeta('starting')).toEqual({ label: '启动中', color: 'var(--sf-warning)' })
    expect(agentStatusMeta('idle')).toEqual({ label: '待命', color: 'var(--sf-text-disabled)' })
    expect(agentStatusMeta('running')).toEqual({ label: '运行中', color: 'var(--sf-success)' })
    expect(agentStatusMeta('stopped')).toEqual({ label: '已停止', color: 'var(--sf-danger)' })
  })

  it('agentStatusMeta：未知状态回退灰色原样展示，不阻断渲染', () => {
    expect(agentStatusMeta('paused')).toEqual({ label: 'paused', color: 'var(--sf-text-disabled)' })
    expect(agentStatusMeta('')).toEqual({ label: '未知', color: 'var(--sf-text-disabled)' })
  })

  it('roleColor：优先 --sf-role-* 令牌，未定义角色回退灰令牌', () => {
    expect(roleColor('leader')).toBe('var(--sf-role-leader, var(--sf-text-disabled))')
    expect(roleColor('monitor')).toBe('var(--sf-role-monitor, var(--sf-text-disabled))')
    // query 无对应令牌 → 由 CSS var fallback 落灰，色值均不写死
    expect(roleColor('query')).toBe('var(--sf-role-query, var(--sf-text-disabled))')
  })
})

describe('agents store · 模型策略', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('保存主模型与当前模型思考配置后刷新 roster', async () => {
    agentsApi.updateAgentModels.mockResolvedValue({ ok: true })
    agentsApi.listAgents.mockResolvedValue(roster())
    const agents = useAgentsStore()
    const payload = {
      model: 'deepseek-v4-flash',
      reasoning_effort: 'auto',
      reasoning_visibility: 'auto'
    }

    await agents.saveModels('leader', payload)

    expect(agentsApi.updateAgentModels).toHaveBeenCalledWith('leader', payload)
    expect(agentsApi.listAgents).toHaveBeenCalledTimes(1)
    expect(agents.savingModels).toBe('')
  })

  it('加载并单独覆盖会话中的 Query 模型快照', async () => {
    agentsApi.listSessionAgents.mockResolvedValue({
      agents: [
        {
          agent_id: 'leader',
          endpoint_id: 'deepseek-v4-pro',
          model: 'deepseek-v4-pro',
          source: 'system_default',
          default_inherited: true
        },
        {
          agent_id: 'query-1',
          endpoint_id: 'minimax-m3',
          model: 'MiniMax-M3',
          source: 'agent_profile'
        }
      ]
    })
    agentsApi.updateSessionAgentModel.mockResolvedValue({
      agent: {
        agent_id: 'query-1',
        endpoint_id: 'claude-sonnet-5',
        model: 'claude-sonnet-5',
        source: 'session_override'
      }
    })
    const agents = useAgentsStore()

    await agents.loadSessionAgents('cs-1')
    const saved = await agents.saveSessionAgentModel('cs-1', 'query-1', 'claude-sonnet-5', 'auto')

    expect(agentsApi.updateSessionAgentModel).toHaveBeenCalledWith('cs-1', 'query-1', {
      endpoint_id: 'claude-sonnet-5',
      reasoning_effort: 'auto'
    })
    expect(saved.source).toBe('session_override')
    expect(agents.sessionAgents['cs-1'].find((item) => item.agent_id === 'leader')).toMatchObject({
      endpoint_id: 'deepseek-v4-pro',
      default_inherited: true
    })
    expect(agents.sessionAgents['cs-1'].find((item) => item.agent_id === 'query-1')).toMatchObject({
      endpoint_id: 'claude-sonnet-5',
      source: 'session_override'
    })
    expect(agents.savingSessionAgent).toBe('')
  })

  it('SESSION_BUSY 保留原错误，供界面显示 409 提示', async () => {
    const busy = Object.assign(new Error('会话正在运行'), { code: 'SESSION_BUSY', status: 409 })
    agentsApi.updateSessionAgentModel.mockRejectedValue(busy)
    const agents = useAgentsStore()

    await expect(
      agents.saveSessionAgentModel('cs-1', 'leader', 'minimax-m3', 'auto')
    ).rejects.toMatchObject({ code: 'SESSION_BUSY', status: 409 })
    expect(agents.savingSessionAgent).toBe('')
  })
})

describe('agents store · 轮询启停', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    const agents = useAgentsStore()
    agents.stopPolling()
    agents.stopPolling() // 幂等用例的第二次 start 引用一并释放（引用归零才停表）
    vi.useRealTimers()
  })

  it('startPolling：每 30s 静默拉取一次；stopPolling 后不再请求', async () => {
    agentsApi.listAgents.mockResolvedValue(roster())
    const agents = useAgentsStore()

    agents.startPolling()
    expect(agents.polling).toBe(true)
    expect(agentsApi.listAgents).not.toHaveBeenCalled() // 首屏数据由 load 负责，定时器不立即打

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    expect(agentsApi.listAgents).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    expect(agentsApi.listAgents).toHaveBeenCalledTimes(2)
    expect(agents.agents).toHaveLength(3)

    agents.stopPolling()
    expect(agents.polling).toBe(false)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 2)
    expect(agentsApi.listAgents).toHaveBeenCalledTimes(2) // 停止后无新请求
  })

  it('startPolling 幂等：重复调用不叠加定时器', async () => {
    agentsApi.listAgents.mockResolvedValue(roster())
    const agents = useAgentsStore()

    agents.startPolling()
    agents.startPolling()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)

    expect(agentsApi.listAgents).toHaveBeenCalledTimes(1)
  })

  it('轮询引用计数：两页面共享时一方 stop 不停表，引用归零才停', async () => {
    agentsApi.listAgents.mockResolvedValue(roster())
    const agents = useAgentsStore()

    agents.startPolling() // Agents 管理页挂载
    agents.startPolling() // 对话页协作侧栏挂载
    agents.stopPolling() // 一方卸载：另一方的轮询不受影响
    expect(agents.polling).toBe(true)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    expect(agentsApi.listAgents).toHaveBeenCalledTimes(1)

    agents.stopPolling() // 引用归零：真正停表
    expect(agents.polling).toBe(false)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    expect(agentsApi.listAgents).toHaveBeenCalledTimes(1)
  })

  it('轮询请求失败静默吞掉：保留旧数据且轮询继续', async () => {
    agentsApi.listAgents.mockResolvedValue(roster())
    const agents = useAgentsStore()
    await agents.load()

    agentsApi.listAgents.mockRejectedValue(new Error('网络异常'))
    agents.startPolling()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)

    expect(agents.agents).toHaveLength(3) // 旧数据保留
    expect(agents.polling).toBe(true) // 定时器未被失败打断

    agentsApi.listAgents.mockResolvedValue(roster())
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    expect(agents.error).toBe('') // 恢复后错误清除
  })
})
