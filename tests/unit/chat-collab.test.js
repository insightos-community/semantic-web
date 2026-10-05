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

// chat store R14：subagent.delta/result 委派块聚合 + alert 三级路由
// （契约以 semantic-framework 代码为准：internal/agent/runtime/events.go
// SubAgent*Payload、internal/agent/monitor/alert.go、aggregate/rules.go）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/chat', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  listMessages: vi.fn()
}))

import {
  ALERT_IMPORTANCE,
  ALERT_LIST_LIMIT,
  alertImportance,
  DELEGATION_STATUS,
  useChatStore
} from '@/stores/chat'

const SID = 'cs-1'

// dialogue 频道委派事件（envelope.agent 归因成员实例：id=query-1、name=角色名）
const subEnv = (over = {}) => ({
  id: 'evt-0000001774950692123-000000010',
  session_id: SID,
  ts: '2026-08-03T10:00:05.000Z',
  agent: { id: 'query-1', role: 'service', name: 'query' },
  channel: 'dialogue',
  type: 'subagent.delta',
  importance: 'normal',
  payload: {},
  ...over
})

// alert 频道告警事件（monitor.alert：payload {rule, level(数值), message, topic}）
const alertEnv = (over = {}) => ({
  id: 'evt-0000001774950692123-000000020',
  session_id: '',
  ts: '2026-08-03T10:00:06.000Z',
  agent: { id: 'monitor-1', role: 'monitor', name: 'monitor' },
  channel: 'alert',
  type: 'monitor.alert',
  importance: 'critical',
  payload: {
    rule: '关键事件告警',
    level: 4,
    message: '监测到 critical 事件',
    topic: 'agent.events'
  },
  ...over
})

describe('chat store · subagent 委派块聚合', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('Leader 的流式思考按模型轮次保留，不被后续工具轮覆盖', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    for (const [index, turn, text] of [
      [1, 1, '查询'],
      [2, 1, '现场'],
      [3, 2, '形成计划']
    ]) {
      chat.applyDialogue(
        subEnv({
          id: `round-${index}`,
          agent: { id: 'leader', name: 'leader', role: 'leader' },
          type: 'reasoning.delta',
          payload: { run_id: 'leader-run', turn, text }
        })
      )
    }
    expect(chat.messages[0].reasoningRounds).toEqual([
      { turn: 1, text: '查询现场' },
      { turn: 2, text: '形成计划' }
    ])
  })

  it('subagent.delta 建块并归并到 Leader 运行行，文本按序聚合、状态 running', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(subEnv({ id: 'evt-1', payload: { run_id: 'r1', text: '正在' } }))
    chat.applyDialogue(subEnv({ id: 'evt-2', payload: { run_id: 'r1', text: '查询' } }))

    expect(chat.delegations).toHaveLength(1)
    const rec = chat.delegations[0]
    expect(rec).toMatchObject({
      sessionId: SID,
      runId: 'r1',
      agentName: 'query-1',
      agentRole: 'query',
      status: DELEGATION_STATUS.RUNNING,
      result: '正在查询'
    })
    const line = chat.messages.find((m) => m.runId === 'r1')
    expect(line).toBeTruthy()
    expect(line.role).toBe('assistant')
    expect(line.delegations).toEqual([rec])
  })

  it('subagent.result 定稿：任务与结果全文落块、状态 done', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(subEnv({ id: 'evt-1', payload: { run_id: 'r1', text: '过程' } }))
    chat.applyDialogue(
      subEnv({
        id: 'evt-2',
        type: 'subagent.result',
        payload: { run_id: 'r1', task: '查 artifact 列表', text: '当前产物：report.pdf' }
      })
    )

    const rec = chat.delegations[0]
    expect(rec.status).toBe(DELEGATION_STATUS.DONE)
    expect(rec.task).toBe('查 artifact 列表')
    expect(rec.result).toBe('当前产物：report.pdf') // 结果全文覆盖流式聚合
  })

  it('subagent.result 不重复展示 Provider 内嵌的 think 推理', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(
      subEnv({
        id: 'evt-reasoning',
        type: 'reasoning.delta',
        payload: { run_id: 'r1', text: '内部分析' }
      })
    )
    chat.applyDialogue(
      subEnv({
        id: 'evt-result',
        type: 'subagent.result',
        payload: {
          run_id: 'r1',
          task: '识别图片',
          text: '<think>内部分析</think>\n图片中的模型是 MiniMax-M3。'
        }
      })
    )

    const rec = chat.delegations[0]
    expect(rec.reasoning).toBe('内部分析')
    expect(rec.result).toBe('\n图片中的模型是 MiniMax-M3。')
    expect(rec.result).not.toContain('<think>')
    expect(rec.result).not.toContain('内部分析')
  })

  it('同 run 同成员再次被委派：定稿后的新 delta 另起新块', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(subEnv({ id: 'evt-1', payload: { run_id: 'r1', text: '甲' } }))
    chat.applyDialogue(
      subEnv({
        id: 'evt-2',
        type: 'subagent.result',
        payload: { run_id: 'r1', task: '任务一', text: '结果一' }
      })
    )
    chat.applyDialogue(subEnv({ id: 'evt-3', payload: { run_id: 'r1', text: '乙' } }))

    expect(chat.delegations).toHaveLength(2)
    expect(chat.delegations[0]).toMatchObject({ status: DELEGATION_STATUS.DONE, result: '结果一' })
    expect(chat.delegations[1]).toMatchObject({ status: DELEGATION_STATUS.RUNNING, result: '乙' })
    expect(chat.messages).toHaveLength(1)
    expect(chat.messages[0].delegations).toHaveLength(2)
  })

  it('同 run 不同成员：按 agent id 各自成块', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(subEnv({ id: 'evt-1', payload: { run_id: 'r1', text: 'q' } }))
    chat.applyDialogue(
      subEnv({
        id: 'evt-2',
        agent: { id: 'map-1', role: 'service', name: 'map' },
        payload: { run_id: 'r1', text: 'm' }
      })
    )

    expect(chat.delegations).toHaveLength(2)
    expect(chat.delegations.map((d) => d.agentName)).toEqual(['query-1', 'map-1'])
  })

  it('result 无 delta 直达：补建块直接落成 done', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(
      subEnv({
        id: 'evt-1',
        type: 'subagent.result',
        payload: { run_id: 'r1', task: '查', text: '结果' }
      })
    )

    expect(chat.delegations).toHaveLength(1)
    expect(chat.delegations[0]).toMatchObject({
      status: DELEGATION_STATUS.DONE,
      task: '查',
      result: '结果'
    })
  })

  it('envelope.agent.name 缺省时 agentRole 从实例 id 去 "-N" 后缀兜底', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(
      subEnv({
        id: 'evt-1',
        agent: { id: 'query-1', role: 'service', name: '' },
        payload: { run_id: 'r1', text: 'x' }
      })
    )
    expect(chat.delegations[0].agentRole).toBe('query')
  })

  it('委派块按会话隔离：其他会话的事件不进当前 delegations', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(
      subEnv({ id: 'evt-1', session_id: 'cs-2', payload: { run_id: 'r9', text: 'x' } })
    )
    expect(chat.delegations).toHaveLength(0)
    expect(chat.messagesBySession['cs-2'].list[0]).toMatchObject({
      role: 'assistant',
      runId: 'r9'
    })
    expect(chat.messagesBySession['cs-2'].list[0].delegations).toHaveLength(1)
  })
})

