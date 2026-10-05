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

import { defineStore } from 'pinia'
import * as workflowsApi from '@/api/workflows'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { normalizeStructuredField } from '@/studio/structuredFields'

const ACTIVE_STATES = new Set(['pending', 'running', 'paused', 'stopping'])

export function workflowStopMode(value) {
  if (value?.status === 'paused' && value.reason === 'execution_state_unknown') return 'unknown'
  if (value?.status === 'stopping') return 'retry'
  if (value?.status === 'running' || value?.status === 'paused') return 'stop'
  return 'readonly'
}
const rows = (value) => (Array.isArray(value) ? value : [])
const objectValue = (value, fallback = {}) => {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
const normalizeSubTask = (value = {}) => ({
  ...value,
  id: value.id || '',
  task_id: value.task_id || '',
  position: Number(value.position || 0),
  status: value.status || 'pending',
  kind: value.kind || 'agent_step',
  goal: value.goal || '',
  spec: objectValue(value.spec),
  completion_criteria: normalizeStructuredField(value.completion_criteria),
  reason: value.reason || '',
  result: objectValue(value.result),
  evidence: rows(value.evidence),
  execution_ref: value.execution_ref || '',
  depends_on: []
})

const normalizeTask = (value = {}) => ({
  ...value,
  id: value.id || '',
  workflow_id: value.workflow_id || '',
  required_role: value.required_role || '',
  required_capabilities: rows(value.required_capabilities),
  resource_requirements: objectValue(value.resource_requirements),
  assigned_agent_id: value.assigned_agent_id || '',
  assigned_robot_id: value.assigned_robot_id || '',
  assignment_revision: Number(value.assignment_revision || 0),
  status: value.status || 'pending',
  reason: value.reason || '',
  completion_criteria: normalizeStructuredField(value.completion_criteria),
  evidence: rows(value.evidence),
  subtasks: []
})

export function normalizePlanProposal(value) {
  if (!value) return null
  const structuredPlan = objectValue(value.structured_plan)
  return {
    ...value,
    id: value.id || '',
    project_id: value.project_id || '',
    conversation_id: value.conversation_id || '',
    revision: Number(value.revision || 0),
    status: value.status || 'ready',
    goal: value.goal || structuredPlan.goal || '',
    approved_scope: objectValue(value.approved_scope),
    structured_plan: structuredPlan,
    document_markdown: value.document_markdown || ''
  }
}

const normalizeDependency = (value = {}) => ({
  ...value,
  task_id: value.task_id || '',
  depends_on_task_id: value.depends_on_task_id || ''
})

const normalizeWorkflow = (value = {}) => ({
  ...value,
  id: value.id || '',
  project_id: value.project_id || '',
  conversation_id: value.conversation_id || '',
  status: value.status || 'pending',
  reason: value.reason || '',
  revision: Number(value.revision || 0),
  confirmed_revision: Number(value.confirmed_revision || 0),
  constraints: normalizeStructuredField(value.constraints),
  completion_criteria: normalizeStructuredField(value.completion_criteria),
  map_scope: value.map_scope || null
})

export function normalizeWorkflowView(value = {}) {
  const workflow = normalizeWorkflow(value.workflow || value)
  const rawTasks = rows(value.tasks)
  const tasks = rawTasks.map((task) =>
    normalizeTask({ ...task, workflow_id: task.workflow_id || workflow.id })
  )
  const subtaskDependencies = rows(value.subtask_dependencies)
  let subtasks = rows(value.subtasks).map((item) => ({
    ...normalizeSubTask(item),
    depends_on: subtaskDependencies
      .filter((edge) => edge.subtask_id === item.id)
      .map((edge) => edge.depends_on_subtask_id)
  }))
  // applyView / inspectView 可能传入已经挂好 nested subtasks 的 view。
  // 这时顶层 subtasks 为空，不能再被 normalizeTask 清成「尚无 SubTask」。
  if (!subtasks.length) {
    subtasks = rawTasks.flatMap((task) =>
      rows(task.subtasks).map((item) => ({
        ...normalizeSubTask(item),
        task_id: item.task_id || task.id,
        depends_on: rows(item.depends_on)
      }))
    )
  }
  for (const task of tasks) {
    task.subtasks = subtasks
      .filter((item) => item.task_id === task.id)
      .sort((left, right) => left.position - right.position)
  }
  return {
    workflow,
    tasks,
    dependencies: rows(value.dependencies).map(normalizeDependency)
  }
}

export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    projectId: '',
    proposal: null,
    proposals: {},
    items: [],
    views: {},
    workflow: null,
    tasks: [],
    dependencies: [],
    loading: false,
    action: '',
    error: ''
  }),
  getters: {
    active: (state) =>
      state.workflow && ACTIVE_STATES.has(state.workflow.status) ? state.workflow : null,
    mapBindingStale: (state) => {
      if (!state.workflow?.map_scope) return false
      return !useSemanticMapStore().isBindingCurrent(state.workflow.map_scope)
    },
    proposalReady: (state) => state.proposal?.status === 'ready',
    proposalById: (state) => (id) => state.proposals[id] || null,
    proposalTasks: (state) => rows(state.proposal?.structured_plan?.tasks),
    viewById: (state) => (workflowId) => state.views[workflowId] || null,
    taskById: (state) => (taskId) => {
      const current = state.tasks.find((task) => task.id === taskId)
      if (current) return current
      for (const view of Object.values(state.views || {})) {
        const found = (view.tasks || []).find((task) => task.id === taskId)
        if (found) return found
      }
      return null
    },
    readyTasks: (state) =>
      state.tasks.filter(
        (task) =>
          task.status === 'pending' &&
          state.dependencies
            .filter((edge) => edge.task_id === task.id)
            .every(
              (edge) =>
                state.tasks.find((candidate) => candidate.id === edge.depends_on_task_id)
                  ?.status === 'completed'
            )
      )
  },
  actions: {
    hydrate(projectId, snapshot = {}) {
      if (projectId !== this.projectId) {
        this.items = []
        this.views = {}
        this.proposals = {}
        this.clearWorkflow(false)
      }
      this.projectId = projectId
      // 快照同时给出所有未结束 Workflow 的摘要；执行栏无需用户先打开历史列表。
      if (Array.isArray(snapshot.workflows)) this.items = snapshot.workflows.map(normalizeWorkflow)
      this.proposal = normalizePlanProposal(snapshot.plan_proposal)
      if (this.proposal) this.proposals[this.proposal.id] = this.proposal
      const view = snapshot.workflow_view
      if (view) this.applyView(view)
      // Proposal 与 Workflow 是互斥但连续的两个阶段。Snapshot 中尚无
      // Workflow 恰好是批准前的正常状态，不能顺手把刚恢复的 Proposal 清掉。
      else this.clearWorkflow(false)
    },
    upsertSummary(value) {
      const workflow = normalizeWorkflow(value)
      if (!workflow.id) return
      const index = this.items.findIndex((item) => item.id === workflow.id)
      if (index < 0) this.items.push(workflow)
      else this.items.splice(index, 1, workflow)
      this.items.sort(
        (left, right) =>
          new Date(right.updated_at || right.created_at || 0).getTime() -
          new Date(left.updated_at || left.created_at || 0).getTime()
      )
    },
    cacheView(raw) {
      const view = normalizeWorkflowView(raw)
      if (view.workflow.project_id && view.workflow.project_id !== this.projectId) return null
      this.views[view.workflow.id] = view
      this.upsertSummary(view.workflow)
      return view
    },
    applyView(raw) {
      const view = this.cacheView(raw)
      if (!view) return false
      this.workflow = view.workflow
      this.tasks = view.tasks
      this.dependencies = view.dependencies
      return true
    },
    async loadHistory(projectId = this.projectId) {
      this.loading = true
      this.error = ''
      try {
        const workflows = await workflowsApi.listWorkflows(projectId, true)
        if (projectId !== this.projectId) {
          this.projectId = projectId
          this.views = {}
          this.clearWorkflow(false)
        }
        this.items = workflows.map(normalizeWorkflow)
        return this.items
      } catch (error) {
        this.error = error.message || 'Workflow 历史加载失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async loadView(workflowId, { refresh = false } = {}) {
      if (!workflowId) return null
      const cached = this.views[workflowId]
      if (cached && !refresh) return cached
      const view = this.cacheView(await workflowsApi.getWorkflowView(this.projectId, workflowId))
      if (view && ACTIVE_STATES.has(view.workflow.status) && !this.workflow) {
        this.workflow = view.workflow
        this.tasks = view.tasks
        this.dependencies = view.dependencies
      }
      return view
    },
    // Inspector reads the selected Workflow from views; inspecting history must
    // not replace the active Workflow used by the running-work bar and actions.
    async inspectView(workflowId) {
      return this.loadView(workflowId)
    },
    async load(projectId = this.projectId) {
      this.loading = true
      this.error = ''
      if (projectId !== this.projectId) {
        this.items = []
        this.views = {}
        this.proposals = {}
        this.clearWorkflow(false)
      }
      this.projectId = projectId
      try {
        const [workflows, proposal] = await Promise.all([
          workflowsApi.listWorkflows(projectId, true),
          workflowsApi.getActivePlanProposal(projectId)
        ])
        this.proposal = normalizePlanProposal(proposal)
        if (this.proposal) this.proposals[this.proposal.id] = this.proposal
        this.items = workflows.map(normalizeWorkflow)
        const active = workflows
          .map(normalizeWorkflow)
          .find((item) => ACTIVE_STATES.has(item.status))
        if (!active) {
          this.clearWorkflow(false)
          return null
        }
        this.applyView(await workflowsApi.getWorkflowView(projectId, active.id))
        return this.workflow
      } catch (error) {
        this.error = error.message || 'Workflow 加载失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async transition(action) {
      if (!this.workflow) return null
      if (action === 'resume' && this.mapBindingStale) {
        const error = new Error('计划引用的地图版本或对象已失效，请重新选择地图范围')
        error.code = 'MAP_BINDING_STALE'
        throw error
      }
      return this.transitionById(this.workflow.id, action)
    },
    async transitionById(workflowId, action) {
      const view = await this.loadView(workflowId)
      if (!view) return null
      if (action === 'resume' && workflowId === this.workflow?.id && this.mapBindingStale) {
        const error = new Error('计划引用的地图版本或对象已失效，请重新选择地图范围')
        error.code = 'MAP_BINDING_STALE'
        throw error
      }
      const methods = {
        pause: workflowsApi.pauseWorkflow,
        resume: workflowsApi.resumeWorkflow,
        'retry-decision': workflowsApi.retryRobotDecision,
        stop: workflowsApi.stopWorkflow
      }
      if (!methods[action]) return null
      this.action = action
      this.error = ''
      try {
        const updated = this.cacheView(
          await methods[action](this.projectId, workflowId, view.workflow.revision)
        )
        if (this.workflow?.id === workflowId) this.applyView(updated)
        return updated?.workflow || null
      } catch (error) {
        this.error = error.code === 'REVISION_CONFLICT' ? '计划已更新，请刷新后重试' : error.message
        if (error.code === 'REVISION_CONFLICT') await this.loadView(workflowId, { refresh: true })
        throw error
      } finally {
        this.action = ''
      }
    },
    async confirmStop(workflowId, reason) {
      const view = await this.loadView(workflowId)
      if (!view) return null
      this.action = 'confirm-stop'
      this.error = ''
      try {
        const updated = this.cacheView(
          await workflowsApi.confirmWorkflowStop(
            this.projectId,
            workflowId,
            view.workflow.revision,
            reason
          )
        )
        if (this.workflow?.id === workflowId) this.applyView(updated)
        return updated?.workflow || null
      } catch (error) {
        this.error = error.code === 'REVISION_CONFLICT' ? '计划已更新，请刷新后重试' : error.message
        if (error.code === 'REVISION_CONFLICT') await this.loadView(workflowId, { refresh: true })
        throw error
      } finally {
        this.action = ''
      }
    },
    async loadProposal(proposalId) {
      const proposal = normalizePlanProposal(
        await workflowsApi.getPlanProposal(this.projectId, proposalId)
      )
      if (proposal) this.proposals[proposal.id] = proposal
      return proposal
    },
    async approveProposal(target = this.proposal) {
      if (!target || target.status !== 'ready') return null
      this.action = 'approve'
      this.error = ''
      try {
        const view = await workflowsApi.approvePlanProposal(
          this.projectId,
          target.id,
          target.revision
        )
        this.proposals[target.id] = { ...target, status: 'approved' }
        if (this.proposal?.id === target.id) this.proposal = null
        this.applyView(view)
        return this.workflow
      } catch (error) {
        this.error = error.code === 'REVISION_CONFLICT' ? '计划已更新，请重新审阅' : error.message
        throw error
      } finally {
        this.action = ''
      }
    },
    async discardProposal(target = this.proposal) {
      if (!target) return null
      this.action = 'discard_proposal'
      try {
        const discarded = await workflowsApi.discardPlanProposal(
          this.projectId,
          target.id,
          target.revision
        )
        const normalized = normalizePlanProposal(discarded)
        this.proposals[target.id] = normalized
        if (this.proposal?.id === target.id) this.proposal = normalized
        return normalized
      } finally {
        this.action = ''
      }
    },
    applyEvent(event) {
      if (
        event.project_id !== this.projectId ||
        !['plan_proposal', 'workflow', 'task', 'subtask'].includes(event.resource_type)
      ) {
        return false
      }
      if (event.resource_type === 'plan_proposal') {
        const proposal = event.payload?.plan_proposal
        if (!proposal) return false
        const normalized = normalizePlanProposal(proposal)
        this.proposals[normalized.id] = normalized
        this.proposal = ['approved', 'discarded'].includes(normalized.status) ? null : normalized
        return true
      }
      const embedded = event.payload?.workflow_view
      if (embedded) return this.applyView(embedded)
      // Task/SubTask 事件已经携带当前资源，不应为每条事件再次读取整张
      // WorkflowView。四箱执行会持续产生状态事件；旧实现把一次事务放大成
      // 数百个并发 GET，旧响应还可能覆盖 Inspector 中更新的第二箱进度。
      if (event.resource_type === 'workflow' && event.payload?.workflow) {
        const incoming = normalizeWorkflow(event.payload.workflow)
        if (incoming.project_id && incoming.project_id !== this.projectId) return false
        if (this.workflow?.id === incoming.id && incoming.revision < this.workflow.revision) {
          return false
        }
        this.workflow = incoming
        this.upsertSummary(incoming)
        if (this.views[incoming.id]) this.views[incoming.id].workflow = incoming
        return true
      }
      if (event.resource_type === 'task' && event.payload?.task) {
        const incoming = normalizeTask(event.payload.task)
        if (this.workflow && incoming.workflow_id !== this.workflow.id) return false
        const index = this.tasks.findIndex((item) => item.id === incoming.id)
        if (index < 0) {
          incoming.subtasks = []
          this.tasks.push(incoming)
          return true
        }
        if (incoming.revision < this.tasks[index].revision) return false
        incoming.subtasks = this.tasks[index].subtasks
        this.tasks.splice(index, 1, incoming)
        return true
      }
      if (event.resource_type === 'subtask' && event.payload?.subtask) {
        const incoming = normalizeSubTask(event.payload.subtask)
        const task = this.tasks.find((item) => item.id === incoming.task_id)
        if (!task) return false
        const index = task.subtasks.findIndex((item) => item.id === incoming.id)
        if (index < 0) {
          task.subtasks.push(incoming)
          task.subtasks.sort((left, right) => left.position - right.position)
          return true
        }
        if (incoming.revision < task.subtasks[index].revision) return false
        incoming.depends_on = task.subtasks[index].depends_on
        task.subtasks.splice(index, 1, incoming)
        return true
      }
      return false
    },
    clearWorkflow(clearProposal = true) {
      this.workflow = null
      this.tasks = []
      this.dependencies = []
      if (clearProposal) this.proposal = null
    },
    clear() {
      this.projectId = ''
      this.clearWorkflow()
      this.items = []
      this.views = {}
      this.proposals = {}
      this.loading = false
      this.action = ''
      this.error = ''
    }
  }
})
