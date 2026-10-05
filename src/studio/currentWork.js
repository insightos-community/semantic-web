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

const activeStates = new Set([
  'pending',
  'queued',
  'starting',
  'running',
  'paused',
  'waiting_agent',
  'waiting_input',
  'stopping',
  'interrupted',
  'cancelling'
])
const terminalStates = new Set(['completed', 'failed', 'stopped', 'cancelled', 'canceled'])
const startedAt = (item) =>
  new Date(item.started_at || item.created_at || item.ended_at || item.updated_at || 0).getTime() ||
  0
const newestFirst = (left, right) => startedAt(right) - startedAt(left)

export function currentProjectWork({
  projectId,
  robotId = '',
  workflows = [],
  executions = [],
  runs = [],
  devices = []
}) {
  const inProject = (item) => !item.project_id || item.project_id === projectId
  const projectWorkflows = workflows.filter(inProject)
  const projectExecutions = executions.filter(inProject)
  // interrupted 历史不能重新占用设备；只有 Pilot 仍指向它时，才保留当前
  // 停止入口。新请求失败或换会话均不能遮蔽这个权威占用。
  const ownsInterruptedExecution = (item) =>
    item.status !== 'interrupted' ||
    devices.some(
      (device) => device.robot_id === item.robot_id && device.current_execution_id === item.id
    )
  // 终态 Workflow 也仍是收尾 Run / Execution 的归属，不能只检查活动父级。
  const workflowIds = new Set(projectWorkflows.map((item) => item.id))
  const activeWorkflowIds = new Set(
    projectWorkflows.filter((item) => activeStates.has(item.status)).map((item) => item.id)
  )
  const taskWorkflowIds = new Map(
    projectWorkflows.flatMap((workflow) =>
      (workflow.tasks || []).map((task) => [task.id, workflow.id])
    )
  )
  const byRunId = new Map(runs.map((run) => [run.id, run]))
  for (const device of devices) {
    const run = device.current_run
    if (run?.id) {
      const existing = byRunId.get(run.id)
      byRunId.set(run.id, {
        ...(Number(run.revision || 0) > Number(existing?.revision || 0)
          ? { ...existing, ...run }
          : { ...run, ...existing }),
        robot_id: existing?.robot_id || run.robot_id || device.robot_id
      })
    }
  }
  const projectRuns = [...byRunId.values()].filter(
    (run) =>
      inProject(run) &&
      (!run.kind || run.kind === 'conversation') &&
      !run.workflow_id &&
      !run.task_id &&
      !run.context_id?.startsWith('workflow-summary:')
  )
  const activeRunIds = new Set(
    projectRuns.filter((run) => activeStates.has(run.status)).map((run) => run.id)
  )
  const matchesRobot = (item) =>
    !robotId ||
    item.robot_id === robotId ||
    item.assigned_robot_id === robotId ||
    projectExecutions.some(
      (execution) => execution.robot_id === robotId && execution.workflow_id === item.id
    ) ||
    (item.tasks || []).some(
      (task) => task.assigned_robot_id === robotId || task.robot_id === robotId
    )
  // 工作摘要按业务工作计数。Task Run 和关联 Execution 已包含在 Workflow 中，
  // 不再各计一次；独立技能调试和普通对话 Run 则各自保留直接停止入口。
  const topLevel = [
    ...projectWorkflows
      .filter(matchesRobot)
      .sort(newestFirst)
      .map((value) => ({ kind: 'workflow', value })),
    ...projectExecutions
      .filter(
        (item) =>
          matchesRobot(item) &&
          ownsInterruptedExecution(item) &&
          !(activeStates.has(item.status) ? activeWorkflowIds : workflowIds).has(
            item.workflow_id ||
              taskWorkflowIds.get(item.task_id) ||
              byRunId.get(item.run_id)?.workflow_id
          ) &&
          (item.status === 'interrupted' || !activeRunIds.has(item.run_id))
      )
      .sort(newestFirst)
      .map((value) => ({ kind: 'execution', value })),
    ...projectRuns
      .filter(matchesRobot)
      .sort(newestFirst)
      .map((value) => ({ kind: 'run', value }))
  ]
  const items = topLevel.filter((item) => activeStates.has(item.value.status))
  const terminalExecutions = topLevel.filter(
    (item) => item.kind === 'execution' && terminalStates.has(item.value.status)
  )
  // Agent 完成下发请求与 Skill 完成操作是两个终态。同一请求已有实际执行
  // 结果时，展示它的 stopped / failed / completed，避免“请求已完成”掩盖停止。
  const terminal = topLevel.filter(
    (item) =>
      terminalStates.has(item.value.status) &&
      (item.kind !== 'run' || !terminalExecutions.some((e) => e.value.run_id === item.value.id))
  )
  // 普通问答的结束不抹掉最近业务结果；新的 Workflow / 技能 / Robot 请求会更新结果。
  const businessResults = terminal.filter((item) => item.kind !== 'run' || item.value.robot_id)
  return {
    items,
    // 当前现场独立于聊天选择；查看另一会话或历史不会改变正在执行的工作。
    current: items[0] || null,
    // 与 current 分离，设备不会因展示已结束结果而被标为忙碌。
    recent:
      (businessResults.length ? businessResults : terminal).sort((left, right) =>
        newestFirst(left.value, right.value)
      )[0] || null
  }
}

// 只呈现运行记录中的计数与当前步骤，不由 Task 比例推导物理成功或执行百分比。
export function projectWorkProgress(item, { workflowViews = {}, executions = [] } = {}) {
  if (!item) return null
  const view = item.kind === 'workflow' ? workflowViews[item.value.id] : null
  const tasks = view?.tasks || item.value.tasks
  const subtasks = (tasks || []).flatMap((task) => task.subtasks || [])
  const activeExecutions = activeStates.has(item.value.status)
    ? executions.filter((execution) => activeStates.has(execution.status))
    : []
  const related = activeExecutions
    .filter((execution) =>
      item.kind === 'workflow'
        ? execution.workflow_id === item.value.id ||
          tasks?.some((task) => task.id === execution.task_id) ||
          subtasks.some((subtask) => subtask.execution_ref === execution.id)
        : item.kind === 'run'
          ? execution.run_id === item.value.id
          : execution.id === item.value.id
    )
    .sort(newestFirst)
  const execution =
    related[0] ||
    (item.kind === 'execution' && activeStates.has(item.value.status) ? item.value : null)
  const subtask =
    subtasks.find(
      (candidate) =>
        execution &&
        (candidate.id === execution.subtask_id || candidate.execution_ref === execution.id)
    ) ||
    (activeStates.has(item.value.status) &&
      subtasks.find(
        (candidate) => activeStates.has(candidate.status) && candidate.status !== 'pending'
      ))
  const task = tasks?.find(
    (candidate) => candidate.id === subtask?.task_id || candidate.subtasks?.includes(subtask)
  )
  return {
    taskTotal: tasks ? tasks.length : null,
    taskCompleted: tasks
      ? tasks.filter((candidate) => candidate.status === 'completed').length
      : null,
    subtask,
    subtaskPosition: subtask ? (task?.subtasks?.indexOf(subtask) ?? -1) + 1 : null,
    subtaskTotal: task?.subtasks?.length || null,
    skill: execution?.skill_name || subtask?.spec?.skill_name || '',
    stage: execution?.stage || '',
    parallelExecutions: related.length
  }
}
