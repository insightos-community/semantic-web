<!--
Copyright 2026 InsightOS
SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

<template>
  <section class="workflow-run">
    <header v-if="currentWorkflow">
      <div>
        <span>WORKFLOW · {{ workflowStatusLabel }}</span>
        <h1 :title="currentWorkflow.goal">{{ compactTitle(currentWorkflow.goal, 'Workflow') }}</h1>
        <small
          >{{ formatTime(currentWorkflow.started_at || currentWorkflow.created_at) }} ·
          {{ durationLabel(currentWorkflow) }}</small
        >
      </div>
      <div class="workflow-summary">
        <strong class="workflow-progress"
          >Task {{ completedTasks }}/{{ tasks.length }} 已完成</strong
        >
        <el-button size="small" @click="openExecutionRecords">查看执行记录</el-button>
        <el-button
          v-if="canRetryStop"
          size="small"
          type="danger"
          plain
          :loading="workflow.action === 'stop'"
          @click="stopWorkflow"
        >
          {{ stopButtonLabel }}
        </el-button>
        <el-button
          v-if="executionStateUnknown"
          size="small"
          type="warning"
          :loading="workflow.action === 'confirm-stop'"
          @click="confirmSafeStop"
        >
          确认现场安全并终结
        </el-button>
      </div>
    </header>

    <div v-if="loading" class="empty">正在读取 Workflow…</div>
    <div v-else-if="!currentWorkflow" class="empty">Workflow 不存在或已无法读取。</div>
    <template v-else>
      <details class="full-goal">
        <summary>完整目标与标识</summary>
        <p>{{ currentWorkflow.goal }}</p>
        <code>{{ currentWorkflow.id }} · revision {{ currentWorkflow.revision }}</code>
      </details>
      <section v-if="executionStateUnknown" class="unknown-stop-notice">
        <b>Robot Execution 状态未知</b>
        <span> 可重试停止，或确认机器人已停止并安全保持后终结。 </span>
      </section>
      <section class="dag-section">
        <div class="section-heading">
          <div>
            <h2>Task / SubTask 概览</h2>
          </div>
        </div>
        <div class="task-dag">
          <button
            v-for="(task, index) in tasks"
            :key="task.id"
            type="button"
            :class="['task-node', `is-${task.status}`, { selected: selectedTask?.id === task.id }]"
            @click="selectTask(task)"
          >
            <span class="node-index">{{ index + 1 }}</span>
            <div class="node-main">
              <div>
                <b :title="task.title || task.goal">{{
                  compactTitle(task.title || task.goal, `Task ${index + 1}`)
                }}</b
                ><i class="sf-status-dot" :data-status="dot(task.status)" />
              </div>
              <small>{{ task.required_role || '未声明角色' }} · {{ assignment(task) }}</small>
              <small
                >{{ (task.subtasks || []).filter((item) => item.status === 'completed').length }}/{{
                  task.subtasks?.length || 0
                }}
                SubTask 已完成</small
              >
              <small v-if="dependenciesFor(task).length"
                >依赖 {{ dependenciesFor(task).join('、') }}</small
              >
              <small v-else>无前置依赖</small>
            </div>
            <span class="node-status">{{ taskStatusLabel(task) }}</span>
          </button>
        </div>
      </section>

      <section v-if="selectedTask" class="task-detail">
        <div class="section-heading">
          <div>
            <span>所选 TASK</span>
            <h2 :title="selectedTask.title || selectedTask.goal">
              {{ compactTitle(selectedTask.title || selectedTask.goal, 'Task') }}
            </h2>
          </div>
          <DeviceStatus :status="selectedTask.status" />
        </div>
        <details class="full-goal">
          <summary>Task 完整目标与标识</summary>
          <p>{{ selectedTask.goal || selectedTask.title }}</p>
          <code>{{ selectedTask.id }}</code>
        </details>
        <div class="task-meta">
          <div>
            <span>所需角色</span><b>{{ selectedTask.required_role || '未声明角色' }}</b>
          </div>
          <div>
            <span>实际 Agent</span><b>{{ selectedTask.assigned_agent_id || '等待分配' }}</b>
          </div>
          <div>
            <span>实际 Robot</span><b>{{ selectedTask.assigned_robot_id || '不适用 / 未分配' }}</b>
          </div>
          <div>
            <span>当前阶段</span><b>{{ taskReasonLabel(selectedTask.reason) }}</b>
          </div>
        </div>
        <TaskWaitingCard
          v-if="selectedWaitingView"
          :view="selectedWaitingView"
          class="selected-waiting"
          @action="handleWaitingAction"
        />
        <div class="subtask-todo">
          <button
            v-for="item in selectedTask.subtasks"
            :key="item.id"
            type="button"
            @click="selectSubTask(item)"
          >
            <i :class="['todo-check', { done: item.status === 'completed' }]" />
            <span
              ><b :title="item.goal || item.title">{{
                compactTitle(item.title || item.goal, 'SubTask')
              }}</b
              ><small>{{ item.kind }} · {{ item.reason || statusLabel(item.status) }}</small></span
            >
            <DeviceStatus :status="item.status" />
          </button>
          <p v-if="!selectedTask.subtasks.length">
            {{ emptySubTaskLabel }}
          </p>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { confirmWorkflowStop } from '@/studio/confirmWorkflowStop'
