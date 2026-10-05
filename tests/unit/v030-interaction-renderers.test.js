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
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const transport = vi.hoisted(() => ({
  send: vi.fn(() => true)
}))

vi.mock('@/studio/commandGateway', () => ({
  sendStudioCommand: transport.send,
  hasStudioCommandTransport: () => true,
  setStudioCommandTransport: vi.fn(),
  clearStudioCommandTransport: vi.fn()
}))
vi.mock('@/api/interactions', () => ({
  getProjectInteraction: vi.fn()
}))
vi.mock('@/api/chat', () => ({
  listMessages: vi.fn(() => Promise.resolve({ messages: [], total: 0 }))
}))

import InteractionShell from '@/components/interaction/InteractionShell.vue'
import PromptInput from '@/components/chat/PromptInput.vue'
import ConversationPlanSummary from '@/components/studio/ConversationPlanSummary.vue'
import { useConversationStore } from '@/stores/conversation'
import { useInteractionsStore } from '@/stores/interactions'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useChatStore } from '@/stores/chat'
import { useWorkflowStore } from '@/stores/workflow'
import { useLayoutStore } from '@/stores/layout'
import { setStudioPanelOpener, clearStudioPanelOpener } from '@/studio/panelService'

const apps = []

function record(id, uiKind, { data = {}, schema = {} } = {}) {
  return {
    id,
    project_id: 'project-1',
    conversation_id: 'conversation-1',
    workflow_id: 'workflow-1',
    task_id: 'task-1',
    type: 'input',
    ui_kind: uiKind,
    revision: 3,
    source_revision: 17,
    payload: JSON.stringify({
      type: 'input',
      ui_kind: uiKind,
      prompt: '请提供输入',
      data,
      response_schema: schema
    })
  }
}

async function mountInteraction(row, prepare) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const interactions = useInteractionsStore()
  interactions.hydrate('project-1', [row])
  prepare?.({ interactions })
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(InteractionShell, {
    interaction: interactions.records[row.id]
  })
  app.use(pinia)
  app.use(ElementPlus)
  app.mount(el)
  apps.push(app)
  await vi.waitFor(() => {
    expect(el.querySelector('.interaction-shell')).toBeTruthy()
    if (interactions.records[row.id].status === 'pending') {
      expect(
        el.querySelector(
          '.actions, .form-renderer, .choice-renderer, .resource-renderer, .map-select-renderer, .unsupported'
        )
      ).toBeTruthy()
    } else {
      expect(el.querySelector('.compact-summary')).toBeTruthy()
    }
  })
  return { el, interactions }
}

function buttonByText(el, text) {
  return [...el.querySelectorAll('button')].find((button) => button.textContent.includes(text))
}

