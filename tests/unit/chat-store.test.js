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

// chat store F3 消息数据层：delta 聚合 / done 定稿 / 幂等去重 / 分页合并与对账
// （契约以 semantic-framework 代码为准：internal/agent/runtime/events.go、
// internal/server/http/handlers/chat.go、docs/api/ws.md）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/chat', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  listMessages: vi.fn()
}))

import * as chatApi from '@/api/chat'
import { MESSAGE_STATUS, insertIndexByTs, reconcileMessages, useChatStore } from '@/stores/chat'
import { deriveConversationTitle, isDefaultSessionTitle } from '@/stores/chatModel'

const SID = 'cs-1'

// WS 下行 envelope（docs/api/ws.md 定稿结构）
const env = (over = {}) => ({
  id: 'evt-0000001774950692123-000000001',
  session_id: SID,
  ts: '2026-08-03T10:00:05.000Z',
  agent: { id: 'leader', role: 'coordinator', name: 'leader' },
  channel: 'dialogue',
  type: 'message.delta',
  importance: 'normal',
  payload: {},
  ...over
})

const restRow = (id, role, content, ts = '2026-08-03T10:00:00.000Z') => ({
  id,
  role,
  content,
  created_at: ts
})

const page = (messages, total, pageNo = 1) => ({
  messages,
  total,
  page: pageNo,
  page_size: 50
})

describe('chat model · 会话自动命名', () => {
  it('按首轮文本归一化空白并截取 20 个 Unicode 字符', () => {
    expect(deriveConversationTitle('  分析\n机器人抓取失败的原因  ')).toBe(
      '分析 机器人抓取失败的原因'
    )
    expect(deriveConversationTitle('123456789012345678901234')).toBe('12345678901234567890')
  })

  it('图片消息使用文件名命名，人工标题不视为默认标题', () => {
    expect(deriveConversationTitle('', [{ name: 'camera-frame.png' }])).toBe(
      'camera-frame · 图片分析'
    )
    expect(isDefaultSessionTitle('新会话')).toBe(true)
    expect(isDefaultSessionTitle('抓取失败诊断')).toBe(false)
    expect(deriveConversationTitle('你好')).toBe('')
  })
})

describe('chat store · message.delta 聚合', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('同 run_id 的 delta 聚合为一条"进行中的助手消息"，文本按序拼接', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(env({ id: 'evt-1', payload: { run_id: 'r1', text: '你' } }))
    chat.applyDialogue(env({ id: 'evt-2', payload: { run_id: 'r1', text: '好' } }))
    chat.applyDialogue(env({ id: 'evt-3', payload: { run_id: 'r1', text: '，世界' } }))

    expect(chat.messages).toHaveLength(1)
    expect(chat.streaming).toBe(chat.messages[0])
    expect(chat.messages[0]).toMatchObject({
      id: 'stream-r1',
      role: 'assistant',
      agentName: 'leader',
      text: '你好，世界',
      status: MESSAGE_STATUS.STREAMING
    })
  })

  it('不同 run_id 开启新的流式消息（同会话串行为异常兜底）', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(env({ id: 'evt-1', payload: { run_id: 'r1', text: '甲' } }))
    chat.applyDialogue(env({ id: 'evt-2', payload: { run_id: 'r2', text: '乙' } }))

    expect(chat.messages).toHaveLength(2)
    expect(chat.streaming.runId).toBe('r2')
  })
})