import { stopWorkflowFromUI } from '@/studio/stopWorkflow'
import { useLayoutStore } from '@/stores/layout'
import { useUiStore } from '@/stores/ui'
import { useWorkflowStore, workflowStopMode } from '@/stores/workflow'
import { useInteractionsStore } from '@/stores/interactions'
import TaskWaitingCard from '@/components/studio/TaskWaitingCard.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { durationLabel } from '@/robot/executionRecords'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { openStudioPanel } from '@/studio/panelService'
import { deriveTaskWaitingView, interactionForTask } from '@/studio/taskWaitingView'

const workflow = useWorkflowStore()
const layout = useLayoutStore()
const ui = useUiStore()
const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const loading = ref(false)
const requestedWorkflowId = computed(() =>
  String(props.panelParams.resourceId || workflow.workflow?.id || '')
)
const selectedView = computed(() => {
  const cached = workflow.viewById(requestedWorkflowId.value)
  if (cached) return cached
  if (workflow.workflow?.id === requestedWorkflowId.value) {
    return {
      workflow: workflow.workflow,
      tasks: workflow.tasks,
      dependencies: workflow.dependencies
    }
  }
  return null
})
const currentWorkflow = computed(() => selectedView.value?.workflow || null)
const tasks = computed(() => selectedView.value?.tasks || [])
const dependencies = computed(() => selectedView.value?.dependencies || [])
const completedTasks = computed(
  () => tasks.value.filter((task) => task.status === 'completed').length
)
function compactTitle(value, fallback) {
  const text = String(value || fallback)
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 36 ? `${text.slice(0, 36)}…` : text
}
function formatTime(value) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '时间未上报'
}
function openExecutionRecords() {
  useExecutionScopeStore().inspectWorkflow(currentWorkflow.value.id)
  openStudioPanel('activity')
}
const stopMode = computed(() => workflowStopMode(currentWorkflow.value))
const executionStateUnknown = computed(() => stopMode.value === 'unknown')
// 物理状态未知时普通 stop 一定会被安全策略退回，重试停止没有意义：面板只保留
// 「确认现场安全并终结」这一条真实出口。
const canRetryStop = computed(() => ['stop', 'retry'].includes(stopMode.value))
const stopButtonLabel = computed(() => (stopMode.value === 'retry' ? '重试停止' : '停止 Workflow'))
const workflowStatusLabel = computed(() =>
  executionStateUnknown.value ? '执行状态未知' : statusLabel(currentWorkflow.value?.status)
)
const interactions = useInteractionsStore()
const selectedTask = computed(() => {
  const selectedId =
    layout.selectedResource?.resourceType === 'task' ? layout.selectedResource.resourceId : ''
  return (
    tasks.value.find((task) => task.id === selectedId) ||
    tasks.value.find((task) => task.status === 'running') ||
    tasks.value[0] ||
    null
  )
})
const emptySubTaskLabel = computed(() => {
  if (selectedTask.value?.reason === 'planning_subtasks') {
    return 'Robot Agent 正在规划该 Task 的类型化 SubTask…'
  }
  if (selectedTask.value?.reason === 'waiting_resource') {
    return '正在等待兼容且空闲的 Agent / Robot。'
  }
  return 'Task 尚未分配或 Task Agent 尚未生成类型化 SubTask。'
})
const selectedWaitingView = computed(() =>
  selectedTask.value
    ? deriveTaskWaitingView(selectedTask.value, {
        workflow: currentWorkflow.value,
        interaction: interactionForTask(
          interactions.pending,
          selectedTask.value,
          currentWorkflow.value
        )
      })
    : null
)

