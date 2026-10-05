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

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/workflows', () => ({
  listWorkflows: vi.fn(),
  getActivePlanProposal: vi.fn(),
  getPlanProposal: vi.fn(),
  approvePlanProposal: vi.fn(),
  discardPlanProposal: vi.fn(),
  getWorkflowView: vi.fn(),
  updateWorkflow: vi.fn(),
  pauseWorkflow: vi.fn(),
  resumeWorkflow: vi.fn(),
  retryRobotDecision: vi.fn(),
  stopWorkflow: vi.fn(),
  confirmWorkflowStop: vi.fn()
}))

vi.mock('@/api/semanticMaps', () => ({
  MAP_IDS: ['simulation_map', 'real_map'],
  getMapSnapshot: vi.fn(),
  queryMap: vi.fn(),
  createMapGeneration: vi.fn(),
  updateMap: vi.fn()
}))

import * as workflowsApi from '@/api/workflows'
import * as mapsApi from '@/api/semanticMaps'
import { useWorkflowStore, workflowStopMode } from '@/stores/workflow'
import { useSemanticMapStore } from '@/stores/semanticMap'
import {
  structuredFieldFromEditor,
  structuredFieldItems,
  structuredFieldToEditor
} from '@/studio/structuredFields'

const workflowView = (revision = 2) => ({
  workflow: {
    id: 'workflow-1',
    project_id: 'project-1',
    status: 'pending',
    reason: 'awaiting_confirmation',
    revision,
    confirmed_revision: 0
  },
  tasks: [
    { id: 'task-a', position: 1, status: 'completed' },
    { id: 'task-b', position: 2, status: 'pending' }
  ],
  subtasks: [
    { id: 'subtask-a', task_id: 'task-a', position: 1, status: 'completed' },
    { id: 'subtask-b', task_id: 'task-b', position: 1, status: 'pending' }
  ],
  dependencies: [{ task_id: 'task-b', depends_on_task_id: 'task-a' }]
})

const planProposal = (revision = 2, status = 'ready') => ({
  id: 'proposal-1',
  project_id: 'project-1',
  conversation_id: 'conversation-1',
  revision,
  status,
  goal: '分析工作区并交付报告',
  approved_scope: { constraints: ['只读输入'] },
  structured_plan: {
    completion_criteria: ['自动测试通过'],
    tasks: [
      {
        id: 'task-a',
        goal: '准备输入数据',
        required_role: 'map',
        required_capabilities: ['map.read']
      },
      {
        id: 'task-b',
        goal: '实现数据分析',
        required_role: 'developer'
      }
    ],
    dependencies: [{ task_id: 'task-b', depends_on_task_id: 'task-a' }]
  },
  document_markdown: '# 分析计划\n\n- 准备输入数据\n- 实现数据分析'
})

const mapSnapshot = (mapId, generation = 1, revision = 1) => ({
  map_id: mapId,
  generation,
  revision,
  entities: [
    {
      id: mapId + '-entity',
      type: 'box',
      status: 'active',
      generation,
      pose: { position: { x: 0, y: 0, z: 0 } }
    }
  ],
  relations: []
})