describe('v0.3 Interaction Renderer → Store → Project WS', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    transport.send.mockReset()
    transport.send.mockReturnValue(true)
  })

  afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
  })

  it.each([
    ['single_select', false, { value: 'choice-a' }],
    ['multi_select', true, { values: ['choice-a'] }]
  ])('%s 提交 Framework value/values 对象', async (uiKind, multiple, expected) => {
    const row = record('interaction-choice', uiKind, {
      data: {
        options: [
          { value: 'choice-a', label: '选项 A' },
          { value: 'choice-b', label: '选项 B' }
        ]
      },
      schema: multiple
        ? {
            type: 'object',
            required: ['values'],
            properties: { values: { type: 'array', items: { type: 'string' } } }
          }
        : {
            type: 'object',
            required: ['value'],
            properties: { value: { type: 'string' } }
          }
    })
    const { el } = await mountInteraction(row)
    const input = el.querySelector('input')
    input.click()
    await nextTick()
    buttonByText(el, '提交选择').click()

    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith('interaction.reply', {
        interaction_id: row.id,
        expected_state_revision: 17,
        response: expected
      })
    )
  })

  it('选择项不满足时可填写“其他”并按既定 value 结构提交', async () => {
    const row = record('interaction-choice-other', 'single_select', {
      data: {
        options: [
          { value: 'complete', label: '完整实现' },
          { value: 'core', label: '核心功能' }
        ]
      },
      schema: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } }
      }
    })
    const { el, interactions } = await mountInteraction(row)
    const other = el.querySelector('.other-choice input')
    other.value = '先完成数据迁移验证'
    other.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(interactions.drafts[row.id]).toMatchObject({ other: '先完成数据迁移验证' })
    buttonByText(el, '提交选择').click()
    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith(
        'interaction.reply',
        expect.objectContaining({ response: { value: '先完成数据迁移验证' } })
      )
    )
  })

  it('单选按 Server Schema 的动态字段名提交', async () => {
    const row = record('interaction-resubmit', 'single_select', {
      data: {
        options: [
          { value: 'stop_and_resubmit', label: '停止原 Workflow 后重新提交' },
          { value: 'wait', label: '继续等待' }
        ]
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['confirm_resubmit'],
        properties: {
          confirm_resubmit: {
            type: 'string',
            enum: ['stop_and_resubmit', 'wait']
          }
        }
      }
    })
    const { el } = await mountInteraction(row)
    el.querySelector('input').click()
    await nextTick()
    buttonByText(el, '提交选择').click()

    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith('interaction.reply', {
        interaction_id: row.id,
        expected_state_revision: 17,
        response: { confirm_resubmit: 'stop_and_resubmit' }
      })
    )
  })

  it('Leader 的 plan.suggest 在 Conversation 中显示为进入规划确认', async () => {
    const row = {
      id: 'interaction-plan-suggestion',
      project_id: 'project-1',
      conversation_id: 'conversation-1',
      run_id: 'run-1',
      agent: 'leader',
      type: 'confirm',
      status: 'pending',
      source_revision: 8,
      payload: JSON.stringify({
        type: 'confirm',
        prompt: '这个目标包含多个相互依赖的步骤，是否先生成计划？',
        data: { action: 'enter_plan', goal: '完成跨模块实现' },
        response_schema: {
          type: 'object',
          required: ['approved'],
          properties: { approved: { type: 'boolean' } }
        }
      })
    }
    const { el } = await mountInteraction(row)
    expect(el.textContent).toContain('规划建议')
    expect(buttonByText(el, '进入规划')).toBeTruthy()
    expect(buttonByText(el, '继续协作')).toBeTruthy()
    buttonByText(el, '进入规划').click()
    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith('interaction.reply', {
        interaction_id: row.id,
        expected_state_revision: 8,
        response: { approved: true }
      })
    )
  })

  it('Form 提交表单对象本身，不增加 values 包装层', async () => {
    const row = record('interaction-form', 'form', {
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: '名称' } }
      }
    })
    const { el } = await mountInteraction(row)
    const input = el.querySelector('input')
    input.value = 'demo'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    buttonByText(el, '提交').click()

    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith(
        'interaction.reply',
        expect.objectContaining({
          expected_state_revision: 17,
          response: { name: 'demo' }
        })
      )
    )
  })

  it('无必填字段的表单可跳过，并提交空响应对象', async () => {
    const row = record('interaction-optional-form', 'form', {
      schema: {
        type: 'object',
        properties: { note: { type: 'string', title: '补充说明' } }
      }
    })
    const { el } = await mountInteraction(row)

    buttonByText(el, '跳过').click()

    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith('interaction.reply', {
        interaction_id: row.id,
        expected_state_revision: 17,
        response: {}
      })
    )
  })

  it('表单类可取消询问，且不把取消误当作回答或停止 Workflow', async () => {
    const row = record('interaction-cancel-form', 'form', {
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: '名称' } }
      }
    })
    const { el } = await mountInteraction(row)

    buttonByText(el, '取消询问').click()

    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith('interaction.cancel', {
        interaction_id: row.id,
        expected_state_revision: 17
      })
    )
    expect(transport.send).not.toHaveBeenCalledWith('workflow.stop', expect.anything())
  })

  it('稍后处理只在本地折叠，Interaction仍保留在待办中', async () => {
    const row = record('interaction-later', 'form', {
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: '名称' } }
      }
    })
    const { el, interactions } = await mountInteraction(row)

    buttonByText(el, '稍后处理').click()
    await nextTick()

    expect(interactions.pending.map((item) => item.id)).toContain(row.id)
    expect(interactions.isCollapsed(row.id)).toBe(true)
    expect(transport.send).not.toHaveBeenCalled()
    expect(el.textContent).toContain('继续处理')

    buttonByText(el, '继续处理').click()
    await nextTick()
    expect(interactions.isCollapsed(row.id)).toBe(false)
    expect(el.textContent).toContain('稍后处理')
  })

  it('已解决Interaction折叠为一行摘要且不再显示表单操作', async () => {
    const row = {
      ...record('interaction-resolved', 'form', {
        schema: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', title: '名称' } }
        }
      }),
      status: 'cancelled'
    }
    const { el } = await mountInteraction(row)

    expect(el.querySelector('.compact-summary')).toBeTruthy()
    expect(el.textContent).toContain('已取消')
    expect(el.querySelector('form')).toBeNull()
  })

  it('confirm仅保留确认与拒绝，不出现跳过或取消询问', async () => {
    const row = record('interaction-confirm-actions', 'confirm', {
      schema: {
        type: 'object',
        required: ['approved'],
        properties: { approved: { type: 'boolean' } }
      }
    })
    const { el } = await mountInteraction(row)

    expect(buttonByText(el, '确认')).toBeTruthy()
    expect(buttonByText(el, '拒绝')).toBeTruthy()
    expect(buttonByText(el, '跳过')).toBeUndefined()
    expect(buttonByText(el, '取消询问')).toBeUndefined()
  })

  it('Studio先同步完整记录时，实时事件仍在Conversation补入唯一消息行', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const row = record('interaction-message-row', 'form', {
      schema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } }
      }
    })
    const interactions = useInteractionsStore()
    interactions.hydrate('project-1', [row])
    const chat = useChatStore()
    chat.currentSessionId = 'conversation-1'

    const event = {
      id: 'event-interaction-message-row',
      session_id: 'conversation-1',
      channel: 'interaction',
      type: 'interaction.request',
      ts: '2026-08-20T05:00:00Z',
      payload: {
        interaction_id: row.id,
        type: 'input',
        question: '请提供输入'
      }
    }
    chat.applyInteraction(event)
    chat.applyInteraction(event)

    expect(chat.messages.filter((message) => message.interactionId === row.id)).toHaveLength(1)
    expect(chat.interactionsById[row.id]).toMatchObject({
      uiKind: 'form',
      schema: expect.objectContaining({ required: ['name'] })
    })
  })

  it.each([
    ['image_select', { artifact_id: 'artifact-1' }],
    ['file_select', { artifact_id: 'artifact-1' }]
  ])('%s 只能提交 Server 候选 artifact', async (uiKind, expected) => {
    const row = record('interaction-resource-' + uiKind, uiKind, {
      data: {
        candidates: [
          {
            artifact_id: 'artifact-1',
            label: 'Server candidate',
            media_type: uiKind === 'image_select' ? 'image/png' : 'text/plain'
          }
        ]
      },
      schema: {
        type: 'object',
        required: ['artifact_id'],
        properties: { artifact_id: { type: 'string' } }
      }
    })
    const { el } = await mountInteraction(row)
    el.querySelector('.resource-renderer > button').click()
    await nextTick()
    buttonByText(el, '提交资源').click()

    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith(
        'interaction.reply',
        expect.objectContaining({ response: expected })
      )
    )
  })

  it('map_select 提交 map_id、generation 和已保存 Region entity_id', async () => {
    const row = record('interaction-map', 'map_select', {
      schema: {
        type: 'object',
        required: ['map_id', 'generation', 'selections']
      }
    })
    const { el } = await mountInteraction(row, () => {
      const map = useSemanticMapStore()
      map.projectId = 'project-1'
      map.snapshots.simulation_map = {
        map_id: 'simulation_map',
        generation: 4,
        revision: 2,
        frame_id: 'world',
        entities: [
          {
            id: 'region-1',
            generation: 4,
            geometry: { kind: 'region' },
            status: 'active'
          }
        ],
        relations: []
      }
      map.beginSelection(row.id)
      map.select({ kind: 'region', entity_id: 'region-1' })
    })
    buttonByText(el, '提交选择').click()

    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith('interaction.reply', {
        interaction_id: row.id,
        expected_state_revision: 17,
        response: {
          map_id: 'simulation_map',
          generation: 4,
          selections: [{ kind: 'region', entity_id: 'region-1' }]
        }
      })
    )
  })

  it('map_select 拒绝 removed Entity 并清除草稿', async () => {
    const row = record('interaction-map-removed', 'map_select')
    const { el, interactions } = await mountInteraction(row, ({ interactions: store }) => {
      const map = useSemanticMapStore()
      map.projectId = 'project-1'
      map.activeMapId = 'simulation_map'
      map.snapshots.simulation_map = {
        map_id: 'simulation_map',
        generation: 4,
        revision: 3,
        entities: [
          { id: 'removed-1', generation: 4, status: 'removed', geometry: { kind: 'box' } }
        ],
        relations: []
      }
      map.selectionPurpose = row.id
      map.selection = {
        kind: 'entity',
        entity_id: 'removed-1',
        map_id: 'simulation_map',
        generation: 4
      }
      store.setDraft(row.id, map.selection)
    })

    await vi.waitFor(() => expect(interactions.drafts[row.id]).toBeUndefined())
    expect(buttonByText(el, '提交选择').disabled).toBe(true)
  })

  it('map_select 打开时立即清除旧 generation 草稿', async () => {
    const row = record('interaction-map-stale', 'map_select')
    const { interactions } = await mountInteraction(row, ({ interactions: store }) => {
      const map = useSemanticMapStore()
      map.projectId = 'project-1'
      map.activeMapId = 'simulation_map'
      map.snapshots.simulation_map = {
        map_id: 'simulation_map',
        generation: 5,
        revision: 1,
        entities: [],
        relations: []
      }
      store.setDraft(row.id, { map_id: 'simulation_map', generation: 4, kind: 'entity' })
    })

    await vi.waitFor(() => expect(interactions.drafts[row.id]).toBeUndefined())
  })

  it('PromptInput 展示并发送明确的 Task SendScope', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const chat = useChatStore()
    chat.connectionStatus = 'online'
    chat.currentSessionId = 'conversation-1'
    const sendScope = {
      type: 'task',
      conversation_id: 'conversation-1',
      workflow_id: 'workflow-1',
      task_id: 'task-1',
      target_agent_id: 'developer',
      intent: 'task_feedback',
      map_binding: { map_id: 'simulation_map', generation: 4 }
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(PromptInput, { sendScope })
    app.use(pinia)
    app.use(ElementPlus)
    app.mount(el)
    apps.push(app)
    await nextTick()

    expect(el.querySelector('.agent-pill').textContent).toContain('Task · developer')
    const input = el.querySelector('textarea')
    input.value = '调整当前 Task'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    el.querySelector('.send-btn').click()

    expect(transport.send).toHaveBeenCalledWith(
      'chat.message',
      expect.objectContaining({
        conversation_id: 'conversation-1',
        text: '调整当前 Task',
        send_scope: sendScope
      })
    )
    expect(chat.messagesBySession['conversation-1']).toBeUndefined()
  })

  it('PromptInput 只把正式 Map Entity 引用写入 send_scope', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const chat = useChatStore()
    chat.connectionStatus = 'online'
    chat.currentSessionId = 'conversation-1'
    const map = useSemanticMapStore()
    map.projectId = 'project-1'
    map.activeMapId = 'simulation_map'
    map.snapshots.simulation_map = {
      map_id: 'simulation_map',
      generation: 8,
      revision: 2,
      entities: [
        {
          id: 'box-17',
          name: '周转箱 17',
          map_id: 'simulation_map',
          generation: 8,
          revision: 2,
          status: 'active',
          geometry: { kind: 'box' },
          pose: { position: { x: 1.2, y: 0.4, z: 0.3 } }
        }
      ],
      relations: []
    }
    map.beginSelection('chat:conversation-1')
    expect(map.select({ kind: 'entity', entity_id: 'box-17' })).toBe(true)

    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(PromptInput)
    app.use(pinia)
    app.use(ElementPlus)
    app.mount(el)
    apps.push(app)
    await nextTick()

    expect(el.querySelector('[data-testid="chat-map-binding"]').textContent).toContain('周转箱 17')
    const input = el.querySelector('textarea')
    input.value = '规划搬运这个箱子'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    el.querySelector('.send-btn').click()

    await vi.waitFor(() =>
      expect(transport.send).toHaveBeenCalledWith(
        'chat.message',
        expect.objectContaining({
          conversation_id: 'conversation-1',
          text: '规划搬运这个箱子',
          send_scope: expect.objectContaining({
            type: 'conversation',
            conversation_id: 'conversation-1',
            map_binding: {
              map_id: 'simulation_map',
              generation: 8,
              selections: [{ kind: 'entity', entity_id: 'box-17' }]
            }
          })
        })
      )
    )
    expect(JSON.stringify(transport.send.mock.calls.at(-1))).not.toContain('position')
    expect(map.selection).toBeNull()
  })

  it('规划模式仍通过当前 Conversation 发消息，而不是直接创建 Workflow', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const chat = useChatStore()
    chat.connectionStatus = 'online'
    chat.currentSessionId = 'conversation-1'
    window.localStorage.setItem('semantic-studio:conversation-mode:v1:conversation-1', 'plan')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(PromptInput)
    app.use(pinia)
    app.use(ElementPlus)
    app.mount(el)
    apps.push(app)
    await nextTick()

    expect(el.querySelector('.scope-intent').textContent).toBe('规划')
    const input = el.querySelector('textarea')
    input.value = '先阅读项目，再和我确认验收范围'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    el.querySelector('.send-btn').click()

    expect(transport.send).toHaveBeenCalledWith(
      'chat.message',
      expect.objectContaining({
        conversation_id: 'conversation-1',
        text: '先阅读项目，再和我确认验收范围',
        send_scope: expect.objectContaining({
          type: 'conversation',
          conversation_id: 'conversation-1',
          intent: 'plan'
        })
      })
    )
    expect(useWorkflowStore().workflow).toBeNull()
  })

  it('Plan Proposal 在来源 Conversation 内紧凑展示并可打开计划文档', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const workflow = useWorkflowStore()
    const conversation = useConversationStore()
    conversation.hydrate('project-1', [
      { id: 'conversation-1', project_id: 'project-1', title: '实施讨论' }
    ])
    workflow.hydrate('project-1', {
      plan_proposal: {
        id: 'proposal-1',
        project_id: 'project-1',
        conversation_id: 'conversation-1',
        status: 'ready',
        revision: 4,
        goal: '生成项目文件',
        structured_plan: {
          tasks: [{ id: 'task-1', goal: '生成项目文件', required_role: 'developer' }]
        },
        document_markdown: '# 实施计划'
      }
    })
    const layout = useLayoutStore()
    layout.projectId = 'project-1'
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(ConversationPlanSummary)
    app.use(pinia)
    app.use(ElementPlus)
    app.mount(el)
    apps.push(app)
    await nextTick()

    expect(el.querySelector('.plan-summary-message').textContent).toContain('生成项目文件')
    expect(el.querySelector('.plan-summary-message').textContent).toContain('1 个主要 Task')
    const open = vi.fn(() => true)
    setStudioPanelOpener(open)
    const selection = layout.selectedResource
    buttonByText(el, '查看计划').click()
    expect(open).toHaveBeenCalledWith('plan-document', {
      resourceId: 'proposal-1'
    })
    expect(layout.selectedResource).toBe(selection)
    clearStudioPanelOpener()
  })

  it('在新 Conversation 中显示 Proposal 来源并可回到规划对话', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const conversation = useConversationStore()
    const workflow = useWorkflowStore()
    conversation.hydrate('project-1', [
      { id: 'conversation-old', project_id: 'project-1', title: '旧规划对话' },
      { id: 'conversation-new', project_id: 'project-1', title: '拆码垛规划' }
    ])
    conversation.currentId = 'conversation-new'
    workflow.hydrate('project-1', {
      plan_proposal: {
        id: 'proposal-old',
        project_id: 'project-1',
        conversation_id: 'conversation-old',
        goal: '旧的未完成计划',
        status: 'ready',
        revision: 2,
        structured_plan: { tasks: [] }
      }
    })

    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp(ConversationPlanSummary)
    app.use(pinia)
    app.use(ElementPlus)
    app.mount(el)
    apps.push(app)
    await nextTick()

    expect(el.querySelector('.plan-summary-message')).toBeTruthy()
    expect(el.textContent).toContain('当前 Project 的计划正在另一个 Conversation 中讨论')
    expect(el.textContent).toContain('旧规划对话')
    expect(buttonByText(el, '返回规划对话')).toBeTruthy()

    buttonByText(el, '返回规划对话').click()
    await vi.waitFor(() => expect(conversation.currentId).toBe('conversation-old'))
    expect(buttonByText(el, '查看计划')).toBeTruthy()
  })
})
