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
// 审批卡刷新恢复（chat store）：selectSession 拉 REST interactions 全量
// （不带 status——端点 interactions.go 空 status 不过滤，返回全部状态）：
// pending 重建待应答队列（payload 映射 ApprovalCard 记录、倒序响应转正序
// 入队）；已终结（answered/expired/cancelled）映射为带结果徽标的历史行，
// 按 created_at 落在时间线原位；本地已知记录不改判、重复恢复幂等、
// 恢复失败不阻塞会话打开。
// 契约以代码为准：internal/server/http/handlers/interactions.go（响应视图
// 字段、按创建时间倒序、空 status 返回全部）、internal/interaction/
// service.go RequestPayload/replyPayload（{"approved":bool}）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/chat', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  listMessages: vi.fn()
}))
vi.mock('@/api/interactions', () => ({
  listInteractions: vi.fn()
}))

// jsdom 无 WebSocket：stub 出可控假连接（openChat 需要，永不触发 onopen）
class FakeSocket {
  send() {}
  close() {}
}

import * as chatApi from '@/api/chat'
import * as interactionsApi from '@/api/interactions'
import { INTERACTION_RESULT, INTERACTION_STATUS, useChatStore } from '@/stores/chat'
import { useUiStore } from '@/stores/ui'
import { useInteractionsStore } from '@/stores/interactions'
import { createStudioSubscription } from '@/studio/subscription'

const SID = 'cs-1'

// REST 交互行（interactions.go interactionView 形态；端点按创建时间倒序返回）
const restRow = (iid, over = {}) => ({
  id: iid,
  session_id: SID,
  agent: 'leader',
  type: 'confirm',
  status: 'pending',
  payload: {
    interaction_id: iid,
    type: 'confirm',
    question: `是否批准 ${iid}？`,
    risk: 'high',
    timeout_ts: 1780000000
  },
  reply: null,
  run_id: 'run-1',
  created_at: '2026-08-03T10:00:05.000Z',
  answered_at: null,
  expired_at: null,
  ...over
})

const listResp = (interactions, over = {}) => ({
  interactions,
  page: 1,
  page_size: 100,
  total: interactions.length,
  ...over
})