describe('chat store · alert 三级路由', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('critical：进消息流 + 侧栏告警列表', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyAlert(alertEnv({ id: 'evt-c1' }))

    expect(chat.alerts).toHaveLength(1)
    expect(chat.alerts[0]).toMatchObject({
      id: 'evt-c1',
      importance: ALERT_IMPORTANCE.CRITICAL,
      level: 4,
      rule: '关键事件告警',
      text: '监测到 critical 事件'
    })
    const line = chat.messages.find((m) => m.id === 'evt-c1')
    expect(line).toBeTruthy()
    expect(line.channel).toBe('alert')
    expect(line.importance).toBe('critical')
  })

  it('normal：进消息流简述 + 侧栏列表', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyAlert(
      alertEnv({
        id: 'evt-n1',
        importance: 'normal',
        payload: { level: 'warning', message: '一般告警' }
      })
    )

    expect(chat.alerts).toHaveLength(1)
    expect(chat.alerts[0].importance).toBe('normal')
    expect(chat.messages.some((m) => m.id === 'evt-n1')).toBe(true)
  })

  it('low：仅侧栏告警列表，不打断对话流', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyAlert(
      alertEnv({ id: 'evt-l1', importance: 'low', payload: { level: 1, message: '心跳基线' } })
    )

    expect(chat.alerts).toHaveLength(1)
    expect(chat.alerts[0]).toMatchObject({ importance: 'low', text: '心跳基线' })
    expect(chat.messages.some((m) => m.id === 'evt-l1')).toBe(false)
  })

  it('告警按事件 id 幂等入列（断连补发与实时到达重叠）', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    const env = alertEnv({ id: 'evt-dup' })
    chat.applyAlert(env)
    chat.applyAlert(env)
    expect(chat.alerts).toHaveLength(1)
  })

  it('侧栏列表最新在前且有容量上限', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    for (let i = 0; i < ALERT_LIST_LIMIT + 5; i += 1) {
      chat.applyAlert(alertEnv({ id: `evt-a${i}`, importance: 'low' }))
    }
    expect(chat.alerts).toHaveLength(ALERT_LIST_LIMIT)
    expect(chat.alerts[0].id).toBe(`evt-a${ALERT_LIST_LIMIT + 4}`) // 最新在前
  })
})

describe('alertImportance · 分级判定（与 aggregate/rules.go 同规则）', () => {
  it('envelope.importance 为线上权威', () => {
    expect(alertImportance(alertEnv({ importance: 'low', payload: { level: 5 } }))).toBe('low')
    expect(alertImportance(alertEnv({ importance: 'critical' }))).toBe('critical')
  })

  it('importance 缺失/非法时按 payload.level 复算：数值 ≥3 critical、1-2 low', () => {
    expect(alertImportance(alertEnv({ importance: '', payload: { level: 4 } }))).toBe('critical')
    expect(alertImportance(alertEnv({ importance: '', payload: { level: 3 } }))).toBe('critical')
    expect(alertImportance(alertEnv({ importance: '', payload: { level: 2 } }))).toBe('low')
    expect(alertImportance(alertEnv({ importance: '', payload: { level: 1 } }))).toBe('low')
  })

  it('字符串 level 映射：critical/high → critical、warning/medium → normal、info/low → low', () => {
    expect(alertImportance(alertEnv({ importance: '', payload: { level: 'high' } }))).toBe(
      'critical'
    )
    expect(alertImportance(alertEnv({ importance: '', payload: { level: 'warning' } }))).toBe(
      'normal'
    )
    expect(alertImportance(alertEnv({ importance: '', payload: { level: 'info' } }))).toBe('low')
  })

  it('level 缺失/不可解析 → normal（宁可见不可漏）', () => {
    expect(alertImportance(alertEnv({ importance: '', payload: {} }))).toBe('normal')
    expect(alertImportance(alertEnv({ importance: '', payload: { level: 'unknown' } }))).toBe(
      'normal'
    )
    expect(alertImportance({})).toBe('normal')
  })
})
