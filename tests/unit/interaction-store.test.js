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
// F4 interaction 审批队列（chat store）：入队 / 应答上行乐观出队 /
// message.done 对账防残留 / INTERACTION_REPLY_FAILED 改判 / 置顶 getter。
// 契约以代码为准：internal/interaction/service.go（RequestPayload 字段、
// 超时按拒绝）、internal/server/ws/chat.go（errorReply 不携带 interaction_id）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/chat', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  listMessages: vi.fn()
}))

// jsdom 无 WebSocket：stub 出可控假连接（readyState=1 使 client.send 放行，
// 手动触发 onopen 置 online），记录全部上行帧
class FakeSocket {
  static instances = []
  constructor(url) {
    this.url = url
    this.readyState = 1
    this.sent = []
    FakeSocket.instances.push(this)
  }
  send(data) {
    this.sent.push(JSON.parse(data))
  }
  close() {}
}

import * as chatApi from '@/api/chat'
import { INTERACTION_RESULT, INTERACTION_STATUS, MESSAGE_STATUS, useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'

const SID = 'cs-1'

// interaction.request 下行 envelope（docs/api/ws.md 定稿结构）
const reqEnv = (iid = 'int-1', over = {}) => ({
  id: `evt-${iid}`,
  session_id: SID,
  ts: '2026-08-03T10:00:05.000Z',
  agent: { id: 'leader', role: 'coordinator', name: 'leader' },
  channel: 'interaction',
  type: 'interaction.request',
  importance: 'critical',
  payload: {
    interaction_id: iid,
    type: 'confirm',
    question: '是否批准执行 artifact.put（风险等级：high）？',
    risk: 'high',
    source_revision: 7,
    timeout_ts: 1780000000
  },
  ...over
})

const doneEnv = (over = {}) => ({
  id: 'evt-done',
  session_id: SID,
  ts: '2026-08-03T10:01:00.000Z',
  agent: { id: 'leader', role: 'coordinator', name: 'leader' },
  channel: 'dialogue',
  type: 'message.done',
  importance: 'normal',
  payload: { run_id: 'r1', text: '好的', turns: 1 },
  ...over
})

// 建连并置 online（openChat 动态引入 dispatcher，需 await）
async function openOnline(chat) {
  useSessionStore().token = 'tk'
  await chat.openChat(SID)
  const sock = FakeSocket.instances.at(-1)
  sock.onopen()
  return sock
}

describe('chat store · interaction 审批队列', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    chatApi.listMessages.mockResolvedValue({ messages: [], total: 0, page: 1, page_size: 50 })
    const chat = useChatStore()
    chat.closeChat() // 清掉上个用例残留的模块级 chatClient（保证离线起点）
    chat.currentSessionId = SID
    await chat.loadMessages(SID) // 会话已选中（loaded 置位）
    chat.sessions = [{ id: SID, title: 't', updated_at: '2026-08-03T09:00:00.000Z' }]
  })

  it('interaction.request 入队：记录字段齐备、消息流落 interaction 行、置顶 getter 命中', () => {
    const chat = useChatStore()
    chat.applyInteraction(reqEnv('int-1'))

    expect(chat.pendingInteractions).toHaveLength(1)
    const rec = chat.pendingInteractions[0]
    expect(rec).toMatchObject({
      id: 'int-1',
      sessionId: SID,
      kind: 'confirm',
      question: '是否批准执行 artifact.put（风险等级：high）？',
      risk: 'high',
      stateRevision: 7,
      timeoutTs: 1780000000,
      status: INTERACTION_STATUS.PENDING
    })
    // 消息流中的 interaction 行（与队列共享同一记录引用）
    const row = chat.messages.find((m) => m.channel === 'interaction')
    expect(row).toBeTruthy()
    expect(row.interactionId).toBe('int-1')
    expect(chat.interactionsById['int-1']).toBe(rec)
    expect(chat.currentPendingInteraction?.id).toBe('int-1')
    // 会话列表按事件时间置顶刷新
    expect(chat.sessions[0].updated_at).toBe('2026-08-03T10:00:05.000Z')
  })

  it('同一 interaction 重复到达幂等：不重复入队、不重复落行（同事件 id）', () => {
    const chat = useChatStore()
    const env = reqEnv('int-1')
    chat.applyInteraction(env)
    chat.applyInteraction(env)
    expect(chat.pendingInteractions).toHaveLength(1)
    expect(chat.messages.filter((m) => m.channel === 'interaction')).toHaveLength(1)
  })

  it('replyInteraction 上行后保持 pending/submitting，等待 Server 结果且拒绝重复提交', async () => {
    const chat = useChatStore()
    const sock = await openOnline(chat)
    chat.applyInteraction(reqEnv('int-1'))

    const ok = chat.replyInteraction('int-1', true)

    expect(ok).toBe(true)
    expect(sock.sent).toEqual([
      {
        type: 'interaction.reply',
        interaction_id: 'int-1',
        expected_state_revision: 7,
        approved: true
      }
    ])
    expect(chat.pendingInteractions).toHaveLength(1)
    const rec = chat.interactionsById['int-1']
    expect(rec.status).toBe(INTERACTION_STATUS.PENDING)
    expect(rec.result).toBe('')
    expect(rec.submitting).toBe(true)
    expect(rec.repliedAt).toBeGreaterThan(0)
    // Server 尚未返回结果时也不允许重复提交。
    expect(chat.replyInteraction('int-1', false)).toBe(false)
    expect(sock.sent).toHaveLength(1)
  })

  it('离线时 replyInteraction 返回 false 且不出队', () => {
    const chat = useChatStore()
    chat.applyInteraction(reqEnv('int-1'))
    expect(chat.replyInteraction('int-1', true)).toBe(false)
    expect(chat.pendingInteractions).toHaveLength(1)
    expect(chat.interactionsById['int-1'].status).toBe(INTERACTION_STATUS.PENDING)
  })

  it('message.done 不终结独立 Interaction，仍等待 Server 结果或后续快照', () => {
    const chat = useChatStore()
    chat.applyInteraction(reqEnv('int-1'))

    chat.applyDialogue(doneEnv())

    expect(chat.pendingInteractions).toHaveLength(1)
    const rec = chat.interactionsById['int-1']
    expect(rec.status).toBe(INTERACTION_STATUS.PENDING)
    expect(rec.result).toBe('')
    expect(chat.currentPendingInteraction?.id).toBe('int-1')
  })

  it('message.done 不把 submitting Interaction 伪造成批准或超时', async () => {
    const chat = useChatStore()
    await openOnline(chat)
    chat.applyInteraction(reqEnv('int-1'))
    chat.replyInteraction('int-1', true)

    chat.applyDialogue(doneEnv())

    expect(chat.interactionsById['int-1'].status).toBe(INTERACTION_STATUS.PENDING)
    expect(chat.interactionsById['int-1'].submitting).toBe(true)
    expect(chat.interactionsById['int-1'].result).toBe('')
  })

  it('INTERACTION_REPLY_FAILED：改判最近一次应答记录为已超时（errorReply 无 interaction_id）', async () => {
    const chat = useChatStore()
    vi.spyOn(useUiStore(), 'notify').mockImplementation(() => ({}))
    await openOnline(chat)
    chat.applyInteraction(reqEnv('int-1'))
    chat.replyInteraction('int-1', true)
    expect(chat.interactionsById['int-1'].result).toBe('')

    chat.applyProtocolError({
      type: 'error',
      code: 'INTERACTION_REPLY_FAILED',
      message: '交互已终结，无法应答'
    })

    expect(chat.interactionsById['int-1'].result).toBe(INTERACTION_RESULT.EXPIRED)
    expect(chat.pendingInteractions).toHaveLength(0)
  })

  it('INTERACTION_REPLY_FAILED：无应答记录时吞掉队列中最老待办（本地时钟偏快场景）', () => {
    const chat = useChatStore()
    vi.spyOn(useUiStore(), 'notify').mockImplementation(() => ({}))
    chat.applyInteraction(reqEnv('int-1'))

    chat.applyProtocolError({ type: 'error', code: 'INTERACTION_REPLY_FAILED', message: 'x' })

    expect(chat.pendingInteractions).toHaveLength(0)
    expect(chat.interactionsById['int-1'].result).toBe(INTERACTION_RESULT.EXPIRED)
  })

  it('interaction.resolved（架构预留类型）对账出队', () => {
    const chat = useChatStore()
    chat.applyInteraction(reqEnv('int-1'))
    chat.applyInteraction(
      reqEnv('int-1', {
        id: 'evt-resolved-1',
        type: 'interaction.resolved',
        payload: { interaction_id: 'int-1', result: 'approved' }
      })
    )
    expect(chat.pendingInteractions).toHaveLength(0)
    expect(chat.interactionsById['int-1'].result).toBe(INTERACTION_RESULT.APPROVED)
  })

  it('置顶 getter：取当前会话最新一条待应答，跨会话不串', () => {
    const chat = useChatStore()
    chat.applyInteraction(reqEnv('int-1'))
    chat.applyInteraction(reqEnv('int-2', { session_id: 'cs-2' }))
    chat.applyInteraction(reqEnv('int-3'))

    expect(chat.currentPendingInteraction?.id).toBe('int-3')
    chat._resolveInteraction('int-3', INTERACTION_RESULT.APPROVED)
    expect(chat.currentPendingInteraction?.id).toBe('int-1')
  })
})
