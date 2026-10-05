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

import { describe, expect, it } from 'vitest'
import { fromRest } from '@/stores/chatModel'
import { normalizeInteraction } from '@/stores/interactions'
import { deriveTaskWaitingView, interactionForTask } from '@/studio/taskWaitingView'

describe('多 Agent Conversation 与 Waiting View', () => {
  it('REST恢复保留真实Agent身份，并将Workflow活动与模型发言分离', () => {
    const activity = fromRest({
      id: 'msg-activity',
      role: 'assistant',
      agent_id: 'robot:r1-pro-1',
      content: 'Task 已暂停',
      metadata: {
        message_kind: 'task_paused',
        message_type: 'activity',
        task_id: 'task-1',
        reason: 'waiting_agent'
      },
      created_at: '2026-08-20T01:00:00Z'
    })
    expect(activity).toMatchObject({
      role: 'system',
      agentName: 'robot:r1-pro-1',
      agentRole: 'robot',
      systemActivity: true,
      messageKind: 'task_paused',
      activity: { taskId: 'task-1', reason: 'waiting_agent' }
    })

    const summary = fromRest({
      id: 'msg-summary',
      role: 'assistant',
      agent_id: 'leader',
      content: 'Workflow 已完成。',
      metadata: { message_kind: 'workflow_summary' },
      created_at: '2026-08-20T01:01:00Z'
    })
    expect(summary).toMatchObject({
      role: 'assistant',
      agentName: 'leader',
      agentRole: 'leader',
      systemActivity: false
    })
  })

  it('Waiting View只从Task、Workflow和Interaction事实派生', () => {
    const task = {
      id: 'task-1',
      status: 'paused',
      reason: 'waiting_agent',
      assigned_agent_id: 'robot:r1-pro-1',
      assigned_robot_id: 'r1-pro-1'
    }
    const workflow = { id: 'workflow-1', status: 'paused' }
    const interaction = {
      id: 'interaction-1',
      status: 'pending',
      workflowId: 'workflow-1',
      taskId: 'task-1',
      targetAgentId: 'robot:r1-pro-1',
      question: '请选择恢复策略'
    }
    expect(interactionForTask([interaction], task, workflow)).toBe(interaction)
    expect(deriveTaskWaitingView(task, { workflow, interaction })).toMatchObject({
      taskId: 'task-1',
      interactionId: 'interaction-1',
      title: '等待用户输入',
      reason: '请选择恢复策略',
      owner: 'robot:r1-pro-1',
      actions: [{ id: 'answer', label: '定位问题', kind: 'primary' }]
    })
  })

  it('等待输入不提供通用Resume或停止Workflow，用户暂停才提供明确继续入口', () => {
    const workflow = { id: 'workflow-1', status: 'paused' }
    const waitingInput = deriveTaskWaitingView(
      { id: 'task-1', status: 'paused', reason: 'waiting_input' },
      {
        workflow,
        interaction: {
          id: 'interaction-1',
          status: 'pending',
          taskId: 'task-1',
          question: '请选择目标'
        }
      }
    )
    expect(waitingInput.actions.map((item) => item.id)).toEqual(['answer'])

    const userPaused = deriveTaskWaitingView(
      { id: 'task-2', status: 'paused', reason: 'user_paused' },
      { workflow }
    )
    expect(userPaused.actions.map((item) => item.id)).toEqual(['inspect', 'resume'])

    const decisionFailed = deriveTaskWaitingView(
      { id: 'task-3', status: 'paused', reason: 'robot_agent_decision_failed' },
      { workflow: { id: 'workflow-1', status: 'paused', reason: 'robot_agent_decision_failed' } }
    )
    expect(decisionFailed.actions.map((item) => item.id)).toEqual(['inspect', 'retry-decision'])

    const unknown = deriveTaskWaitingView(
      { id: 'task-4', status: 'paused', reason: 'execution_state_unknown' },
      { workflow: { id: 'workflow-1', status: 'paused', reason: 'execution_state_unknown' } }
    )
    expect(unknown.actions.map((item) => item.id)).toEqual(['inspect', 'confirm-stop'])
    expect(unknown.actions.some((item) => item.id === 'resume')).toBe(false)
  })

  it('Robot执行失败使用通用暂停状态并显示问题说明', () => {
    const view = deriveTaskWaitingView(
      {
        id: 'task-place',
        status: 'paused',
        reason: 'robot_execution_failed',
        assigned_robot_id: 'r1-pro-1'
      },
      {
        workflow: {
          id: 'workflow-1',
          status: 'paused',
          reason: 'robot_execution_failed'
        }
      }
    )

    expect(view).toMatchObject({
      title: 'Robot 执行失败',
      reason: 'robot_execution_failed',
      owner: 'r1-pro-1',
      actions: [{ id: 'inspect', label: '查看 Task', kind: 'default' }]
    })
    expect(view.activity).toContain('查看 Execution 诊断')
  })

  it('single_select实时payload恢复动态字段和候选项', () => {
    const interaction = normalizeInteraction({
      id: 'interaction-1',
      payload: {
        ui_kind: 'single_select',
        candidates: [
          { value: 'stop', label: '停止原 Workflow' },
          { value: 'wait', label: '继续等待' }
        ],
        data: {
          fields: [
            {
              name: 'confirm_resubmit',
              label: '处理方式',
              options: [
                { value: 'stop', label: '停止原 Workflow' },
                { value: 'wait', label: '继续等待' }
              ]
            }
          ]
        },
        response_schema: {
          type: 'object',
          required: ['confirm_resubmit'],
          properties: { confirm_resubmit: { type: 'string' } },
          additionalProperties: false
        }
      }
    })
    expect(interaction.options).toHaveLength(2)
    expect(interaction.schema.required).toEqual(['confirm_resubmit'])
  })
})