describe('v0.3 Workflow 与 Semantic Map Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('Snapshot 恢复 Workflow、Task、SubTask 和确定性 ready Task', () => {
    const store = useWorkflowStore()
    store.hydrate('project-1', {
      workflow_view: workflowView(),
      workflows: [
        workflowView().workflow,
        { id: 'another-workflow', status: 'running', project_id: 'project-1' }
      ]
    })

    expect(store.workflow.revision).toBe(2)
    expect(store.items.map((item) => item.id)).toContain('another-workflow')
    expect(store.taskById('task-b').subtasks[0].id).toBe('subtask-b')
    expect(store.readyTasks.map((item) => item.id)).toEqual(['task-b'])
  })

  it('历史 Proposal 按 ID 加载，操作不会误用另一个对话中的当前计划', async () => {
    const store = useWorkflowStore()
    const current = { ...planProposal(5), id: 'proposal-current' }
    const history = planProposal(2)
    store.hydrate('project-1', { plan_proposal: current })
    workflowsApi.getPlanProposal.mockResolvedValue(history)
    await store.loadProposal(history.id)
    expect(store.proposal.id).toBe(current.id)
    expect(store.proposalById(history.id).revision).toBe(2)

    workflowsApi.approvePlanProposal.mockResolvedValue(workflowView())
    await store.approveProposal(store.proposalById(history.id))
    expect(workflowsApi.approvePlanProposal).toHaveBeenCalledWith('project-1', history.id, 2)
    expect(store.proposalById(history.id).status).toBe('approved')
    expect(store.proposal.id).toBe(current.id)
    store.hydrate('another-project', {})
    expect(store.proposalById(history.id)).toBeNull()
  })

  it('Workflow 历史使用 include_ended 并可按 ID 重开且不覆盖活动 Workflow', async () => {
    const active = {
      ...workflowView(4),
      workflow: {
        ...workflowView(4).workflow,
        status: 'running',
        updated_at: '2026-08-29T10:00:00Z'
      }
    }
    const historical = {
      ...workflowView(7),
      workflow: {
        ...workflowView(7).workflow,
        id: 'workflow-history',
        status: 'stopped',
        reason: 'operator_confirmed_stop',
        updated_at: '2026-08-28T10:00:00Z'
      },
      tasks: workflowView(7).tasks.map((item) => ({
        ...item,
        workflow_id: 'workflow-history',
        status: 'stopped'
      }))
    }
    workflowsApi.listWorkflows.mockResolvedValue([active.workflow, historical.workflow])
    workflowsApi.getActivePlanProposal.mockResolvedValue(null)
    workflowsApi.getWorkflowView.mockImplementation((_projectId, workflowId) =>
      Promise.resolve(workflowId === 'workflow-history' ? historical : active)
    )
    const store = useWorkflowStore()

    await store.load('project-1')
    const reopened = await store.loadView('workflow-history')

    expect(workflowsApi.listWorkflows).toHaveBeenCalledWith('project-1', true)
    expect(store.items.map((item) => item.id)).toEqual(['workflow-1', 'workflow-history'])
    expect(reopened.workflow.id).toBe('workflow-history')
    expect(store.workflow.id).toBe('workflow-1')
    expect(store.workflow.status).toBe('running')
  })

  it('inspectView 返回终态 Workflow 缓存，不覆盖当前工作，且 taskById 能命中缓存', async () => {
    const active = {
      ...workflowView(4),
      workflow: {
        ...workflowView(4).workflow,
        status: 'running',
        conversation_id: 'conv-1',
        updated_at: '2026-08-29T10:00:00Z'
      }
    }
    const historical = {
      ...workflowView(7),
      workflow: {
        ...workflowView(7).workflow,
        id: 'workflow-history',
        status: 'completed',
        conversation_id: 'conv-2',
        updated_at: '2026-08-28T10:00:00Z'
      },
      tasks: workflowView(7).tasks.map((item) => ({
        ...item,
        id: item.id === 'task-b' ? 'task-history' : item.id,
        workflow_id: 'workflow-history',
        status: 'completed'
      })),
      subtasks: workflowView(7).subtasks.map((item) => ({
        ...item,
        task_id: item.task_id === 'task-b' ? 'task-history' : item.task_id,
        status: 'completed'
      }))
    }
    workflowsApi.listWorkflows.mockResolvedValue([active.workflow, historical.workflow])
    workflowsApi.getActivePlanProposal.mockResolvedValue(null)
    workflowsApi.getWorkflowView.mockImplementation((_projectId, workflowId) =>
      Promise.resolve(workflowId === 'workflow-history' ? historical : active)
    )
    const store = useWorkflowStore()
    await store.load('project-1')
    await store.loadView('workflow-history')
    expect(store.workflow.id).toBe('workflow-1')
    expect(store.taskById('task-history')?.id).toBe('task-history')

    const inspected = await store.inspectView('workflow-history')
    expect(inspected.workflow.id).toBe('workflow-history')
    expect(store.workflow.id).toBe('workflow-1')
    expect(store.taskById('task-history')?.status).toBe('completed')
    expect(store.taskById('task-history')?.subtasks.map((item) => item.id)).toEqual(['subtask-b'])
    store.applyView(inspected)
    expect(store.taskById('task-history')?.subtasks).toHaveLength(1)
  })

  it('停止操作按面板 Workflow ID 重试，人工确认携带 revision、确认和原因', async () => {
    const stopping = workflowView(5)
    stopping.workflow.status = 'stopping'
    workflowsApi.stopWorkflow.mockResolvedValue({
      ...stopping,
      workflow: { ...stopping.workflow, status: 'stopped', revision: 6 }
    })
    const store = useWorkflowStore()
    store.hydrate('project-1', { workflow_view: stopping })

    await store.transitionById('workflow-1', 'stop')

    expect(workflowsApi.stopWorkflow).toHaveBeenCalledWith('project-1', 'workflow-1', 5)

    const unknown = workflowView(8)
    unknown.workflow.status = 'paused'
    unknown.workflow.reason = 'execution_state_unknown'
    store.applyView(unknown)
    workflowsApi.confirmWorkflowStop.mockResolvedValue({
      ...unknown,
      workflow: {
        ...unknown.workflow,
        status: 'stopped',
        reason: 'operator_confirmed_stop',
        revision: 9
      }
    })

    await store.confirmStop('workflow-1', '现场确认机器人已停止并安全保持')

    expect(workflowsApi.confirmWorkflowStop).toHaveBeenCalledWith(
      'project-1',
      'workflow-1',
      8,
      '现场确认机器人已停止并安全保持'
    )
    expect(store.workflow.status).toBe('stopped')
  })

  it('Workflow 停止入口只在活动、停止中和未知态显示，终态保持只读', () => {
    expect(workflowStopMode({ status: 'running' })).toBe('stop')
    expect(workflowStopMode({ status: 'paused', reason: 'user_paused' })).toBe('stop')
    expect(workflowStopMode({ status: 'stopping' })).toBe('retry')
    expect(workflowStopMode({ status: 'paused', reason: 'execution_state_unknown' })).toBe(
      'unknown'
    )
    expect(workflowStopMode({ status: 'stopped' })).toBe('readonly')
    expect(workflowStopMode({ status: 'completed' })).toBe('readonly')
    expect(workflowStopMode({ status: 'failed' })).toBe('readonly')
  })

  it('Task和SubTask事件直接合并，第二箱进度不会触发整张Workflow重复读取', () => {
    const store = useWorkflowStore()
    store.hydrate('project-1', { workflow_view: workflowView() })

    expect(
      store.applyEvent({
        project_id: 'project-1',
        resource_type: 'task',
        payload: {
          task: {
            id: 'task-b',
            workflow_id: 'workflow-1',
            position: 2,
            status: 'running',
            revision: 4
          }
        }
      })
    ).toBe(true)
    expect(
      store.applyEvent({
        project_id: 'project-1',
        resource_type: 'subtask',
        payload: {
          subtask: {
            id: 'subtask-b',
            task_id: 'task-b',
            position: 1,
            status: 'completed',
            revision: 3
          }
        }
      })
    ).toBe(true)

    expect(store.taskById('task-b').status).toBe('running')
    expect(store.taskById('task-b').subtasks[0].status).toBe('completed')
    expect(workflowsApi.getWorkflowView).not.toHaveBeenCalled()
  })

  it('对象形式的约束和完成条件无损恢复、展示和再次保存', () => {
    const view = workflowView()
    view.workflow.constraints = { branch: 'develop', retries: 2 }
    view.workflow.completion_criteria = { tests: 'pass', coverage: 80 }
    view.tasks[0].completion_criteria = { artifact: 'report.json' }
    const store = useWorkflowStore()

    store.hydrate('project-1', { workflow_view: view })

    expect(store.workflow.constraints).toEqual({ branch: 'develop', retries: 2 })
    expect(structuredFieldItems(store.workflow.constraints)).toEqual([
      'branch: develop',
      'retries: 2'
    ])
    const editor = structuredFieldToEditor(store.workflow.completion_criteria)
    expect(structuredFieldFromEditor(editor)).toEqual({ tests: 'pass', coverage: 80 })
    expect(store.taskById('task-a').completion_criteria).toEqual({ artifact: 'report.json' })
  })

  it('Snapshot 在批准前只恢复 Plan Proposal，不伪造 Workflow', () => {
    const store = useWorkflowStore()
    store.hydrate('project-1', { plan_proposal: planProposal() })

    expect(store.workflow).toBeNull()
    expect(store.proposalReady).toBe(true)
    expect(store.proposalTasks.map((item) => item.goal)).toEqual(['准备输入数据', '实现数据分析'])
  })

  it('批准 Plan Proposal 携带精确 revision，并用事务返回的 Workflow 替换状态', async () => {
    workflowsApi.approvePlanProposal.mockResolvedValue({
      ...workflowView(3),
      workflow: {
        ...workflowView(3).workflow,
        status: 'running',
        confirmed_revision: 2
      }
    })
    const store = useWorkflowStore()
    store.hydrate('project-1', { plan_proposal: planProposal(2) })

    await store.approveProposal()

    expect(workflowsApi.approvePlanProposal).toHaveBeenCalledWith('project-1', 'proposal-1', 2)
    expect(store.proposal).toBeNull()
    expect(store.workflow.status).toBe('running')
    expect(store.workflow.confirmed_revision).toBe(2)
  })

  it('放弃 Proposal 携带精确 revision，且不暴露直接修改 Task 的接口', async () => {
    workflowsApi.discardPlanProposal.mockResolvedValue(planProposal(3, 'discarded'))
    const store = useWorkflowStore()
    store.hydrate('project-1', { plan_proposal: planProposal(2) })

    await store.discardProposal()

    expect(workflowsApi.discardPlanProposal).toHaveBeenCalledWith('project-1', 'proposal-1', 2)
    expect(store.proposal.status).toBe('discarded')
    expect(store.adjustTask).toBeUndefined()
  })

  it('类型化 Task/SubTask 无损恢复后绑定与执行引用', () => {
    const view = workflowView()
    view.tasks[1] = {
      ...view.tasks[1],
      required_role: 'robot',
      required_capabilities: ['grasp-object'],
      resource_requirements: { robot_models: ['r1pro'] },
      assigned_agent_id: 'robot:r1pro-fake-02',
      assigned_robot_id: 'r1pro-fake-02',
      assignment_revision: 1
    }
    view.subtasks[1] = {
      ...view.subtasks[1],
      kind: 'robot_skill',
      goal: '抓取 box-17',
      spec: { skill_name: 'grasp-object', input: { target_ref: 'box-17' } },
      execution_ref: 'rex-1',
      evidence: ['artifact://grasp-proof']
    }
    const store = useWorkflowStore()
    store.hydrate('project-1', { workflow_view: view })

    const task = store.taskById('task-b')
    expect(task.assigned_robot_id).toBe('r1pro-fake-02')
    expect(task.resource_requirements).toEqual({ robot_models: ['r1pro'] })
    expect(task.subtasks[0].spec.skill_name).toBe('grasp-object')
    expect(task.subtasks[0].execution_ref).toBe('rex-1')
  })

  it('地图 generation 或 Entity 失效时禁止继续已批准 Workflow', async () => {
    const maps = useSemanticMapStore()
    maps.hydrate('project-1', { maps: [mapSnapshot('simulation_map', 3, 5)] })
    const view = workflowView(2)
    view.workflow.map_scope = {
      map_id: 'simulation_map',
      generation: 2,
      selections: [{ kind: 'entity', entity_id: 'simulation_map-entity' }]
    }
    const store = useWorkflowStore()
    store.hydrate('project-1', { workflow_view: view })

    expect(store.mapBindingStale).toBe(true)
    store.workflow.status = 'paused'
    await expect(store.transition('resume')).rejects.toMatchObject({
      code: 'MAP_BINDING_STALE'
    })
    expect(workflowsApi.resumeWorkflow).not.toHaveBeenCalled()
  })

  it('地图创建新 generation 后立即标记已有计划绑定失效', async () => {
    mapsApi.createMapGeneration.mockResolvedValue(mapSnapshot('simulation_map', 4, 6))
    const maps = useSemanticMapStore()
    maps.hydrate('project-1', { maps: [mapSnapshot('simulation_map', 3, 5)] })
    const view = workflowView(2)
    view.workflow.map_scope = {
      map_id: 'simulation_map',
      generation: 3,
      selections: [{ kind: 'entity', entity_id: 'simulation_map-entity' }]
    }
    const store = useWorkflowStore()
    store.hydrate('project-1', { workflow_view: view })

    expect(store.mapBindingStale).toBe(false)
    await maps.newGeneration('reset')
    expect(store.mapBindingStale).toBe(true)
  })

  it('simulation_map 与 real_map 独立保存且切换时清理旧选择', async () => {
    mapsApi.getMapSnapshot.mockImplementation((_projectId, mapId) =>
      Promise.resolve(mapSnapshot(mapId))
    )
    const store = useSemanticMapStore()
    store.hydrate('project-1')
    await store.load('simulation_map')
    store.select({ kind: 'entity', entity_id: 'simulation_map-entity' })
    await store.switchMap('real_map')

    expect(store.activeMapId).toBe('real_map')
    expect(store.selection).toBeNull()
    expect(store.snapshots.simulation_map.entities[0].id).toBe('simulation_map-entity')
    expect(store.snapshots.real_map.entities[0].id).toBe('real_map-entity')
  })

  it('generation 变化会使旧地图选择失效', async () => {
    mapsApi.getMapSnapshot.mockResolvedValue(mapSnapshot('simulation_map'))
    mapsApi.createMapGeneration.mockResolvedValue(mapSnapshot('simulation_map', 2, 2))
    const store = useSemanticMapStore()
    store.hydrate('project-1')
    await store.load()
    store.select({ kind: 'entity', entity_id: 'simulation_map-entity' })

    await store.newGeneration('reset')

    expect(store.activeSnapshot.generation).toBe(2)
    expect(store.selection).toBeNull()
  })

  it('服务事件对账后清除已移除 Entity 的选择', async () => {
    const current = mapSnapshot('simulation_map', 3, 5)
    const removed = mapSnapshot('simulation_map', 3, 6)
    removed.entities[0].status = 'removed'
    mapsApi.getMapSnapshot.mockResolvedValueOnce(current).mockResolvedValueOnce(removed)
    const store = useSemanticMapStore()
    store.hydrate('project-1')
    await store.load()
    store.select({ kind: 'entity', entity_id: 'simulation_map-entity' })

    expect(
      store.applyEvent({
        project_id: 'project-1',
        resource_type: 'map_entity',
        resource_id: 'simulation_map-entity',
        payload: { map_id: 'simulation_map', generation: 3 }
      })
    ).toBe(true)
    await vi.waitFor(() => expect(store.selection).toBeNull())
  })

  it('检查点与重置通知重读地图，旧响应不能覆盖重置后的快照', async () => {
    const store = useSemanticMapStore()
    store.hydrate('project-1', { maps: [mapSnapshot('simulation_map', 3, 5)] })
    store.select({ kind: 'entity', entity_id: 'simulation_map-entity' })
    let finishOld
    mapsApi.getMapSnapshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve
        })
    )
    store.applyEvent({
      project_id: 'project-1',
      resource_type: 'semantic_map',
      resource_id: 'simulation_map',
      payload: { generation: 3 }
    })
    mapsApi.getMapSnapshot.mockResolvedValueOnce(mapSnapshot('simulation_map', 4, 1))
    store.applyEvent({
      project_id: 'project-1',
      resource_type: 'semantic_map',
      payload: { map_id: 'simulation_map', generation: 4 }
    })
    await vi.waitFor(() => expect(store.activeSnapshot.generation).toBe(4))
    expect(store.selection).toBeNull()
    finishOld(mapSnapshot('simulation_map', 3, 6))
    await Promise.resolve()
    await Promise.resolve()
    expect(store.activeSnapshot.generation).toBe(4)
  })

  it('批量更新始终携带当前 generation 和 revision', async () => {
    mapsApi.getMapSnapshot.mockResolvedValue(mapSnapshot('simulation_map', 3, 5))
    const removed = mapSnapshot('simulation_map', 3, 6)
    removed.entities[0].status = 'removed'
    mapsApi.updateMap.mockResolvedValue(removed)
    const store = useSemanticMapStore()
    store.hydrate('project-1')
    await store.load()
    store.select({ kind: 'entity', entity_id: 'simulation_map-entity' })

    await store.submitUpdate([{ op: 'remove_entity', entity_id: 'entity-1' }])

    expect(store.selection).toBeNull()
    expect(mapsApi.updateMap).toHaveBeenCalledWith('project-1', 'simulation_map', {
      generation: 3,
      revision: 5,
      operations: [{ op: 'remove_entity', entity_id: 'entity-1' }]
    })
  })
})
