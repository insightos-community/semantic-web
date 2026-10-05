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

import { deviceFixture } from '@/fixtures/deviceFixture'

const now = () => new Date().toISOString()

const state = {
  projects: [
    {
      id: 'proj-v020-demo',
      name: 'v0.2 演示项目',
      mode: 'development',
      revision: 3,
      is_active: true,
      archived: false,
      created_at: '2026-08-08T08:00:00Z',
      updated_at: '2026-08-08T08:03:00Z'
    }
  ],
  conversations: [
    {
      id: 'conv-v020-demo',
      project_id: 'proj-v020-demo',
      title: '检查工具运行链',
      archived: false,
      updated_at: '2026-08-08T08:03:00Z'
    }
  ],
  runs: [
    {
      id: 'run-v020-003',
      project_id: 'proj-v020-demo',
      conversation_id: 'conv-v020-demo',
      agent_id: 'leader',
      status: 'completed',
      trace_id: 'trace-v020-003',
      revision: 4,
      started_at: '2026-08-08T08:03:00Z',
      ended_at: '2026-08-08T08:03:02Z'
    },
    {
      id: 'run-v020-004',
      project_id: 'proj-v020-demo',
      conversation_id: 'conv-v020-demo',
      agent_id: 'leader',
      status: 'waiting_input',
      trace_id: 'trace-v020-004',
      revision: 2,
      started_at: '2026-08-08T08:04:00Z'
    }
  ],
  interactions: [
    {
      id: 'interaction-v020-001',
      project_id: 'proj-v020-demo',
      conversation_id: 'conv-v020-demo',
      run_id: 'run-v020-004',
      type: 'confirm',
      status: 'pending',
      question: '是否继续执行演示工具？',
      revision: 1,
      source_revision: 1,
      created_at: '2026-08-08T08:04:00Z'
    }
  ],
  planProposal: null,
  workflow: {
    id: 'workflow-v030-demo',
    project_id: 'proj-v020-demo',
    conversation_id: 'conv-v020-demo',
    goal: '分析工作区数据并交付测试报告',
    approved_scope: { workspace_write: true },
    constraints: ['规划确认前不执行任何副作用'],
    completion_criteria: ['测试通过', '报告可在 Artifact 中查看'],
    status: 'running',
    reason: '',
    revision: 2,
    confirmed_revision: 2,
    map_scope: {
      map_id: 'simulation_map',
      generation: 1,
      selections: [{ kind: 'entity', entity_id: 'entity-pallet-a' }]
    }
  },
  tasks: [
    {
      id: 'task-v030-prepare',
      workflow_id: 'workflow-v030-demo',
      position: 1,
      goal: '确认输入文件和地图范围',
      input: {},
      required_role: 'developer',
      required_capabilities: [],
      resource_requirements: { workspace_write: false },
      assigned_agent_id: 'developer',
      assignment_revision: 1,
      status: 'completed',
      reason: '',
      completion_criteria: ['输入可读取'],
      result_summary: '输入已经确认',
      evidence: [],
      context_id: 'task-context-prepare',
      revision: 2
    },
    {
      id: 'task-v030-implement',
      workflow_id: 'workflow-v030-demo',
      position: 2,
      goal: '编写分析程序并运行测试',
      input: {},
      required_role: 'developer',
      required_capabilities: [],
      resource_requirements: { workspace_write: true },
      assigned_agent_id: '',
      assignment_revision: 0,
      status: 'pending',
      reason: 'waiting_dependency',
      completion_criteria: ['自动测试通过'],
      result_summary: '',
      evidence: [],
      context_id: 'task-context-implement',
      revision: 1
    }
  ],
  subtasks: [
    {
      id: 'subtask-v030-prepare-1',
      task_id: 'task-v030-prepare',
      position: 1,
      kind: 'agent_step',
      goal: '检查输入',
      spec: { instruction: '确认输入文件和地图范围', workspace_access: 'read' },
      completion_criteria: ['输入可读取'],
      status: 'completed',
      reason: '',
      result: { summary: '输入已经确认' },
      evidence: [],
      revision: 2
    },
    {
      id: 'subtask-v030-implement-1',
      task_id: 'task-v030-implement',
      position: 1,
      kind: 'agent_step',
      goal: '实现程序',
      spec: { instruction: '实现数据分析程序', workspace_access: 'write' },
      completion_criteria: ['程序可运行'],
      status: 'pending',
      reason: '',
      result: {},
      evidence: [],
      revision: 1
    },
    {
      id: 'subtask-v030-implement-2',
      task_id: 'task-v030-implement',
      position: 2,
      kind: 'agent_step',
      goal: '运行测试',
      spec: { instruction: '运行自动测试', workspace_access: 'read' },
      completion_criteria: ['自动测试通过'],
      status: 'pending',
      reason: '',
      result: {},
      evidence: [],
      revision: 1
    }
  ],
  dependencies: [
    {
      task_id: 'task-v030-implement',
      depends_on_task_id: 'task-v030-prepare'
    }
  ],
  subtaskDependencies: [
    {
      task_id: 'task-v030-implement',
      subtask_id: 'subtask-v030-implement-2',
      depends_on_subtask_id: 'subtask-v030-implement-1'
    }
  ],
  maps: {
    simulation_map: {
      map_id: 'simulation_map',
      generation: 1,
      revision: 3,
      frame_id: 'world',
      entities: [
        {
          id: 'entity-pallet-a',
          map_id: 'simulation_map',
          generation: 1,
          revision: 1,
          type: 'pallet',
          name: '托盘 A',
          status: 'active',
          frame_id: 'world',
          pose: {
            position: { x: -1.2, y: 0, z: 0.1 },
            orientation: { x: 0, y: 0, z: 0, w: 1 }
          },
          geometry: { kind: 'box', size: { x: 1.2, y: 1, z: 0.2 } },
          properties: { purpose: 'source' }
        }
      ],
      relations: []
    },
    real_map: {
      map_id: 'real_map',
      generation: 1,
      revision: 1,
      frame_id: 'world',
      entities: [],
      relations: []
    }
  },
  memory: {
    project_id: 'proj-v020-demo',
    content: '# Project Memory\n\n- 默认使用中文输出。\n- 测试结论需要附带 Trace。\n',
    revision: 2,
    updated_at: '2026-08-08T08:02:00Z'
  }
}

