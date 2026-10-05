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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const command = vi.hoisted(() => ({
  online: true,
  send: vi.fn(() => true)
}))
const interactionsApi = vi.hoisted(() => ({
  get: vi.fn()
}))

vi.mock('@/studio/commandGateway', () => ({
  sendStudioCommand: command.send,
  hasStudioCommandTransport: () => command.online,
  setStudioCommandTransport: vi.fn(),
  clearStudioCommandTransport: vi.fn()
}))
vi.mock('@/api/interactions', () => ({
  getProjectInteraction: interactionsApi.get
}))
vi.mock('@/api/chat', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  listMessages: vi.fn(),
  uploadAttachment: vi.fn()
}))

import { supportedInteractionRenderers } from '@/components/interaction/rendererRegistry'
import { normalizeInteraction, useInteractionsStore } from '@/stores/interactions'
import { useChatStore } from '@/stores/chat'

const kinds = [
  'confirm',
  'form',
  'single_select',
  'multi_select',
  'parameter',
  'image_select',
  'file_select',
  'map_select'
]

function rows() {
  return kinds.map((uiKind, index) => ({
    id: 'interaction-' + uiKind,
    project_id: 'project-1',
    conversation_id: 'conversation-1',
    workflow_id: 'workflow-1',
    task_id: index ? 'task-1' : '',
    kind: uiKind === 'confirm' ? 'confirm' : 'input',
    ui_kind: uiKind,
    status: 'pending',
    revision: index + 1,
    source_revision: index + 101,
    payload: {
      response_schema: { type: uiKind === 'multi_select' ? 'array' : 'object' },
      candidates:
        uiKind === 'image_select' || uiKind === 'file_select'
          ? [{ artifact_id: 'artifact-1', label: 'Server candidate' }]
          : []
    }
  }))
}

