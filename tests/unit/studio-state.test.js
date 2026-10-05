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

vi.mock('@/api/projects', () => ({
  getStudioSnapshot: vi.fn(),
  listProjects: vi.fn(),
  archiveProject: vi.fn(),
  listProjectConversations: vi.fn(),
  archiveProjectConversation: vi.fn()
}))
vi.mock('@/api/runs', () => ({
  listProjectRuns: vi.fn(),
  cancelRun: vi.fn()
}))

import * as projectsApi from '@/api/projects'
import { clearStudioState, loadStudioSnapshot } from '@/studio/bootstrap'
import { sanitizeLayout, sanitizeShell, useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useConversationStore } from '@/stores/conversation'
import { useRunsStore } from '@/stores/runs'
import { useInteractionsStore } from '@/stores/interactions'
import { useChatStore } from '@/stores/chat'
import { useArtifactsStore } from '@/stores/artifacts'
import { setStudioCommandTransport, clearStudioCommandTransport } from '@/studio/commandGateway'
import { createStudioSubscription } from '@/studio/subscription'

const snapshot = {
  snapshot_version: 1,
  event_sequence: 10,
  project: {
    id: 'project-1',
    name: '测试 Project',
    mode: 'development',
    is_active: true,
    revision: 2
  },
  conversations: [{ id: 'conversation-1', project_id: 'project-1', title: '测试对话' }],
  runs: [
    {
      id: 'run-1',
      project_id: 'project-1',
      conversation_id: 'conversation-1',
      status: 'running',
      trace_id: 'trace-1',
      revision: 2
    }
  ],
  pending_interactions: [
    {
      id: 'interaction-1',
      project_id: 'project-1',
      conversation_id: 'conversation-1',
      status: 'pending',
      revision: 1,
      payload: {
        question: '是否继续？',
        risk: 'high',
        timeout_ts: 1_800_000_000
      }
    }
  ],
  memory_revision: 3
}

