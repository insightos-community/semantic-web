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
  <section class="activity-panel">
    <header v-if="sourceTab" class="process-header">
      <button type="button" @click="returnToSource">
        返回{{ sourceLabels[sourceTab] || '来源' }}
      </button>
      <b :title="title">{{ workflowView ? 'Workflow' : '本次请求' }} · {{ title }}</b>
    </header>
    <div v-if="tasks.length" class="process-workspace">
      <nav class="task-tree" aria-label="Task 与 SubTask">
        <div class="tree-heading">
          <small>Task / SubTask</small
          ><button v-if="workflowView" type="button" @click="openWorkflow">查看 Workflow</button>
        </div>
        <section v-for="task in tasks" :key="task.id" class="task-group">
          <button
            class="task-row"
            type="button"
            :title="task.title"
            :aria-expanded="!collapsed[task.id]"
            @click="toggleTask(task)"
          >
            <b
              >{{ collapsed[task.id] ? '▸' : '▾' }} {{ task.unassociated ? '' : 'Task · '
              }}{{ task.title }}</b
            >
            <small v-if="!task.unassociated"
              >{{ completedCount(task) }}/{{ task.subtasks.length }} 步完成</small
            >
          </button>
          <template v-if="!collapsed[task.id]">
            <button
              v-for="(subtask, index) in task.subtasks"
              :key="subtask.id"
              class="subtask-row"
              type="button"
              :class="{ selected: process.subtask?.id === subtask.id }"
              :data-subtask-id="subtask.id"
              :aria-current="process.subtask?.id === subtask.id ? 'step' : undefined"
              :aria-label="`${subtask.unassociated ? '执行' : 'SubTask'} · ${subtask.title}`"
              :title="subtask.title"
              @click="selectSubtask(task, subtask)"
            >
              <span class="step-number">{{ index + 1 }}</span>
              <span class="step-label">{{ subtask.title }}</span>
              <DeviceStatus :status="subtask.status" />
            </button>
            <p v-if="!task.subtasks.length" class="empty">等待 SubTask 分解</p>
          </template>
        </section>
      </nav>
      <div class="selected-process">
        <header class="step-heading">
          <b :title="process.subtask?.title">{{ process.subtask?.title || process.task?.title }}</b>
          <span v-if="process.execution">{{ process.execution.skill_name }}</span>
          <select
            v-if="process.subtask?.executions.length > 1"
            aria-label="本步骤执行尝试"
            :value="process.execution?.id"
            @change="selectAttempt($event.target.value)"
          >
            <option
              v-for="(execution, index) in process.subtask.executions"
              :key="execution.id"
              :value="execution.id"
            >
              尝试 {{ index + 1 }} · {{ execution.status }}
            </option>
          </select>
        </header>
        <StudioStageTimeline
          v-if="process.execution"
          :execution="process.execution"
          :stages="process.stages"
          :selected-stage="process.stage"
          @select="selectStage"
          @logs="showStageLogs"
        />
        <div v-else class="empty">
          {{
            process.subtask?.reason ||
            (process.subtask ? '本步骤暂无 Robot 执行记录。' : '选择一个 SubTask 查看过程。')
          }}
        </div>
        <footer v-if="process.execution" class="record-loading">
          <span v-if="robots.eventPages[process.execution.id]?.error" role="alert">{{
            robots.eventPages[process.execution.id].error
          }}</span>
          <button
            v-if="robots.eventPages[process.execution.id]?.hasMore"
            type="button"
            :disabled="robots.detailLoading(process.execution.id)"
            @click="robots.loadMoreEvents(process.execution.id)"
          >
            加载后续阶段与记录
          </button>
        </footer>
      </div>
    </div>
    <div v-else-if="runs.length" class="standalone-run">
      <b>{{ runs[0].agent_name || runs[0].agent_id || 'Agent 请求' }}</b
      ><DeviceStatus :status="runs[0].status" />
      <p>本次 Agent 请求尚无 Robot 执行阶段。</p>
      <button type="button" @click="layout.revealBottom('logs')">查看请求日志</button>
      <button type="button" @click="inspectRun">查看属性</button>
    </div>
    <p v-else class="empty">所选运行尚无 Task 或执行记录。</p>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import StudioStageTimeline from './StudioStageTimeline.vue'
