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

vi.mock('@/api/simulation', () => ({
  getSimulationSnapshot: vi.fn(),
  getProjectStudioSnapshot: vi.fn(),
  listRuntimeProfiles: vi.fn(),
  listSceneDocuments: vi.fn(),
  listSceneAssets: vi.fn(),
  listRuntimeInstallations: vi.fn(),
  listSceneCatalog: vi.fn(),
  getProjectRuntimePreference: vi.fn(),
  setProjectRuntimePreference: vi.fn(),
  ensureProjectRuntime: vi.fn(),
  releaseProjectRuntime: vi.fn(),
  listProjectScenes: vi.fn(),
  addProjectScene: vi.fn(),
  createProjectLayoutDraft: vi.fn(),
  recoverInterruptedRuntime: vi.fn(),
  startProjectScene: vi.fn(),
  switchProjectSceneVariant: vi.fn(),
  ensureRuntime: vi.fn(),
  listScenes: vi.fn(),
  startScene: vi.fn(),
  getSceneInstance: vi.fn(),
  operateScene: vi.fn(),
  getSceneSnapshot: vi.fn(),
  syncSceneMap: vi.fn(),
  getSceneEvaluation: vi.fn(),
  listRobots: vi.fn(),
  getRobotState: vi.fn(),
  listRobotSensors: vi.fn(),
  submitRobotCommand: vi.fn(),
  getRobotCommand: vi.fn(),
  stopRobotCommand: vi.fn(),
  holdRobot: vi.fn(),
  createSceneDocument: vi.fn(),
  saveSceneDocument: vi.fn(),
  applySceneOperations: vi.fn(),
  validateSceneDocument: vi.fn(),
  buildSceneDocument: vi.fn(),
  createDocumentLayout: vi.fn(),
  renameDocumentLayout: vi.fn(),
  deleteDocumentLayout: vi.fn(),
  importScenePackage: vi.fn(),
  exportScenePackage: vi.fn(),
  publishSceneDocument: vi.fn(),
  listDocumentLayouts: vi.fn()
}))

import * as api from '@/api/simulation'
import { useSimulationStore } from '@/stores/simulation'

const instance = {
  instance_id: 'scene-1',
  scene_key: 'depalletizing',
  layout: 'layout001',
  generation: 1,
  state: 'running'
}
const robot = { robot_id: 'r1pro-1', sdk_type: 'r1pro-mujoco-v1' }

