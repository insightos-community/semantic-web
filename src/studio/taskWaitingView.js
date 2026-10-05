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

const REASON_COPY = Object.freeze({
  planning_subtasks: {
    title: '等待 Agent 规划',
    activity: 'Task 已分配，Agent 正在生成可执行的 SubTask。'
  },
  waiting_resource: {
    title: '等待可用资源',
    activity: '调度器正在等待满足能力要求且空闲的 Agent 或 Robot。'
  },
  waiting_input: {
    title: '等待用户输入',
    activity: 'Agent 已提出需要用户确认的问题，回答后会恢复原 Task 上下文。'
  },
  waiting_agent: {
    title: '等待 Agent 决策',
    activity: '当前执行已保留现场，正在等待负责该 Task 的 Agent 给出恢复决策。'
  },
  execution_state_unknown: {
    title: '等待设备状态对账',
    activity: '设备执行状态尚未确认，暂不可继续。请查看详情并核对现场安全。'
  },
  robot_execution_failed: {
    title: 'Robot 执行失败',
    activity: 'Robot 当前执行已失败并保留现场，请查看 Execution 诊断后选择恢复或停止 Workflow。'
  },
  waiting_dependency: {
    title: '等待前置任务',
    activity: '等待前置任务完成。'
  },
  user_paused: {
    title: '已由用户暂停',
    activity: 'Workflow 保留当前进度，等待用户继续或停止。'
  },
  server_restarted: {
    title: '服务重启后待确认',
    activity: 'Server 重启后未发现活动物理执行，可以继续或停止。'
  },
  robot_agent_decision_failed: {
    title: '机器人决策失败',
    activity: 'Robot Agent 没有给出可用的类型化决策。可以重试决策，或停止当前 Workflow。'
  }
})

function normalizedReason(task = {}, workflow = {}) {
  return String(task.reason || (task.status === 'paused' ? workflow.reason : '') || '').trim()
}

export function interactionForTask(records = [], task = {}, workflow = {}) {
  return (
    records.find(
      (record) =>
        record.status === 'pending' &&
        ((record.taskId && record.taskId === task.id) ||
          (!record.taskId && record.workflowId && record.workflowId === workflow.id))
    ) || null
  )
}

// Waiting View 是对 Task、Workflow 与 Interaction 现有事实的只读投影。
// 它不持久化新的 Pause/Waiting 对象，避免恢复后出现第二份状态真相。
export function deriveTaskWaitingView(task = {}, { workflow = {}, interaction = null } = {}) {
  const reason = interaction ? 'waiting_input' : normalizedReason(task, workflow)
  const explicitlyWaiting =
    Boolean(interaction) ||
    task.status === 'paused' ||
    task.status === 'stopping' ||
    reason.startsWith('waiting_') ||
    reason === 'planning_subtasks' ||
    reason === 'execution_state_unknown' ||
    reason === 'robot_agent_decision_failed'
  if (!explicitlyWaiting) return null

  const copy = REASON_COPY[reason] || {
    title: task.status === 'stopping' ? '正在安全停止' : 'Task 已暂停',
    activity:
      task.status === 'stopping'
        ? '停止请求已提交，正在等待当前执行返回终态和安全证据。'
        : 'Task 已保留当前进度，等待恢复条件成立。'
  }
  const owner =
    interaction?.targetAgentId ||
    interaction?.agentName ||
    task.assigned_agent_id ||
    task.assigned_robot_id ||
    (reason === 'waiting_resource' ? 'Workflow Service' : task.required_role || 'Leader')
  const actions = []
  if (interaction) actions.push({ id: 'answer', label: '定位问题', kind: 'primary' })
  else actions.push({ id: 'inspect', label: '查看 Task', kind: 'default' })
  if (
    !interaction &&
    ['user_paused', 'server_restarted'].includes(reason) &&
    workflow.status === 'paused'
  )
    actions.push({ id: 'resume', label: '继续 Workflow', kind: 'primary' })
  if (!interaction && reason === 'robot_agent_decision_failed' && workflow.status === 'paused')
    actions.push({ id: 'retry-decision', label: '重试决策', kind: 'primary' })
  if (!interaction && reason === 'execution_state_unknown' && workflow.status === 'paused')
    actions.push({ id: 'confirm-stop', label: '确认现场安全并终结', kind: 'warning' })
  return {
    taskId: task.id || '',
    workflowId: workflow.id || '',
    interactionId: interaction?.id || '',
    title: copy.title,
    reason: interaction?.question || reason || task.status,
    owner,
    activity: copy.activity,
    actions
  }
}