describe('v0.3 Interaction 与 SendScope', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    command.online = true
    command.send.mockReset()
    command.send.mockReturnValue(true)
    interactionsApi.get.mockReset()
    window.localStorage.clear()
  })

  it('只注册 confirm 与七类 input Renderer', () => {
    expect([...supportedInteractionRenderers].sort()).toEqual([...kinds].sort())
  })

  it('从 response_schema 和 Server candidates 恢复八类 Interaction', () => {
    const store = useInteractionsStore()
    store.hydrate('project-1', rows())

    expect(
      Object.values(store.records)
        .map((item) => item.uiKind)
        .sort()
    ).toEqual([...kinds].sort())
    expect(store.records['interaction-form'].schema).toEqual({ type: 'object' })
    expect(store.records['interaction-image_select'].candidates).toEqual([
      { artifact_id: 'artifact-1', label: 'Server candidate' }
    ])
    expect(normalizeInteraction({ payload: { ui_kind: 'unknown' } }).uiKind).toBe('unknown')
  })

  it('按 Framework StructuredPayload 解析 prompt、data 与两个 revision', () => {
    const record = normalizeInteraction({
      id: 'interaction-real',
      revision: 9,
      source_revision: 42,
      payload: JSON.stringify({
        type: 'input',
        ui_kind: 'single_select',
        prompt: '请选择执行环境',
        data: { options: [{ value: 'dev', label: '开发环境' }] },
        response_schema: JSON.stringify({
          type: 'object',
          required: ['value'],
          properties: { value: { type: 'string' } }
        })
      })
    })

    expect(record).toMatchObject({
      question: '请选择执行环境',
      uiKind: 'single_select',
      resourceRevision: 9,
      sourceRevision: 42,
      stateRevision: 42,
      options: [{ value: 'dev', label: '开发环境' }],
      schema: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } }
      }
    })
  })

  it('按公开接口发送八类 response，并携带 expected_state_revision', async () => {
    const store = useInteractionsStore()
    store.hydrate('project-1', rows())
    const responses = {
      confirm: { approved: true },
      form: { name: 'demo', retries: 2 },
      single_select: { value: 'choice-a' },
      multi_select: { values: ['choice-a', 'choice-b'] },
      parameter: { speed: 0.4 },
      image_select: { artifact_id: 'artifact-image' },
      file_select: { artifact_ids: ['artifact-a', 'artifact-b'] },
      map_select: {
        map_id: 'simulation_map',
        generation: 3,
        selections: [{ kind: 'region', entity_id: 'region-a' }]
      }
    }

    for (const [index, uiKind] of kinds.entries()) {
      const interactionId = 'interaction-' + uiKind
      expect(await store.submit(interactionId, responses[uiKind])).toBe(true)
      expect(command.send).toHaveBeenNthCalledWith(index + 1, 'interaction.reply', {
        interaction_id: interactionId,
        expected_state_revision: index + 101,
        response: responses[uiKind]
      })
      expect(await store.submit(interactionId, responses[uiKind])).toBe(false)
    }
  })

  it('资源 revision 前进不会覆盖来源状态 revision', async () => {
    const store = useInteractionsStore()
    store.hydrate('project-1', [rows()[1]])

    expect(
      store.applyEvent({
        project_id: 'project-1',
        resource_type: 'interaction',
        resource_id: 'interaction-form',
        revision: 20,
        type: 'interaction.updated',
        payload: { status: 'pending' }
      })
    ).toBe(true)
    expect(store.records['interaction-form']).toMatchObject({
      resourceRevision: 20,
      sourceRevision: 102,
      stateRevision: 102
    })

    await store.submit('interaction-form', { name: 'demo' })
    expect(command.send).toHaveBeenCalledWith('interaction.reply', {
      interaction_id: 'interaction-form',
      expected_state_revision: 102,
      response: { name: 'demo' }
    })
  })

  it('连接失败后先读取 Server 当前状态，再开放重试', async () => {
    const store = useInteractionsStore()
    store.hydrate('project-1', rows().slice(0, 1))
    command.send.mockReturnValue(false)
    interactionsApi.get.mockResolvedValue({
      id: 'interaction-confirm',
      project_id: 'project-1',
      status: 'answered',
      revision: 2,
      source_revision: 101,
      reply: { approved: true }
    })

    expect(await store.submit('interaction-confirm', { approved: true })).toBe(false)

    expect(interactionsApi.get).toHaveBeenCalledWith('project-1', 'interaction-confirm')
    expect(store.records['interaction-confirm'].status).toBe('answered')
    expect(store.isSubmitting('interaction-confirm')).toBe(false)
  })

  it('Task 消息提交明确范围且不写入 Leader Conversation 时间线', () => {
    const chat = useChatStore()
    chat.currentSessionId = 'conversation-1'
    chat.sessions = [{ id: 'conversation-1', title: 'Leader Conversation' }]
    const sendScope = {
      type: 'task',
      project_id: 'project-1',
      conversation_id: 'conversation-1',
      workflow_id: 'workflow-1',
      task_id: 'task-1',
      target_agent_id: 'developer',
      intent: 'task_feedback',
      map_binding: { map_id: 'simulation_map', generation: 3 },
      map_selection: {
        kind: 'point',
        map_id: 'simulation_map',
        generation: 3,
        frame_id: 'world',
        position: [1, 2, 0]
      }
    }

    expect(chat.sendChatMessage('请调整当前 Task', { sendScope })).toBe(true)

    expect(command.send).toHaveBeenCalledWith('chat.message', {
      session_id: 'conversation-1',
      conversation_id: 'conversation-1',
      text: '请调整当前 Task',
      attachments: [],
      interrupt_current: false,
      run_id: '',
      reasoning_effort: 'auto',
      reasoning_visibility: 'auto',
      send_scope: sendScope
    })
    expect(chat.messagesBySession['conversation-1']).toBeUndefined()
    expect(chat.sending).toBe(false)
  })

  it('缺少 Conversation 或连接离线时拒绝 SendScope', () => {
    const chat = useChatStore()
    command.online = false
    expect(
      chat.sendChatMessage('不能发送', {
        sendScope: {
          type: 'task',
          workflow_id: 'workflow-1',
          task_id: 'task-1',
          target_agent_id: 'developer',
          intent: 'task_feedback'
        }
      })
    ).toBe(false)
    expect(command.send).not.toHaveBeenCalled()
  })
})
