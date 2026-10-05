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
import { currentProjectWork, projectWorkProgress } from '@/studio/currentWork'

describe('当前工作摘要', () => {
  it('停止或失败的 Skill 不被同一 Agent 请求的完成状态覆盖', () => {
    for (const status of ['stopped', 'failed', 'completed']) {
      const work = currentProjectWork({
        projectId: 'p1',
        runs: [{ id: 'request', robot_id: 'r1', status: 'completed' }],
        executions: [{ id: 'actual', robot_id: 'r1', run_id: 'request', status }]
      })
      expect(work.current).toBeNull()
      expect(work.recent).toMatchObject({ kind: 'execution', value: { id: 'actual', status } })
    }
  })
  it('新的失败请求不会遮蔽尚未确认停止的物理执行', () => {
    const work = currentProjectWork({
      projectId: 'p1',
      devices: [{ robot_id: 'r1', current_execution_id: 'original' }],
      executions: [
        {
          id: 'original',
          robot_id: 'r1',
          run_id: 'old-run',
          status: 'interrupted',
          created_at: '2026-09-11T02:50:00Z'
        },
        {
          id: 'rejected',
          robot_id: 'r1',
          run_id: 'new-run',
          status: 'failed',
          created_at: '2026-09-11T02:55:00Z'
        }
      ],
      runs: [
        { id: 'old-run', robot_id: 'r1', status: 'completed' },
        { id: 'new-run', robot_id: 'r1', status: 'failed' }
      ]
    })
    expect(work.current).toMatchObject({ kind: 'execution', value: { id: 'original' } })
    expect(work.items).toHaveLength(1)
  })

  it('旧场景的 interrupted 历史不恢复为当前执行', () => {
    const work = currentProjectWork({
      projectId: 'p1',
      devices: [{ robot_id: 'r1', current_execution_id: '' }],
      executions: [{ id: 'historical', robot_id: 'r1', status: 'interrupted' }]
    })
    expect(work.current).toBeNull()
  })

  it('新对话生成期间仍优先显示原来的独立物理执行', () => {
    const work = currentProjectWork({
      projectId: 'p1',
      executions: [{ id: 'original', robot_id: 'r1', run_id: 'old-run', status: 'running' }],
      runs: [
        { id: 'old-run', robot_id: 'r1', status: 'completed' },
        { id: 'new-run', robot_id: 'r1', status: 'running' }
      ]
    })
    expect(work.current).toMatchObject({ kind: 'execution', value: { id: 'original' } })
    expect(work.items).toHaveLength(2)
  })
  it('当前工作独立于会话选择，Task Run 与关联 Execution 不重复计数', () => {
    const work = currentProjectWork({
      projectId: 'p1',
      conversationId: 'c1',
      workflows: [
        { id: 'wf-other', status: 'running', conversation_id: 'c2' },
        { id: 'wf1', status: 'paused', conversation_id: 'c1' }
      ],
      executions: [
        { id: 'rex1', workflow_id: 'wf1', status: 'running' },
        { id: 'debug1', status: 'running', project_id: 'p1' }
      ],
      runs: [
        { id: 'planning', kind: 'task_planning', status: 'running' },
        { id: 'chat', kind: 'conversation', status: 'running' }
      ]
    })
    expect(work.current.value.id).toBe('wf-other')
    expect(work.items.map((item) => item.value.id)).toEqual(['wf-other', 'wf1', 'debug1', 'chat'])
  })
  it('设备卡与工作条使用同一活动工作规则，不丢失尚未加载 Workflow 的执行', () => {
    const work = currentProjectWork({
      projectId: 'p1',
      robotId: 'r1',
      workflows: [{ id: 'wf1', status: 'running' }],
      executions: [
        { id: 'rex1', robot_id: 'r1', workflow_id: 'wf1', status: 'running' },
        { id: 'rex2', robot_id: 'r2', status: 'running' },
        { id: 'rex3', robot_id: 'r1', workflow_id: 'unloaded', status: 'running' }
      ]
    })
    expect(work.items.map((item) => item.value.id)).toEqual(['wf1', 'rex3'])
  })
  it('历史与其他 Project 的活动不冒充当前执行', () => {
    const work = currentProjectWork({
      projectId: 'p1',
      workflows: [
        { id: 'wf1', status: 'completed' },
        { id: 'wf2', project_id: 'p2', status: 'running' }
      ],
      executions: [{ id: 'rex1', status: 'stopped' }],
      runs: []
    })
    expect(work.items).toEqual([])
    expect(work.current).toBeNull()
  })
  it('直接 Robot 请求跨模型等待保持占用，关联技能不重复计数且只读询问不占设备', () => {
    const request = {
      id: 'run-robot',
      project_id: 'p1',
      kind: 'conversation',
      status: 'running',
      robot_id: 'r1'
    }
    const args = {
      projectId: 'p1',
      robotId: 'r1',
      devices: [{ robot_id: 'r1', current_run: request }],
      runs: [{ id: 'query', kind: 'conversation', status: 'running' }]
    }
    const duringSkill = currentProjectWork({
      ...args,
      executions: [{ id: 'rex1', robot_id: 'r1', status: 'running', run_id: request.id }]
    })
    expect(duringSkill.items).toEqual([{ kind: 'run', value: request }])
    expect(currentProjectWork(args).current.value.id).toBe(request.id)
    expect(
      currentProjectWork({ ...args, runs: [{ ...request, status: 'completed' }] }).current
    ).toBeNull()
  })
  it('真实 Task Run / Execution 和 Leader 收尾只归属一个 Workflow，独立查询仍单列', () => {
    const workflow = { id: 'wf1', project_id: 'p1', status: 'running' }
    const runs = [
      { id: 'plan', kind: 'task_planning', workflow_id: 'wf1', status: 'running' },
      { id: 'task', kind: 'task_execution', workflow_id: 'wf1', status: 'running' },
      { id: 'summary', kind: 'conversation', workflow_id: 'wf1', status: 'running' },
      { id: 'query', kind: 'conversation', agent_id: 'robot:r1', status: 'running' }
    ]
    const executions = [{ id: 'rex', workflow_id: 'wf1', run_id: 'task', status: 'running' }]
    expect(
      currentProjectWork({ projectId: 'p1', workflows: [workflow], runs, executions }).items.map(
        (item) => item.value.id
      )
    ).toEqual(['wf1', 'query'])
    const ended = currentProjectWork({
      projectId: 'p1',
      workflows: [{ ...workflow, status: 'completed' }],
      runs: runs.filter((run) => run.id !== 'query'),
      executions: [{ ...executions[0], status: 'completed' }]
    })
    expect(ended.current).toBeNull()
    expect(ended.recent.value.id).toBe('wf1')
  })
  it('Task ID / Execution Run ID 的已有归属也用于去重，旧收尾 Context 不占当前', () => {
    const work = currentProjectWork({
      projectId: 'p1',
      workflows: [{ id: 'wf', status: 'running', tasks: [{ id: 'task' }] }],
      runs: [
        { id: 'child', task_id: 'task', status: 'running' },
        { id: 'task-run', kind: 'task_execution', workflow_id: 'wf', status: 'running' },
        { id: 'summary', context_id: 'workflow-summary:wf', status: 'running' }
      ],
      executions: [
        { id: 'task-execution', task_id: 'task', status: 'running' },
        { id: 'run-execution', run_id: 'task-run', status: 'running' }
      ]
    })
    expect(work.items.map((item) => item.value.id)).toEqual(['wf'])
  })
  it('最近业务结果按开始时间选取，迟到的旧结果和普通聊天不抢走它', () => {
    const work = currentProjectWork({
      projectId: 'p1',
      workflows: [
        {
          id: 'old',
          status: 'failed',
          started_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-09T00:00:00Z'
        },
        { id: 'latest', status: 'completed', started_at: '2026-09-02T00:00:00Z' }
      ],
      runs: [
        {
          id: 'question',
          kind: 'conversation',
          status: 'completed',
          started_at: '2026-09-03T00:00:00Z'
        }
      ]
    })
    expect(work.current).toBeNull()
    expect(work.recent.value.id).toBe('latest')
    expect(
      currentProjectWork({
        projectId: 'p1',
        workflows: [work.recent.value],
        executions: [{ id: 'new-debug', status: 'stopped', started_at: '2026-09-04T00:00:00Z' }]
      }).recent.value.id
    ).toBe('new-debug')
  })
  it('历史/会话选择不改当前，新 Workflow 自动取代旧终态且设备不被终态占用', () => {
    const args = {
      projectId: 'p1',
      robotId: 'r1',
      workflows: [{ id: 'done', status: 'completed', tasks: [{ assigned_robot_id: 'r1' }] }]
    }
    expect(currentProjectWork(args).current).toBeNull()
    expect(currentProjectWork(args).recent.value.id).toBe('done')
    expect(
      currentProjectWork({
        ...args,
        conversationId: 'history-conversation',
        workflows: [
          ...args.workflows,
          { id: 'next', status: 'running', tasks: [{ assigned_robot_id: 'r1' }] }
        ]
      }).current.value.id
    ).toBe('next')
  })
  it('父级先结束不能隐藏仍报告运行中的 Execution 或把设备提前标为空闲', () => {
    const execution = { id: 'still-running', robot_id: 'r1', status: 'running' }
    for (const parent of ['run', 'workflow']) {
      const work = currentProjectWork({
        projectId: 'p1',
        robotId: 'r1',
        workflows: [{ id: 'wf', status: 'completed' }],
        runs: [{ id: 'run', kind: 'conversation', robot_id: 'r1', status: 'completed' }],
        executions: [{ ...execution, [`${parent}_id`]: parent === 'run' ? 'run' : 'wf' }]
      })
      expect(work.current.value.id).toBe('still-running')
    }
  })
})