function taskStatusLabel(task) {
  return task.status === 'pending' && task.reason === 'planning_subtasks'
    ? 'Agent 规划中'
    : statusLabel(task.status)
}

function taskReasonLabel(reason) {
  return (
    {
      planning_subtasks: 'Robot Agent 正在规划 SubTask',
      waiting_resource: '等待兼容且空闲的 Agent / Robot',
      robot_execution_failed: 'Robot 执行失败，现场已保留'
    }[reason] ||
    reason ||
    '—'
  )
}

function dependenciesFor(task) {
  return dependencies.value
    .filter((edge) => edge.task_id === task.id)
    .map((edge) => {
      const index = tasks.value.findIndex((candidate) => candidate.id === edge.depends_on_task_id)
      return index >= 0 ? `Task ${index + 1}` : edge.depends_on_task_id
    })
}

function assignment(task) {
  return task.assigned_robot_id || task.assigned_agent_id || `等待 ${task.required_role || 'Agent'}`
}

function selectTask(task) {
  layout.select({ resourceType: 'task', resourceId: task.id, title: task.title || task.goal })
  layout.revealInspector()
}

function selectSubTask(item) {
  layout.select({ resourceType: 'subtask', resourceId: item.id, title: item.title || item.goal })
  layout.revealInspector()
}

async function handleWaitingAction(action) {
  const view = selectedWaitingView.value
  if (!view) return
  if (action === 'inspect') {
    selectTask(selectedTask.value)
    return
  }
  if (action === 'answer') {
    if (view.interactionId) {
      layout.select({
        resourceType: 'interaction',
        resourceId: view.interactionId,
        title: view.reason
      })
    }
    layout.revealBottom('interactions')
    return
  }
  if (action === 'confirm-stop') {
    await confirmSafeStop()
    return
  }
  if (action !== 'resume' && action !== 'stop' && action !== 'retry-decision') return
  try {
    await workflow.transitionById(currentWorkflow.value.id, action)
  } catch (error) {
    ui.notify({ type: 'error', message: workflow.error || error.message || 'Workflow 操作失败' })
  }
}

async function stopWorkflow() {
  await stopWorkflowFromUI(workflow, ui, currentWorkflow.value.id, tasks.value, {
    view: selectedView.value
  })
}

async function confirmSafeStop() {
  await confirmWorkflowStop(workflow, ui, currentWorkflow.value.id, tasks.value)
}