const copy = (value) => structuredClone(value)
const fixtureSequences = new Map()
const planConversationTurns = new Map()
const nextFixtureSequence = (projectId) => {
  const next = (fixtureSequences.get(projectId) || 10) + 1
  fixtureSequences.set(projectId, next)
  return next
}
const workflowView = () => ({
  workflow: copy(state.workflow),
  tasks: copy(state.tasks),
  subtasks: copy(state.subtasks),
  dependencies: copy(state.dependencies),
  subtask_dependencies: copy(state.subtaskDependencies)
})
const workflowOrThrow = (workflowId) => {
  if (state.workflow?.id !== workflowId) {
    throw Object.assign(new Error('Workflow 不存在'), { code: 'WORKFLOW_NOT_FOUND' })
  }
  return state.workflow
}
const projectOrThrow = (projectId) => {
  const project = state.projects.find((item) => item.id === projectId)
  if (!project) throw Object.assign(new Error('Project 不存在'), { code: 'PROJECT_NOT_FOUND' })
  return project
}

export const FIXTURE_STUDIO_EVENTS = [
  {
    id: 'evt-v020-011',
    project_id: 'proj-v020-demo',
    resource_type: 'agent_run',
    resource_id: 'run-v020-004',
    revision: 3,
    sequence: 11,
    channel: 'run',
    type: 'run.waiting_input',
    session_id: 'conv-v020-demo',
    parent: { run_id: 'run-v020-004', trace_id: 'trace-v020-004' },
    ts: '2026-08-08T08:04:00Z',
    payload: { status: 'waiting_input' }
  },
  {
    id: 'evt-v020-012',
    project_id: 'proj-v020-demo',
    resource_type: 'interaction',
    resource_id: 'interaction-v020-001',
    revision: 1,
    sequence: 12,
    channel: 'interaction',
    type: 'interaction.requested',
    session_id: 'conv-v020-demo',
    parent: { run_id: 'run-v020-004', trace_id: 'trace-v020-004' },
    ts: '2026-08-08T08:04:00Z',
    payload: { interaction_id: 'interaction-v020-001' }
  }
]