describe('Studio v0.2 状态恢复', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    clearStudioCommandTransport()
  })

  it('按一个 Snapshot 原子填充 Project、Conversation、Run 和 Interaction', async () => {
    projectsApi.getStudioSnapshot.mockResolvedValue({ snapshot })
    await loadStudioSnapshot('project-1')

    expect(useProjectStore().lastEventSequence).toBe(10)
    expect(useConversationStore().currentId).toBe('conversation-1')
    expect(useRunsStore().activeForConversation('conversation-1')?.id).toBe('run-1')
    expect(useInteractionsStore().pending.map((item) => item.id)).toEqual(['interaction-1'])
    expect(useInteractionsStore().records['interaction-1'].question).toBe('是否继续？')
    expect(useInteractionsStore().records['interaction-1'].risk).toBe('high')
    expect(useInteractionsStore().records['interaction-1'].timeoutTs).toBe(1_800_000_000)
  })

  it('Task Planning Run 不会冒充可中断的 Conversation Run', () => {
    const runs = useRunsStore()
    runs.hydrate('project-1', [
      {
        id: 'run-planning',
        project_id: 'project-1',
        conversation_id: 'conversation-1',
        kind: 'task_planning',
        status: 'running',
        revision: 1
      }
    ])
    expect(runs.activeForConversation('conversation-1')).toBeNull()

    runs.upsert({
      id: 'run-conversation',
      project_id: 'project-1',
      conversation_id: 'conversation-1',
      kind: 'conversation',
      status: 'running',
      revision: 1
    })
    expect(runs.activeForConversation('conversation-1')?.id).toBe('run-conversation')
  })

  it('Project 快速切换时在 hydrate 前拒绝迟到的旧 Snapshot', async () => {
    let resolveFirst
    let firstIsCurrent = true
    const project2 = {
      ...snapshot,
      project: { ...snapshot.project, id: 'project-2', name: '第二个 Project' },
      conversations: [],
      runs: [],
      pending_interactions: [],
      event_sequence: 20
    }
    projectsApi.getStudioSnapshot
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce({ snapshot: project2 })

    const oldRequest = loadStudioSnapshot('project-1', {
      shouldApply: () => firstIsCurrent
    })
    firstIsCurrent = false
    await loadStudioSnapshot('project-2')
    resolveFirst({ snapshot })

    expect(await oldRequest).toBeNull()
    expect(useProjectStore().currentProjectId).toBe('project-2')
    expect(useProjectStore().lastEventSequence).toBe(20)
    expect(useConversationStore().projectId).toBe('project-2')
  })

  it('Project 切换前清空 Chat、Artifact 与各业务 Store', async () => {
    projectsApi.getStudioSnapshot.mockResolvedValue({ snapshot })
    await loadStudioSnapshot('project-1')
    const chat = useChatStore()
    const artifacts = useArtifactsStore()
    chat.messagesBySession['conversation-1'] = { list: [{ id: 'message-1' }] }
    artifacts.items = [{ id: 'artifact-1' }]

    clearStudioState()

    expect(chat.sessions).toEqual([])
    expect(chat.messagesBySession).toEqual({})
    expect(artifacts.items).toEqual([])
    expect(useConversationStore().projectId).toBe('')
    expect(useRunsStore().projectId).toBe('')
    expect(useInteractionsStore().projectId).toBe('')
    expect(useProjectStore().snapshotStatus).toBe('idle')
  })

  it('按 Project 全局 sequence 发现缺口，资源 revision 只负责拒绝旧状态', () => {
    const project = useProjectStore()
    const runs = useRunsStore()
    const interactions = useInteractionsStore()
    project.hydrateSnapshot(snapshot)
    runs.hydrate('project-1', snapshot.runs)
    interactions.hydrate('project-1', snapshot.pending_interactions)
    const onGap = vi.fn()
    const subscription = createStudioSubscription({
      projectId: 'project-1',
      afterSequence: 10,
      onGap
    })

    subscription.applyEvent({
      id: 'evt-11',
      project_id: 'project-1',
      resource_type: 'agent_run',
      resource_id: 'run-1',
      revision: 3,
      sequence: 11,
      type: 'run.started',
      session_id: 'conversation-1',
      parent: { run_id: 'run-1', trace_id: 'trace-1' },
      payload: { run: { status: 'running' } }
    })
    expect(project.lastEventSequence).toBe(11)
    expect(runs.byId('run-1').status).toBe('running')

    subscription.applyEvent({
      id: 'evt-13',
      project_id: 'project-1',
      resource_type: 'interaction',
      resource_id: 'interaction-1',
      revision: 2,
      sequence: 13,
      type: 'interaction.resolved',
      payload: {}
    })
    expect(onGap).toHaveBeenCalledWith(expect.objectContaining({ previousSequence: 11 }))
    expect(project.lastEventSequence).toBe(11)
  })

  it('Server 返回 SYNC_FAILED 时标记状态过期并请求重新读取 Snapshot', () => {
    const project = useProjectStore()
    project.hydrateSnapshot(snapshot)
    const onGap = vi.fn()
    const subscription = createStudioSubscription({
      projectId: 'project-1',
      afterSequence: 10,
      onGap
    })

    subscription.applyEvent({
      type: 'error',
      code: 'SYNC_FAILED',
      message: '增量存在缺口，请重新读取 Snapshot'
    })

    expect(project.stale).toBe(true)
    expect(onGap).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'SYNC_FAILED' }),
        previousSequence: 10
      })
    )
  })

  it('旧 revision 和重复 sequence 不会回退 Run 状态', async () => {
    const runs = useRunsStore()
    runs.hydrate('project-1', snapshot.runs)
    expect(
      runs.applyEvent({
        project_id: 'project-1',
        resource_type: 'agent_run',
        resource_id: 'run-1',
        resource_revision: 1,
        type: 'run.queued',
        payload: {}
      })
    ).toBe(false)
    expect(runs.byId('run-1').status).toBe('running')
  })

  it('Conversation 归档事件移除项目，并让当前 Conversation 回退到剩余项', () => {
    const conversations = useConversationStore()
    conversations.hydrate('project-1', [
      { ...snapshot.conversations[0], revision: 1 },
      {
        id: 'conversation-2',
        project_id: 'project-1',
        title: '备用对话',
        revision: 1
      }
    ])
    conversations.currentId = 'conversation-1'
    useChatStore().currentSessionId = 'conversation-1'

    expect(
      conversations.applyEvent({
        project_id: 'project-1',
        resource_type: 'conversation',
        resource_id: 'conversation-1',
        resource_revision: 2,
        type: 'conversation.archived',
        payload: {
          id: 'conversation-1',
          archived_at: '2026-08-08T12:00:00Z'
        }
      })
    ).toBe(true)

    expect(conversations.items.map((item) => item.id)).toEqual(['conversation-2'])
    expect(conversations.archivedItems.map((item) => item.id)).toEqual(['conversation-1'])
    expect(conversations.currentId).toBe('conversation-1')
    expect(useChatStore().sessions.map((item) => item.id)).toEqual(['conversation-2'])
    expect(useChatStore().currentSessionId).toBe('conversation-1')
    expect(conversations.currentArchived).toBe(true)
    expect(
      conversations.applyEvent({
        project_id: 'project-1',
        resource_type: 'conversation',
        resource_id: 'conversation-1',
        resource_revision: 1,
        type: 'conversation.archived',
        payload: { id: 'conversation-1', title: '过期标题' }
      })
    ).toBe(false)
    expect(conversations.archivedItems[0].title).toBe('测试对话')
  })

  it('Interaction 提交后等待 Server 事件，不在本地提前终结', async () => {
    const sent = []
    setStudioCommandTransport((type, payload) => {
      sent.push({ type, payload })
      return true
    })
    const interactions = useInteractionsStore()
    interactions.hydrate('project-1', snapshot.pending_interactions)

    expect(await interactions.submit('interaction-1', false)).toBe(true)
    expect(await interactions.submit('interaction-1', true)).toBe(false)
    expect(interactions.records['interaction-1'].status).toBe('pending')
    expect(interactions.isSubmitting('interaction-1')).toBe(true)
    expect(sent[0].type).toBe('interaction.reply')
    expect(sent).toHaveLength(1)

    interactions.applyEvent({
      id: 'evt-11',
      project_id: 'project-1',
      resource_type: 'interaction',
      resource_id: 'interaction-1',
      resource_revision: 2,
      type: 'interaction.resolved',
      payload: {
        interaction_id: 'interaction-1',
        status: 'answered',
        reply: { approved: false },
        revision: 2
      }
    })
    expect(interactions.records['interaction-1'].status).toBe('answered')
    expect(interactions.records['interaction-1'].reply).toEqual({ approved: false })
    expect(interactions.records['interaction-1'].result).toBe('rejected')
    expect(interactions.isSubmitting('interaction-1')).toBe(false)
  })

  it('按 archived_at 识别归档 Project，并在归档后重新获取活动列表', async () => {
    const projects = useProjectStore()
    projectsApi.listProjects.mockResolvedValueOnce({
      projects: [
        {
          id: 'archived-project',
          name: '已归档',
          archived_at: '2026-08-08T10:00:00Z',
          is_active: true,
          revision: 2
        },
        { id: 'project-2', name: '可用 Project', is_active: true, revision: 1 }
      ]
    })
    await projects.load({ includeArchived: true })
    expect(projects.items[0].archived).toBe(true)
    expect(projects.activeProject?.id).toBe('project-2')

    projectsApi.archiveProject.mockResolvedValue({
      project: {
        id: 'project-2',
        name: '可用 Project',
        archived_at: '2026-08-08T11:00:00Z',
        revision: 2
      }
    })
    const archivedProject = {
      id: 'project-2',
      name: '可用 Project',
      archived_at: '2026-08-08T11:00:00Z',
      revision: 2
    }
    projectsApi.listProjects.mockResolvedValueOnce({
      projects: [
        { id: 'project-3', name: '新活动 Project', is_active: true, revision: 1 },
        archivedProject
      ]
    })

    const archived = await projects.archive('project-2', { includeArchived: true })

    expect(archived.archived).toBe(true)
    expect(projectsApi.archiveProject).toHaveBeenCalledWith('project-2', 1)
    expect(projectsApi.listProjects).toHaveBeenLastCalledWith({ includeArchived: true })
    expect(projects.items.map((item) => item.id)).toEqual(['project-3', 'project-2'])
    expect(projects.activeProject?.id).toBe('project-3')
  })

  it('归档当前 Conversation 后移入归档列表并保持当前只读内容', async () => {
    const conversations = useConversationStore()
    const chat = useChatStore()
    const first = {
      id: 'conversation-1',
      project_id: 'project-1',
      title: '第一段对话',
      revision: 1
    }
    const second = {
      id: 'conversation-2',
      project_id: 'project-1',
      title: '第二段对话',
      revision: 1
    }
    conversations.hydrate('project-1', [first, second])
    await conversations.select(first.id, { loadMessages: false })
    projectsApi.archiveProjectConversation.mockResolvedValue({
      conversation: {
        ...first,
        archived_at: '2026-08-08T12:00:00Z',
        revision: 2
      }
    })

    await conversations.archive(first.id)

    expect(projectsApi.archiveProjectConversation).toHaveBeenCalledWith('project-1', first.id)
    expect(conversations.items.map((item) => item.id)).toEqual([second.id])
    expect(conversations.archivedItems.map((item) => item.id)).toEqual([first.id])
    expect(conversations.currentId).toBe(first.id)
    expect(chat.currentSessionId).toBe(first.id)
    expect(conversations.currentArchived).toBe(true)
  })

  it('可以加载并区分进行中与已归档 Conversation', async () => {
    const conversations = useConversationStore()
    projectsApi.listProjectConversations.mockResolvedValue({
      conversations: [
        {
          id: 'conversation-active',
          project_id: 'project-1',
          title: '进行中的对话',
          revision: 1
        },
        {
          id: 'conversation-archived',
          project_id: 'project-1',
          title: '已归档的对话',
          archived_at: '2026-08-08T12:00:00Z',
          revision: 2
        }
      ]
    })

    await conversations.load('project-1', { includeArchived: true })

    expect(projectsApi.listProjectConversations).toHaveBeenCalledWith('project-1', {
      includeArchived: true
    })
    expect(conversations.items.map((item) => item.id)).toEqual(['conversation-active'])
    expect(conversations.archivedItems.map((item) => item.id)).toEqual(['conversation-archived'])
  })

  it('归档非当前会话不清除当前生成状态，迟到归档不污染另一个 Project', async () => {
    const conversations = useConversationStore()
    const chat = useChatStore()
    conversations.hydrate('project-1', [
      snapshot.conversations[0],
      {
        id: 'other',
        project_id: 'project-1',
        title: '另一段对话'
      }
    ])
    conversations.currentId = 'conversation-1'
    chat.currentSessionId = 'conversation-1'
    chat.streaming = { runId: 'active-run' }
    chat.sending = true
    conversations.moveToArchive('other')
    expect(chat.streaming).toEqual({ runId: 'active-run' })
    expect(chat.sending).toBe(true)
    expect(conversations.currentId).toBe('conversation-1')
    let resolveArchive
    projectsApi.archiveProjectConversation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveArchive = resolve
        })
    )
    const request = conversations.archive('conversation-1')
    conversations.hydrate('project-2', [{ id: 'new', project_id: 'project-2' }])
    resolveArchive({ conversation: { ...snapshot.conversations[0], archived: true } })
    await request
    expect(conversations.items.map((item) => item.id)).toEqual(['new'])
    expect(conversations.archivedItems).toEqual([])
  })

  it('布局只保存资源定位参数，不保存消息、Run 或 Interaction 正文', () => {
    const sanitized = sanitizeLayout({
      grid: {
        root: {
          data: {
            views: [
              {
                id: 'conversation',
                params: {
                  panelType: 'conversation',
                  projectId: 'project-1',
                  resourceId: 'conversation-1',
                  messages: [{ text: '不能保存' }],
                  run: { id: 'run-1' },
                  interaction: { question: '不能保存' }
                }
              }
            ]
          }
        }
      }
    })
    const text = JSON.stringify(sanitized)
    expect(text).toContain('conversation-1')
    expect(text).not.toContain('不能保存')
    expect(text).not.toContain('run-1')
  })

  it('损坏布局只回退布局，不修改业务 Store', () => {
    const project = useProjectStore()
    project.items = [snapshot.project]
    localStorage.setItem('semantic-studio:layout:v2:project-1:debug', '{broken')
    const layout = useLayoutStore()
    expect(layout.load('project-1', 'debug')).toBeNull()
    expect(layout.phase).toBe('invalid')
    expect(project.items).toHaveLength(1)
  })

  it('布局 v2 固定区域尺寸范围并拒绝未知导航容器', () => {
    expect(
      sanitizeShell(
        {
          primaryWidth: 12,
          secondaryWidth: 900,
          bottomHeight: 20,
          primaryView: 'unknown',
          bottomTab: 'unknown'
        },
        'debug'
      )
    ).toMatchObject({
      primaryWidth: 240,
      secondaryWidth: 640,
      bottomHeight: 180,
      primaryView: 'run',
      bottomTab: 'activity'
    })
  })

  it('可以持久化 Pinia 中被代理的 Dock 布局和区域尺寸', () => {
    const layout = useLayoutStore()
    layout.projectId = 'project-1'
    layout.preset = 'default'
    layout.dockLayout = {
      grid: {
        root: {
          data: {
            views: [{ id: 'conversation', params: { panelType: 'conversation' } }]
          }
        }
      }
    }
    layout.shell.primaryWidth = 330

    expect(layout.persistShell()).toBe(true)
    expect(
      JSON.parse(localStorage.getItem('semantic-studio:layout:v2:project-1:default')).shell
        .primaryWidth
    ).toBe(330)
    expect(layout.phase).toBe('ready')
  })

  it('按 Project 记住最后使用的工作区预设', () => {
    const layout = useLayoutStore()
    expect(layout.preferredPreset('project-1')).toBe('default')
    expect(layout.rememberPreset('project-1', 'debug')).toBe(true)
    expect(layout.preferredPreset('project-1')).toBe('debug')
    expect(layout.rememberPreset('project-1', 'unknown')).toBe(false)
    expect(layout.preferredPreset('project-1')).toBe('debug')
  })
})