describe('当前 Task / SubTask / Skill / Stage 摘要', () => {
  const item = { kind: 'workflow', value: { id: 'wf', status: 'running' } }
  const workflowViews = {
    wf: {
      tasks: [
        { id: 'task1', status: 'completed', subtasks: [] },
        {
          id: 'task2',
          status: 'running',
          subtasks: [
            { id: 'nav', status: 'completed' },
            {
              id: 'grasp',
              task_id: 'task2',
              status: 'running',
              goal: '抓取来源箱',
              spec: { skill_name: 'grasp-object' }
            },
            { id: 'place', status: 'pending' }
          ]
        },
        { id: 'task3', status: 'failed', subtasks: [] }
      ]
    },
    history: {
      tasks: [{ id: 'wrong', status: 'completed', subtasks: [{ id: 'old', status: 'running' }] }]
    }
  }
  it('按业务 ID 取真实 Task 计数和运行中子步骤，失败 Task 不计完成', () => {
    const progress = projectWorkProgress(item, {
      workflowViews,
      executions: [
        { id: 'old-ex', workflow_id: 'history', status: 'running', stage: 'wrong' },
        {
          id: 'rex',
          workflow_id: 'wf',
          subtask_id: 'grasp',
          status: 'running',
          skill_name: 'grasp-object',
          stage: 'prepare_transport'
        }
      ]
    })
    expect(progress).toMatchObject({
      taskTotal: 3,
      taskCompleted: 1,
      subtaskPosition: 2,
      subtaskTotal: 3,
      skill: 'grasp-object',
      stage: 'prepare_transport',
      parallelExecutions: 1
    })
    expect(progress.subtask.id).toBe('grasp')
  })
  it('子步骤已开始但技能尚未发起时，不沿用上一 Execution 的 Stage', () => {
    expect(
      projectWorkProgress(item, {
        workflowViews,
        executions: [
          {
            id: 'previous',
            workflow_id: 'wf',
            status: 'completed',
            stage: 'verify_arrival',
            skill_name: 'semantic-navigation'
          }
        ]
      })
    ).toMatchObject({ skill: 'grasp-object', stage: '', subtaskPosition: 2 })
  })
  it('缺失 view 不伪造 0/0，结束 Workflow 不展示滞后的活动子步骤', () => {
    expect(projectWorkProgress(item)).toMatchObject({
      taskTotal: null,
      taskCompleted: null,
      stage: ''
    })
    expect(
      projectWorkProgress(
        { ...item, value: { ...item.value, status: 'completed' } },
        {
          workflowViews,
          executions: [{ id: 'stale', workflow_id: 'wf', status: 'running', stage: 'navigate' }]
        }
      )
    ).toMatchObject({ taskTotal: 3, taskCompleted: 1, stage: '', skill: '' })
  })
  it('直接 Robot 请求也读取所属技能的真实 Stage，不混入另一请求', () => {
    expect(
      projectWorkProgress(
        { kind: 'run', value: { id: 'run1', status: 'running' } },
        {
          executions: [
            { id: 'rex2', run_id: 'run2', status: 'running', skill_name: 'wrong', stage: 'wrong' },
            {
              id: 'rex1',
              run_id: 'run1',
              status: 'running',
              skill_name: 'semantic-navigation',
              stage: 'navigate'
            }
          ]
        }
      )
    ).toMatchObject({ taskTotal: null, skill: 'semantic-navigation', stage: 'navigate' })
  })
})