describe('chat store · 审批卡恢复（全量：pending 队列 + 已终结历史行）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('WebSocket', FakeSocket)
    chatApi.listMessages.mockResolvedValue({ messages: [], total: 0, page: 1, page_size: 50 })
    interactionsApi.listInteractions.mockResolvedValue(listResp([]))
    const chat = useChatStore()
    chat.closeChat() // 清掉上个用例残留的模块级 chatClient
    chat.sessions = [{ id: SID, title: 't', updated_at: '2026-08-03T09:00:00.000Z' }]
  })

  it('selectSession 拉全量 interactions（不带 status）：pending 重建队列，已终结落历史行', async () => {
    // 端点按创建时间倒序：int-4（新）在前，int-1（旧）在后
    interactionsApi.listInteractions.mockResolvedValue(
      listResp([
        restRow('int-4', { status: 'expired', created_at: '2026-08-03T10:00:08.000Z' }),
        restRow('int-3', {
          status: 'answered',
          reply: { approved: false },
          created_at: '2026-08-03T10:00:07.000Z',
          answered_at: '2026-08-03T10:00:07.500Z'
        }),
        restRow('int-2', {
          status: 'answered',
          reply: { approved: true },
          created_at: '2026-08-03T10:00:06.000Z',
          answered_at: '2026-08-03T10:00:06.500Z'
        }),
        restRow('int-1')
      ])
    )
    const chat = useChatStore()

    await chat.selectSession(SID)

    // 不带 status（端点空 status 返回全部状态）
    expect(interactionsApi.listInteractions).toHaveBeenCalledWith({
      sessionId: SID,
      page: 1,
      pageSize: 100
    })
    // 仅 pending 入队（队列按创建升序；置顶卡取尾部最新一条）
    expect(chat.pendingInteractions.map((it) => it.id)).toEqual(['int-1'])
    expect(chat.currentPendingInteraction?.id).toBe('int-1')
    // pending 记录字段映射（payload → ApprovalCard 记录）
    expect(chat.interactionsById['int-1']).toMatchObject({
      sessionId: SID,
      kind: 'confirm',
      question: '是否批准 int-1？',
      risk: 'high',
      timeoutTs: 1780000000,
      agentName: 'leader',
      status: INTERACTION_STATUS.PENDING,
      result: ''
    })
    // 已终结映射结果徽标（reply.approved/status），resolved 不可再操作
    expect(chat.interactionsById['int-2']).toMatchObject({
      status: INTERACTION_STATUS.RESOLVED,
      result: INTERACTION_RESULT.APPROVED
    })
    expect(chat.interactionsById['int-3'].result).toBe(INTERACTION_RESULT.REJECTED)
    expect(chat.interactionsById['int-4'].result).toBe(INTERACTION_RESULT.EXPIRED)
    // 全部落消息行（evt-restored- 前缀，与记录共享引用），按 created_at 升序
    const rows = chat.messages.filter((m) => m.channel === 'interaction')
    expect(rows.map((m) => m.id)).toEqual([
      'evt-restored-int-1',
      'evt-restored-int-2',
      'evt-restored-int-3',
      'evt-restored-int-4'
    ])
    expect(rows[1].interactionId).toBe('int-2')
    expect(chat.interactionsById['int-2'].question).toBe('是否批准 int-2？')
  })

  it('已终结历史行按 created_at 落在时间线原位（用户消息后、助手回复前）', async () => {
    chatApi.listMessages.mockResolvedValue({
      messages: [
        {
          id: 'msg-001',
          role: 'user',
          content: '把报告存起来',
          created_at: '2026-08-03T10:00:01.000Z'
        },
        {
          id: 'msg-002',
          role: 'assistant',
          content: '报告已存好。',
          created_at: '2026-08-03T10:00:04.000Z'
        }
      ],
      total: 2,
      page: 1,
      page_size: 50
    })
    interactionsApi.listInteractions.mockResolvedValue(
      listResp([
        restRow('int-2', { created_at: '2026-08-03T10:00:03.000Z' }), // 仍 pending
        restRow('int-1', {
          status: 'answered',
          reply: { approved: true },
          created_at: '2026-08-03T10:00:02.000Z'
        })
      ])
    )
    const chat = useChatStore()

    await chat.selectSession(SID)

    expect(chat.messages.map((m) => m.id)).toEqual([
      'msg-001',
      'evt-restored-int-1',
      'evt-restored-int-2',
      'msg-002'
    ])
  })

  it('cancelled 行映射"已取消"；answered 缺 reply 按已拒绝、未知状态兜底已超时', async () => {
    interactionsApi.listInteractions.mockResolvedValue(
      listResp([
        restRow('int-3', { status: 'weird', created_at: '2026-08-03T10:00:07.000Z' }),
        restRow('int-2', {
          status: 'answered',
          reply: null,
          created_at: '2026-08-03T10:00:06.000Z'
        }),
        restRow('int-1', { status: 'cancelled' })
      ])
    )
    const chat = useChatStore()
    chat.currentSessionId = SID // 直接调 restoreInteractions（不经 selectSession）需先选中会话

    await chat.restoreInteractions(SID)

    expect(chat.interactionsById['int-1']).toMatchObject({
      status: INTERACTION_STATUS.RESOLVED,
      result: INTERACTION_RESULT.CANCELLED
    })
    expect(chat.interactionsById['int-2'].result).toBe(INTERACTION_RESULT.REJECTED)
    expect(chat.interactionsById['int-3'].result).toBe(INTERACTION_RESULT.EXPIRED)
    // 已终结均不入待应答队列，但都落历史行
    expect(chat.pendingInteractions).toHaveLength(0)
    expect(chat.messages.filter((m) => m.channel === 'interaction')).toHaveLength(3)
  })

  it('本地已知记录不改判，但缺失的历史消息行仍恢复', async () => {
    interactionsApi.listInteractions.mockResolvedValue(
      listResp([
        restRow('int-2', {
          status: 'answered',
          reply: { approved: false },
          created_at: '2026-08-03T10:00:06.000Z'
        }),
        restRow('int-1')
      ])
    )
    const chat = useChatStore()
    chat.currentSessionId = SID // 直接调 restoreInteractions（不经 selectSession）需先选中会话
    // 模拟刷新前 WS 实时到达、且已被本地应答（乐观出队）的同 id 记录
    chat.interactionsById['int-2'] = {
      id: 'int-2',
      sessionId: SID,
      kind: 'confirm',
      question: '旧记录',
      risk: 'low',
      timeoutTs: 1780000000,
      agentName: 'leader',
      ts: '2026-08-03T10:00:06.000Z',
      status: INTERACTION_STATUS.RESOLVED,
      result: INTERACTION_RESULT.APPROVED,
      repliedAt: Date.now()
    }

    const restored = await chat.restoreInteractions(SID)

    expect(restored).toBe(2) // int-1 新建，int-2 只补缺失的消息行
    expect(chat.pendingInteractions.map((it) => it.id)).toEqual(['int-1'])
    // 本地已知记录以本地状态为准（不被 REST 行覆盖改判）
    expect(chat.interactionsById['int-2'].result).toBe(INTERACTION_RESULT.APPROVED)
    expect(chat.interactionsById['int-2'].question).toBe('旧记录')
    expect(chat.messages.filter((m) => m.channel === 'interaction')).toHaveLength(2)
  })

  const choice = (over = {}) =>
    restRow('int-choice', {
      conversation_id: SID,
      resource_revision: 3,
      source_revision: 7,
      type: 'single_select',
      ui_kind: 'single_select',
      question: '请选择目标托盘列',
      response_schema: {
        type: 'object',
        required: ['target_column'],
        properties: {
          target_column: { type: 'string', enum: ['column-a', 'column-b'] }
        }
      },
      payload: {
        type: 'single_select',
        question: '请选择目标托盘列',
        candidates: [
          { value: 'column-a', label: '目标 A 列' },
          { value: 'column-b', label: '目标 B 列' }
        ]
      },
      ...over
    })

  it('真实 Snapshot→消息 REST→Interaction REST 顺序仍恢复完整选择卡并按创建时间落位', async () => {
    const chat = useChatStore()
    const interactions = useInteractionsStore()
    interactions.hydrate('project-1', [choice()])
    expect(chat.interactionsById['int-choice'].schema.required).toEqual(['target_column'])
    expect(chat.messagesBySession[SID]).toBeUndefined()
    chatApi.listMessages.mockResolvedValue({
      messages: [
        {
          id: 'msg-before',
          role: 'user',
          content: '搬到目标托盘',
          created_at: '2026-08-03T10:00:01.000Z'
        },
        {
          id: 'msg-after',
          role: 'assistant',
          content: '等待你选择目标列。',
          created_at: '2026-08-03T10:00:10.000Z'
        }
      ],
      total: 2,
      page: 1,
      page_size: 50
    })
    interactionsApi.listInteractions.mockResolvedValue(listResp([choice()]))
    await chat.selectSession(SID, { connect: false })
    await chat.restoreInteractions(SID)
    expect(chat.messages.map((message) => message.id)).toEqual([
      'msg-before',
      'evt-restored-int-choice',
      'msg-after'
    ])
    expect(chat.pendingInteractions.filter((record) => record.id === 'int-choice')).toHaveLength(1)
    expect(chat.interactionsById['int-choice']).toMatchObject({
      kind: 'single_select',
      uiKind: 'single_select',
      resourceRevision: 3,
      stateRevision: 7,
      options: [
        { value: 'column-a', label: '目标 A 列' },
        { value: 'column-b', label: '目标 B 列' }
      ]
    })
  })

  it('REST→Snapshot→重复恢复只保留一行，切换别的会话不串卡', async () => {
    const chat = useChatStore()
    interactionsApi.listInteractions.mockResolvedValue(listResp([choice()]))
    await chat.selectSession(SID, { connect: false })
    useInteractionsStore().hydrate('project-1', [choice()])
    await chat.restoreInteractions(SID)
    // 即使收到错误范围的 REST 行，也不能把它放进刚选择的另一个 Conversation。
    await chat.selectSession('cs-other', { connect: false })
    expect(chat.messages).toEqual([])
    expect(
      chat.messagesBySession[SID].list.filter((row) => row.interactionId === 'int-choice')
    ).toHaveLength(1)
    await chat.selectSession(SID, { connect: false })
    expect(chat.messages.filter((row) => row.interactionId === 'int-choice')).toHaveLength(1)
  })

  it('迟到的 pending REST 只补消息行，不覆盖新版已回答状态和字段', async () => {
    const chat = useChatStore()
    useInteractionsStore().hydrate('project-1', [
      choice({
        status: 'answered',
        resource_revision: 5,
        source_revision: 8,
        reply: { target_column: 'column-b' },
        question: '新版问题'
      })
    ])
    interactionsApi.listInteractions.mockResolvedValue(listResp([choice({ resource_revision: 2 })]))
    await chat.selectSession(SID, { connect: false })
    expect(chat.interactionsById['int-choice']).toMatchObject({
      status: 'resolved',
      resourceRevision: 5,
      stateRevision: 8,
      question: '新版问题',
      reply: { target_column: 'column-b' }
    })
    expect(chat.pendingInteractions).toHaveLength(0)
    expect(chat.messages.filter((row) => row.interactionId === 'int-choice')).toHaveLength(1)
  })

  it('REST 不可用仍显示 Snapshot 已确认的待答卡', async () => {
    const chat = useChatStore()
    useInteractionsStore().hydrate('project-1', [choice()])
    interactionsApi.listInteractions.mockRejectedValue(new Error('补查失败'))
    vi.spyOn(useUiStore(), 'notify').mockImplementation(() => ({}))
    await chat.selectSession(SID, { connect: false })
    expect(chat.messages.filter((row) => row.interactionId === 'int-choice')).toHaveLength(1)
    expect(chat.interactionsById['int-choice'].status).toBe('pending')
  })

  it('实时 interaction.ask requested 先同步领域记录再分发消息，重放也只插所属会话一行', async () => {
    const chat = useChatStore()
    chat.currentSessionId = 'cs-other'
    useInteractionsStore().hydrate('project-1', [])
    const subscription = createStudioSubscription({ projectId: 'project-1' })
    const event = {
      id: 'evt-choice-live',
      project_id: 'project-1',
      conversation_id: SID,
      resource_type: 'interaction',
      resource_id: 'int-choice',
      resource_revision: 3,
      sequence: 1,
      type: 'interaction.requested',
      occurred_at: choice().created_at,
      payload: { ...choice(), interaction_id: 'int-choice' }
    }
    subscription.applyEvent(event)
    subscription.applyEvent(event)
    expect(
      chat.messagesBySession[SID].list.find((row) => row.interactionId === 'int-choice').id
    ).toBe('evt-choice-live')
    interactionsApi.listInteractions.mockResolvedValue(listResp([choice()]))
    await chat.selectSession(SID, { connect: false })
    expect(chat.messages.filter((row) => row.interactionId === 'int-choice')).toHaveLength(1)
    expect(chat.messages.find((row) => row.interactionId === 'int-choice').ts).toBe(
      choice().created_at
    )
    expect(chat.messagesBySession['cs-other']?.list || []).toEqual([])
    expect(chat.interactionsById['int-choice']).toMatchObject({
      uiKind: 'single_select',
      stateRevision: 7
    })
    subscription.stop()
  })

  it('无交互记录：空集恢复，队列与消息流均无新增', async () => {
    const chat = useChatStore()

    await chat.selectSession(SID)

    expect(chat.pendingInteractions).toHaveLength(0)
    expect(chat.currentPendingInteraction).toBeNull()
    expect(chat.messages.filter((m) => m.channel === 'interaction')).toHaveLength(0)
  })

  it('恢复失败不阻塞会话打开：消息照常加载，仅告警提示', async () => {
    interactionsApi.listInteractions.mockRejectedValue(
      Object.assign(new Error('服务内部错误'), { code: 'INTERNAL' })
    )
    const notify = vi.spyOn(useUiStore(), 'notify').mockImplementation(() => ({}))
    const chat = useChatStore()

    await chat.selectSession(SID) // 不抛出

    expect(chat.currentBucket?.loaded).toBe(true)
    expect(chat.pendingInteractions).toHaveLength(0)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        message: expect.stringContaining('审批记录恢复失败')
      })
    )
  })

  it('重复 selectSession/恢复幂等：同 id 不重复入队、不重复落行', async () => {
    interactionsApi.listInteractions.mockResolvedValue(
      listResp([
        restRow('int-2', {
          status: 'answered',
          reply: { approved: true },
          created_at: '2026-08-03T10:00:06.000Z'
        }),
        restRow('int-1')
      ])
    )
    const chat = useChatStore()

    await chat.selectSession(SID)
    await chat.restoreInteractions(SID) // 再次恢复（如断线重连后手动刷新）

    expect(chat.pendingInteractions).toHaveLength(1)
    expect(chat.messages.filter((m) => m.channel === 'interaction')).toHaveLength(2)
  })

  it('total 超页大小时翻页拉全（跨页合并后按创建升序入队/落行）', async () => {
    const ts = (i) => new Date(Date.parse('2026-08-03T10:00:00.000Z') + i * 1000).toISOString()
    // 端点按创建时间倒序分页：第 1 页 int-101…int-2，第 2 页 int-1
    const page1Rows = Array.from({ length: 100 }, (_, k) => {
      const i = 101 - k
      return restRow(`int-${i}`, { created_at: ts(i) })
    })
    interactionsApi.listInteractions.mockImplementation(({ page: p }) => {
      if (p === 1) return Promise.resolve(listResp(page1Rows, { total: 101 }))
      return Promise.resolve(listResp([restRow('int-1', { created_at: ts(1) })], { total: 101 }))
    })
    const chat = useChatStore()
    chat.currentSessionId = SID // 直接调 restoreInteractions（不经 selectSession）需先选中会话

    const restored = await chat.restoreInteractions(SID)

    expect(restored).toBe(101)
    expect(interactionsApi.listInteractions).toHaveBeenCalledTimes(2)
    // 跨页合并反转后全局创建升序：最旧在队首，最新在队尾（置顶卡取尾部）
    expect(chat.pendingInteractions).toHaveLength(101)
    expect(chat.pendingInteractions[0].id).toBe('int-1')
    expect(chat.pendingInteractions.at(-1).id).toBe('int-101')
    // 消息行按 ts 全局升序
    const rows = chat.messages.filter((m) => m.channel === 'interaction')
    expect(rows).toHaveLength(101)
    expect(rows[0].id).toBe('evt-restored-int-1')
    expect(rows.at(-1).id).toBe('evt-restored-int-101')
  })
})