watch(
  [requestedWorkflowId, () => workflow.projectId],
  async ([workflowId, projectId]) => {
    if (!workflowId || !projectId) return
    loading.value = true
    try {
      await workflow.loadView(workflowId, { refresh: true })
    } catch (error) {
      ui.notify({ type: 'error', message: error.message || 'Workflow 加载失败' })
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function statusLabel(status) {
  return (
    {
      pending: '待执行',
      ready: '可执行',
      running: '执行中',
      paused: '已暂停',
      stopping: '停止中',
      completed: '已完成',
      failed: '失败',
      stopped: '已停止'
    }[status] ||
    status ||
    '未知'
  )
}

function dot(status) {
  return (
    {
      pending: 'idle',
      ready: 'starting',
      running: 'warning',
      paused: 'stopped',
      completed: 'success',
      failed: 'danger',
      stopped: 'stopped'
    }[status] || 'idle'
  )
}
</script>

<style scoped lang="scss">
.workflow-run {
  height: 100%;
  overflow: auto;
  padding: 16px 18px 30px;
  container-type: inline-size;
  background: var(--sf-bg-primary);
}
.workflow-run > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.workflow-run > header > div:first-child {
  min-width: 0;
  flex: 1 1 260px;
}
.workflow-run > header span,
.section-heading span {
  color: var(--sf-brand);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.1em;
}
h1,
h2,
p {
  margin: 0;
}
h1 {
  margin: 5px 0;
  color: var(--sf-text-primary);
  font-size: 17px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.workflow-run > header small,
.section-heading small {
  color: var(--sf-text-disabled);
}
.workflow-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.workflow-progress {
  font-size: 12px;
  white-space: nowrap;
}
.full-goal {
  margin: 10px 0;
  font-size: 12px;
  color: var(--sf-text-secondary);
}
.full-goal summary {
  cursor: pointer;
}
.full-goal p {
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.65;
  margin: 8px 0;
}
.full-goal code {
  overflow-wrap: anywhere;
  font-size: 10px;
}
.workflow-progress strong {
  color: var(--sf-text-primary);
  font-size: 22px;
}
.workflow-progress :deep(.el-progress) {
  margin-top: 8px;
}
.unknown-stop-notice {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 5px;
  margin-top: 20px;
  padding: 13px 15px;
  border: 1px solid color-mix(in srgb, var(--sf-warning) 45%, var(--sf-border-light));
  border-radius: var(--sf-radius-md);
  background: color-mix(in srgb, var(--sf-warning) 8%, var(--sf-bg-secondary));
  color: var(--sf-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.unknown-stop-notice b {
  color: var(--sf-warning);
}
.dag-section,
.task-detail {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-secondary);
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}
.section-heading h2 {
  margin-top: 4px;
  color: var(--sf-text-primary);
  font-size: 14px;
}
.task-dag {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  margin-top: 10px;
}
.task-node {
  display: grid;
  align-items: center;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 10px;
  min-height: 48px;
  padding: 8px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
}
.task-node:hover,
.task-node.selected {
  border-color: var(--sf-brand);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--sf-brand) 20%, transparent);
}
.node-index {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  background: var(--sf-brand-soft);
  color: var(--sf-brand);
  font-weight: 520;
}
.node-main {
  display: flex;
  min-width: 0;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 4px;
}
.node-main > div {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
}
.node-main b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-main small,
.node-status {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.task-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-md);
}
.task-meta > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-right: 1px solid var(--sf-border-light);
}
.task-meta > div:last-child {
  border-right: none;
}
.task-meta span {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.task-meta b {
  overflow: hidden;
  color: var(--sf-text-primary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-waiting {
  margin-top: 14px;
}
.subtask-todo {
  display: grid;
  gap: 7px;
  margin-top: 14px;
}
.subtask-todo button {
  display: grid;
  align-items: center;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
}
.subtask-todo button:hover {
  background: var(--sf-brand-soft);
}
.subtask-todo button > span {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.subtask-todo button b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
@container (max-width: 600px) {
  .task-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.subtask-todo small {
  color: var(--sf-text-disabled);
}
.subtask-todo code {
  color: var(--sf-brand);
  font-size: 11px;
}
.todo-check {
  width: 13px;
  height: 13px;
  border: 1px solid var(--sf-border-strong);
  border-radius: 4px;
}
.todo-check.done {
  border-color: var(--sf-success);
  background: var(--sf-success);
}
.subtask-todo p,
.empty {
  padding: 28px;
  color: var(--sf-text-disabled);
  text-align: center;
}
</style>