describe('simulation store', () => {
  it('场景加载预算来自 Runtime Profile，未声明时保留三分钟', () => {
    const store = useSimulationStore()
    store.instance = { ...instance, runtime_profile_id: 'behavior-omnigibson' }
    expect(store.sceneStartTimeoutMilliseconds).toBe(180_000)
    store.runtimeProfiles = [{ runtime_profile_id: 'behavior-omnigibson', scene_start_timeout_seconds: 900 }]
    expect(store.sceneStartTimeoutMilliseconds).toBe(900_000)
  })

  it.each(['starting', 'resetting', 'stopping'])('%s 时不重复提交 Layout 切换', async (state) => {
    const store = useSimulationStore()
    store.instance = { ...instance, state }
    await expect(store.switchVariant('instance-302')).rejects.toThrow('请等待当前操作完成')
    expect(api.switchProjectSceneVariant).not.toHaveBeenCalled()
  })

  it('后台启动观察使用 Profile 预算', async () => {
    const store = useSimulationStore()
    store.instance = { ...instance, runtime_profile_id: 'behavior-omnigibson' }
    store.runtimeProfiles = [{ runtime_profile_id: 'behavior-omnigibson', scene_start_timeout_seconds: 900 }]
    const wait = vi.spyOn(store, 'waitForSceneState').mockResolvedValue(instance)
    vi.spyOn(store, 'refreshRuntimeData').mockResolvedValue()
    await store.observeStartedScene(instance.instance_id)
    expect(wait).toHaveBeenCalledWith(['running', 'paused'], { timeoutMilliseconds: 900_000 })
  })

  it('实例切换后忽略旧状态轮询的迟到响应', async () => {
    vi.useFakeTimers()
    try {
      const store = useSimulationStore()
      store.instance = { ...instance, state: 'starting' }
      let resolveOld
      api.getSceneInstance.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      const waiting = store.waitForSceneState(['running'])
      await vi.advanceTimersByTimeAsync(500)
      store.instance = { ...instance, instance_id: 'new-scene' }
      resolveOld({ instance })
      await waiting
      expect(store.instance.instance_id).toBe('new-scene')
    } finally {
      vi.useRealTimers()
    }
  })
  it('从快照恢复当前场景和初态，页面刷新后选择器与现场一致', () => {
    const store = useSimulationStore()
    store.resetForProject('p1')
    store.applySnapshot({project_id:'p1', instance:{instance_id:'scene-1',state:'running',layout:'init-2'}, catalog_scene_id:'libero-spatial-0',scene_version:'1.0.0',variant_id:'init-2'})
    expect(store.catalogSceneId).toBe('libero-spatial-0')
    expect(store.variantId).toBe('init-2')
    expect(store.sceneVersion).toBe('1.0.0')
  })
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.getSimulationSnapshot.mockResolvedValue({
      simulation: {
        project_id: 'project-1',
        runtimes: [
          { runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco', state: 'ready' }
        ],
        scenes: [
          {
            scene_key: 'depalletizing',
            runtime_profile_id: 'native-mujoco',
            layouts: ['layout001']
          }
        ],
        instance: null,
        robots: [],
        viewers: []
      }
    })
    api.getProjectStudioSnapshot.mockResolvedValue({ snapshot: { event_sequence: 7 } })
    api.listRuntimeProfiles.mockResolvedValue({
      runtime_profiles: [{ runtime_profile_id: 'native-mujoco', name: 'Native MuJoCo' }]
    })
    api.listRuntimeInstallations.mockResolvedValue({
      runtime_installations: [
        {
          installation_id: 'mujoco-local',
          profile_id: 'native-mujoco',
          engine: 'mujoco',
          enabled: true,
          status: 'ready'
        }
      ]
    })
    api.getProjectRuntimePreference.mockResolvedValue({
      runtime_profile_id: 'native-mujoco',
      preferred_runtime_installation_id: 'mujoco-local',
      compatible_runtime_installations: [
        {
          installation_id: 'mujoco-local',
          profile_id: 'native-mujoco',
          engine: 'mujoco',
          enabled: true,
          status: 'ready'
        }
      ]
    })
    api.listSceneCatalog.mockResolvedValue({ scenes: [] })
    api.listProjectScenes.mockResolvedValue({ project_scenes: [] })
    api.ensureProjectRuntime.mockResolvedValue({
      runtime: { runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco', state: 'ready' }
    })
    api.listSceneDocuments.mockResolvedValue({ documents: [] })
    api.listSceneAssets.mockResolvedValue({
      assets: [
        {
          catalog_id: 'r1-pro-chassis',
          label: 'R1 Pro',
          node_kind: 'robot',
          asset: {
            id: 'robot-r1-pro-chassis-v1',
            asset_key: 'robot/r1_pro_chassis/config/r1_pro_chassis.xml',
            kind: 'robot',
            metadata: { model: 'r1_pro_chassis' }
          },
          preview: { shape: 'box', size: [0.8, 0.55, 1.2], color: '#315cec', placeholder: true },
          default_properties: { model: 'r1_pro_chassis', sensor_names: ['camera'] }
        }
      ]
    })
    api.listScenes.mockResolvedValue({
      scenes: [{ scene_key: 'depalletizing', layouts: ['layout001'] }]
    })
    api.ensureRuntime.mockResolvedValue({
      runtime: {
        runtime_id: 'runtime-1',
        runtime_profile_id: 'native-mujoco',
        state: 'ready'
      }
    })
    api.getSceneSnapshot.mockResolvedValue({
      snapshot: { instance_id: 'scene-1', generation: 1, objects: [], sensors: [] }
    })
    api.getSceneEvaluation.mockResolvedValue({
      evaluation: {
        instance_id: 'scene-1',
        generation: 1,
        reward: 1.25,
        success: true
      }
    })
    api.listRobots.mockResolvedValue({ robots: [robot] })
    api.getRobotState.mockResolvedValue({
      state: { robot_id: robot.robot_id, generation: 1 }
    })
    api.listRobotSensors.mockResolvedValue({
      sensors: [{ sensor_id: 'camera.rgb', kind: 'rgb', robot_id: robot.robot_id }]
    })
  })

  it('从完整快照恢复 Project，并在切换 Project 时清除旧状态', async () => {
    const store = useSimulationStore()
    await store.hydrate('project-1')
    expect(store.lastSequence).toBe(7)
    expect(store.runtime.state).toBe('ready')
    expect(store.scenes).toHaveLength(1)
    expect(store.assetCatalog[0].catalog_id).toBe('r1-pro-chassis')
    store.commands.push({ command_id: 'old' })

    api.getSimulationSnapshot.mockResolvedValue({
      simulation: { project_id: 'project-2', runtime: { state: 'offline' } }
    })
    await store.hydrate('project-2')
    expect(store.projectId).toBe('project-2')
    expect(store.commands).toEqual([])
    expect(store.runtime.state).toBe('offline')
    expect(api.ensureProjectRuntime).not.toHaveBeenCalled()
  })

  it('用 Runtime 探测快照覆盖并行返回的旧 Installation 离线状态', async () => {
    api.getSimulationSnapshot.mockResolvedValueOnce({
      simulation: {
        project_id: 'project-1',
        runtimes: [
          {
            runtime_id: 'runtime-1',
            runtime_installation_id: 'mujoco-local',
            runtime_profile_id: 'native-mujoco',
            state: 'ready'
          }
        ],
        runtime_installation: {
          installation_id: 'mujoco-local',
          profile_id: 'native-mujoco',
          status: 'ready',
          diagnostic: ''
        },
        instance: null,
        robots: []
      }
    })
    api.listRuntimeInstallations.mockResolvedValueOnce({
      runtime_installations: [
        {
          installation_id: 'mujoco-local',
          profile_id: 'native-mujoco',
          status: 'offline',
          diagnostic: '旧探测结果'
        }
      ]
    })
    api.getProjectRuntimePreference.mockResolvedValueOnce({
      runtime_profile_id: 'native-mujoco',
      preferred_runtime_installation_id: 'mujoco-local',
      compatible_runtime_installations: [
        {
          installation_id: 'mujoco-local',
          profile_id: 'native-mujoco',
          status: 'offline',
          diagnostic: '旧探测结果'
        }
      ]
    })

    const store = useSimulationStore()
    await store.hydrate('project-1')

    expect(store.runtimeInstallations[0]).toEqual(
      expect.objectContaining({ status: 'ready', diagnostic: '' })
    )
    expect(store.runtimePreference.compatible_runtime_installations[0]).toEqual(
      expect.objectContaining({ status: 'ready', diagnostic: '' })
    )
  })

  it('打开 Project 只恢复 Runtime Profile，不隐式启动 Runtime 或恢复失联实例', async () => {
    const store = useSimulationStore()
    api.getSimulationSnapshot.mockResolvedValueOnce({
      simulation: {
        project_id: 'project-1',
        runtimes: [{ runtime_profile_id: 'native-mujoco', state: 'offline' }],
        instance: null,
        robots: [],
        viewers: []
      }
    })
    await store.hydrate('project-1')
    expect(store.runtimePreference.runtime_profile_id).toBe('native-mujoco')
    expect(store.runtime.state).toBe('offline')
    expect(api.ensureProjectRuntime).not.toHaveBeenCalled()

    api.ensureProjectRuntime.mockClear()
    api.getSimulationSnapshot.mockResolvedValueOnce({
      simulation: {
        project_id: 'project-2',
        runtimes: [{ runtime_profile_id: 'native-mujoco', state: 'offline' }],
        instance: { ...instance, runtime_profile_id: 'native-mujoco' },
        recovery: 'runtime_offline',
        robots: [],
        viewers: []
      }
    })
    await store.hydrate('project-2')
    await Promise.resolve()
    expect(store.runtimeInterrupted).toBe(true)
    expect(api.ensureProjectRuntime).not.toHaveBeenCalled()
  })

  it('按 Project sequence 接收同 generation 操作并识别缺口', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.lastSequence = 7
    store.revision = 1
    store.instance = { ...instance }

    expect(
      await store.applyIncremental({
        project_id: 'project-1',
        channel: 'simulation',
        type: 'simulation.scene.pause',
        sequence: 8,
        revision: 1,
        payload: { ...instance, state: 'paused' }
      })
    ).toBe(true)
    expect(store.instance.state).toBe('paused')
    expect(store.lastSequence).toBe(8)
    api.listScenes.mockClear()
    expect(
      await store.applyIncremental({
        project_id: 'project-1',
        channel: 'simulation',
        type: 'simulation.scene.built',
        sequence: 9,
        revision: 2,
        payload: { build_id: 'build-1', scene_key: 'scene-doc-1' }
      })
    ).toBe(true)
    expect(store.instance.state).toBe('paused')
    expect(api.listScenes).toHaveBeenCalledOnce()
    expect(store.lastSequence).toBe(9)

    expect(
      await store.applyIncremental({
        project_id: 'project-1',
        channel: 'simulation',
        type: 'simulation.scene.resume',
        sequence: 11,
        revision: 1,
        payload: { ...instance, state: 'running' }
      })
    ).toBe(false)
    expect(store.connection).toBe('stale')
    expect(store.lastSequence).toBe(9)
  })

  it('SceneDocument 事件只更新草稿，不占用活动场景实例', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.lastSequence = 4
    const document = {
      id: 'scene-doc-1',
      revision: 1,
      status: 'draft'
    }

    expect(
      await store.applyIncremental({
        project_id: 'project-1',
        channel: 'simulation',
        type: 'simulation.scene.document.created',
        sequence: 5,
        revision: 1,
        payload: document
      })
    ).toBe(true)
    expect(store.instance).toBeNull()
    expect(store.documents).toEqual([document])
    expect(store.lastSequence).toBe(5)
  })

  it('启动场景后恢复 Robot、传感器和场景快照', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    api.startScene.mockResolvedValue({ instance })

    await store.startScene('depalletizing', { layout: 'layout001', seed: 3 })

    expect(api.startScene).toHaveBeenCalledWith(
      'project-1',
      'depalletizing',
      expect.objectContaining({ layout: 'layout001', seed: 3, headless: true })
    )
    expect(store.instance.instance_id).toBe('scene-1')
    expect(store.selectedRobotId).toBe(robot.robot_id)
    expect(store.sensors[0].sensor_id).toBe('camera.rgb')
  })

  it('等待异步启动完成后才读取 Robot 和场景快照', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    api.startScene.mockResolvedValue({ instance: { ...instance, state: 'starting' } })
    api.getSceneInstance.mockResolvedValue({ instance })

    await store.startScene('depalletizing', {
      layout: 'layout001',
      seed: 3,
      request_id: 'start-async'
    })

    expect(api.getSceneInstance).toHaveBeenCalledWith('project-1', 'scene-1')
    expect(api.getSceneSnapshot).toHaveBeenCalledTimes(1)
    expect(api.listRobots).toHaveBeenCalledTimes(1)
    expect(store.instance.state).toBe('running')
  })

  it('原生模型加载期间状态查询瞬时超时不会把 starting 场景判为失败', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    api.startScene.mockResolvedValue({ instance: { ...instance, state: 'starting' } })
    api.getSceneInstance
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'NETWORK_ERROR' })
      )
      .mockResolvedValueOnce({ instance })

    await store.startScene('depalletizing', {
      layout: 'layout001',
      seed: 3,
      request_id: 'start-after-transient-timeout'
    })

    expect(api.getSceneInstance).toHaveBeenCalledTimes(2)
    expect(store.instance.state).toBe('running')
  })

  it('Project 场景创建为 starting 时立即返回并在后台恢复运行数据', async () => {
    vi.useFakeTimers()
    try {
      const store = useSimulationStore()
      store.resetForProject('project-1')
      api.startProjectScene.mockResolvedValue({
        instance: { ...instance, state: 'starting' }
      })
      api.getSceneInstance.mockResolvedValue({ instance })

      const started = await store.startProjectScene(
        {
          project_scene_id: 'project-scene-1',
          catalog_scene_id: 'depalletizing-r1pro',
          scene_version: '0.5.0',
          default_variant_id: 'layout_smoke'
        },
        { variant_id: 'layout_smoke', runtime_installation_id: 'mujoco-local' }
      )

      expect(started.state).toBe('starting')
      expect(store.runtime.state).toBe('ready')
      expect(api.getSceneSnapshot).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(500)
      await Promise.resolve()
      expect(store.instance.state).toBe('running')
      expect(api.getSceneSnapshot).toHaveBeenCalledTimes(1)
      expect(api.listRobots).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('starting 增量只更新实例，不提前读取尚未就绪的数据', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')

    expect(
      await store.applyIncremental({
        project_id: 'project-1',
        type: 'simulation.scene.started',
        sequence: 1,
        revision: 1,
        payload: { ...instance, state: 'starting' }
      })
    ).toBe(true)

    expect(store.instance.state).toBe('starting')
    expect(api.getSceneSnapshot).not.toHaveBeenCalled()
    expect(api.listRobots).not.toHaveBeenCalled()
  })

  it('仅为 Runtime 和场景版本都声明 evaluator 的实例恢复评测证据', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.instance = { ...instance, runtime_profile_id: 'robosuite-1.5' }
    store.runtimeProfiles = [
      {
        runtime_profile_id: 'robosuite-1.5',
        capabilities: { native_evaluator: true }
      }
    ]
    store.evaluationDescriptor = {
      provider: 'robosuite',
      evaluation_kind: 'native',
      metrics: ['reward', 'success'],
      supports_comparison: false
    }

    await store.refreshRuntimeData()

    expect(api.getSceneEvaluation).toHaveBeenCalledWith('project-1', 'scene-1')
    expect(store.evaluation).toEqual(
      expect.objectContaining({ generation: 1, reward: 1.25, success: true })
    )
  })

  it('只在显式检查点同步 Semantic Map，并拒绝旧 generation 快照', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.instance = { ...instance }
    const snapshot = {
      instance_id: 'scene-1',
      generation: 1,
      coordinate_frame: 'world',
      objects: [{ source_id: 'box-001', category: 'box' }],
      regions: []
    }
    api.syncSceneMap.mockResolvedValue({ synced: true, snapshot })

    await expect(store.syncSemanticMap()).resolves.toEqual(snapshot)

    expect(api.syncSceneMap).toHaveBeenCalledWith('project-1', 'scene-1')
    expect(store.sceneSnapshot).toEqual(snapshot)
    expect(store.events.at(-1)).toEqual(
      expect.objectContaining({ type: 'map', message: '已在当前检查点同步 Semantic Map' })
    )

    api.syncSceneMap.mockResolvedValue({
      synced: true,
      snapshot: { ...snapshot, generation: 2 }
    })
    await expect(store.syncSemanticMap()).rejects.toThrow('旧 generation')
    expect(store.sceneSnapshot.generation).toBe(1)
  })

  it('SDK 命令和 reset 都使用当前 generation', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.instance = { ...instance }
    store.robots = [robot]
    store.selectedRobotId = robot.robot_id
    api.submitRobotCommand.mockResolvedValue({
      command: {
        command_id: 'cmd-1',
        robot_id: robot.robot_id,
        type: 'base_trajectory',
        status: 'accepted'
      }
    })
    api.getRobotCommand.mockResolvedValue({
      command: {
        command_id: 'cmd-1',
        robot_id: robot.robot_id,
        type: 'base_trajectory',
        status: 'running'
      }
    })
    api.stopRobotCommand.mockResolvedValue({
      command: {
        command_id: 'cmd-1',
        robot_id: robot.robot_id,
        type: 'base_trajectory',
        status: 'cancelled'
      }
    })
    api.operateScene.mockResolvedValue({
      instance: { ...instance, generation: 2, state: 'running' }
    })
    await store.submitCommand('base_trajectory', {
      frame_id: 'world',
      points: [
        { positions: { x: 0, y: 0, yaw: 0 }, time_from_start_seconds: 0 },
        { positions: { x: 0.1, y: 0, yaw: 0 }, time_from_start_seconds: 0.2 }
      ]
    })
    expect(api.submitRobotCommand).toHaveBeenCalledWith(
      'project-1',
      'scene-1',
      robot.robot_id,
      expect.objectContaining({
        scene_generation: 1,
        type: 'base_trajectory',
        base_trajectory: expect.objectContaining({ frame_id: 'world' })
      })
    )

    await store.refreshCommand('cmd-1')
    expect(api.getRobotCommand).toHaveBeenCalledWith(
      'project-1',
      'scene-1',
      robot.robot_id,
      'cmd-1'
    )
    expect(store.commands).toHaveLength(1)
    expect(store.commands[0].status).toBe('running')

    await store.stopCommand('cmd-1')
    expect(api.stopRobotCommand).toHaveBeenCalledWith(
      'project-1',
      'scene-1',
      robot.robot_id,
      'cmd-1'
    )
    expect(store.commands).toHaveLength(1)
    expect(store.commands[0].status).toBe('cancelled')

    api.holdRobot.mockResolvedValue({
      command: {
        command_id: 'hold-1',
        robot_id: robot.robot_id,
        scene_generation: 1,
        type: 'hold',
        status: 'succeeded'
      }
    })
    await store.holdRobot()
    expect(api.holdRobot).toHaveBeenCalledWith('project-1', 'scene-1', robot.robot_id, 1)

    await store.operate('reset')
    expect(store.instance.generation).toBe(2)
    expect(store.commands).toEqual([])
  })

  it('停止场景后释放活动实例并允许启动下一布局', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.instance = { ...instance }
    store.robots = [robot]
    store.selectedRobotId = robot.robot_id
    store.sceneSnapshot = { generation: 1 }
    api.operateScene.mockResolvedValue({
      instance: { ...instance, state: 'stopped' }
    })

    const stopped = await store.operate('stop')

    expect(stopped.state).toBe('stopped')
    expect(store.instance).toBeNull()
    expect(store.robots).toEqual([])
    expect(store.selectedRobotId).toBe('')
    expect(store.sceneSnapshot).toBeNull()

    api.startScene.mockResolvedValue({
      instance: { ...instance, instance_id: 'scene-2', layout: 'layout002' }
    })
    await store.startScene('depalletizing', {
      runtime_profile_id: 'native-mujoco',
      layout: 'layout002'
    })
    expect(store.instance.instance_id).toBe('scene-2')
  })

  it('failed 实例只允许通过 stop 安全清理', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.instance = { ...instance, state: 'failed' }
    expect(store.canCleanup).toBe(true)
    api.operateScene.mockResolvedValue({ instance: { ...instance, state: 'stopped' } })
    await store.operate('stop')
    expect(store.instance).toBeNull()
  })

  it('场景操作返回 503 时立即刷新为 interrupted，允许用户显式恢复', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.instance = { ...instance, runtime_profile_id: 'native-mujoco' }
    const unavailable = Object.assign(new Error('Runtime 不可用'), {
      status: 503,
      code: 'SIMULATION_OFFLINE'
    })
    api.operateScene.mockRejectedValueOnce(unavailable)
    api.getSimulationSnapshot.mockResolvedValueOnce({
      simulation: {
        project_id: 'project-1',
        runtimes: [{ runtime_profile_id: 'native-mujoco', state: 'offline' }],
        instance: { ...store.instance },
        recovery_info: {
          code: 'runtime_offline',
          derived_state: 'interrupted',
          message: 'Runtime 进程已经退出',
          last_known_state: 'running'
        }
      }
    })

    await expect(store.operate('reset')).rejects.toThrow('Runtime 不可用')

    expect(api.getSimulationSnapshot).toHaveBeenCalledWith('project-1')
    expect(store.runtimeInterrupted).toBe(true)
    expect(store.instanceDisplayState).toBe('interrupted')
    expect(store.canControl).toBe(false)
    expect(store.connection).toBe('stale')
  })

  it('构建草稿后保存 Runtime 版本并刷新场景列表', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.runtimePreference = {
      runtime_profile_id: 'native-mujoco',
      preferred_runtime_installation_id: 'mujoco-local',
      compatible_runtime_installations: []
    }
    store.selectedRuntimeProfileId = 'native-mujoco'
    api.buildSceneDocument.mockResolvedValue({
      runtime_bundle: {
        runtime_bundle_id: 'runtime-bundle-1',
        runtime_profile_id: 'native-mujoco',
        scene_key: 'scene-doc-1',
        scene_version: 1
      },
      runtime_result: {
        runtime_bundle_id: 'runtime-bundle-1',
        scene_key: 'scene-doc-1',
        runtime_scene_key: 'scene-doc-1',
        valid: true
      }
    })

    const result = await store.buildDocument('scene-doc-1')

    expect(result.runtime_result.valid).toBe(true)
    expect(store.runtimeBuild.scene_key).toBe('scene-doc-1')
    expect(api.ensureProjectRuntime).toHaveBeenCalledWith('project-1')
    expect(api.buildSceneDocument).toHaveBeenCalledWith('project-1', 'scene-doc-1')
    expect(api.listScenes).toHaveBeenCalledTimes(2)
    expect(store.scenes[0].scene_key).toBe('depalletizing')
  })
  it('Runtime 离线时保留最后实例状态、派生 interrupted 并阻止所有控制请求', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.commands = [{ command_id: 'cmd-running', robot_id: robot.robot_id, status: 'running' }]
    api.getSimulationSnapshot.mockResolvedValue({
      simulation: {
        project_id: 'project-1',
        runtimes: [
          {
            runtime_profile_id: 'native-mujoco',
            state: 'offline'
          }
        ],
        instance: {
          ...instance,
          runtime_profile_id: 'native-mujoco',
          state: 'running'
        },
        recovery: 'runtime_offline',
        recovery_info: {
          code: 'runtime_offline',
          derived_state: 'interrupted',
          message: 'Runtime 当前不可连接，场景实例状态无法继续确认',
          last_known_state: 'running'
        },
        robots: [],
        viewers: []
      }
    })

    await store.hydrate('project-1')

    expect(store.instance.state).toBe('running')
    expect(store.instanceDisplayState).toBe('interrupted')
    expect(store.runtimeInterrupted).toBe(true)
    expect(store.canControl).toBe(false)
    expect(store.recoveryDiagnostic).toContain('不可连接')
    expect(store.commands[0]).toEqual(
      expect.objectContaining({
        status: 'unknown',
        interruption: expect.objectContaining({ code: 'runtime_offline' })
      })
    )
    expect(api.getSceneSnapshot).not.toHaveBeenCalled()
    expect(api.listRobots).not.toHaveBeenCalled()

    store.selectedRobotId = robot.robot_id
    await expect(store.operate('pause')).rejects.toThrow('Runtime 已中断')
    await expect(store.submitCommand('gripper_command', { opening: 0.02 })).rejects.toThrow(
      'Runtime 已中断'
    )
    expect(api.operateScene).not.toHaveBeenCalled()
    expect(api.submitRobotCommand).not.toHaveBeenCalled()
  })

  it('显式清理 interrupted 实例后释放启动槽位', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.applySnapshot({
      project_id: 'project-1',
      runtimes: [{ runtime_id: 'runtime-1', state: 'offline' }],
      instance: { ...instance },
      recovery_info: { derived_state: 'interrupted', message: 'Runtime 离线' }
    })
    store.robots = [robot]
    api.recoverInterruptedRuntime.mockResolvedValue({
      runtime: { runtime_id: 'runtime-2', state: 'ready' }
    })

    await store.recoverInterruptedRuntime()

    expect(api.recoverInterruptedRuntime).toHaveBeenCalledWith('project-1', 'scene-1')
    expect(store.instance).toBeNull()
    expect(store.recovery).toBeNull()
    expect(store.robots).toEqual([])
    expect(store.runtime.state).toBe('ready')
  })

  it('Runtime 重新就绪后立即用权威快照清除旧离线诊断', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.runtimePreference = {
      runtime_profile_id: 'native-mujoco',
      preferred_runtime_installation_id: 'mujoco-local',
      compatible_runtime_installations: []
    }
    store.selectedRuntimeProfileId = 'native-mujoco'
    store.applySnapshot({
      project_id: 'project-1',
      runtimes: [
        { runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco', state: 'offline' }
      ],
      instance: { ...instance, runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco' },
      recovery_info: {
        code: 'runtime_offline',
        derived_state: 'interrupted',
        message: 'Runtime 当前不可连接'
      }
    })
    api.getSimulationSnapshot.mockResolvedValue({
      simulation: {
        project_id: 'project-1',
        runtimes: [
          { runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco', state: 'ready' }
        ],
        instance: { ...instance, runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco' }
      }
    })

    await store.ensureRuntime()

    expect(api.ensureProjectRuntime).toHaveBeenCalledWith('project-1')
    expect(api.getSimulationSnapshot).toHaveBeenCalledWith('project-1')
    expect(store.runtime.state).toBe('ready')
    expect(store.recovery).toBeNull()
    expect(store.runtimeInterrupted).toBe(false)
  })

  it('Runtime ready 事件也会对账快照而不是保留红色中断状态', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.lastSequence = 7
    store.applySnapshot({
      project_id: 'project-1',
      runtimes: [
        { runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco', state: 'offline' }
      ],
      instance: { ...instance, runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco' },
      recovery: 'runtime_offline'
    })
    api.getSimulationSnapshot.mockResolvedValue({
      simulation: {
        project_id: 'project-1',
        runtimes: [
          { runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco', state: 'ready' }
        ],
        instance: { ...instance, runtime_id: 'runtime-1', runtime_profile_id: 'native-mujoco' }
      }
    })

    await store.applyIncremental({
      project_id: 'project-1',
      sequence: 8,
      type: 'simulation.runtime.ready',
      payload: { runtime_id: 'runtime-1', state: 'ready' }
    })

    expect(store.runtime.state).toBe('ready')
    expect(store.runtimeInterrupted).toBe(false)
    expect(store.lastSequence).toBe(8)
  })

  it('Runtime unknown 也派生 interrupted，并只由后续正常快照清除', () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.applySnapshot({
      project_id: 'project-1',
      runtimes: [{ runtime_profile_id: 'native-mujoco', state: 'unknown' }],
      instance: { ...instance, runtime_profile_id: 'native-mujoco', state: 'paused' }
    })

    expect(store.instance.state).toBe('paused')
    expect(store.instanceDisplayState).toBe('interrupted')
    expect(store.recovery).toEqual(
      expect.objectContaining({ code: 'runtime_unknown', derived_state: 'interrupted' })
    )
    expect(store.canControl).toBe(false)

    store.applySnapshot({
      project_id: 'project-1',
      runtimes: [{ runtime_profile_id: 'native-mujoco', state: 'ready' }],
      instance: { ...instance, runtime_profile_id: 'native-mujoco', state: 'paused' },
      robots: [robot],
      viewers: []
    })

    expect(store.recovery).toBeNull()
    expect(store.runtimeInterrupted).toBe(false)
    expect(store.instance.state).toBe('paused')
    expect(store.instanceDisplayState).toBe('paused')
    expect(store.canControl).toBe(true)
    store.applySnapshot({
      project_id: 'project-1',
      runtimes: [{ runtime_profile_id: 'native-mujoco', state: 'offline' }],
      instance: { ...instance, runtime_profile_id: 'native-mujoco', state: 'stopped' }
    })
    expect(store.recovery).toBeNull()
    expect(store.runtimeInterrupted).toBe(false)
    expect(store.instance).toBeNull()
    expect(store.instanceDisplayState).toBe('')
  })

  it('直接保留 Server 原生 MuJoCo 场景目录、正式 Layout 与单箱调试 Layout', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    const nativeScene = {
      scene_id: 'depalletizing-r1pro',
      name: 'R1 Pro 拆码垛',
      engine: 'mujoco',
      loader: 'native',
      source: 'mujoco_asset',
      compatible_runtime_profile: 'native-mujoco',
      versions: [
        {
          version: '1.0.0',
          runtime_scene_key: 'palletizing_depalletizing_tote_v1',
          variants: [
            { variant_id: 'layout001', name: '布局 001', kind: 'layout' },
            { variant_id: 'layout002', name: '布局 002', kind: 'layout' },
            { variant_id: 'layout003', name: '布局 003', kind: 'layout' },
            { variant_id: 'layout_smoke', name: '单箱物理调试', kind: 'layout' }
          ]
        }
      ]
    }
    api.listSceneCatalog.mockResolvedValue({ scenes: [nativeScene] })
    api.listProjectScenes.mockResolvedValue({ project_scenes: [] })
    api.listSceneDocuments.mockResolvedValue({ documents: [] })

    await store.refreshSceneResources()

    const catalogScene = store.catalogById('depalletizing-r1pro')
    expect(catalogScene).toEqual(nativeScene)
    expect(catalogScene.versions[0].runtime_scene_key).toBe('palletizing_depalletizing_tote_v1')
    expect(catalogScene.versions[0].variants.map((item) => item.variant_id)).toEqual([
      'layout001',
      'layout002',
      'layout003',
      'layout_smoke'
    ])
  })

  it('切换 Project 后迟到的准备查询不写入资源或错误', async () => {
    const store = useSimulationStore()
    let resolve
    api.listSceneCatalog.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const pending = store.hydrate('project-1')
    store.resetForProject('project-2')
    resolve({ scenes: [{ scene_id: 'old-scene' }] })
    await pending
    expect(store.projectId).toBe('project-2')
    expect(store.sceneCatalog).toEqual([])
    expect(store.runtimeInstallations).toEqual([])
    expect(store.error).toBe('')
  })

  it('重置为新 generation 后旧 Robot 与 Sensor 响应不能覆盖当前现场', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    store.instance = { ...instance }
    store.selectedRobotId = robot.robot_id
    let resolve
    api.getRobotState.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    api.listRobotSensors.mockResolvedValueOnce({ sensors: [{ sensor_id: 'old-camera' }] })
    const pending = store.refreshSelectedRobot()
    store.instance = { ...instance, generation: 2 }
    store.robotState = { generation: 2 }
    store.sensors = [{ sensor_id: 'new-camera' }]
    resolve({ state: { generation: 1 } })
    await pending
    expect(store.robotState).toEqual({ generation: 2 })
    expect(store.sensors).toEqual([{ sensor_id: 'new-camera' }])
  })

  it('管理多 Layout、Scene Package 和发布后的 Project 目录', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    const base = {
      id: 'scene-doc-a',
      scene_id: 'scene-custom',
      layout_id: 'layout-a',
      layout_name: 'Layout A',
      name: 'Custom',
      status: 'draft',
      revision: 1,
      version: 0
    }
    store.documents = [base]
    const second = {
      ...base,
      id: 'scene-doc-b',
      layout_id: 'layout-b',
      layout_name: 'Layout B'
    }
    api.createDocumentLayout.mockResolvedValue({ document: second })
    expect(await store.createLayout(base, 'Layout B')).toEqual(second)
    expect(api.createDocumentLayout).toHaveBeenCalledWith('project-1', 'scene-doc-a', 'Layout B')
    expect(store.documents).toHaveLength(2)

    const renamed = { ...second, layout_name: 'Layout C', revision: 2 }
    api.renameDocumentLayout.mockResolvedValue({ document: renamed })
    await store.renameLayout(second, 'Layout C')
    expect(store.documents.find((item) => item.id === second.id)?.layout_name).toBe('Layout C')

    api.deleteDocumentLayout.mockResolvedValue(undefined)
    await store.deleteLayout(renamed)
    expect(store.documents.map((item) => item.id)).toEqual(['scene-doc-a'])

    const imported = {
      ...base,
      id: 'scene-doc-imported',
      scene_id: 'scene-imported',
      layout_id: 'layout-imported'
    }
    api.importScenePackage.mockResolvedValue({ documents: [imported] })
    await expect(store.importScenePackage(new Blob(['zip']))).resolves.toEqual([imported])
    expect(store.documents.some((item) => item.id === imported.id)).toBe(true)

    const packageBlob = new Blob(['scene-package'], { type: 'application/zip' })
    api.exportScenePackage.mockResolvedValue(packageBlob)
    await expect(store.exportScenePackage(base.scene_id)).resolves.toBe(packageBlob)
    expect(api.exportScenePackage).toHaveBeenCalledWith('project-1', 'scene-custom')

    const published = { ...base, status: 'published', revision: 2, version: 1 }
    const dynamicCatalog = [{ scene_id: 'scene-custom', versions: [{ version: 'published-1' }] }]
    api.publishSceneDocument.mockResolvedValue({
      document: published,
      catalog_scenes: dynamicCatalog
    })
    await expect(store.publishDocument(base)).resolves.toEqual(published)
    expect(store.sceneCatalog).toEqual(dynamicCatalog)
    expect(store.documents.find((item) => item.id === base.id)?.status).toBe('published')

    api.listSceneDocuments.mockResolvedValue({ documents: [published] })
    api.listSceneCatalog.mockResolvedValue({ scenes: dynamicCatalog })
    api.listProjectScenes.mockResolvedValue({
      project_scenes: [{ project_scene_id: 'project-scene-1' }]
    })
    await store.refreshSceneResources()
    expect(api.listSceneCatalog).toHaveBeenLastCalledWith('project-1')
    expect(store.projectScenes).toEqual([{ project_scene_id: 'project-scene-1' }])
  })

  it('只能从 Project 公共场景引用派生 Layout 草稿', async () => {
    const store = useSimulationStore()
    store.resetForProject('project-1')
    const reference = { project_scene_id: 'project-scene-public' }
    const document = {
      id: 'scene-doc-derived',
      project_id: 'project-1',
      layout_name: '布局 001 副本',
      status: 'draft',
      authoring: {
        mode: 'layout_only',
        project_scene_id: reference.project_scene_id,
        locked_nodes: ['robot-r1-pro']
      }
    }
    api.createProjectLayoutDraft.mockResolvedValue({ scene_document: document })

    await expect(
      store.createProjectLayoutDraft(reference, {
        name: '布局 001 副本',
        source_variant_id: 'layout001',
        initialization: 'copy_variant'
      })
    ).resolves.toEqual(document)

    expect(api.createProjectLayoutDraft).toHaveBeenCalledWith(
      'project-1',
      'project-scene-public',
      expect.objectContaining({ initialization: 'copy_variant' })
    )
    expect(store.documents).toEqual([document])
  })
})