describe('chat store · message.done 定稿与 REST 对账', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // 会话已选中：空历史（loaded 置位，模拟真实 selectSession 流程）
    chatApi.listMessages.mockResolvedValue(page([], 0))
    const chat = useChatStore()
    chat.currentSessionId = SID
    await chat.loadMessages(SID)
    chat.sessions = [{ id: SID, title: 't', updated_at: '2026-08-03T09:00:00.000Z' }]
  })

  it('done 将流式消息定稿为正式消息（id 换事件 id、带 usage/turns），streaming/sending 复位', async () => {
    const chat = useChatStore()
    chat.sending = true
    chat.applyDialogue(env({ id: 'evt-1', payload: { run_id: 'r1', text: '你好' } }))
    chat.applyDialogue(env({ id: 'evt-2', payload: { run_id: 'r1', text: '世界' } }))

    // done 时本轮用户/助手消息均已落库（runtime 先落库再发 done），refreshTail 拉到
    chatApi.listMessages.mockResolvedValue(
      page(
        [
          restRow('msg-001', 'user', 'hi'),
          { ...restRow('msg-002', 'assistant', '你好世界'), trace_id: 'trace-r1' }
        ],
        2
      )
    )
    chat.applyDialogue(
      env({
        id: 'evt-done',
        type: 'message.done',
        payload: {
          run_id: 'r1',
          trace_id: 'trace-r1',
          text: '你好世界',
          turns: 1,
          usage: { total_tokens: 42 },
          model: {
            requested_endpoint: 'deepseek-v4-pro',
            resolved_endpoint: 'MiniMax-M3',
            resolved_model: 'MiniMax-M3',
            fallback: true
          }
        }
      })
    )

    expect(chat.streaming).toBeNull()
    expect(chat.sending).toBe(false)
    // 定稿消息在 refreshTail 完成前已可见（evt id）
    expect(chat.messages.some((m) => m.id === 'evt-done' && m.status === MESSAGE_STATUS.DONE)).toBe(
      true
    )
    // 会话列表顺序刷新（updated_at 取事件时间）
    expect(chat.sessions[0].updated_at).toBe('2026-08-03T10:00:05.000Z')

    // REST 对账：本地流式/乐观副本被服务端落库行替换（幂等，无重复）
    await vi.waitFor(() => {
      expect(chat.messages.map((m) => m.id)).toEqual(['msg-001', 'msg-002'])
    })
    expect(chat.messages[1].text).toBe('你好世界')
    expect(chat.messages[1].traceId).toBe('trace-r1')
    expect(chat.messages[1].modelResolution).toEqual({
      requested_endpoint: 'deepseek-v4-pro',
      resolved_endpoint: 'MiniMax-M3',
      resolved_model: 'MiniMax-M3',
      fallback: true
    })
  })

  it('REST 历史消息恢复已归档的实际模型解析结果', async () => {
    chatApi.listMessages.mockResolvedValue(
      page(
        [
          {
            ...restRow('msg-model', 'assistant', '已完成'),
            trace_id: 'trace-history',
            metadata: {
              model: {
                requested_endpoint: 'deepseek-v4-pro',
                resolved_endpoint: 'deepseek-v4-pro',
                resolved_model: 'deepseek-v4-pro',
                fallback: false
              }
            }
          }
        ],
        1
      )
    )
    const chat = useChatStore()
    await chat.loadMessages(SID)

    expect(chat.messages[0].modelResolution).toMatchObject({
      resolved_endpoint: 'deepseek-v4-pro',
      resolved_model: 'deepseek-v4-pro',
      fallback: false
    })
    expect(chat.messages[0].traceId).toBe('trace-history')
  })

  it('乐观用户消息在 done 对账后被服务端行替换', async () => {
    const chat = useChatStore()
    chat.insertSorted({
      id: 'local-1',
      role: 'user',
      text: 'hi',
      channel: 'dialogue',
      status: MESSAGE_STATUS.DONE,
      ts: '2026-08-03T10:00:04.000Z'
    })
    chat.applyDialogue(env({ id: 'evt-1', payload: { run_id: 'r1', text: '好' } }))

    chatApi.listMessages.mockResolvedValue(
      page([restRow('msg-001', 'user', 'hi'), restRow('msg-002', 'assistant', '好')], 2)
    )
    chat.applyDialogue(
      env({ id: 'evt-done', type: 'message.done', payload: { run_id: 'r1', text: '好', turns: 1 } })
    )

    await vi.waitFor(() => {
      expect(chat.messages.map((m) => m.id)).toEqual(['msg-001', 'msg-002'])
    })
  })

  it('tool.result 先于正文到达也会建立活动行，done 与 REST 对账后结果仍保留', async () => {
    const chat = useChatStore()
    chat.applyDialogue(
      env({
        id: 'evt-tool-1',
        type: 'tool.result',
        payload: {
          run_id: 'r-tool',
          name: 'weather.get',
          result: '{"temp":25}',
          truncated: true
        }
      })
    )

    expect(chat.streaming).toMatchObject({ runId: 'r-tool', text: '' })
    expect(chat.streaming.toolCalls).toEqual([
      {
        id: 'evt-tool-1',
        name: 'weather.get',
        status: 'done',
        result: '{"temp":25}',
        truncated: true
      }
    ])

    chat.applyDialogue(
      env({ id: 'evt-delta', payload: { run_id: 'r-tool', text: '北京今天 25°C。' } })
    )
    chatApi.listMessages.mockResolvedValue(
      page([restRow('msg-tool', 'assistant', '北京今天 25°C。')], 1)
    )
    chat.applyDialogue(
      env({
        id: 'evt-done-tool',
        type: 'message.done',
        payload: { run_id: 'r-tool', text: '北京今天 25°C。', turns: 2 }
      })
    )

    expect(chat.messages.find((message) => message.id === 'evt-done-tool')?.toolCalls).toHaveLength(
      1
    )
    await vi.waitFor(() => {
      expect(chat.messages.map((message) => message.id)).toEqual(['msg-tool'])
    })
    expect(chat.messages[0].toolCalls[0]).toMatchObject({
      name: 'weather.get',
      result: '{"temp":25}',
      truncated: true
    })
    expect(chat.messages[0].turns).toBe(2)
  })

  it('done 带 error：定稿为 error 态（文本为空也收尾）', async () => {
    const chat = useChatStore()
    chat.sending = true
    chat.applyDialogue(env({ id: 'evt-1', payload: { run_id: 'r1', text: '半截' } }))
    chat.applyDialogue(
      env({
        id: 'evt-done',
        type: 'message.done',
        payload: { run_id: 'r1', text: '', turns: 1, error: '模型调用失败' }
      })
    )

    const m = chat.messages.find((it) => it.id === 'evt-done')
    expect(m.status).toBe(MESSAGE_STATUS.ERROR)
    expect(m.error).toBe('模型调用失败')
    expect(m.text).toBe('半截') // 回退用已聚合文本
    expect(chat.sending).toBe(false)
  })
})

