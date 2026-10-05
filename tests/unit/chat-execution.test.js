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

// 会话执行策略数据层：mode 与宿主开关必须原子更新，并以 Server 响应为准。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/chat', () => ({
  getSessionExecution: vi.fn(),
  updateSessionExecution: vi.fn(),
  deleteSession: vi.fn()
}))

import * as chatApi from '@/api/chat'
import { useChatStore } from '@/stores/chat'

const SID = 'cs-execution'

describe('chat store · 会话执行策略', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('读取 ask 默认策略和 Server 宿主硬开关', async () => {
    chatApi.getSessionExecution.mockResolvedValue({
      execution: {
        mode: 'ask',
        host_execution_enabled: false,
        host_execution_allowed: true,
        busy: false
      }
    })
    const chat = useChatStore()
    chat.currentSessionId = SID

    const result = await chat.loadSessionExecution()

    expect(chatApi.getSessionExecution).toHaveBeenCalledWith(SID)
    expect(result.mode).toBe('ask')
    expect(chat.currentExecution).toEqual(result)
    expect(chat.executionLoadingSession).toBe('')
  })

  it('mode 与 enabled 一次提交，并只采用后端确认结果', async () => {
    chatApi.updateSessionExecution.mockResolvedValue({
      execution: {
        mode: 'full',
        host_execution_enabled: true,
        host_execution_allowed: true,
        busy: false
      }
    })
    const chat = useChatStore()
    chat.currentSessionId = SID

    const result = await chat.saveSessionExecution(SID, { mode: 'full', enabled: true })

    expect(chatApi.updateSessionExecution).toHaveBeenCalledWith(SID, {
      mode: 'full',
      enabled: true
    })
    expect(chat.currentExecution).toEqual(result)
    expect(chat.executionSavingSession).toBe('')
  })

  it('删除会话时同步清除对应执行策略缓存', async () => {
    const chat = useChatStore()
    chat.sessions = [{ id: SID }]
    chat.executionBySession[SID] = { mode: 'auto' }
    chatApi.deleteSession.mockResolvedValue(undefined)

    await chat.deleteSession(SID)

    expect(chat.executionBySession[SID]).toBeUndefined()
  })
})
