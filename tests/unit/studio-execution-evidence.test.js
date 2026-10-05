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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
vi.mock('@/api/devices', () => ({ getRobotExecution: vi.fn() }))
vi.mock('@/api/chat', () => ({ getArtifact: vi.fn() }))
vi.mock('@/api/runs', () => ({ getRun: vi.fn() }))
vi.mock('@/api/traces', () => ({ getSpans: vi.fn() }))
import { getRobotExecution } from '@/api/devices'
import { getArtifact } from '@/api/chat'
import { getRun } from '@/api/runs'
import { getSpans } from '@/api/traces'
import { useRobotStore } from '@/stores/robot'
import { useProjectStore } from '@/stores/project'
import { useConversationStore } from '@/stores/conversation'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { useRunsStore } from '@/stores/runs'
import { useWorkflowStore } from '@/stores/workflow'
import { createExecutionEvidence } from '@/studio/executionEvidence'
import { buildRobotStageView, currentExecutionStage } from '@/robot/executionViewAdapter'
import { executionProblems } from '@/robot/executionRecords'
import { createExecutionExport } from '@/robot/exportExecution'

const execution = {
  id: 'rex-1',
  project_id: 'p1',
  robot_id: 'robot-1',
  status: 'running',
  revision: 1
}
const event = (sequence, overrides = {}) => ({
  execution_id: 'rex-1',
  sequence,
  type: 'feedback.emitted',
  payload: {
    stage: 'move',
    action_id: 'action-1',
    feedback: { sequence, phase: 'running', message: `移动 ${sequence}` }
  },
  ...overrides
})
let scope
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  scope = effectScope()
  useProjectStore().currentProjectId = 'p1'
})
afterEach(() => scope.stop())

