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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from '@/stores/chat'
import { useRunsStore } from '@/stores/runs'
import { fromRest } from '@/stores/chatModel'
vi.mock('@/api/chat', () => ({
  listMessages: vi.fn().mockResolvedValue({ messages: [], total: 0 })
}))

describe('会话收件人与共享消息流', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('定向发送的 Service Agent 工具过程作为本轮回复而不是委派块', () => {
    const chat = useChatStore()
    chat.currentSessionId = 'conversation'
    useRunsStore().upsert({
      id: 'run-service',
      agent_id: 'query-1',
      kind: 'conversation',
      status: 'running'
    })
    chat.applyDialogue({
      session_id: 'conversation',
      channel: 'dialogue',
      agent: { id: 'query-1', role: 'service' },
      type: 'tool.call',
      payload: { run_id: 'run-service', call_id: 'tool-1', name: 'system.get' }
    })
    expect(chat.messages).toHaveLength(1)
    expect(chat.messages[0].agentName).toBe('query-1')
    expect(chat.messages[0].toolCalls).toHaveLength(1)
    expect(chat.messages[0].delegations).toHaveLength(0)
  })
  it('两个 Run 的交错事件复用各自的消息行，不复制或串写文本', () => {
    const chat = useChatStore()
    chat.currentSessionId = 'conversation'
    const send = (id, text) =>
      chat.applyDialogue({
        session_id: 'conversation',
        channel: 'dialogue',
        type: 'message.delta',
        agent: { id },
        payload: { run_id: id, text }
      })
    send('robot:arm', 'A')
    send('leader', 'B')
    send('robot:arm', 'C')
    expect(chat.messages.map((item) => [item.agentName, item.text])).toEqual([
      ['robot:arm', 'AC'],
      ['leader', 'B']
    ])
  })
  it('历史恢复保留本条消息的收件人', () => {
    expect(
      fromRest({
        id: 'message',
        role: 'user',
        content: '查询',
        metadata: { target_agent_id: 'robot:arm' }
      }).targetAgentId
    ).toBe('robot:arm')
  })
})
