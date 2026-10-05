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

import { computed, inject, watch } from 'vue'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { useProjectStore } from '@/stores/project'
import { useDeviceStore } from '@/stores/device'
import { useRobotStore } from '@/stores/robot'
import { useRunsStore } from '@/stores/runs'
import { useWorkflowStore } from '@/stores/workflow'
import { currentProjectWork } from '@/studio/currentWork'
import { executionLogRows, executionProblems, runLogRows } from '@/robot/executionRecords'
import { processHierarchy, selectedProcess, stageKey } from '@/studio/executionProcess'
import { useLayoutStore } from '@/stores/layout'
import { robotStageResourceId } from '@/devices/stageSelection'

export const executionEvidenceKey = Symbol('executionEvidence')

export function createExecutionEvidence() {
  const scope = useExecutionScopeStore()
  const project = useProjectStore()
  const devices = useDeviceStore()
  const robots = useRobotStore()
  const runsStore = useRunsStore()
  const workflows = useWorkflowStore()
  const layout = useLayoutStore()
  const businessSelection = (kind, value) => {
    const parentId =
      value.workflow_id ||
      (value.context_id?.startsWith('workflow-summary:')
        ? value.context_id.slice('workflow-summary:'.length)
        : '')
    return {
      kind: parentId ? 'workflow' : kind,
      id: parentId || value.id,
      projectId: project.currentProjectId
    }
  }
  const lastCurrent = computed(() => {
    const previous = scope.currentSelection
    if (!previous || previous.projectId !== project.currentProjectId) return previous
    // 修正已被内部收尾 Run 接管的当前记录；手动 inspectRun 不走此分支。
    const value =
      previous.kind === 'run'
        ? runsStore.byId(previous.id)
        : previous.kind === 'execution'
          ? robots.byId(previous.id)
          : null
    return value ? businessSelection(previous.kind, value) : previous
  })
  const work = computed(() =>
    currentProjectWork({
      projectId: project.currentProjectId,
      workflows: workflows.items,
      devices: devices.robots,
      executions: robots.executions,
      runs: runsStore.items
    })
  )
  const current = computed(
    () =>
      work.value.current ||
      (lastCurrent.value?.projectId !== project.currentProjectId ? work.value.recent : null)
  )
  watch(
    [current, lastCurrent],
    ([item, previous]) => {
      const next = item ? businessSelection(item.kind, item.value) : previous
      if (!next || next.projectId !== project.currentProjectId) return
      if (
        scope.currentSelection?.id !== next.id ||
        scope.currentSelection?.kind !== next.kind ||
        scope.currentSelection?.projectId !== next.projectId
      )
        scope.currentSelection = next
    },
    { immediate: true, flush: 'sync' }
  )
  const selection = computed(() => {
    if (scope.mode === 'history') {
      return {
        kind: scope.executionId ? 'execution' : scope.workflowId ? 'workflow' : 'run',
        id: scope.executionId || scope.workflowId || scope.runId
      }
    }
    if (lastCurrent.value?.projectId === project.currentProjectId) return lastCurrent.value
    const execution = robots.executions.find((item) => item.project_id === project.currentProjectId)
    return execution ? businessSelection('execution', execution) : null
  })
  const workflowId = computed(() =>
    selection.value?.kind === 'workflow' ? selection.value.id : ''
  )
  const workflowView = computed(
    () =>
      workflows.viewById(workflowId.value) ||
      (workflows.workflow?.id === workflowId.value
        ? { workflow: workflows.workflow, tasks: workflows.tasks }
        : null)
  )
  const executions = computed(() =>
    robots.executions.filter(
      (item) =>
        (!item.project_id || item.project_id === project.currentProjectId) &&
        (selection.value?.kind === 'execution'
          ? item.id === selection.value.id
          : selection.value?.kind === 'workflow'
            ? item.workflow_id === selection.value.id
            : selection.value?.kind === 'run'
              ? item.run_id === selection.value.id
              : false)
    )
  )
  const runs = computed(() => {
    const knownRuns = [...runsStore.items]
    if (
      selection.value?.kind === 'run' &&
      !knownRuns.some((item) => item.id === selection.value.id)
    )
      knownRuns.push({ id: selection.value.id, project_id: project.currentProjectId })
    for (const execution of executions.value) {
      if (execution.run_id && !knownRuns.some((item) => item.id === execution.run_id))
        knownRuns.push({ id: execution.run_id, project_id: execution.project_id })
    }
    return knownRuns
      .filter((item) => {
        if (item.project_id && item.project_id !== project.currentProjectId) return false
        if (selection.value?.kind === 'run') return item.id === selection.value.id
        if (executions.value.some((execution) => execution.run_id === item.id)) return true
        return Boolean(
          workflowId.value &&
          (item.workflow_id === workflowId.value ||
            workflowView.value?.tasks?.some((task) => task.id === item.task_id))
        )
      })
      .map((item) => ({ ...robots.tracesByRun[item.id]?.run, ...item }))
  })
  const traceRows = computed(() =>
    runs.value.flatMap((run) => runLogRows(run, robots.tracesByRun[run.id]))
  )
  const events = computed(() => [
    ...executions.value.flatMap((execution) =>
      executionLogRows(execution, robots.eventsFor(execution.id))
    ),
    ...traceRows.value
  ])
  const problems = computed(() => [
    ...executionProblems(executions.value, robots.eventsFor),
    ...traceRows.value.filter((row) => row.level !== 'info')
  ])
  const title = computed(
    () =>
      workflowView.value?.workflow?.goal ||
      executions.value[0]?.skill_name ||
      runs.value[0]?.agent_name ||
      selection.value?.id ||
      '暂无运行记录'
  )
  const pendingPages = computed(() =>
    executions.value.filter((item) => robots.eventPages[item.id]?.hasMore)
  )
  const loading = computed(() => executions.value.some((item) => robots.detailLoading(item.id)))
  const scopeKey = computed(() => `${selection.value?.kind || ''}:${selection.value?.id || ''}`)
  const tasks = computed(() => processHierarchy(workflowView.value, executions.value))
  const process = computed(() => selectedProcess(tasks.value, scope.processFocus, scopeKey.value))
  const sourceTab = computed(() =>
    scope.navigationOrigin?.scopeKey === scopeKey.value ? scope.navigationOrigin.tab : ''
  )
  function focusSubtask(task, subtask) {
    scope.focusProcess({ scopeKey: scopeKey.value, taskId: task.id, subtaskId: subtask.id })
  }
  function focusStage(stage) {
    scope.focusProcess({
      scopeKey: scopeKey.value,
      taskId: process.value.task?.id,
      subtaskId: process.value.subtask?.id,
      executionId: process.value.execution?.id,
      stageId: stageKey(stage)
    })
  }
  function inspectProcess() {
    const { task, subtask, execution, stage } = process.value
    const resource =
      stage && !stage.detailsPending
        ? {
            resourceType: 'robot_stage',
            resourceId: robotStageResourceId(execution.id, stage),
            title: stage.label || stage.name
          }
        : subtask && !subtask.unassociated
          ? { resourceType: 'subtask', resourceId: subtask.id, title: subtask.title }
          : execution
            ? {
                resourceType: 'robot_execution',
                resourceId: execution.id,
                title: execution.skill_name
              }
            : task && !task.unassociated
              ? { resourceType: 'task', resourceId: task.id, title: task.title }
              : null
    if (resource) {
      layout.select({ ...resource, source: 'studio-evidence', workflowId: workflowId.value })
      layout.revealInspector()
    }
  }
  function locateRecord(record, fromTab, toTab = 'activity') {
    scope.rememberSource(fromTab, scopeKey.value)
    const task = tasks.value.find((item) =>
      item.subtasks.some((step) =>
        step.executions.some((execution) => execution.id === record.executionId)
      )
    )
    const subtask = task?.subtasks.find((item) =>
      item.executions.some((execution) => execution.id === record.executionId)
    )
    if (subtask)
      scope.focusProcess({
        scopeKey: scopeKey.value,
        taskId: task.id,
        subtaskId: subtask.id,
        executionId: record.executionId,
        stageId: record.stage || ''
      })
    if (toTab === 'logs') scope.logEventId = record.id
    layout.revealBottom(toTab)
  }
  function returnToSource() {
    const tab = scope.returnToSource(scopeKey.value)
    if (tab) layout.revealBottom(tab)
  }
  return {
    scope,
    selection,
    workflowId,
    workflowView,
    executions,
    runs,
    events,
    problems,
    title,
    pendingPages,
    loading,
    scopeKey,
    tasks,
    process,
    sourceTab,
    focusSubtask,
    focusStage,
    inspectProcess,
    locateRecord,
    returnToSource
  }
}

export function useExecutionEvidence() {
  return inject(executionEvidenceKey, null) || createExecutionEvidence()
}