describe('Studio 运行证据', () => {
  it('周期阶段反馈保留进入时间并恢复历史阶段顺序', () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [{...execution, stages: [{id:'execute_policy', name:'execute_policy', started_at:'2026-09-10T12:02:00Z'}]}])
    const stage = (sequence, name, at, summary) => ({execution_id:'rex-1', sequence, type:'stage.running', created_at:at, payload:{stage:name,summary}})
    robots.appendExecutionEvent('rex-1', stage(1,'validate_target','2026-09-10T12:00:00Z','确认目标'))
    robots.appendExecutionEvent('rex-1', stage(2,'prepare','2026-09-10T12:00:01Z','准备'))
    robots.appendExecutionEvent('rex-1', stage(3,'execute_policy','2026-09-10T12:00:02Z','开始执行'))
    robots.appendExecutionEvent('rex-1', stage(4,'execute_policy','2026-09-10T12:03:00Z','已执行 10 个动作 · 等待模型输出'))
    const stages = robots.byId('rex-1').stages
    expect(stages.map(s=>s.name)).toEqual(['validate_target','prepare','execute_policy'])
    expect(stages[2].started_at).toBe('2026-09-10T12:00:02Z')
    expect(stages[2].observation).toContain('已执行 10 个动作')
  })
  it('同 Stage 的 Pilot / Server 引用去重，后续判断引用不改变 sensor.frame 拍摄归属', () => {
    const local = 'pilot-artifact://pilot-1/local-rgb'
    const formal = 'artifact://rgb-server'
    const value = {
      ...execution,
      artifact_sync: [
        {
          execution_id: execution.id,
          pilot_instance_id: 'pilot-1',
          local_artifact_id: 'local-rgb',
          server_artifact_id: 'rgb-server',
          status: 'synced',
          media_type: 'image/jpeg'
        }
      ],
      observations: [
        { stage: 'grasp', kind: 'sensor.frame', artifact_refs: [local, formal, formal] },
        { stage: 'grasp', artifact_refs: [local] },
        { stage: 'lift', artifact_refs: [formal] }
      ]
    }
    const view = buildRobotStageView(value, {
      name: 'grasp',
      evidence_refs: [local, local, formal]
    })
    expect(view.artifacts.map((item) => item.id)).toEqual(['rgb-server'])
    const later = buildRobotStageView(value, { name: 'lift', evidence_refs: [local, formal] })
    expect(later.artifacts).toEqual([])
    expect(later.evidence).toEqual([local, formal])
  })

  it('摘要已进入最新阶段但事件尚未补齐，不用旧 label / status 冒充当前阶段', () => {
    const value = {
      ...execution,
      status: 'completed',
      stage: 'verify_arrival',
      stages: [
        {
          name: 'validate_target',
          label: '正在执行语义导航阶段：validate_target',
          status: 'running'
        }
      ]
    }
    expect(currentExecutionStage(value)).toBeNull()
    value.stages.push({ name: 'verify_arrival', label: '验证到达', status: 'completed' })
    expect(currentExecutionStage(value)).toBe(value.stages[1])
    expect(currentExecutionStage(value)).toMatchObject({
      name: 'verify_arrival',
      label: '验证到达'
    })
  })

  it('Device 摘要的全局游标不污染 Execution 游标，Project 内层阶段事件仍连续接收', () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [{ ...execution, stage: 'approach', revision: 34 }])
    robots.appendExecutionEvent(
      'rex-1',
      event(33, {
        type: 'stage.running',
        payload: { stage: 'approach', summary: '正在执行放置阶段：approach' }
      })
    )
    robots.applyEvent({
      resource_type: 'robot_execution',
      resource_id: 'rex-1',
      type: 'stage.running',
      sequence: 1245,
      resource_revision: 77,
      payload: { execution: { ...execution, stage: 'release', revision: 77 } }
    })
    expect(robots.eventSequenceFor('rex-1')).toBe(33)
    robots.applyEvent({
      resource_type: 'robot_execution',
      resource_id: 'rex-1',
      type: 'stage.running',
      sequence: 2000,
      resource_revision: 77,
      payload: {
        execution: { ...execution, stage: 'release', revision: 77 },
        event: event(76, {
          type: 'stage.running',
          payload: { stage: 'release', summary: '正在执行放置阶段：release' }
        })
      }
    })
    expect(robots.eventSequenceFor('rex-1')).toBe(76)
    expect(robots.byId('rex-1').stages.at(-1)).toMatchObject({
      name: 'release',
      label: '正在执行放置阶段：release'
    })
    expect(robots.eventsFor('rex-1').map((item) => item.sequence)).toEqual([33, 76])
  })

  it('分页重建旧 Stage 不覆盖 Execution 摘要的准确最后阶段', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [execution])
    getRobotExecution.mockResolvedValue({
      execution: {
        ...execution,
        status: 'completed',
        stage: 'restore_travel_posture',
        revision: 700
      },
      events: [
        event(1, { type: 'stage.running', payload: { stage: 'approach', summary: '接近目标' } })
      ],
      has_more: true,
      next_sequence: 1
    })
    await robots.loadDetail('rex-1', { allPages: false })
    expect(robots.byId('rex-1').stage).toBe('restore_travel_posture')
    expect(robots.eventPages['rex-1'].hasMore).toBe(true)
  })

  it('较新 Device 终态摘要不被迟到的 Project 旧阶段倒退，仍可补全历史', () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [
      { ...execution, status: 'completed', stage: 'restore_travel_posture', revision: 252 }
    ])
    robots.applyEvent({
      sequence: 2000,
      resource_type: 'robot_execution',
      resource_id: 'rex-1',
      type: 'stage.running',
      resource_revision: 77,
      payload: {
        execution: { ...execution, stage: 'release', revision: 77 },
        event: event(76, {
          type: 'stage.running',
          payload: { stage: 'release', summary: '释放阶段' }
        })
      }
    })
    expect(robots.byId('rex-1')).toMatchObject({
      status: 'completed',
      stage: 'restore_travel_posture',
      revision: 252
    })
    expect(robots.byId('rex-1').stages[0]).toMatchObject({ name: 'release', label: '释放阶段' })
    expect(robots.eventSequenceFor('rex-1')).toBe(76)
  })

  it('旧详情响应晚于新实时阶段到达时，回放保留合并后最新摘要而非 HTTP 旧 Stage', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [{ ...execution, stage: 'approach', revision: 34 }])
    let finishDetail
    getRobotExecution.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDetail = resolve
        })
    )
    const loading = robots.loadDetail('rex-1', { allPages: false })
    robots.applyEvent({
      resource_type: 'robot_execution',
      resource_id: 'rex-1',
      type: 'stage.running',
      sequence: 3000,
      resource_revision: 221,
      payload: {
        execution: { ...execution, stage: 'restore_travel_posture', revision: 221 },
        event: event(220, {
          type: 'stage.running',
          payload: { stage: 'restore_travel_posture', summary: '恢复行走姿态' }
        })
      }
    })
    finishDetail({
      execution: { ...execution, stage: 'release', revision: 77 },
      events: [
        event(76, { type: 'stage.running', payload: { stage: 'release', summary: '释放阶段' } })
      ],
      has_more: false,
      next_sequence: 76
    })
    await loading
    expect(robots.byId('rex-1')).toMatchObject({ stage: 'restore_travel_posture', revision: 221 })
    expect(currentExecutionStage(robots.byId('rex-1')).label).toBe('恢复行走姿态')
    expect(robots.eventsFor('rex-1').map((item) => item.sequence)).toEqual([76, 220])
    expect(robots.eventSequenceFor('rex-1')).toBe(220)
  })

  it('六百次反馈原位更新，保留阶段、终态与完整分页原文', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [execution])
    const events = [
      event(1, {
        type: 'stage.started',
        payload: { stage: 'move', summary: '移动目标', expectation: '到达目标' }
      }),
      ...Array.from({ length: 600 }, (_, index) => event(index + 2)),
      event(602, {
        type: 'stage.failed',
        payload: { stage: 'move', error: { message: '原始失败' } }
      })
    ]
    getRobotExecution.mockImplementation(async (id, after) => ({
      execution,
      events: events.filter((item) => item.sequence > after).slice(0, 500),
      has_more: after === 0,
      next_sequence: after === 0 ? 500 : 602
    }))
    await robots.loadDetail('rex-1', { allPages: false })
    expect(robots.eventsFor('rex-1')).toHaveLength(500)
    expect(robots.eventPages['rex-1'].hasMore).toBe(true)
    await robots.loadMoreEvents('rex-1')
    expect(getRobotExecution).toHaveBeenLastCalledWith('rex-1', 500)
    expect(robots.eventsFor('rex-1')).toHaveLength(602)
    expect(robots.byId('rex-1').feedback).toHaveLength(1)
    expect(robots.byId('rex-1').feedback[0]).toMatchObject({
      message: '移动 601',
      repeat_count: 600
    })
    expect(robots.byId('rex-1').stages[0]).toMatchObject({
      status: 'failed',
      expectation: '到达目标'
    })
    expect(
      executionProblems(robots.executions, robots.eventsFor)[0].details.payload.error.message
    ).toBe('原始失败')
  })

  it('重复告警按位置归并次数，原始告警不会丢失', () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [execution])
    for (let sequence = 1; sequence <= 3; sequence++)
      robots.appendExecutionEvent(
        'rex-1',
        event(sequence, {
          payload: {
            stage: 'move',
            feedback: { sequence, phase: 'warning', level: 'warning', message: '接近障碍' }
          }
        })
      )
    expect(robots.byId('rex-1').feedback).toHaveLength(1)
    expect(robots.byId('rex-1').feedback[0].repeat_count).toBe(3)
    expect(executionProblems(robots.executions, robots.eventsFor)[0].count).toBe(3)
    expect(robots.eventsFor('rex-1')).toHaveLength(3)
  })

  it('后续页失败仍保留首批记录，重试从失败页的游标继续', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [execution])
    getRobotExecution
      .mockResolvedValueOnce({ execution, events: [event(1)], has_more: true, next_sequence: 1 })
      .mockRejectedValueOnce(new Error('读取超时'))
    await robots.loadDetail('rex-1')
    expect(robots.eventsFor('rex-1')).toHaveLength(1)
    expect(robots.eventPages['rex-1']).toMatchObject({
      cursor: 1,
      hasMore: true,
      error: '读取超时'
    })
    getRobotExecution.mockResolvedValueOnce({
      execution,
      events: [event(2)],
      has_more: false,
      next_sequence: 2
    })
    await robots.loadMoreEvents('rex-1')
    expect(robots.eventsFor('rex-1')).toHaveLength(2)
  })

  it('历史固定后切换聊天、推进新执行均不改变底部范围', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [{ ...execution, id: 'old', status: 'completed' }, execution])
    const selected = useExecutionScopeStore()
    selected.inspectExecution('old')
    const evidence = scope.run(createExecutionEvidence)
    expect(evidence.executions.value.map((item) => item.id)).toEqual(['old'])
    useConversationStore().currentId = 'different-conversation'
    robots.upsert({ ...execution, id: 'new', revision: 2 })
    await nextTick()
    expect(evidence.selection.value.id).toBe('old')
    expect(evidence.executions.value.map((item) => item.id)).toEqual(['old'])
    selected.followCurrent()
    expect(evidence.executions.value[0].id).toBe('new')
  })

  it('本次结束后仍保留结果，过期详情不会复活运行或跨项目写入', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [execution])
    const evidence = scope.run(createExecutionEvidence)
    expect(evidence.selection.value.id).toBe('rex-1')
    robots.upsert({ ...execution, status: 'completed', revision: 3 })
    robots.upsert({ ...execution, revision: 2 })
    expect(robots.byId('rex-1').status).toBe('completed')
    expect(evidence.selection.value.id).toBe('rex-1')
    let resolve
    getRobotExecution.mockReturnValue(
      new Promise((value) => {
        resolve = value
      })
    )
    const pending = robots.loadDetail('rex-1')
    robots.hydrate('p2', [{ ...execution, id: 'other-project', project_id: 'p2' }])
    resolve({ execution, events: [event(1)] })
    await pending
    expect(robots.byId('rex-1')).toBeNull()
    expect(robots.eventsFor('rex-1')).toEqual([])
  })

  it('Workflow 完成与 Leader 收尾仍展示四步结果，新业务接管但手动历史不变', () => {
    const workflows = useWorkflowStore()
    const runs = useRunsStore()
    const selected = useExecutionScopeStore()
    const workflow = {
      id: 'wf-1',
      project_id: 'p1',
      status: 'running',
      updated_at: '2026-09-07T10:00:00Z'
    }
    const view = {
      workflow,
      tasks: [{ id: 'task-1', status: 'running' }],
      subtasks: Array.from({ length: 4 }, (_, index) => ({
        id: `step-${index}`,
        task_id: 'task-1',
        status: 'completed'
      }))
    }
    workflows.hydrate('p1', { workflow_view: view })
    useRobotStore().hydrate(
      'p1',
      Array.from({ length: 4 }, (_, index) => ({
        ...execution,
        id: `rex-${index}`,
        workflow_id: 'wf-1',
        status: 'completed'
      }))
    )
    const evidence = scope.run(createExecutionEvidence)
    expect(evidence.selection.value).toMatchObject({ kind: 'workflow', id: 'wf-1' })
    workflows.applyView({
      ...view,
      workflow: { ...workflow, status: 'completed' },
      tasks: [{ id: 'task-1', status: 'completed' }]
    })
    runs.hydrate('p1', [
      {
        id: 'summary-1',
        project_id: 'p1',
        workflow_id: 'wf-1',
        context_id: 'workflow-summary:wf-1',
        kind: 'conversation',
        status: 'running'
      }
    ])
    expect(evidence.selection.value).toMatchObject({ kind: 'workflow', id: 'wf-1' })
    expect(evidence.workflowView.value.workflow.status).toBe('completed')
    expect(evidence.workflowView.value.tasks[0].subtasks).toHaveLength(4)
    expect(evidence.executions.value).toHaveLength(4)
    runs.upsert({ id: 'summary-1', status: 'completed', revision: 2 })
    expect(evidence.selection.value.id).toBe('wf-1')

    selected.inspectWorkflow('wf-1')
    workflows.upsertSummary({ ...workflow, id: 'wf-2', updated_at: '2026-09-07T11:00:00Z' })
    expect(evidence.selection.value.id).toBe('wf-1')
    expect(selected.mode).toBe('history')
    selected.followCurrent()
    expect(evidence.selection.value).toMatchObject({ kind: 'workflow', id: 'wf-2' })
    workflows.upsertSummary({
      ...workflow,
      id: 'wf-2',
      status: 'completed',
      updated_at: '2026-09-07T11:01:00Z'
    })
    runs.upsert({ id: 'summary-1', status: 'running', revision: 3 })
    expect(evidence.selection.value.id).toBe('wf-2')

    runs.upsert({
      id: 'independent-chat',
      project_id: 'p1',
      kind: 'conversation',
      status: 'running'
    })
    expect(evidence.selection.value).toMatchObject({ kind: 'run', id: 'independent-chat' })
    runs.upsert({ id: 'independent-chat', status: 'completed', revision: 2 })
    expect(evidence.selection.value.id).toBe('independent-chat')
    selected.inspectRun('summary-1')
    expect(evidence.selection.value).toMatchObject({ kind: 'run', id: 'summary-1' })
    expect(selected.mode).toBe('history')
  })

  it('重新打开底部可恢复已完成 Workflow，已被收尾 Run 抢走的当前选择按真实关联修正', () => {
    const workflows = useWorkflowStore()
    workflows.hydrate('p1', {
      workflows: [
        {
          id: 'completed-workflow',
          project_id: 'p1',
          status: 'completed',
          updated_at: '2026-09-07T10:00:00Z'
        }
      ]
    })
    useRunsStore().hydrate('p1', [
      {
        id: 'summary',
        project_id: 'p1',
        workflow_id: 'completed-workflow',
        context_id: 'workflow-summary:completed-workflow',
        kind: 'conversation',
        status: 'completed',
        started_at: '2026-09-07T10:00:01Z'
      }
    ])
    const evidence = scope.run(createExecutionEvidence)
    expect(evidence.selection.value).toMatchObject({ kind: 'workflow', id: 'completed-workflow' })
    useExecutionScopeStore().currentSelection = { kind: 'run', id: 'summary', projectId: 'p1' }
    expect(evidence.selection.value).toMatchObject({ kind: 'workflow', id: 'completed-workflow' })
    expect(useExecutionScopeStore().currentSelection).toMatchObject({
      kind: 'workflow',
      id: 'completed-workflow'
    })
    expect(workflows.items[0].status).toBe('completed')
  })

  it('迟到分页与实时消息按sequence合并，游标不跳过持久记录', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [execution])
    let resolve
    getRobotExecution.mockReturnValue(
      new Promise((value) => {
        resolve = value
      })
    )
    const pending = robots.loadDetail('rex-1', { allPages: false })
    robots.appendExecutionEvent('rex-1', event(4))
    resolve({ execution, events: [event(1), event(2)], has_more: true, next_sequence: 2 })
    await pending
    expect(robots.eventsFor('rex-1').map((item) => item.sequence)).toEqual([1, 2, 4])
    expect(robots.eventPages['rex-1'].cursor).toBe(2)
    getRobotExecution.mockResolvedValue({
      execution,
      events: [event(3), event(4)],
      has_more: false,
      next_sequence: 4
    })
    await robots.loadMoreEvents('rex-1')
    expect(robots.eventsFor('rex-1').map((item) => item.sequence)).toEqual([1, 2, 3, 4])
    expect(robots.byId('rex-1').feedback[0].message).toBe('移动 4')
  })

  it('阶段图片只通过该阶段观测或动作关联，并标明实际采集时刻', () => {
    const view = buildRobotStageView(
      {
        observations: [
          {
            id: 'obs-1',
            stage: 'grasp',
            occurred_at: '2026-09-07T01:00:00Z',
            artifact_refs: ['artifact://rgb-1']
          }
        ],
        artifact_sync: [
          {
            server_artifact_id: 'rgb-1',
            status: 'synced',
            media_type: 'image/png',
            size_bytes: 10
          },
          {
            server_artifact_id: 'other-stage',
            stage: 'place',
            status: 'synced',
            media_type: 'image/png'
          }
        ]
      },
      { name: 'grasp' }
    )
    expect(view.artifacts).toHaveLength(1)
    expect(view.artifacts[0]).toMatchObject({
      id: 'rgb-1',
      captured_at: '2026-09-07T01:00:00Z',
      stage: 'grasp',
      size: 10
    })
  })

  it('Pilot 图片只按同执行的真实同步映射关联到观测阶段，迟到证据不复活已完成阶段', () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [
      { ...execution, stages: [{ id: 'place', name: 'place', status: 'completed' }] }
    ])
    robots.appendExecutionEvent(
      'rex-1',
      event(1, {
        type: 'observation.recorded',
        payload: {
          stage: 'place',
          observation: {
            id: 'rgb',
            observed_at: '2026-09-07T10:00:00Z',
            evidence_refs: ['pilot-artifact://pilot-1/local-rgb']
          }
        }
      })
    )
    robots.appendExecutionEvent(
      'rex-1',
      event(2, {
        type: 'stage.evidence',
        payload: { stage: 'place', evidence_refs: ['pilot-artifact://pilot-1/local-rgb'] }
      })
    )
    robots.appendExecutionEvent(
      'rex-1',
      event(3, {
        type: 'stage.evidence_unavailable',
        payload: { stage: 'place', message: '另一采样不可用' }
      })
    )
    expect(robots.byId('rex-1').stages[0].status).toBe('completed')
    const sync = {
      pilot_instance_id: 'pilot-1',
      local_artifact_id: 'local-rgb',
      server_artifact_id: 'rgb-server',
      execution_id: 'rex-1',
      media_type: 'image/jpeg',
      status: 'synced'
    }
    robots.upsert({
      ...execution,
      revision: 2,
      artifact_sync: [
        { ...sync, server_artifact_id: 'wrong-pilot', pilot_instance_id: 'pilot-2' },
        { ...sync, server_artifact_id: 'wrong-execution', execution_id: 'rex-other' },
        { ...sync, status: 'uploading' }
      ]
    })
    const stage = robots.byId('rex-1').stages[0]
    expect(buildRobotStageView(robots.byId('rex-1'), stage).artifacts).toEqual([])
    robots.upsert({ ...execution, revision: 3, artifact_sync: [sync] })
    expect(buildRobotStageView(robots.byId('rex-1'), stage).artifacts).toMatchObject([
      { id: 'rgb-server', stage: 'place', captured_at: '2026-09-07T10:00:00Z' }
    ])
    expect(
      buildRobotStageView(robots.byId('rex-1'), { name: 'different-stage' }).artifacts
    ).toEqual([])
  })

  it('通过Execution明确run_id补查Trace，不读取无关聊天Run', async () => {
    const robots = useRobotStore()
    robots.hydrate('p1', [{ ...execution, run_id: 'task-run' }])
    useRunsStore().hydrate('p1', [
      { id: 'other-chat', status: 'completed', project_id: 'p1', trace_id: 'other-trace' }
    ])
    useExecutionScopeStore().inspectExecution('rex-1')
    const evidence = scope.run(createExecutionEvidence)
    expect(evidence.runs.value.map((item) => item.id)).toEqual(['task-run'])
    getRun.mockResolvedValue({ run: { id: 'task-run', trace_id: 'task-trace' } })
    getSpans.mockResolvedValue({
      spans: [
        { id: 'span-1', kind: 'ChatModel', name: '模型调用', attrs: { error: 'deadline exceeded' } }
      ]
    })
    await robots.loadRunTrace(evidence.runs.value[0])
    expect(getSpans).toHaveBeenCalledWith('task-trace')
    expect(evidence.problems.value[0].details.attrs.error).toBe('deadline exceeded')
  })

  it('单文件导出包含真实证据本体、原始记录和读取失败说明', async () => {
    getArtifact.mockImplementation(async (id) => {
      if (id === 'missing') throw new Error('同步文件不存在')
      return new Blob(['real-image-bytes'], { type: 'image/png' })
    })
    const result = await createExecutionExport(
      { scope: { id: 'rex-1' }, events: { 'rex-1': [event(1)] }, missing: ['trace未读取'] },
      [{ id: 'image', media_type: 'image/png', stage: 'grasp' }, { id: 'missing' }]
    )
    expect(result.manifest.artifacts.map((item) => item.included)).toEqual([true, false])
    expect(result.manifest.missing).toEqual(['trace未读取', 'Artifact missing：同步文件不存在'])
    const html = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsText(result.blob)
    })
    expect(html).toContain('data:image/png;base64,cmVhbC1pbWFnZS1ieXRlcw==')
    expect(html).toContain('移动 1')
    expect(html).toContain('rex-1')
  })
})