import { useExecutionEvidence } from '@/studio/executionEvidence'
import { useRobotStore } from '@/stores/robot'
import { useLayoutStore } from '@/stores/layout'
import { openStudioPanel } from '@/studio/panelService'

const {
  scope,
  scopeKey,
  title,
  workflowView,
  tasks,
  process,
  runs,
  events,
  sourceTab,
  focusSubtask,
  focusStage,
  inspectProcess,
  locateRecord,
  returnToSource
} = useExecutionEvidence()
const robots = useRobotStore()
const layout = useLayoutStore()
const collapsed = ref({})
function toggleTask(task) {
  collapsed.value[task.id] = !collapsed.value[task.id]
  inspectTask(task)
}
function selectSubtask(task, subtask) {
  focusSubtask(task, subtask)
  inspectStep()
}
function selectStage(stage) {
  focusStage(stage)
  inspectProcess()
}
const sourceLabels = { problems: '问题', logs: '日志', artifacts: '结果', activity: '过程' }
const completedCount = (task) => task.subtasks.filter((item) => item.status === 'completed').length
function openWorkflow() {
  openStudioPanel('workflow-run', { resourceId: workflowView.value.workflow.id })
}
function inspectTask(task) {
  if (task.unassociated) return
  layout.select({
    resourceType: 'task',
    resourceId: task.id,
    title: task.title,
    source: 'studio-evidence'
  })
  layout.revealInspector()
}
function inspectStep() {
  const { subtask, execution, task } = process.value
  const resource =
    subtask && !subtask.unassociated
      ? { resourceType: 'subtask', resourceId: subtask.id, title: subtask.title }
      : execution
        ? { resourceType: 'robot_execution', resourceId: execution.id, title: execution.skill_name }
        : null
  if (!resource) return task && inspectTask(task)
  layout.select({ ...resource, source: 'studio-evidence' })
  layout.revealInspector()
}
function selectAttempt(id) {
  scope.focusProcess({
    scopeKey: scopeKey.value,
    taskId: process.value.task.id,
    subtaskId: process.value.subtask.id,
    executionId: id
  })
}
function showStageLogs() {
  const { execution, stage } = process.value
  const record = events.value.find(
    (item) =>
      item.executionId === execution.id && (!stage || [stage.name, stage.id].includes(item.stage))
  )
  locateRecord(record || { executionId: execution.id, stage: stage?.name }, 'activity', 'logs')
}
function inspectRun() {
  layout.select({ resourceType: 'run', resourceId: runs.value[0].id, source: 'studio-evidence' })
  layout.revealInspector()
}
</script>

<style scoped>
.activity-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--sf-bg-secondary);
  font-size: 11px;
}
.process-header,
.step-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 10px;
  flex: none;
  border-bottom: 1px solid var(--sf-border-light);
}
.process-header > b,
.step-heading > b {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.process-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(150px, 26%) minmax(0, 1fr);
}
.task-tree {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid var(--sf-border-light);
}
.task-group {
  padding: 5px;
  border-bottom: 1px solid var(--sf-border-light);
}
.tree-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 5px;
  color: var(--sf-text-secondary);
}
.task-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
}
.task-row b {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-row small {
  color: var(--sf-text-secondary);
}
.subtask-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
  text-align: left;
}
.subtask-row.selected {
  background: var(--sf-brand-light, var(--sf-bg-hover));
  border-color: var(--sf-brand);
}
.step-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.step-number {
  color: var(--sf-text-disabled);
  flex: none;
}
.subtask-row :deep(.device-status) {
  font-size: 11px;
  flex: none;
}
.selected-process {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.step-heading > span {
  color: var(--sf-text-secondary);
  max-width: 35%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
button,
select {
  padding: 4px 6px;
  border: 1px solid var(--sf-border-light);
  border-radius: 4px;
  background: transparent;
  color: var(--sf-text-primary);
  font-size: 11px;
  cursor: pointer;
}
.process-header > button,
.step-heading > button {
  flex: none;
}
.record-loading {
  flex: none;
  padding: 3px 8px;
}
.record-loading:empty {
  display: none;
}
.empty {
  padding: 12px;
  color: var(--sf-text-secondary);
}
.standalone-run {
  padding: 12px;
}
.standalone-run > b {
  margin-right: 10px;
}
</style>