describe('chat store · 幂等去重', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('insertSorted 按 id 去重', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    const msg = { id: 'evt-1', role: 'system', text: 'a', channel: 'alert' }
    chat.insertSorted(msg)
    chat.insertSorted(msg)
    expect(chat.messages).toHaveLength(1)
  })

  it('同一 done 事件重复到达不重复入列（补发 at-least-once 边界）', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chatApi.listMessages.mockResolvedValue(page([], 0))
    const done = env({
      id: 'evt-done',
      type: 'message.done',
      payload: { run_id: 'r1', text: '好', turns: 1 }
    })
    chat.applyDialogue(done)
    chat.applyDialogue(done)
    expect(chat.messages.filter((m) => m.id === 'evt-done')).toHaveLength(1)
  })

  it('reconcileMessages：fetched 与既有服务端消息按 id 去重并保持升序', () => {
    const existing = [
      { id: 'msg-002', role: 'assistant', text: 'b', channel: 'dialogue' },
      { id: 'msg-004', role: 'assistant', text: 'd', channel: 'dialogue' }
    ]
    const fetched = [
      { id: 'msg-001', role: 'user', text: 'a', channel: 'dialogue' },
      { id: 'msg-002', role: 'assistant', text: 'b', channel: 'dialogue' },
      { id: 'msg-003', role: 'user', text: 'c', channel: 'dialogue' }
    ]
    const merged = reconcileMessages(existing, fetched)
    expect(merged.map((m) => m.id)).toEqual(['msg-001', 'msg-002', 'msg-003', 'msg-004'])
  })

  it('reconcileMessages：未命中落库的 pending 保留；非对话 pending 原样保留（无 ts 保持相对序）', () => {
    const streaming = {
      id: 'stream-r1',
      role: 'assistant',
      text: '进行中',
      channel: 'dialogue',
      status: MESSAGE_STATUS.STREAMING
    }
    const alert = { id: 'evt-9', role: 'system', text: '告警', channel: 'alert' }
    const merged = reconcileMessages(
      [streaming, alert],
      [{ id: 'msg-001', role: 'user', text: 'hi', channel: 'dialogue' }]
    )
    expect(merged.map((m) => m.id)).toEqual(['msg-001', 'stream-r1', 'evt-9'])
  })
})

