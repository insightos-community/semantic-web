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
// ChatView 组件级冒烟：挂载真实组件树（MessageStream/MessageRow/PromptInput），
// 覆盖模板运行时错误（图标导入/指令/响应式接线）——逻辑正确性由
// chat-store.test.js 保证，本文件只保证"页面能渲染、关键交互元素在位"。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import piniaPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'

vi.mock('@/api/chat', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  listMessages: vi.fn(),
  uploadAttachment: vi.fn(),
  getSessionExecution: vi.fn(),
  updateSessionExecution: vi.fn(),
  listArtifacts: vi.fn(),
  registerWorkspaceArtifact: vi.fn(),
  getArtifact: vi.fn(),
  deleteArtifact: vi.fn()
}))
vi.mock('@/api/interactions', () => ({
  listInteractions: vi.fn()
}))
vi.mock('@/api/agents', () => ({
  listAgents: vi.fn(),
  listSessionAgents: vi.fn(),
  updateSessionAgentModel: vi.fn()
}))
vi.mock('@/api/settings', () => ({
  getSettings: vi.fn()
}))
// jsdom 无 WebSocket：默认不触发 onopen，指定测试可显式 open，验证真实发送路径。
class FakeSocket {
  constructor() {
    this.readyState = 0
    this.sent = []
    FakeSocket.latest = this
  }

  open() {
    this.readyState = 1
    this.onopen?.()
  }

  send(payload) {
    this.sent.push(payload)
  }

  close() {
    this.readyState = 3
  }
}

import * as agentsApi from '@/api/agents'
import * as chatApi from '@/api/chat'
import * as interactionsApi from '@/api/interactions'
import * as settingsApi from '@/api/settings'
import ChatView from '@/views/ChatView.vue'
import { useChatStore } from '@/stores/chat'
import { useSessionStore } from '@/stores/session'
import { useRunsStore } from '@/stores/runs'
import { useWorkflowStore } from '@/stores/workflow'
import { clearStudioCommandTransport, setStudioCommandTransport } from '@/studio/commandGateway'

function mount() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const pinia = createPinia()
  pinia.use(piniaPersistedstate)
  const app = createApp(ChatView)
  app.use(pinia)
  app.use(ElementPlus)
  // MessageRow 的"追踪"入口（R19）在 setup 注入 router：挂 memory 路由消除告警
  // （catch-all 匹配初始位置，组件树仍是直接挂载的 ChatView）
  app.use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
    })
  )
  app.mount(el)
  return { app, el }
}