// 开发样例必须显式通过 VITE_STUDIO_FIXTURES=true 开启；生产接口失败时绝不
// 自动降级到样例，避免用户把演示状态误认为真实 Server 状态。
export const studioFixture = {
  async listProjects({ includeArchived = false } = {}) {
    return { projects: copy(state.projects.filter((item) => includeArchived || !item.archived)) }
  },
  async createProject(payload = {}) {
    const id = `proj-fixture-${Date.now()}`
    const project = {
      id,
      name: String(payload.name || '未命名项目'),
      mode: 'development',
      revision: 1,
      is_active: state.projects.every((item) => item.archived),
      archived: false,
      created_at: now(),
      updated_at: now()
    }
    state.projects.push(project)
    return { project: copy(project) }
  },
  async getProject(projectId) {
    return { project: copy(projectOrThrow(projectId)) }
  },
  async updateProject(projectId, payload = {}) {
    const project = projectOrThrow(projectId)
    if (payload.revision != null && payload.revision !== project.revision) {
      throw Object.assign(new Error('Project 已被更新，请刷新后重试'), {
        code: 'REVISION_CONFLICT'
      })
    }
    if (payload.name != null) project.name = String(payload.name).trim()
    project.revision += 1
    project.updated_at = now()
    return { project: copy(project) }
  },
  async archiveProject(projectId, revision) {
    const project = projectOrThrow(projectId)
    if (revision != null && revision !== project.revision) {
      throw Object.assign(new Error('Project 已被更新，请刷新后重试'), {
        code: 'REVISION_CONFLICT'
      })
    }
    const archivedAt = now()
    project.archived = true
    project.archived_at = archivedAt
    project.is_active = false
    project.revision += 1
    project.updated_at = archivedAt
    return { project: copy(project) }
  },
  async activateProject(projectId, revision) {
    const target = projectOrThrow(projectId)
    if (revision != null && revision !== target.revision) {
      throw Object.assign(new Error('Project 已被更新，请刷新后重试'), {
        code: 'REVISION_CONFLICT'
      })
    }
    for (const project of state.projects) project.is_active = project.id === projectId
    target.revision += 1
    target.updated_at = now()
    return { project: copy(target) }
  },
  async getMemory(projectId) {
    projectOrThrow(projectId)
    return { project_memory: copy({ ...state.memory, project_id: projectId }) }
  },
  async saveMemory(projectId, { content, revision }) {
    projectOrThrow(projectId)
    if (revision !== state.memory.revision) {
      throw Object.assign(new Error('Memory 已被更新，请刷新后再保存'), {
        code: 'REVISION_CONFLICT'
      })
    }
    state.memory = {
      project_id: projectId,
      content: String(content || ''),
      revision: revision + 1,
      updated_at: now()
    }
    return { project_memory: copy(state.memory) }
  },
  async listConversations(projectId, { includeArchived = false } = {}) {
    projectOrThrow(projectId)
    return {
      conversations: copy(
        state.conversations.filter(
          (item) =>
            item.project_id === projectId &&
            (includeArchived || (!item.archived && !item.archived_at))
        )
      )
    }
  },
  async createConversation(projectId, payload = {}) {
    projectOrThrow(projectId)
    const conversation = {
      id: `conv-fixture-${Date.now()}`,
      project_id: projectId,
      title: String(payload.title || '新对话'),
      archived: false,
      created_at: now(),
      updated_at: now()
    }
    state.conversations.unshift(conversation)
    return { conversation: copy(conversation), session: copy(conversation) }
  },
  async archiveConversation(projectId, conversationId) {
    projectOrThrow(projectId)
    const conversation = state.conversations.find(
      (item) => item.id === conversationId && item.project_id === projectId
    )
    if (!conversation || conversation.archived || conversation.archived_at) {
      throw Object.assign(new Error('Conversation 不存在'), {
        code: 'CHAT_SESSION_NOT_FOUND'
      })
    }
    const hasActiveRun = state.runs.some(
      (run) =>
        run.conversation_id === conversationId &&
        ['queued', 'running', 'waiting_input', 'cancelling'].includes(run.status)
    )
    const hasPendingInteraction = state.interactions.some(
      (interaction) =>
        interaction.conversation_id === conversationId && interaction.status === 'pending'
    )
    if (hasActiveRun || hasPendingInteraction) {
      throw Object.assign(new Error('请先结束当前运行并处理待回复请求，再归档 Conversation'), {
        code: 'CONVERSATION_HAS_ACTIVE_WORK'
      })
    }
    const archivedAt = now()
    conversation.archived = true
    conversation.archived_at = archivedAt
    conversation.revision = Number(conversation.revision || 0) + 1
    conversation.updated_at = archivedAt
    return { conversation: copy(conversation) }
  },
  async getSnapshot(projectId) {
    const project = projectOrThrow(projectId)
    const robotExecutions = await deviceFixture.listProjectExecutions(projectId)
    return {
      snapshot: {
        snapshot_version: 1,
        event_sequence: 10,
        project: copy(project),
        conversations: copy(
          state.conversations.filter(
            (item) => item.project_id === projectId && !item.archived && !item.archived_at
          )
        ),
        runs: copy(state.runs.filter((item) => item.project_id === projectId)),
        robot_executions: robotExecutions.executions,
        pending_interactions: copy(
          state.interactions.filter(
            (item) => item.project_id === projectId && item.status === 'pending'
          )
        ),
        memory_revision: state.memory.revision,
        plan_proposal:
          state.planProposal?.project_id === projectId && state.planProposal?.status === 'ready'
            ? copy(state.planProposal)
            : null,
        workflow_view: state.workflow?.project_id === projectId ? workflowView() : null,
        map_summaries: Object.values(state.maps).map((map) => ({
          map_id: map.map_id,
          generation: map.generation,
          revision: map.revision,
          entity_count: map.entities.length,
          relation_count: map.relations.length
        }))
      }
    }
  },
  async listWorkflows(projectId, _includeEnded = false) {
    projectOrThrow(projectId)
    return { workflows: state.workflow?.project_id === projectId ? [copy(state.workflow)] : [] }
  },
  async getActivePlanProposal(projectId) {
    projectOrThrow(projectId)
    const active =
      state.planProposal?.project_id === projectId && state.planProposal?.status === 'ready'
        ? state.planProposal
        : null
    return { plan_proposal: copy(active) }
  },
  async getPlanProposal(proposalId) {
    if (state.planProposal?.id !== proposalId) {
      throw Object.assign(new Error('Plan Proposal 不存在'), { code: 'PLAN_NOT_FOUND' })
    }
    return { plan_proposal: copy(state.planProposal) }
  },
  async transitionPlanProposal(proposalId, action, payload = {}) {
    if (state.planProposal?.id !== proposalId) {
      throw Object.assign(new Error('Plan Proposal 不存在'), { code: 'PLAN_NOT_FOUND' })
    }
    if (Number(payload.revision) !== state.planProposal.revision) {
      throw Object.assign(new Error('计划已更新，请重新审阅'), { code: 'REVISION_CONFLICT' })
    }
    if (action === 'discard') {
      state.planProposal.status = 'discarded'
      state.planProposal.revision += 1
      return { plan_proposal: copy(state.planProposal) }
    }
    if (action !== 'approve' || state.planProposal.status !== 'ready') {
      throw new Error('未知或非法 Plan Proposal 操作')
    }
    const plan = state.planProposal.structured_plan
    const suffix = Date.now()
    state.workflow = {
      id: 'workflow-fixture-' + suffix,
      project_id: state.planProposal.project_id,
      conversation_id: state.planProposal.conversation_id,
      goal: state.planProposal.goal,
      approved_scope: copy(state.planProposal.approved_scope || {}),
      constraints: copy(plan.constraints || []),
      completion_criteria: copy(plan.completion_criteria || []),
      map_scope: copy(plan.map_scope || null),
      status: 'running',
      revision: 1,
      confirmed_revision: 1
    }
    state.tasks = (plan.tasks || []).map((task, index) => ({
      ...copy(task),
      workflow_id: state.workflow.id,
      position: index + 1,
      required_role: task.required_role || '',
      required_capabilities: copy(task.required_capabilities || []),
      resource_requirements: copy(task.resource_requirements || {}),
      assigned_agent_id: '',
      assigned_robot_id: '',
      assignment_revision: 0,
      status: 'pending',
      reason: 'waiting_dependency',
      evidence: [],
      context_id: 'task-context-' + (task.id || index + 1),
      revision: 1
    }))
    state.subtasks = []
    state.dependencies = copy(plan.dependencies || [])
    state.subtaskDependencies = []
    state.planProposal.status = 'approved'
    state.planProposal.revision += 1
    return { workflow_view: workflowView() }
  },
  async getWorkflowView(workflowId) {
    workflowOrThrow(workflowId)
    return { workflow_view: workflowView() }
  },
  async transitionWorkflow(workflowId, action, payload = {}) {
    const workflow = workflowOrThrow(workflowId)
    if (payload.revision !== workflow.revision) {
      throw Object.assign(new Error('计划已更新，请刷新后重试'), {
        code: 'REVISION_CONFLICT'
      })
    }
    if (action === 'confirm-stop') {
      if (!payload.physical_state_confirmed || !String(payload.reason || '').trim()) {
        throw new Error('必须确认现场物理状态安全并填写原因')
      }
      workflow.status = 'stopped'
      workflow.reason = 'operator_confirmed_stop'
      workflow.revision += 1
      return { workflow_view: workflowView() }
    }
    const next = {
      pause: 'paused',
      resume: 'running',
      'retry-decision': 'running',
      stop: 'stopped'
    }[action]
    if (!next) throw new Error('未知 Workflow 操作')
    workflow.status = next
    workflow.revision += 1
    return { workflow_view: workflowView() }
  },
  async getMapSnapshot(projectId, mapId) {
    projectOrThrow(projectId)
    const map = state.maps[mapId]
    if (!map) throw Object.assign(new Error('Semantic Map 不存在'), { code: 'MAP_NOT_FOUND' })
    return { map_snapshot: copy(map) }
  },
  async queryMap(projectId, mapId, query = {}) {
    projectOrThrow(projectId)
    const map = state.maps[mapId]
    if (!map) throw Object.assign(new Error('Semantic Map 不存在'), { code: 'MAP_NOT_FOUND' })
    if (query.generation && Number(query.generation) !== map.generation) {
      throw Object.assign(new Error('地图 generation 已变化'), {
        code: 'MAP_GENERATION_CONFLICT'
      })
    }
    const entityIds = new Set(query.entity_ids || [])
    const entities = map.entities.filter(
      (entity) =>
        entity.status !== 'removed' &&
        (!query.type || entity.type === query.type) &&
        (!entityIds.size || entityIds.has(entity.id))
    )
    return { map_view: { ...copy(map), entities: copy(entities) } }
  },
  async createMapGeneration(projectId, mapId, payload = {}) {
    projectOrThrow(projectId)
    const map = state.maps[mapId]
    if (!map) throw Object.assign(new Error('Semantic Map 不存在'), { code: 'MAP_NOT_FOUND' })
    if (payload.expected_revision != null && Number(payload.expected_revision) !== map.revision) {
      throw Object.assign(new Error('地图已更新，请刷新后重试'), { code: 'REVISION_CONFLICT' })
    }
    map.generation += 1
    map.revision += 1
    map.entities = []
    map.relations = []
    return { map_snapshot: copy(map) }
  },
  async updateMap(projectId, mapId, payload = {}) {
    projectOrThrow(projectId)
    const map = state.maps[mapId]
    if (!map) throw Object.assign(new Error('Semantic Map 不存在'), { code: 'MAP_NOT_FOUND' })
    if (Number(payload.generation) !== map.generation) {
      throw Object.assign(new Error('地图 generation 已变化'), {
        code: 'MAP_GENERATION_CONFLICT'
      })
    }
    if (Number(payload.expected_revision) !== map.revision) {
      throw Object.assign(new Error('地图已更新，请刷新后重试'), { code: 'REVISION_CONFLICT' })
    }
    const operations = payload.operations || [
      ...(payload.entities || []).map((entity) => ({ op: 'upsert_entity', entity })),
      ...(payload.remove_entity_ids || []).map((entity_id) => ({ op: 'remove_entity', entity_id })),
      ...(payload.relations || []).map((relation) => ({ op: 'upsert_relation', relation })),
      ...(payload.remove_relation_ids || []).map((relation_id) => ({
        op: 'remove_relation',
        relation_id
      }))
    ]
    for (const operation of operations) {
      if (operation.op === 'upsert_entity') {
        const entity = {
          ...copy(operation.entity),
          map_id: mapId,
          generation: map.generation,
          revision: map.revision + 1,
          status: operation.entity.status || 'active'
        }
        const index = map.entities.findIndex((item) => item.id === entity.id)
        if (index >= 0) map.entities[index] = entity
        else map.entities.push(entity)
      } else if (operation.op === 'remove_entity') {
        const entity = map.entities.find((item) => item.id === operation.entity_id)
        if (entity) entity.status = 'removed'
      } else if (operation.op === 'upsert_relation') {
        const relation = copy(operation.relation)
        const index = map.relations.findIndex((item) => item.id === relation.id)
        if (index >= 0) map.relations[index] = relation
        else map.relations.push(relation)
      } else if (operation.op === 'remove_relation') {
        map.relations = map.relations.filter((item) => item.id !== operation.relation_id)
      }
    }
    map.revision += 1
    return { map_snapshot: copy(map) }
  },
  async getInteraction(projectId, interactionId) {
    projectOrThrow(projectId)
    const interaction = state.interactions.find(
      (item) => item.id === interactionId && item.project_id === projectId
    )
    if (!interaction) {
      throw Object.assign(new Error('Interaction 不存在'), { code: 'INTERACTION_NOT_FOUND' })
    }
    return { interaction: copy(interaction) }
  },
  async listRuns(projectId, { conversationId } = {}) {
    projectOrThrow(projectId)
    return {
      runs: copy(
        state.runs.filter(
          (item) =>
            item.project_id === projectId &&
            (!conversationId || item.conversation_id === conversationId)
        )
      )
    }
  },
  async getRun(runId) {
    const run = state.runs.find((item) => item.id === runId)
    if (!run) throw Object.assign(new Error('Run 不存在'), { code: 'RUN_NOT_FOUND' })
    return { run: copy(run) }
  },
  async cancelRun(runId) {
    const run = state.runs.find((item) => item.id === runId)
    if (!run) throw Object.assign(new Error('Run 不存在'), { code: 'RUN_NOT_FOUND' })
    run.status = 'cancelling'
    run.revision += 1
    return { run: copy(run) }
  },
  subscribe(projectId, { afterSequence, onEvent, onStatus }) {
    projectOrThrow(projectId)
    const replayableEvents = FIXTURE_STUDIO_EVENTS.filter(
      (event) => event.project_id === projectId && event.sequence > Number(afterSequence)
    )
    const knownSequence = Math.max(
      10,
      Number(afterSequence) || 0,
      ...replayableEvents.map((event) => Number(event.sequence) || 0)
    )
    fixtureSequences.set(projectId, Math.max(fixtureSequences.get(projectId) || 0, knownSequence))
    onStatus?.('connecting')
    const onlineTimer = setTimeout(() => onStatus?.('online'), 20)
    const eventTimers =
      Number(afterSequence) >= 0
        ? replayableEvents.map((event, index) =>
            setTimeout(() => onEvent?.(copy(event)), 60 + index * 20)
          )
        : []
    return {
      send(type, payload) {
        let chatRun = null
        if (type === 'chat.message') {
          const conversationId = payload.conversation_id || payload.session_id || ''
          const agentId = payload.send_scope?.target_agent_id || 'leader'
          chatRun = {
            id: `run-chat-fixture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            project_id: projectId,
            conversation_id: conversationId,
            agent_id: agentId,
            target_agent_id: agentId,
            kind: 'conversation',
            status: 'running',
            revision: 1,
            started_at: now()
          }
          state.runs.unshift(chatRun)
          const emit = (type, channel, payload) =>
            onEvent?.({
              id: `evt-${type}-${chatRun.id}`,
              project_id: projectId,
              conversation_id: conversationId,
              session_id: conversationId,
              sequence: nextFixtureSequence(projectId),
              resource_type: channel === 'run' ? 'agent_run' : 'message',
              resource_id: chatRun.id,
              resource_revision: chatRun.revision,
              parent: { run_id: chatRun.id },
              agent: { id: agentId, role: agentId === 'leader' ? 'leader' : 'service' },
              channel,
              type,
              ts: now(),
              payload
            })
          eventTimers.push(setTimeout(() => emit('run.started', 'run', { run: copy(chatRun) }), 10))
          if (payload.send_scope?.intent !== 'plan')
            eventTimers.push(
              setTimeout(
                () =>
                  emit('message.done', 'dialogue', {
                    run_id: chatRun.id,
                    text: `${agentId} 已收到：${payload.text || ''}`,
                    metadata: { target_agent_id: agentId }
                  }),
                40
              )
            )
          eventTimers.push(
            setTimeout(() => {
              chatRun.status = 'completed'
              chatRun.revision = 2
              chatRun.completed_at = now()
              emit('run.completed', 'run', { run: copy(chatRun) })
            }, 80)
          )
        }
        if (type === 'chat.message' && payload.send_scope?.intent === 'plan') {
          const conversationId = payload.conversation_id || payload.session_id || ''
          const key = `${projectId}:${conversationId}`
          const turn = (planConversationTurns.get(key) || 0) + 1
          planConversationTurns.set(key, turn)
          const runId = chatRun.id
          if (turn === 1) {
            setTimeout(
              () =>
                onEvent?.({
                  id: `evt-plan-question-${Date.now()}`,
                  project_id: projectId,
                  sequence: nextFixtureSequence(projectId),
                  channel: 'dialogue',
                  type: 'message.done',
                  session_id: conversationId,
                  parent: { run_id: runId, trace_id: `trace-plan-fixture-${turn}` },
                  ts: now(),
                  payload: {
                    run_id: runId,
                    trace_id: `trace-plan-fixture-${turn}`,
                    text: '在生成计划前，请补充期望交付物和验收方式。'
                  }
                }),
              40
            )
          } else {
            const suffix = Date.now()
            const tasks = [
              {
                id: `task-fixture-${suffix}`,
                kind: 'developer',
                required_role: 'developer',
                goal: '实现并验证目标',
                completion_criteria: ['自动测试通过']
              }
            ]
            state.planProposal = {
              id: `plan-fixture-${suffix}`,
              project_id: projectId,
              conversation_id: conversationId,
              goal: String(payload.text || '完成规划目标'),
              approved_scope: { constraints: ['确认计划前不执行副作用'] },
              structured_plan: {
                goal: String(payload.text || '完成规划目标'),
                constraints: ['确认计划前不执行副作用'],
                completion_criteria: ['自动测试通过'],
                tasks,
                dependencies: []
              },
              document_markdown: `# ${String(payload.text || '完成规划目标')}\n\nLeader 已完成澄清，批准后按以下 TODO 推进。\n\n- [ ] 实现并验证目标`,
              status: 'ready',
              revision: 1,
              created_at: now(),
              updated_at: now()
            }
            setTimeout(
              () =>
                onEvent?.({
                  id: `evt-plan-ready-${suffix}`,
                  project_id: projectId,
                  resource_type: 'plan_proposal',
                  resource_id: state.planProposal.id,
                  revision: 1,
                  sequence: nextFixtureSequence(projectId),
                  channel: 'workflow',
                  type: 'plan_proposal.ready',
                  session_id: conversationId,
                  ts: now(),
                  payload: { plan_proposal: copy(state.planProposal) }
                }),
              40
            )
            eventTimers.push(
              setTimeout(
                () =>
                  onEvent?.({
                    id: `evt-plan-message-${runId}`,
                    project_id: projectId,
                    sequence: nextFixtureSequence(projectId),
                    channel: 'dialogue',
                    type: 'message.done',
                    session_id: conversationId,
                    parent: { run_id: runId },
                    ts: now(),
                    payload: { run_id: runId, text: '计划已准备好，请审阅目标与完成条件。' }
                  }),
                60
              )
            )
          }
        }
        if (type === 'interaction.reply') {
          const target = state.interactions.find((item) => item.id === payload.interaction_id)
          if (
            target &&
            target.status === 'pending' &&
            Number(payload.expected_state_revision) === Number(target.source_revision)
          ) {
            const response = copy(payload.response)
            const approved = response?.approved
            target.status = 'answered'
            target.reply = response
            target.revision += 1
            setTimeout(
              () =>
                onEvent?.({
                  id: `evt-fixture-${Date.now()}`,
                  project_id: projectId,
                  resource_type: 'interaction',
                  resource_id: target.id,
                  revision: target.revision,
                  sequence: nextFixtureSequence(projectId),
                  channel: 'interaction',
                  type: 'interaction.resolved',
                  session_id: target.conversation_id,
                  parent: { run_id: target.run_id },
                  ts: now(),
                  payload: {
                    interaction_id: target.id,
                    status: 'answered',
                    reply: response,
                    result:
                      typeof approved === 'boolean'
                        ? approved
                          ? 'approved'
                          : 'rejected'
                        : 'submitted'
                  }
                }),
              40
            )
          }
        }
        return true
      },
      close() {
        clearTimeout(onlineTimer)
        eventTimers.forEach(clearTimeout)
        onStatus?.('offline')
      }
    }
  }
}