describe('chat store · 分页加载与合并', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const rows = (from, to) =>
    Array.from({ length: to - from + 1 }, (_, i) =>
      restRow(
        `msg-${String(from + i).padStart(3, '0')}`,
        i % 2 ? 'assistant' : 'user',
        `t${from + i}`
      )
    )

  it('loadMessages 加载最新一页（total 超一页时取末页），earliestPage 指向末页', async () => {
    chatApi.listMessages.mockImplementation((_sid, { page: p }) => {
      if (p === 1) return Promise.resolve(page(rows(1, 50), 120, 1))
      if (p === 3) return Promise.resolve(page(rows(101, 120), 120, 3))
      return Promise.resolve(page([], 120, p))
    })
    const chat = useChatStore()
    chat.currentSessionId = SID

    await chat.loadMessages(SID)

    expect(chat.messages).toHaveLength(20)
    expect(chat.messages[0].id).toBe('msg-101')
    expect(chat.currentBucket.earliestPage).toBe(3)
    expect(chat.currentBucket.total).toBe(120)
    expect(chat.hasEarlier).toBe(true)
  })

  it('loadEarlierMessages 向页首回退一页并前插（按 id 去重），earliestPage 递减', async () => {
    chatApi.listMessages.mockImplementation((_sid, { page: p }) => {
      if (p === 1) return Promise.resolve(page(rows(1, 50), 120, 1))
      if (p === 2) return Promise.resolve(page(rows(51, 100), 120, 2))
      if (p === 3) return Promise.resolve(page(rows(101, 120), 120, 3))
      return Promise.resolve(page([], 120, p))
    })
    const chat = useChatStore()
    chat.currentSessionId = SID
    await chat.loadMessages(SID)

    const added = await chat.loadEarlierMessages()
    expect(added).toBe(50)
    expect(chat.messages).toHaveLength(70)
    expect(chat.messages[0].id).toBe('msg-051')
    expect(chat.messages.at(-1).id).toBe('msg-120')
    expect(chat.currentBucket.earliestPage).toBe(2)

    await chat.loadEarlierMessages()
    expect(chat.currentBucket.earliestPage).toBe(1)
    expect(chat.hasEarlier).toBe(false)
    // 已到页首：不再发请求
    const calls = chatApi.listMessages.mock.calls.length
    await chat.loadEarlierMessages()
    expect(chatApi.listMessages.mock.calls.length).toBe(calls)
  })

  it('loadMessages 重复选择会话：已加载列表与末页对账，不产生重复', async () => {
    // 第二次拉取时服务端多出一条新落库消息（离开期间 run 仍在跑）
    chatApi.listMessages
      .mockResolvedValueOnce(page([restRow('msg-001', 'user', 'a')], 1))
      .mockResolvedValueOnce(
        page([restRow('msg-001', 'user', 'a'), restRow('msg-002', 'assistant', 'b')], 2)
      )
    const chat = useChatStore()
    chat.currentSessionId = SID

    await chat.loadMessages(SID)
    await chat.loadMessages(SID)

    expect(chat.messages.map((m) => m.id)).toEqual(['msg-001', 'msg-002'])
  })
})