describe('ChatView · 冒烟挂载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearStudioCommandTransport()
    vi.stubGlobal('WebSocket', FakeSocket)
    FakeSocket.latest = null
    localStorage.clear()
    document.body.innerHTML = ''
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file) => `blob:${file.name}`)
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn()
    })
    chatApi.listSessions.mockResolvedValue({
      sessions: [
        {
          id: 'cs-1',
          project_id: 'proj-default-user',
          title: '历史会话',
          updated_at: '2026-08-03T10:00:00.000Z'
        }
      ]
    })
    chatApi.listMessages.mockResolvedValue({
      messages: [
        { id: 'msg-001', role: 'user', content: '你好', created_at: '2026-08-03T10:00:00.000Z' },
        {
          id: 'msg-002',
          role: 'assistant',
          content: '**你好**！`code`',
          created_at: '2026-08-03T10:00:01.000Z'
        }
      ],
      page: 1,
      page_size: 50,
      total: 2
    })
    chatApi.getSessionExecution.mockResolvedValue({
      execution: {
        mode: 'ask',
        host_execution_enabled: false,
        host_execution_allowed: true,
        busy: false
      }
    })
    chatApi.listArtifacts.mockResolvedValue({
      artifacts: [
        {
          id: 'art-report',
          media_type: 'application/json',
          size: 128,
          summary: '数据分析报告',
          metadata: { workspace_path: '.semantic-output/profile.json' }
        }
      ]
    })
    chatApi.registerWorkspaceArtifact.mockResolvedValue({
      artifact: {
        id: 'art-new',
        media_type: 'application/json',
        size: 256,
        summary: '新登记报告',
        metadata: { workspace_path: '.semantic-output/new-report.json' }
      }
    })
    // R19：selectSession 的审批卡恢复链路（默认无待应答）
    interactionsApi.listInteractions.mockResolvedValue({
      interactions: [],
      page: 1,
      page_size: 100,
      total: 0
    })
    // roster（roster.go AgentInfo 形态）：侧栏 Team 状态区数据源
    agentsApi.listAgents.mockResolvedValue({
      agents: [
        { id: 'leader', role: 'leader', mode: 'coordinator', status: 'idle', model: 'mock' },
        { id: 'monitor-1', role: 'monitor', mode: 'observer', status: 'running', model: 'mock' },
        { id: 'query-1', role: 'query', mode: 'service', status: 'idle', model: 'mock' }
      ]
    })
    agentsApi.listSessionAgents.mockResolvedValue({
      agents: [
        {
          agent_id: 'leader',
          role: 'leader',
          endpoint_id: 'mock',
          model: 'mock',
          reasoning_effort: 'auto',
          source: 'system_default',
          default_inherited: true,
          busy: false
        }
      ]
    })
    settingsApi.getSettings.mockResolvedValue({
      settings: {
        llm: {
          default: 'mock',
          providers: { mock: { component: 'mock', model: 'mock', capabilities: ['text'] } }
        }
      },
      base_hash: 'hash-1',
      key_sources: {}
    })
  })

  it('挂载渲染 IDE 工作台、三种布局、运行检查器与支持图片的输入区', async () => {
    const { el } = mount()
    await vi.waitFor(() => {
      expect(el.textContent).toContain('历史会话')
    })
    expect(el.textContent).toContain('新建')
    expect(el.textContent).toContain('Embodied Agent Workbench')
    for (const layout of ['调试', '对话', '专注']) expect(el.textContent).toContain(layout)
    expect(el.querySelector('.workbench-inspector')).toBeTruthy()
    expect(el.textContent).toContain('Agent 配置')
    expect(el.textContent).toContain('最近实际模型')
    expect(el.textContent).toContain('执行权限')
    expect(el.textContent).toContain('Server 已允许宿主')
    expect(el.querySelector('textarea')).toBeTruthy()
    const stream = el.querySelector('.message-stream')
    expect(stream).toBeTruthy()
    expect(stream.parentElement?.classList.contains('message-stream-shell')).toBe(true)
    const upload = el.querySelector('.upload-btn')
    expect(upload?.disabled).toBe(false)
    expect(upload?.getAttribute('title')).toContain('添加图片')
  })

  it('选择会话：加载历史消息并渲染 markdown（助手徽标 leader）', async () => {
    const { el } = mount()
    await vi.waitFor(() => {
      expect(el.textContent).toContain('历史会话')
    })
    const chat = useChatStore()
    await chat.selectSession('cs-1')

    await vi.waitFor(() => {
      const rows = el.querySelectorAll('.message-row')
      expect(rows.length).toBe(2)
    })
    const html = el.innerHTML
    expect(html).toContain('<strong>你好</strong>')
    expect(html).toContain('<code>code</code>')
    expect(el.textContent).toContain('leader')
    expect(el.querySelector('.answer-label')).toBeNull()
    // 未连接（FakeSocket 不开）：输入禁用
    expect(el.querySelector('textarea')?.disabled).toBe(true)
  })

  it('输入区支持一次拖入或粘贴多张图片，并可在发送前移除', async () => {
    chatApi.uploadAttachment.mockImplementation(async (file) => ({
      attachment: {
        id: `art-${file.name}`,
        name: file.name,
        media_type: file.type,
        size: file.size,
        content_url: `/api/v1/chat/attachments/art-${file.name}`
      }
    }))
    const { el } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    const composer = el.querySelector('.prompt-input')
    const first = new File(['a'], 'first.png', { type: 'image/png' })
    const second = new File(['b'], 'second.webp', { type: 'image/webp' })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [first, second] } })

    composer.dispatchEvent(drop)
    await vi.waitFor(() => expect(el.querySelectorAll('.attachment-chip')).toHaveLength(2))
    expect(chatApi.uploadAttachment).toHaveBeenCalledTimes(2)

    el.querySelector('.attachment-chip button').click()
    await vi.waitFor(() => expect(el.querySelectorAll('.attachment-chip')).toHaveLength(1))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first.png')

    const third = new File(['c'], 'third.jpg', { type: 'image/jpeg' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        items: [{ kind: 'file', getAsFile: () => third }],
        getData: () => ''
      }
    })
    composer.dispatchEvent(paste)
    await vi.waitFor(() => expect(el.querySelectorAll('.attachment-chip')).toHaveLength(2))
    expect(el.textContent).toContain('third.jpg')
  })

  it('切换对话分别保留文字草稿，发送成功只清空当前草稿', async () => {
    const { el, app } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    const chat = useChatStore()
    await chat.selectSession('cs-1', { connect: false })
    chat.connectionStatus = 'online'
    setStudioCommandTransport(() => true)
    const textarea = el.querySelector('.prompt-input textarea')
    textarea.value = '第一份未发送内容'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await chat.selectSession('cs-2', { connect: false })
    await vi.waitFor(() => expect(textarea.value).toBe(''))
    textarea.value = '第二份未发送内容'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await chat.selectSession('cs-1', { connect: false })
    await vi.waitFor(() => expect(textarea.value).toBe('第一份未发送内容'))
    el.querySelector('.prompt-input .send-btn').click()
    await vi.waitFor(() => expect(textarea.value).toBe(''))
    await chat.selectSession('cs-2', { connect: false })
    await vi.waitFor(() => expect(textarea.value).toBe('第二份未发送内容'))
    app.unmount()
  })

  it('切换期间上传的附件仍属于原对话，卸载时释放所有未发送预览', async () => {
    let finishUpload
    chatApi.uploadAttachment.mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve
      })
    )
    const { el, app } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    const chat = useChatStore()
    await chat.selectSession('cs-1', { connect: false })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [new File(['image'], 'draft.png', { type: 'image/png' })] }
    })
    el.querySelector('.prompt-input').dispatchEvent(drop)
    await vi.waitFor(() => expect(chatApi.uploadAttachment).toHaveBeenCalled())
    await chat.selectSession('cs-2', { connect: false })
    finishUpload({ attachment: { id: 'image-1', name: 'draft.png', media_type: 'image/png' } })
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    expect(el.querySelectorAll('.attachment-chip')).toHaveLength(0)
    await chat.selectSession('cs-1', { connect: false })
    await vi.waitFor(() => expect(el.querySelectorAll('.attachment-chip')).toHaveLength(1))
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:draft.png')
    await chat.selectSession('cs-2', { connect: false })
    app.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:draft.png')
  })

  it('图片发送后保留乐观预览，直到消息画廊卸载时才释放 blob URL', async () => {
    chatApi.uploadAttachment.mockImplementation(async (file) => ({
      attachment: {
        id: `art-${file.name}`,
        name: file.name,
        media_type: file.type,
        size: file.size,
        content_url: `/api/v1/chat/attachments/art-${file.name}`
      }
    }))
    const { app, el } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    const chat = useChatStore()
    // 组件级用例共享 chat 模块；先关闭前序用例残留连接，确保本次创建新 socket。
    chat.closeChat()
    // openChat 只在已登录时建连；测试 Token 仅用于构造本地 WS URL，不发网络请求。
    useSessionStore().token = 'test-token'
    await chat.selectSession('cs-1')
    FakeSocket.latest.open()
    await vi.waitFor(() => expect(el.querySelector('textarea')?.disabled).toBe(false))

    const image = new File(['image'], 'sent.png', { type: 'image/png' })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [image] } })
    el.querySelector('.prompt-input').dispatchEvent(drop)
    await vi.waitFor(() => expect(el.querySelectorAll('.attachment-chip')).toHaveLength(1))

    el.querySelector('.send-btn').click()
    await vi.waitFor(() => {
      expect(el.querySelector('.attachment-gallery img')?.getAttribute('src')).toBe('blob:sent.png')
    })
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:sent.png')

    // 所有权已转交给消息画廊；离开页面后统一释放，防止 blob URL 泄漏。
    app.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:sent.png')
  })

  it('生成期间编辑草稿不隐式中断，终态后普通发送', async () => {
    const { el } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    const chat = useChatStore()
    const runs = useRunsStore()
    chat.setConnectionStatus('online')
    chat.sending = true
    await vi.waitFor(() =>
      expect(el.querySelector('.send-btn')?.classList.contains('is-stop')).toBe(false)
    )
    runs.hydrate('proj-default-user', [
      {
        id: 'run-1',
        project_id: 'proj-default-user',
        conversation_id: 'cs-1',
        status: 'running',
        revision: 1
      }
    ])
    await vi.waitFor(() =>
      expect(el.querySelector('.send-btn')?.classList.contains('is-stop')).toBe(true)
    )

    const textarea = el.querySelector('textarea')
    textarea.value = '请改为只查询，不要写入'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() =>
      expect(el.querySelector('.send-btn')?.classList.contains('is-stop')).toBe(true)
    )
    expect(el.querySelector('.send-btn')?.getAttribute('title')).toBe('停止生成')

    const sent = []
    setStudioCommandTransport((type, payload) => {
      sent.push({ type, payload })
      return true
    })
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(0)
    expect(textarea.value).toBe('请改为只查询，不要写入')
    runs.upsert({ id: 'run-1', status: 'completed', revision: 2 })
    chat.sending = false
    await vi.waitFor(() => expect(el.querySelector('.send-btn').disabled).toBe(false))
    el.querySelector('.send-btn').click()
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual(
      expect.objectContaining({
        type: 'chat.message',
        payload: expect.objectContaining({
          interrupt_current: false,
          run_id: ''
        })
      })
    )
  })

  it('ready Proposal 仍允许继续讨论，并在对话中显示计划卡', async () => {
    const { el } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    const chat = useChatStore()
    const workflow = useWorkflowStore()
    chat.setConnectionStatus('online')
    workflow.hydrate('proj-default-user', {
      plan_proposal: {
        id: 'proposal-ready',
        project_id: 'proj-default-user',
        conversation_id: 'cs-1',
        goal: '生成一份可执行计划',
        status: 'ready',
        revision: 1,
        structured_plan: {
          tasks: [{ id: 'task-1', goal: '完成主要任务', required_role: 'developer' }]
        }
      }
    })

    await vi.waitFor(() => expect(el.querySelector('textarea')?.disabled).toBe(false))
    expect(el.querySelector('.send-btn')?.classList.contains('is-stop')).toBe(false)
    expect(el.querySelector('.message-stream-inner .plan-summary-message')).toBeTruthy()
    expect(el.textContent).toContain('生成一份可执行计划')
  })

  it('工作台检查器：Agent 与 Artifact 分栏呈现并支持显式登记工作区文件', async () => {
    const { el } = mount()
    await vi.waitFor(() => {
      expect(el.textContent).toContain('Agent 3')
    })
    const tabs = [...el.querySelectorAll('.inspector-tabs button')]
    tabs.find((button) => button.textContent.includes('Agent')).click()
    await vi.waitFor(() => expect(el.textContent).toContain('query-1'))
    expect(el.textContent).toContain('monitor-1')
    expect(el.textContent).toContain('会话模型是创建时快照')
    expect(el.textContent).toContain('待命')
    expect(el.textContent).toContain('运行中')

    tabs.find((button) => button.textContent.includes('Artifact')).click()
    await vi.waitFor(() => expect(el.textContent).toContain('数据分析报告'))
    expect(chatApi.listArtifacts).toHaveBeenCalledTimes(1)
    expect(el.textContent).toContain('.semantic-output/profile.json')
    expect(el.textContent).toContain('登记文件')
    const pathInput = el.querySelector('input[placeholder*="工作区相对路径"]')
    expect(pathInput).toBeTruthy()
    expect(el.textContent).toContain('跨 Agent/会话使用或长期保存时才登记')

    // 会话 API 的 project_id 必须原样贯通到登记请求；否则界面虽然可见，
    // 实际按钮会永久禁用，无法把工作区文件变成 ArtifactRef。
    pathInput.value = '.semantic-output/new-report.json'
    pathInput.dispatchEvent(new Event('input', { bubbles: true }))
    const registerButton = [...el.querySelectorAll('button')].find((button) =>
      button.textContent.includes('登记文件')
    )
    await vi.waitFor(() => expect(registerButton.disabled).toBe(false))
    registerButton.click()
    await vi.waitFor(() => {
      expect(chatApi.registerWorkspaceArtifact).toHaveBeenCalledWith({
        project_id: 'proj-default-user',
        path: '.semantic-output/new-report.json',
        media_type: '',
        summary: ''
      })
    })
    await vi.waitFor(() => expect(el.textContent).toContain('新登记报告'))
  })

  it('不支持推理档位的模型仍可继续切换，仅禁用推理档位选择器', async () => {
    agentsApi.listSessionAgents.mockResolvedValue({
      agents: [
        {
          agent_id: 'leader',
          role: 'leader',
          endpoint_id: 'minimax-m3',
          model: 'MiniMax-M3',
          reasoning_effort: 'auto',
          source: 'session_override',
          default_inherited: false,
          supports_reasoning_effort: false,
          busy: false
        }
      ]
    })
    settingsApi.getSettings.mockResolvedValue({
      settings: {
        llm: {
          default: 'mock',
          providers: {
            mock: { component: 'mock', model: 'mock', capabilities: ['text'] },
            'minimax-m3': {
              component: 'openai',
              model: 'MiniMax-M3',
              capabilities: ['text', 'vision']
            },
            'deepseek-v4-pro': {
              component: 'openai',
              model: 'deepseek-v4-pro',
              capabilities: ['text', 'reasoning_effort']
            }
          }
        }
      },
      base_hash: 'hash-2',
      key_sources: {}
    })

    const { el } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    await useChatStore().selectSession('cs-1')
    const agentTab = [...el.querySelectorAll('.inspector-tabs button')].find((button) =>
      button.textContent.includes('Agent')
    )
    agentTab.click()

    await vi.waitFor(() => expect(el.textContent).toContain('MiniMax-M3'))
    const leaderCard = [...el.querySelectorAll('.agent-card')].find((card) =>
      card.textContent.includes('leader')
    )
    const selectors = leaderCard.querySelectorAll('.agent-model-control .el-select')
    expect(selectors).toHaveLength(2)
    // 模型是否支持 reasoning_effort 只影响推理档位，不能锁死模型选择器，
    // 否则用户第一次切到 MiniMax 后便无法再次切换模型。
    expect(selectors[0].querySelector('input')?.disabled).toBe(false)
    expect(selectors[1].querySelector('input')?.disabled).toBe(true)
  })

  it('delegation 消息行渲染为 SubAgentBlock（Leader → query-1），result 定稿转 done', async () => {
    const { el } = mount()
    await vi.waitFor(() => {
      expect(el.textContent).toContain('历史会话')
    })
    const chat = useChatStore()
    await chat.selectSession('cs-1')

    const subEnv = (over = {}) => ({
      id: 'evt-s1',
      session_id: 'cs-1',
      ts: '2026-08-03T10:00:05.000Z',
      agent: { id: 'query-1', role: 'service', name: 'query' },
      channel: 'dialogue',
      type: 'subagent.delta',
      importance: 'normal',
      payload: { run_id: 'r1', text: '' },
      ...over
    })
    chat.applyDialogue(subEnv({ payload: { run_id: 'r1', text: '正在查询' } }))

    await vi.waitFor(() => {
      expect(el.textContent).toContain('Leader → query-1')
    })
    expect(el.textContent).toContain('正在查询') // running：流式明细实时可见
    expect(el.querySelector('.subagent-block.is-running')).toBeTruthy()

    chat.applyDialogue(
      subEnv({
        id: 'evt-s2',
        type: 'subagent.result',
        payload: { run_id: 'r1', task: '查 artifact 列表', text: '当前产物：report.pdf' }
      })
    )
    await vi.waitFor(() => {
      expect(el.querySelector('.subagent-block.is-done')).toBeTruthy()
    })
    expect(el.textContent).toContain('查 artifact 列表')
    // done 后结果区默认折叠：结果全文不可见，点击头部展开
    expect(el.textContent).not.toContain('当前产物：report.pdf')
    el.querySelector('.subagent-block .block-head').click()
    await vi.waitFor(() => {
      expect(el.textContent).toContain('当前产物：report.pdf')
    })
  })

  it('interaction 空文本系统行仍完整渲染审批卡片', async () => {
    const { el } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    const chat = useChatStore()
    await chat.selectSession('cs-1')

    chat.applyInteraction({
      id: 'evt-approval',
      session_id: 'cs-1',
      ts: '2026-08-03T10:00:05.000Z',
      agent: { id: 'leader', role: 'coordinator', name: 'leader' },
      channel: 'interaction',
      type: 'interaction.request',
      importance: 'critical',
      payload: {
        interaction_id: 'int-execute',
        type: 'confirm',
        question: '是否批准执行 execute（风险等级：high）？',
        risk: 'high',
        timeout_ts: Math.floor(Date.now() / 1000) + 300
      }
    })

    await vi.waitFor(() => {
      expect(el.querySelector('.approval-card')).toBeTruthy()
      expect(el.textContent).toContain('是否批准执行 execute（风险等级：high）？')
    })
    // pending 审批会同时出现在时间线和输入区置顶位；本用例专门验证
    // MessageRow 内的时间线卡，避免把置顶卡误算成重复渲染缺陷。
    const buttons = [...el.querySelectorAll('.message-row .approval-card button')]
    expect(buttons.map((button) => button.textContent.trim())).toEqual(['批准', '拒绝'])
  })

  it('tool.result 归并为可展开工具活动，并提示实时结果截断', async () => {
    const { el } = mount()
    await vi.waitFor(() => {
      expect(el.textContent).toContain('历史会话')
    })
    const chat = useChatStore()
    await chat.selectSession('cs-1')
    chat.applyDialogue({
      id: 'evt-tool',
      session_id: 'cs-1',
      ts: '2026-08-03T10:00:05.000Z',
      agent: { id: 'leader', role: 'coordinator', name: 'leader' },
      channel: 'dialogue',
      type: 'tool.result',
      importance: 'normal',
      payload: {
        run_id: 'r-tool',
        name: 'weather.get',
        result: '{"temp":25}',
        truncated: true
      }
    })

    await vi.waitFor(() => {
      expect(el.textContent).toContain('weather.get')
    })
    expect(el.textContent).toContain('执行 1 次工具调用')
    expect(el.textContent).not.toContain('{"temp":25}')
    el.querySelector('.tool-head').click()
    await vi.waitFor(() => {
      expect(el.textContent).toContain('{"temp":25}')
    })
    expect(el.textContent).toContain('实时结果已截断')
  })

  it('长系统活动默认收拢，展开后仍保留完整原文', async () => {
    const { el } = mount()
    await vi.waitFor(() => expect(el.textContent).toContain('历史会话'))
    const chat = useChatStore()
    await chat.selectSession('cs-1')
    const text = '任务执行说明。'.repeat(40)
    chat.messages.push({
      id: 'long-activity',
      role: 'system',
      text,
      ts: Date.now(),
      status: 'done',
      systemActivity: true,
      activity: { taskId: 'task-long' }
    })
    await vi.waitFor(() => expect(el.querySelector('.activity-preview')).toBeTruthy())
    const toggle = el.querySelector('.activity-expand')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    toggle.click()
    await vi.waitFor(() => expect(el.querySelector('.activity-preview')).toBeNull())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(el.textContent).toContain(text)
  })

  it('告警分级呈现：critical 进消息流且侧栏高亮，low 仅侧栏列表', async () => {
    const { el } = mount()
    await vi.waitFor(() => {
      expect(el.textContent).toContain('历史会话')
    })
    const chat = useChatStore()
    await chat.selectSession('cs-1')

    const alertEnv = (id, importance, level, message) => ({
      id,
      session_id: '',
      ts: '2026-08-03T10:00:06.000Z',
      agent: { id: 'monitor-1', role: 'monitor', name: 'monitor' },
      channel: 'alert',
      type: 'monitor.alert',
      importance,
      payload: { rule: 'r', level, message, topic: 'agent.events' }
    })
    chat.applyAlert(alertEnv('evt-c', 'critical', 4, '监测到 critical 事件'))
    chat.applyAlert(alertEnv('evt-l', 'low', 1, '心跳基线'))

    await vi.waitFor(() => {
      expect(el.textContent).toContain('监测到 critical 事件')
    })
    // critical：消息流一行 + 侧栏高亮条目
    const rows = el.querySelectorAll('.message-row')
    expect(rows[rows.length - 1].querySelector('.row-badge')?.textContent).toContain('monitor')
    expect(el.querySelector('.alert-item.is-critical')).toBeTruthy()
    // low：仅侧栏条目（消息流不新增 low 告警行）
    expect(el.querySelector('.alert-item.is-low')).toBeTruthy()
    expect(el.textContent).toContain('心跳基线')
    expect(el.querySelectorAll('.message-row').length).toBe(3) // 2 历史 + 1 critical 告警
  })
})
