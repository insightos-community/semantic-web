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

import { currentExecutionStage, buildRobotStageView } from '@/robot/executionViewAdapter'

const active = new Set([
  'running',
  'starting',
  'queued',
  'pending',
  'waiting_agent',
  'waiting_input',
  'stopping',
  'cancelling'
])
const timestamp = (value) => Date.parse(value?.started_at || value?.created_at || '') || 0
const ordered = (values = []) =>
  [...values].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || timestamp(a) - timestamp(b))
export const stageKey = (stage) => stage?.id || stage?.name || ''

// Only explicit Task/SubTask/Execution links form the hierarchy. Unknown parents
// stay visibly unassociated; no imagined Task, physical success, or timestamp join.
export function processHierarchy(view, executions = []) {
  const linked = new Set()
  const tasks = ordered(view?.tasks).map((task) => ({
    ...task,
    title: task.title || task.goal || task.id,
    subtasks: ordered(
      task.subtasks || view?.subtasks?.filter((item) => item.task_id === task.id)
    ).map((subtask) => {
      const children = executions.filter(
        (execution) =>
          execution.id === subtask.execution_ref ||
          (execution.subtask_id === subtask.id &&
            (!execution.task_id || execution.task_id === task.id))
      )
      children.forEach((execution) => linked.add(execution.id))
      return {
        ...subtask,
        title: subtask.title || subtask.goal || subtask.spec?.skill_name || subtask.id,
        executions: [...children].sort((a, b) => timestamp(a) - timestamp(b))
      }
    })
  }))
  const unlinked = executions.filter((execution) => !linked.has(execution.id))
  if (unlinked.length)
    tasks.push({
      id: view ? 'unassociated-executions' : 'independent-request',
      title: view ? '未关联 SubTask 的执行' : '所选执行',
      unassociated: true,
      subtasks: [...unlinked]
        .sort((a, b) => timestamp(a) - timestamp(b))
        .map((execution) => ({
          id: `execution:${execution.id}`,
          title: execution.skill_name || 'Robot Skill',
          status: execution.status,
          unassociated: true,
          executions: [execution]
        }))
    })
  return tasks
}

export function selectedProcess(tasks, focus, scopeKey) {
  const pairs = tasks.flatMap((task) => task.subtasks.map((subtask) => ({ task, subtask })))
  const matching =
    focus?.scopeKey === scopeKey
      ? pairs.find(({ subtask }) => subtask.id === focus.subtaskId)
      : null
  const selected =
    matching ||
    pairs.find(({ subtask }) => ['running', 'starting', 'stopping'].includes(subtask.status)) ||
    [...pairs].reverse().find(({ subtask }) => subtask.executions.length) ||
    pairs.find(({ subtask }) => active.has(subtask.status)) ||
    pairs[0]
  if (!selected)
    return { task: tasks[0] || null, subtask: null, execution: null, stage: null, stages: [] }
  const execution =
    (matching && selected.subtask.executions.find((item) => item.id === focus.executionId)) ||
    selected.subtask.executions.at(-1) ||
    null
  const stages = [...(execution?.stages || [])]
  if (execution?.stage && !currentExecutionStage(execution))
    stages.push({ name: execution.stage, label: execution.stage, detailsPending: true })
  const stage =
    (matching &&
      stages.find((item) => stageKey(item) === focus.stageId || item.name === focus.stageId)) ||
    stages.find((item) => item.name === execution?.stage || item.id === execution?.stage) ||
    stages.at(-1) ||
    null
  return { ...selected, execution, stages, stage }
}

export function objectTarget(input = {}) {
  return {
    object:
      input.object_ref ||
      input.target?.object_ref ||
      input.source?.object_ref ||
      input.carried_object_ref ||
      '',
    target: input.target_ref || input.target?.target_ref || '',
    layer: input.target_layer || input.target?.layer || ''
  }
}

export function finalStageEvidence(execution) {
  if (!execution) return { artifacts: [], stage: null }
  const stage = currentExecutionStage(execution)
  // Never relabel approach/grasp images as final placement evidence.
  return { stage, artifacts: stage ? buildRobotStageView(execution, stage).artifacts : [] }
}