describe('chat store · 时间线排序（ts 升序）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const T = (s) => `2026-08-03T10:00:${String(s).padStart(2, '0')}.000Z`

  it('insertIndexByTs：按 ts 定位、同 ts 稳定在后、无 ts 追加尾部、空列表为 0', () => {
    const list = [{ ts: T(1) }, { ts: T(3) }]
    expect(insertIndexByTs(list, T(2))).toBe(1)
    expect(insertIndexByTs(list, T(3))).toBe(2) // 同 ts 落在既有同 ts 行之后
    expect(insertIndexByTs(list, T(9))).toBe(2)
    expect(insertIndexByTs(list, undefined)).toBe(2) // 无 ts 追加尾部
    expect(insertIndexByTs([], T(2))).toBe(0)
  })

  it('insertSorted 乱序到达按 ts 落位，同 ts 保持到达序', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    const row = (id, ts) => ({ id, role: 'system', text: id, channel: 'alert', ts })
    chat.insertSorted(row('evt-c', T(7)))
    chat.insertSorted(row('evt-a', T(3)))
    chat.insertSorted(row('evt-b1', T(5)))
    chat.insertSorted(row('evt-b2', T(5))) // 同 ts：稳定落在 evt-b1 之后
    chat.insertSorted(row('evt-d', T(9)))
    expect(chat.messages.map((m) => m.id)).toEqual(['evt-a', 'evt-b1', 'evt-b2', 'evt-c', 'evt-d'])
  })

  it('先审批后用户消息回执：REST 对账后审批卡落在用户消息之后（按 ts）', async () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chatApi.listMessages.mockResolvedValue(page([], 0))
    await chat.loadMessages(SID) // loaded 置位（否则首次加载丢弃本地行）
    // 审批卡先经 WS 实时到达（ts 较晚）
    chat.applyInteraction(
      env({
        id: 'evt-int',
        channel: 'interaction',
        type: 'interaction.request',
        ts: T(5),
        payload: { interaction_id: 'int-1', type: 'confirm', question: '？', risk: 'low' }
      })
    )
    // 用户消息回执（REST，ts 较早）后至——refreshTail/loadMessages 对账路径
    chatApi.listMessages.mockResolvedValue(page([restRow('msg-001', 'user', '存报告', T(1))], 1))
    await chat.loadMessages(SID)

    expect(chat.messages.map((m) => m.id)).toEqual(['msg-001', 'evt-int'])
  })

  it('先 done 后 delta（迟到事件）：done 已按 ts 落位，更早 ts 的委派/审批仍插到其前', async () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chatApi.listMessages.mockResolvedValue(page([], 0))
    await chat.loadMessages(SID) // loaded 置位，done 后会真对账
    // done 先至（无流式行，补发乱序）：insertSorted 按 ts 落位
    chat.applyDialogue(
      env({
        id: 'evt-done',
        type: 'message.done',
        ts: T(9),
        payload: { run_id: 'r1', text: '完成', turns: 1 }
      })
    )
    // 迟到的同 run 委派 delta 归并回已完成的 Leader 行，不新增幽灵流式行
    chat.applyDialogue(
      env({
        id: 'evt-sub',
        type: 'subagent.delta',
        ts: T(4),
        agent: { id: 'query-1', name: 'query' },
        payload: { run_id: 'r1', text: '检索中' }
      })
    )
    // 迟到的审批（ts 居中）
    chat.applyInteraction(
      env({
        id: 'evt-int',
        channel: 'interaction',
        type: 'interaction.request',
        ts: T(6),
        payload: { interaction_id: 'int-1', type: 'confirm', question: '？' }
      })
    )

    expect(chat.messages.map((m) => m.type)).toEqual(['interaction.request', 'message.done'])
    expect(chat.messages.find((m) => m.type === 'message.done')?.delegations).toHaveLength(1)
    // done 触发的 REST 对账完成后，时间线次序保持
    await vi.waitFor(() => {
      expect(chat.messages.map((m) => m.type)).toEqual(['interaction.request', 'message.done'])
    })
  })

  it('流式中的 run 保持在尾部直到 done（运行中例外）', () => {
    const chat = useChatStore()
    chat.currentSessionId = SID
    chat.applyDialogue(env({ id: 'evt-1', ts: T(8), payload: { run_id: 'r1', text: '进行中' } }))
    // 流式期间到达的更早 ts 告警：落在流式行之前，流式行仍在尾部
    chat.applyAlert(
      env({ id: 'evt-alert', channel: 'alert', type: 'alert', ts: T(2), payload: { message: 'm' } })
    )
    expect(chat.messages.map((m) => m.id)).toEqual(['evt-alert', 'stream-r1'])
    expect(chat.messages.at(-1).status).toBe(MESSAGE_STATUS.STREAMING)
  })

  it('reconcileMessages：分页合并后全局按 ts 有序（本地未对账行按 ts 交错）', () => {
    const existing = [
      { id: 'evt-int-1', role: 'system', channel: 'interaction', text: '', ts: T(3) },
      { id: 'msg-051', role: 'assistant', text: 'a', channel: 'dialogue', ts: T(5) }
    ]
    const fetched = [
      { id: 'msg-001', role: 'user', text: 'q', channel: 'dialogue', ts: T(1) },
      { id: 'msg-002', role: 'assistant', text: 'a', channel: 'dialogue', ts: T(2) }
    ]
    const merged = reconcileMessages(existing, fetched)
    expect(merged.map((m) => m.id)).toEqual(['msg-001', 'msg-002', 'evt-int-1', 'msg-051'])
  })

  it('loadEarlierMessages 前插合并后全局按 ts 有序（含本地系统行交错）', async () => {
    const ids = (from, to) =>
      Array.from({ length: to - from + 1 }, (_, i) => `msg-${String(from + i).padStart(3, '0')}`)
    const rows = (from, to) =>
      Array.from({ length: to - from + 1 }, (_, i) =>
        restRow(
          `msg-${String(from + i).padStart(3, '0')}`,
          (from + i) % 2 ? 'assistant' : 'user',
          `t${from + i}`,
          T(from + i)
        )
      )
    chatApi.listMessages.mockImplementation((_sid, { page: p }) => {
      if (p === 1) return Promise.resolve(page(rows(1, 50), 51, 1))
      if (p === 2) return Promise.resolve(page(rows(51, 51), 51, 2))
      return Promise.resolve(page([], 51, p))
    })
    const chat = useChatStore()
    chat.currentSessionId = SID
    await chat.loadMessages(SID) // 末页：msg-051
    // 本地系统行（审批卡，ts 落在未加载区间中部）
    chat.insertSorted({
      id: 'evt-int',
      role: 'system',
      channel: 'interaction',
      text: '',
      ts: '2026-08-03T10:00:30.500Z'
    })

    await chat.loadEarlierMessages()

    expect(chat.messages.map((m) => m.id)).toEqual([...ids(1, 30), 'evt-int', ...ids(31, 51)])
  })
})
