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

// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { processHierarchy, selectedProcess, finalStageEvidence } from '@/studio/executionProcess'
import { recordLevel, executionLogRows, groupLogRows, isKeyLog } from '@/robot/executionRecords'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { useProjectStore } from '@/stores/project'
import { useWorkflowStore } from '@/stores/workflow'
import { useRobotStore } from '@/stores/robot'
import { useLayoutStore } from '@/stores/layout'
import { createExecutionEvidence } from '@/studio/executionEvidence'

beforeEach(() => setActivePinia(createPinia()))
const execution = {
  id: 'e1',
  task_id: 't1',
  subtask_id: 's1',
  workflow_id: 'wf',
  project_id: 'p',
  status: 'completed',
  stage: 'finish',
  stages: [
    { name: 'start', status: 'completed' },
    { name: 'finish', status: 'completed' }
  ]
}
const view = {
  workflow: { id: 'wf', status: 'completed', project_id: 'p' },
  tasks: [
    {
      id: 't1',
      status: 'completed',
      subtasks: [{ id: 's1', status: 'completed', execution_ref: 'e1' }]
    }
  ]
}

describe('Studio Task → SubTask → 横向 Stage', () => {
  it('只按明确父子引用关联，不把所有 Execution/Run 平铺成 Task', () => {
    const tasks = processHierarchy(view, [
      execution,
      { ...execution, id: 'unlinked', task_id: 'other-task' }
    ])
    expect(tasks[0].subtasks[0].executions.map((item) => item.id)).toEqual(['e1'])
    expect(tasks[1]).toMatchObject({ title: '未关联 SubTask 的执行', unassociated: true })
    expect(tasks[1].subtasks[0].executions[0].id).toBe('unlinked')
    // A single-Execution view may still belong to a Workflow; missing the parent
    // view does not make the request independent.
    expect(processHierarchy(null, [execution])[0].title).toBe('所选执行')
    expect(execution.workflow_id).toBe('wf')
  })
  it('默认显示最近阶段；手动选择在新执行、终态和面板切换后保持', () => {
    const tasks = processHierarchy(view, [execution])
    expect(selectedProcess(tasks, null, 'workflow:wf').stage.name).toBe('finish')
    const focus = { scopeKey: 'workflow:wf', subtaskId: 's1', executionId: 'e1', stageId: 'start' }
    tasks[0].subtasks.push({
      id: 's2',
      status: 'running',
      executions: [{ ...execution, id: 'e2' }]
    })
    expect(selectedProcess(tasks, focus, 'workflow:wf').stage.name).toBe('start')
    expect(selectedProcess(tasks, null, 'workflow:wf').subtask.id).toBe('s2')
    expect(selectedProcess(tasks, focus, 'workflow:other').subtask.id).toBe('s2')
  })
  it('摘要先到时保留真实当前阶段名，不能冒充早期阶段详情', () => {
    const tasks = processHierarchy(view, [{ ...execution, stage: 'new-stage' }])
    expect(selectedProcess(tasks, null, 'workflow:wf').stage).toEqual({
      name: 'new-stage',
      label: 'new-stage',
      detailsPending: true
    })
  })
  it('最终证据不从其他阶段图片补造', () => {
    const value = {
      ...execution,
      stages: [{ name: 'start', evidence_refs: ['artifact://early'] }, { name: 'finish' }]
    }
    expect(finalStageEvidence(value).artifacts).toEqual([])
    value.stages[1].evidence_refs = ['artifact://final', 'artifact://final']
    expect(finalStageEvidence(value).artifacts.map((item) => item.id)).toEqual(['final'])
  })
  it('问题→阶段/日志保持Workflow历史范围，返回来源恢复焦点且不选择地图', () => {
    useProjectStore().currentProjectId = 'p'
    useWorkflowStore().views.wf = view
    useRobotStore().upsert(execution)
    const scope = useExecutionScopeStore()
    scope.inspectWorkflow('wf')
    scope.focusProcess({ scopeKey: 'workflow:wf', subtaskId: 's1', stageId: 'start' })
    const layout = useLayoutStore()
    layout.selectedResource = { resourceType: 'scene', resourceId: 'scene-main' }
    const effects = effectScope()
    const evidence = effects.run(createExecutionEvidence)
    evidence.locateRecord({ id: 'e1:9', executionId: 'e1', stage: 'finish' }, 'problems')
    expect(scope).toMatchObject({ mode: 'history', workflowId: 'wf', executionId: '' })
    expect(evidence.process.value.stage.name).toBe('finish')
    expect(layout.selectedResource).toEqual({ resourceType: 'scene', resourceId: 'scene-main' })
    evidence.returnToSource()
    expect(layout.shell.bottomTab).toBe('problems')
    expect(evidence.process.value.stage.name).toBe('start')
    effects.stop()
  })
})

describe('语义日志和真实问题', () => {
  it('正常承载稳定/空error对象/取消/恢复阶段不能成为红色问题', () => {
    for (const phase of ['load_stable', 'running', 'recovering', 'interrupted', 'cancelled'])
      expect(
        recordLevel({
          type: 'feedback.emitted',
          payload: { feedback: { phase, error: {}, message: '双侧承载稳定' } }
        })
      ).toBe('info')
    expect(
      recordLevel({
        type: 'observation.recorded',
        payload: { observation: { kind: 'grasp.failure_recovery', value: { stable: true } } }
      })
    ).toBe('info')
    expect(
      recordLevel({
        type: 'feedback.emitted',
        payload: { feedback: { phase: 'running', level: 'warning', message: '承载异常' } }
      })
    ).toBe('warning')
    expect(recordLevel({ type: 'stage.failed', payload: {} })).toBe('error')
  })
  it('默认关键日志收起纯running/start反馈，保留阶段和动作输入输出', () => {
    const events = [
      {
        sequence: 1,
        type: 'feedback.emitted',
        payload: { stage: 'carry', feedback: { phase: 'running', message: 'running' } }
      },
      {
        sequence: 2,
        type: 'action.completed',
        payload: {
          stage: 'carry',
          action_type: 'Move',
          input: { target: 'slot' },
          result: { arrived: true }
        }
      }
    ]
    const logs = executionLogRows(execution, events)
    expect(logs.filter(isKeyLog)).toHaveLength(1)
    expect(logs[1]).toMatchObject({ stage: 'carry', action: 'Move' })
    expect(logs[1].input).toContain('slot')
    expect(logs[1].output).toContain('arrived')
  })
  it('重复记录合并展示而完整原文与原始定位ID不丢失', () => {
    const logs = executionLogRows(
      execution,
      [1, 2, 3].map((sequence) => ({
        sequence,
        type: 'feedback.emitted',
        payload: { stage: 'carry', feedback: { level: 'warning', message: '接近障碍' } }
      }))
    )
    const grouped = groupLogRows(logs)
    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({ count: 3, ids: ['e1:1', 'e1:2', 'e1:3'] })
    expect(grouped[0].originals.map((item) => item.sequence)).toEqual([1, 2, 3])
  })
})
