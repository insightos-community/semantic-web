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

import { defineStore } from 'pinia'
import * as simulationApi from '@/api/simulation'

const nowId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const hydrationRequests = new WeakMap()
const readableSceneStates = new Set(['running', 'paused'])
const terminalSceneStates = new Set(['failed', 'stopped'])
const sceneLifecycleEventTypes = new Set([
  'simulation.scene.started',
  'simulation.scene.pause',
  'simulation.scene.resume',
  'simulation.scene.step',
  'simulation.scene.reset',
  'simulation.scene.stop',
  'simulation.scene.stopped'
])
const runtimeLifecycleEventTypes = new Set([
  'simulation.runtime.ready',
  'simulation.runtime.recovered'
])
const unavailableRuntimeStates = new Set(['offline', 'unknown'])

const recoveryMessages = {
  runtime_offline: 'Runtime 当前不可连接，场景实例状态无法继续确认',
  runtime_unknown: 'Runtime 状态未知，场景实例状态无法继续确认'
}

function deriveRecovery(snapshot, runtime) {
  if (snapshot.recovery_info?.derived_state === 'interrupted') {
    return { ...snapshot.recovery_info }
  }
  const code = String(snapshot.recovery || '')
  if (code) {
    return {
      code,
      derived_state: 'interrupted',
      message: recoveryMessages[code] || 'Runtime 无法确认当前场景实例，请查看恢复诊断'
    }
  }
  const runtimeState = String(runtime?.state || '')
  const activeInstance =
    snapshot.instance && !terminalSceneStates.has(String(snapshot.instance.state || ''))
  if (activeInstance && unavailableRuntimeStates.has(runtimeState)) {
    const runtimeCode = `runtime_${runtimeState}`
    return {
      code: runtimeCode,
      derived_state: 'interrupted',
      message: recoveryMessages[runtimeCode]
    }
  }
  return null
}

export const useSimulationStore = defineStore('simulation', {
  state: () => ({
    projectId: '',
    revision: 0,
    lastSequence: 0,
    loading: false,
    connection: 'offline',
    runtime: { state: 'offline' },
    recovery: null,
    runtimePreference: {
      runtime_profile_id: '',
      preferred_runtime_installation_id: '',
      compatible_runtime_installations: []
    },
    runtimeInstallations: [],
    runtimes: [],
    runtimeProfiles: [],
    selectedRuntimeProfileId: '',
    sceneCatalog: [],
    projectScenes: [],
    catalogSceneId: '',
    sceneVersion: '',
    variantId: '',
    evaluationDescriptor: null,
    scenes: [],
    instance: null,
    robots: [],
    assetCatalog: [],
    documents: [],
    editorContext: null,
    selected: null,
    selectedRobotId: '',
    sceneSnapshot: null,
    evaluation: null,
    robotState: null,
    sensors: [],
    commands: [],
    events: [],
    validation: null,
    build: null,
    runtimeBuild: null,
    error: ''
  }),
  getters: {
    sceneTransitioning: (state) =>
      ['starting', 'resetting', 'stopping'].includes(state.instance?.state),
    sceneStartTimeoutMilliseconds: (state) => {
      const profileId = state.instance?.runtime_profile_id || state.selectedRuntimeProfileId
      const seconds = Number(
        state.runtimeProfiles.find((profile) => profile.runtime_profile_id === profileId)
          ?.scene_start_timeout_seconds
      )
      // 使用 Runtime 声明的原生加载预算，与 Server 一致；HTTP 单次查询仍短超时。
      return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 180_000
    },
    hasRuntimeProfile: (state) => Boolean(state.runtimePreference.runtime_profile_id),
    compatibleRuntimeInstallations: (state) =>
      state.runtimePreference.compatible_runtime_installations || [],
    catalogById: (state) => (sceneId) =>
      state.sceneCatalog.find((scene) => scene.scene_id === sceneId) || null,
    activeCatalogScene() {
      return this.catalogSceneId ? this.catalogById(this.catalogSceneId) : null
    },
    selectedRobot: (state) =>
      state.robots.find((robot) => robot.robot_id === state.selectedRobotId) || null,
    runtimeInterrupted: (state) =>
      Boolean(state.instance && state.recovery?.derived_state === 'interrupted'),
    instanceDisplayState() {
      if (!this.instance) return ''
      return this.runtimeInterrupted ? 'interrupted' : this.instance.state
    },
    recoveryDiagnostic: (state) => state.recovery?.message || '',
    canControl() {
      return Boolean(
        !this.runtimeInterrupted && ['running', 'paused'].includes(this.instance?.state)
      )
    },
    canCleanup() {
      return Boolean(!this.runtimeInterrupted && this.instance?.state === 'failed')
    },
    activeMotionCommands: (state) =>
      state.commands.filter((command) => ['accepted', 'running'].includes(command.status))
  },
  actions: {
    resetForProject(projectId) {
      hydrationRequests.delete(this)
      Object.assign(this, {
        projectId,
        revision: 0,
        lastSequence: 0,
        loading: false,
        connection: 'offline',
        runtime: { state: 'offline' },
        recovery: null,
        runtimePreference: {
          runtime_profile_id: '',
          preferred_runtime_installation_id: '',
          compatible_runtime_installations: []
        },
        runtimeInstallations: [],
        runtimes: [],
        runtimeProfiles: [],
        selectedRuntimeProfileId: '',
        sceneCatalog: [],
        projectScenes: [],
        catalogSceneId: '',
        sceneVersion: '',
        variantId: '',
        evaluationDescriptor: null,
        scenes: [],
        assetCatalog: [],
        instance: null,
        robots: [],
        documents: [],
        editorContext: null,
        selected: null,
        selectedRobotId: '',
        evaluation: null,
        sceneSnapshot: null,
        robotState: null,
        sensors: [],
        commands: [],
        events: [],
        validation: null,
        build: null,
        runtimeBuild: null,
        error: ''
      })
    },
    setEditorContext(document, selectedId = '') {
      if (!document) {
        this.editorContext = null
        return
      }
      this.editorContext = {
        document_id: document.id,
        readonly: document.status === 'published',
        selected_id: selectedId,
        locked_node_ids: [...(document.authoring?.locked_nodes || [])],
        nodes: [...(document.nodes || []), ...(document.regions || [])]
      }
    },
    selectEditorContextNode(nodeId) {
      if (!this.editorContext) return null
      const node = this.editorContext.nodes.find((item) => item.id === nodeId) || null
      this.editorContext.selected_id = node?.id || ''
      this.selected = node ? { type: 'editor-node', value: node } : null
      return node
    },
    clearEditorContext(documentId = '') {
      if (!documentId || this.editorContext?.document_id === documentId) this.editorContext = null
    },
    record(type, message, details = null) {
      this.events.unshift({
        id: nowId('event'),
        type,
        message,
        details,
        at: new Date().toISOString()
      })
      if (this.events.length > 500) this.events.length = 500
    },
    assertRuntimeControllable(action) {
      if (!this.runtimeInterrupted) return
      throw new Error(`Runtime 已中断，无法${action}：${this.recoveryDiagnostic}`)
    },
    async reconcileRuntimeFailure(error) {
      const unavailable = Number(error?.status || 0) === 503 || error?.code === 'SIMULATION_OFFLINE'
      if (!unavailable || !this.projectId) return false
      try {
        const response = await simulationApi.getSimulationSnapshot(this.projectId)
        this.applySnapshot(response.simulation)
        this.connection = 'stale'
        this.record('problem', this.recoveryDiagnostic || error.message, this.recovery)
        return this.runtimeInterrupted
      } catch (snapshotError) {
        this.connection = 'stale'
        this.record('problem', 'Runtime 失联后读取恢复状态失败', snapshotError.message)
        return false
      }
    },
    async hydrate(projectId) {
      if (this.projectId !== projectId) this.resetForProject(projectId)
      const request = {}
      hydrationRequests.set(this, request)
      const current = () => hydrationRequests.get(this) === request && this.projectId === projectId
      this.loading = true
      this.error = ''
      try {
        const [
          snapshotResponse,
          documentResponse,
          studioResponse,
          assetResponse,
          profileResponse,
          installationsResponse,
          preferenceResponse,
          catalogResponse,
          projectScenesResponse
        ] = await Promise.all([
          simulationApi.getSimulationSnapshot(projectId),
          simulationApi.listSceneDocuments(projectId),
          simulationApi.getProjectStudioSnapshot(projectId),
          simulationApi.listSceneAssets(projectId),
          simulationApi.listRuntimeProfiles(projectId),
          simulationApi.listRuntimeInstallations(),
          simulationApi.getProjectRuntimePreference(projectId),
          simulationApi.listSceneCatalog(projectId),
          simulationApi.listProjectScenes(projectId)
        ])
        if (!current()) return
        const sequence = Number(studioResponse.snapshot?.event_sequence || 0)
        if (sequence >= this.lastSequence) this.applySnapshot(snapshotResponse.simulation)
        this.lastSequence = Math.max(this.lastSequence, sequence)
        this.documents = documentResponse.documents || []
        this.assetCatalog = assetResponse.assets || []
        this.runtimeProfiles = profileResponse.runtime_profiles || []
        this.runtimeInstallations = installationsResponse.runtime_installations || []
        this.runtimePreference = {
          runtime_profile_id: preferenceResponse.runtime_profile_id || '',
          preferred_runtime_installation_id:
            preferenceResponse.preferred_runtime_installation_id || '',
          compatible_runtime_installations:
            preferenceResponse.compatible_runtime_installations || []
        }
        // 安装列表与 Project 快照并行读取，返回顺序不代表观测新旧。始终用
        // 快照中刚刚 Probe 得到的状态覆盖列表，避免真实在线却显示 offline。
        this.applyRuntimeInstallationObservation(snapshotResponse.simulation?.runtime_installation)
        this.sceneCatalog = catalogResponse.scenes || []
        this.projectScenes = projectScenesResponse.project_scenes || []
        if (
          !this.runtimeProfiles.some(
            (item) => item.runtime_profile_id === this.selectedRuntimeProfileId
          )
        ) {
          this.selectedRuntimeProfileId =
            this.runtimePreference.runtime_profile_id ||
            this.runtime.runtime_profile_id ||
            this.runtimeProfiles[0]?.runtime_profile_id ||
            ''
        }
        // 完整快照只负责恢复领域对象列表；Robot 状态和传感器属于当前实例的
        // 实时资源。interrupted 只表示 Framework 仍可访问、Runtime 已不可确认，
        // 此时不能根据最后一次 running/paused 状态继续读取或发送任何 Runtime 请求。
        if (
          this.instance &&
          readableSceneStates.has(this.instance.state) &&
          !this.runtimeInterrupted
        ) {
          await this.refreshRuntimeData()
        }
        if (!current()) return
        this.connection = 'online'
        if (this.runtimeInterrupted) {
          this.record('problem', this.recoveryDiagnostic, this.recovery)
        } else {
          this.record('snapshot', '仿真工作区状态已恢复')
        }
        // Project 打开只恢复资源引用。Runtime Installation 属于本机启动选择，
        // 只有用户真正启动场景时才连接或拉起，避免浏览 Project 就占用仿真资源。
      } catch (error) {
        if (!current()) return
        this.connection = 'stale'
        this.error = error.message
        this.record('error', '恢复仿真工作区失败', error.message)
        throw error
      } finally {
        if (current()) this.loading = false
      }
    },
    applySnapshot(snapshot = {}) {
      if (snapshot.project_id && snapshot.project_id !== this.projectId) return
      this.revision = Number(snapshot.revision || 0)
      this.runtimes = snapshot.runtimes || (snapshot.runtime ? [snapshot.runtime] : [])
      this.runtime = this.runtimes.find(
        (item) => item.runtime_id === snapshot.instance?.runtime_id
      ) ||
        this.runtimes.find(
          (item) => item.runtime_profile_id === snapshot.instance?.runtime_profile_id
        ) ||
        this.runtimes[0] || { state: 'offline' }
      if (this.runtime.runtime_profile_id) {
        this.selectedRuntimeProfileId = this.runtime.runtime_profile_id
      }
      this.scenes = snapshot.scenes || []
      // instance 是 Runtime 最后一次真实状态；interrupted 只保存在 recovery，
      // 不能覆盖 instance.state，否则用户无法区分“最后在运行”和“Runtime 已失联”。
      const activeInstance = snapshot.instance?.state === 'stopped' ? null : snapshot.instance
      this.instance = activeInstance || null
      // 页面刷新从 Server 快照恢复选择，不能只在本页启动场景时赋值。
      this.catalogSceneId = snapshot.catalog_scene_id || ''
      this.sceneVersion = snapshot.scene_version || ''
      this.variantId = snapshot.variant_id || activeInstance?.layout || ''
      this.evaluationDescriptor = snapshot.evaluation_descriptor || null
      this.recovery = deriveRecovery(snapshot, this.runtime)
      this.evaluation = snapshot.evaluation || null
      this.robots = snapshot.robots || []
      this.applyRuntimeInstallationObservation(snapshot.runtime_installation)
      if (this.runtimeInterrupted) {
        this.robotState = null
        this.sensors = []
        // 失联时 accepted/running 已无法确认，标为 unknown 并保留命令记录；
        // 恢复后的完整快照也不会自动重放这些命令。
        this.commands = this.commands.map((command) =>
          ['accepted', 'running'].includes(command.status)
            ? {
                ...command,
                status: 'unknown',
                interruption: {
                  code: this.recovery?.code,
                  message: this.recoveryDiagnostic
                }
              }
            : command
        )
      }
      if (!this.robots.some((robot) => robot.robot_id === this.selectedRobotId)) {
        this.selectedRobotId = this.robots[0]?.robot_id || ''
      }
    },
    applyRuntimeInstallationObservation(observation) {
      const installationId = observation?.installation_id
      if (!installationId) return
      const replace = (item) =>
        item.installation_id === installationId ? { ...item, ...observation } : item
      this.runtimeInstallations = this.runtimeInstallations.map(replace)
      if (this.runtimePreference?.compatible_runtime_installations) {
        this.runtimePreference.compatible_runtime_installations =
          this.runtimePreference.compatible_runtime_installations.map(replace)
      }
    },
    async refreshRuntimeOverview() {
      const projectId = this.projectId
      const instanceId = this.instance?.instance_id
      const generation = this.instance?.generation
      const response = await simulationApi.getSimulationSnapshot(projectId)
      if (
        this.projectId !== projectId ||
        this.instance?.instance_id !== instanceId ||
        this.instance?.generation !== generation
      )
        return null
      const snapshot = response.simulation || {}
      this.revision = Math.max(this.revision, Number(snapshot.revision || 0))
      this.runtimes = snapshot.runtimes || (snapshot.runtime ? [snapshot.runtime] : [])
      this.runtime = this.runtimes.find((item) => item.runtime_id === this.instance?.runtime_id) ||
        this.runtimes.find(
          (item) => item.runtime_profile_id === this.instance?.runtime_profile_id
        ) ||
        this.runtimes[0] || { state: 'offline' }
      if (this.runtime.runtime_profile_id) {
        this.selectedRuntimeProfileId = this.runtime.runtime_profile_id
      }
      // 场景实例由事件流和专用实例接口维护。顶层快照在场景刚创建时可能短暂
      // 尚无 instance，因此这里只接受同一实例的新状态，不能用空值擦掉刚收到
      // 的 StartScene 响应。
      if (
        snapshot.instance?.instance_id &&
        (!this.instance || snapshot.instance.instance_id === this.instance.instance_id)
      ) {
        this.instance = snapshot.instance.state === 'stopped' ? null : snapshot.instance
      }
      this.recovery = deriveRecovery(snapshot, this.runtime)
      this.applyRuntimeInstallationObservation(snapshot.runtime_installation)
      return snapshot
    },
    async applyIncremental(envelope = {}) {
      if (envelope.project_id && envelope.project_id !== this.projectId) return true
      const sequence = Number(envelope.sequence || 0)
      if (sequence > 0 && sequence <= this.lastSequence) return true
      if (sequence > 0 && this.lastSequence > 0 && sequence !== this.lastSequence + 1) {
        this.connection = 'stale'
        this.record('problem', '仿真事件存在缺口，正在重新读取完整状态', {
          expected: this.lastSequence + 1,
          received: sequence
        })
        return false
      }
      const revision = Number(envelope.revision || 0)
      const type = String(envelope.type || '')
      // SceneDocument 和 SceneInstance 共用 simulation.scene 前缀，但它们不是同一种
      // 领域对象。文档事件只能更新草稿列表，绝不能占用活动实例槽。
      if (type.startsWith('simulation.scene.document.')) {
        if (revision > 0) this.revision = Math.max(this.revision, revision)
        if (envelope.payload?.id) {
          this.replaceDocument(envelope.payload)
          if (
            this.selected?.type === 'document' &&
            this.selected.value?.id === envelope.payload.id
          ) {
            this.selected = { type: 'document', value: envelope.payload }
          }
        }
        this.record('incremental', type, envelope.payload)
        if (sequence > 0) this.lastSequence = sequence
        return true
      }
      if (runtimeLifecycleEventTypes.has(type)) {
        if (revision > 0) this.revision = Math.max(this.revision, revision)
        // ready 事件只证明 Runtime 进程已就绪；是否仍对应当前场景实例必须
        // 由同一权威快照核对。这样可同时清除旧 offline 诊断，又不会掩盖
        // instance_mismatch 等真实恢复问题。
        await this.refreshRuntimeOverview()
        this.connection = 'online'
        this.record('incremental', type, envelope.payload)
        if (sequence > 0) this.lastSequence = sequence
        return true
      }
      if (sceneLifecycleEventTypes.has(type)) {
        if (revision > 0) this.revision = Math.max(this.revision, revision)
        const operation = type.slice('simulation.scene.'.length)
        if (operation === 'stopped' || operation === 'stop') {
          this.instance = null
          this.robots = []
          this.selectedRobotId = ''
          this.sceneSnapshot = null
          this.evaluation = null
          this.sensors = []
        } else {
          this.instance = envelope.payload || this.instance
          if (operation === 'reset') {
            this.sceneSnapshot = null
            this.evaluation = null
            this.commands = []
          }
          // Runtime 的启动、重置和停止都是异步过程。starting/resetting/stopping
          // 期间快照和 Robot 接口可能尚不可用，不能因为一次 409 就把有效事件
          // 误报为“无法解析”。达到可读状态后再加载领域数据。
          if (!this.runtimeInterrupted && readableSceneStates.has(this.instance?.state)) {
            await this.refreshRuntimeData()
          }
        }
        this.record('incremental', type, envelope.payload)
        if (sequence > 0) this.lastSequence = sequence
        return true
      }
      if (type === 'simulation.scene.built') {
        if (revision > 0) this.revision = Math.max(this.revision, revision)
        await this.refreshScenes()
        this.record('incremental', type, envelope.payload)
        if (sequence > 0) this.lastSequence = sequence
        return true
      }
      // Project 内其他频道也占用连续 sequence。即使本面板不消费其内容，
      // 也必须推进游标，否则下一条仿真事件会被误判为缺口。
      if (sequence > 0) this.lastSequence = sequence
      return true
    },
    async setRuntimePreference(runtimeProfileId, preferredInstallationId = '') {
      const response = await simulationApi.setProjectRuntimePreference(
        this.projectId,
        runtimeProfileId,
        preferredInstallationId
      )
      const preference = await simulationApi.getProjectRuntimePreference(this.projectId)
      this.runtimePreference = {
        runtime_profile_id: preference.runtime_profile_id || '',
        preferred_runtime_installation_id: preference.preferred_runtime_installation_id || '',
        compatible_runtime_installations: preference.compatible_runtime_installations || []
      }
      this.selectedRuntimeProfileId = this.runtimePreference.runtime_profile_id
      this.record('runtime', 'Project Runtime Profile 已更新', this.runtimePreference)
      return response.project
    },
    async addCatalogScene(scene, versionId, variantId) {
      if (!scene?.scene_id) throw new Error('请选择目录场景')
      const response = await simulationApi.addProjectScene(this.projectId, {
        catalog_scene_id: scene.scene_id,
        scene_version: versionId,
        default_variant_id: variantId
      })
      this.projectScenes.unshift(response.project_scene)
      const preference = await simulationApi.getProjectRuntimePreference(this.projectId)
      this.runtimePreference = {
        runtime_profile_id: preference.runtime_profile_id || '',
        preferred_runtime_installation_id: preference.preferred_runtime_installation_id || '',
        compatible_runtime_installations: preference.compatible_runtime_installations || []
      }
      this.selectedRuntimeProfileId = this.runtimePreference.runtime_profile_id
      this.record(
        'scene',
        `已把 ${scene.name || scene.scene_id} 加入 Project`,
        response.project_scene
      )
      return response.project_scene
    },
    async startProjectScene(projectScene, options = {}) {
      this.assertRuntimeControllable('启动新场景')
      if (this.instance) throw new Error('请先停止当前场景')
      const response = await simulationApi.startProjectScene(
        this.projectId,
        projectScene.project_scene_id,
        {
          request_id: options.request_id || nowId('scene'),
          variant_id: options.variant_id || projectScene.default_variant_id,
          runtime_installation_id: options.runtime_installation_id || '',
          seed: Number(options.seed || 0),
          headless: options.headless !== false,
          render_backend: options.render_backend || 'egl'
        }
      )
      this.instance = response.instance
      this.catalogSceneId = projectScene.catalog_scene_id
      this.sceneVersion = projectScene.scene_version
      this.variantId = options.variant_id || projectScene.default_variant_id
      this.evaluationDescriptor =
        this.catalogById(projectScene.catalog_scene_id)?.versions?.find(
          (version) => version.version === projectScene.scene_version
        )?.evaluation || null
      // Installation 是一次 Scene 启动时解析出的运行位置，而不是 Project Scene 的
      // 固定属性。Server 会记住本次实际选择；这里立即刷新偏好，避免页面仍显示旧候选，
      // 也保证下次启动可以直接复用同一台兼容 Runtime。
      const preference = await simulationApi.getProjectRuntimePreference(this.projectId)
      this.runtimePreference = {
        runtime_profile_id: preference.runtime_profile_id || '',
        preferred_runtime_installation_id: preference.preferred_runtime_installation_id || '',
        compatible_runtime_installations: preference.compatible_runtime_installations || []
      }
      // StartScene 已经成功连接 Runtime。立即读取一次 Framework 的权威快照，
      // 不要求用户再点击“重新检查”才能把离线观测刷新为在线。
      await this.refreshRuntimeOverview()
      if (this.instance?.state === 'starting') {
        // 请求已接受，页面显示加载状态；后台观察同一实例。场景就绪前保留
        // 查看状态入口，但暂不允许重复切换 Layout，避免多个生命周期操作排队。
        this.record('scene', '场景启动请求已接受，正在加载 Runtime 与 Robot', this.instance)
        void this.observeStartedScene(this.instance.instance_id)
        return this.instance
      }
      await this.refreshRuntimeData()
      return this.instance
    },
    async observeStartedScene(instanceId) {
      try {
        await this.waitForSceneState(['running', 'paused'], {
          timeoutMilliseconds: this.sceneStartTimeoutMilliseconds
        })
        if (this.instance?.instance_id !== instanceId) return
        await this.refreshRuntimeData()
        this.record('scene', `场景已进入 ${this.instance.state}`, this.instance)
      } catch (error) {
        // 用户可能已经切换/停止实例；旧观察任务不能覆盖当前页面状态。
        if (this.instance?.instance_id !== instanceId) return
        this.error = error.message || '场景后台启动失败'
        this.record('problem', this.error, { instance_id: instanceId })
      }
    },
    async switchVariant(variantId, seed = 0) {
      if (!this.instance) throw new Error('当前没有活动场景')
      if (this.sceneTransitioning) throw new Error('场景正在加载或切换，请等待当前操作完成')
      const response = await simulationApi.switchProjectSceneVariant(
        this.projectId,
        this.instance.instance_id,
        {
          request_id: nowId('layout'),
          variant_id: variantId,
          seed: Number(seed || 0)
        }
      )
      this.instance = response.instance
      this.variantId = variantId
      this.commands = []
      await this.waitForSceneState(['running', 'paused'], {
        timeoutMilliseconds: this.sceneStartTimeoutMilliseconds
      })
      await this.refreshRuntimeData()
      return this.instance
    },
    async releaseProject() {
      const response = await simulationApi.releaseProjectRuntime(this.projectId)
      this.instance = null
      this.robots = []
      this.sensors = []
      this.runtime = { state: 'offline' }
      return response
    },
    async recoverInterruptedRuntime() {
      if (!this.instance?.instance_id || !this.runtimeInterrupted) {
        throw new Error('当前没有需要清理的中断场景')
      }
      const response = await simulationApi.recoverInterruptedRuntime(
        this.projectId,
        this.instance.instance_id
      )
      this.instance = null
      this.recovery = null
      this.robots = []
      this.selectedRobotId = ''
      this.sceneSnapshot = null
      this.evaluation = null
      this.sensors = []
      this.commands = []
      this.runtime = response.runtime
      this.connection = 'online'
      this.record('runtime', '中断场景已清理，Runtime 已重新就绪', response.runtime)
      await this.refreshScenes()
      return response.runtime
    },
    async ensureRuntime(profileId = this.selectedRuntimeProfileId) {
      if (!profileId) throw new Error('此 Project 尚未选择 Runtime Profile')
      const response = this.runtimePreference.preferred_runtime_installation_id
        ? await simulationApi.ensureProjectRuntime(this.projectId)
        : await simulationApi.ensureRuntime(this.projectId, profileId)
      this.runtime = response.runtime
      this.selectedRuntimeProfileId = response.runtime.runtime_profile_id || profileId
      this.runtimes = [
        response.runtime,
        ...this.runtimes.filter((item) => item.runtime_id !== response.runtime.runtime_id)
      ]
      this.connection = 'online'
      this.record('runtime', `Runtime ${this.selectedRuntimeProfileId} 已就绪`, response.runtime)
      // Ensure 返回 ready 后，旧快照中的 runtime_offline/recovery 仍可能留在
      // Store；立即重新核对当前实例，使文字、诊断和状态点使用同一份事实。
      await this.refreshRuntimeOverview()
      await this.refreshScenes()
      return response.runtime
    },
    async refreshScenes() {
      const response = await simulationApi.listScenes(this.projectId)
      this.scenes = response.scenes || []
      return this.scenes
    },
    async startScene(sceneKey, options) {
      this.assertRuntimeControllable('启动新场景')
      const response = await simulationApi.startScene(this.projectId, sceneKey, {
        request_id: options.request_id || nowId('scene'),
        runtime_profile_id: options.runtime_profile_id || this.selectedRuntimeProfileId,
        runtime_bundle_id: options.runtime_bundle_id || '',
        layout: options.layout,
        seed: Number(options.seed || 0),
        headless: options.headless !== false,
        render_backend: options.render_backend || 'egl'
      })
      this.instance = response.instance
      this.record('scene', `场景 ${sceneKey} 启动请求已接受`, response.instance)
      await this.waitForSceneState(['running', 'paused'])
      await this.refreshRuntimeData()
      this.record('scene', `场景 ${sceneKey} 已进入 ${this.instance.state}`, this.instance)
      return this.instance
    },
    async operate(operation, payload) {
      if (!this.instance) throw new Error('当前没有活动场景')
      if (this.instance.state === 'failed' && operation !== 'stop') {
        throw new Error('failed 场景只能执行 stop 完成资源清理')
      }
      if (!(operation === 'stop' && this.instance.state === 'failed')) {
        this.assertRuntimeControllable('执行场景操作')
      }
      let response
      try {
        response = await simulationApi.operateScene(
          this.projectId,
          this.instance.instance_id,
          operation,
          payload
        )
      } catch (error) {
        await this.reconcileRuntimeFailure(error)
        throw error
      }
      this.instance = response.instance
      let resultInstance = this.instance
      this.record('scene', `场景操作：${operation}`, response.instance)
      if (operation === 'reset') {
        this.sceneSnapshot = null
        this.evaluation = null
        this.commands = []
        // Viewer 与 generation 绑定。reset 后 Framework 和 Runtime 都会废弃旧会话，
        // 页面也必须立即移除旧 ID，等新 generation 就绪后创建新会话。
      }
      const targets = {
        pause: ['paused'],
        resume: ['running'],
        step: ['paused'],
        reset: ['running'],
        stop: ['stopped']
      }
      if (targets[operation]) await this.waitForSceneState(targets[operation])
      if (operation === 'stop' || this.instance?.state === 'stopped') {
        // stopped 实例已经进入历史，不再占用“当前活动场景”位置。保留返回值供
        // 调用方展示终态，但清空活动实例，用户无需刷新页面即可启动下一布局。
        resultInstance = this.instance
        this.instance = null
        this.robots = []
        this.selectedRobotId = ''
        this.sceneSnapshot = null
        this.evaluation = null
        this.sensors = []
      } else {
        await this.refreshRuntimeData()
      }
      return resultInstance
    },
    async waitForSceneState(
      expectedStates,
      { timeoutMilliseconds = 90_000, intervalMilliseconds = 500 } = {}
    ) {
      if (!this.instance?.instance_id) throw new Error('当前没有可等待的场景实例')
      const expected = new Set(expectedStates)
      const instanceId = this.instance.instance_id
      const deadline = Date.now() + timeoutMilliseconds
      let lastPollingError = null

      // 场景加载发生在 Runtime 后台任务中。这里查询 Framework 保存的同一实例，
      // 不直接连接 Plugin，也不在 starting 阶段访问尚未就绪的 Robot/Viewer。
      while (!expected.has(this.instance?.state)) {
        if (terminalSceneStates.has(this.instance?.state)) {
          throw new Error(
            `场景 ${instanceId} 在等待 ${[...expected].join('/')} 时进入 ${this.instance.state}`
          )
        }
        if (Date.now() >= deadline) {
          const detail = lastPollingError?.message ? `，最近错误：${lastPollingError.message}` : ''
          throw new Error(`等待场景 ${instanceId} 进入 ${[...expected].join('/')} 超时${detail}`)
        }
        await sleep(intervalMilliseconds)
        if (this.instance?.instance_id !== instanceId) return null
        try {
          const response = await simulationApi.getSceneInstance(this.projectId, instanceId)
          // 切换项目或实例后，旧轮询的迟到响应不能把旧现场恢复到页面。
          if (this.instance?.instance_id !== instanceId) return null
          this.instance = response.instance
          lastPollingError = null
        } catch (error) {
          // 原生 MuJoCo 首次加载大模型时，Runtime 进程可能暂时无法在 HTTP
          // 客户端的 15 秒窗口内返回状态。场景已经以 starting 持久化，此时
          // 单次 503/网络超时不是启动终态；继续轮询，直到 Runtime 返回明确
          // failed/stopped 或总等待窗口耗尽。其他业务错误仍立即暴露。
          if (
            this.instance?.state !== 'starting' ||
            !(error?.status === 503 || error?.code === 'NETWORK_ERROR')
          ) {
            throw error
          }
          lastPollingError = error
        }
      }
      return this.instance
    },
    async refreshRuntimeData() {
      if (!this.instance || this.runtimeInterrupted) return
      const instanceId = this.instance.instance_id
      const projectId = this.projectId
      const generation = this.instance.generation
      // 场景详情接口只返回 MuJoCo 数据，不包含 Runtime/Installation 状态。
      // 每次常规刷新先对账顶层快照，使卡片、实例文字和实际运行状态同源。
      await this.refreshRuntimeOverview()
      if (
        !this.instance ||
        this.instance.instance_id !== instanceId ||
        this.projectId !== projectId ||
        this.instance.generation !== generation ||
        this.runtimeInterrupted ||
        !readableSceneStates.has(this.instance.state)
      ) {
        return
      }
      const profile = this.runtimeProfiles.find(
        (item) => item.runtime_profile_id === this.instance.runtime_profile_id
      )
      const evaluationRequest =
        profile?.capabilities?.native_evaluator && this.evaluationDescriptor
          ? simulationApi.getSceneEvaluation(this.projectId, instanceId)
          : Promise.resolve(null)
      const [snapshotResponse, robotResponse, evaluationResponse] = await Promise.all([
        simulationApi.getSceneSnapshot(this.projectId, instanceId),
        simulationApi.listRobots(this.projectId, instanceId),
        evaluationRequest
      ])
      if (
        this.projectId !== projectId ||
        this.instance?.instance_id !== instanceId ||
        this.instance?.generation !== generation
      )
        return
      this.sceneSnapshot = snapshotResponse.snapshot
      this.evaluation = evaluationResponse?.evaluation || null
      this.robots = robotResponse.robots || []
      if (!this.selectedRobotId) this.selectedRobotId = this.robots[0]?.robot_id || ''
      if (this.selectedRobotId) await this.refreshSelectedRobot()
    },
    async syncSemanticMap() {
      if (!this.instance) throw new Error('当前没有活动场景')
      this.assertRuntimeControllable('同步 Semantic Map')
      const response = await simulationApi.syncSceneMap(this.projectId, this.instance.instance_id)
      if (response.snapshot?.generation !== this.instance.generation) {
        throw new Error('地图同步返回了旧 generation 的场景快照')
      }
      this.sceneSnapshot = response.snapshot
      this.record('map', '已在当前检查点同步 Semantic Map', {
        instance_id: this.instance.instance_id,
        generation: this.instance.generation
      })
      return response.snapshot
    },
    async refreshSelectedRobot() {
      if (!this.instance || !this.selectedRobotId || this.runtimeInterrupted) return
      const args = [this.projectId, this.instance.instance_id, this.selectedRobotId]
      const generation = this.instance.generation
      const [stateResponse, sensorResponse] = await Promise.all([
        simulationApi.getRobotState(...args),
        simulationApi.listRobotSensors(...args)
      ])
      if (
        this.projectId !== args[0] ||
        this.instance?.instance_id !== args[1] ||
        this.selectedRobotId !== args[2] ||
        this.instance?.generation !== generation
      )
        return
      this.robotState = stateResponse.state || null
      this.sensors = sensorResponse.sensors || []
    },
    async submitCommand(commandType, commandPayload, options = {}) {
      if (!this.instance || !this.selectedRobotId) throw new Error('没有可控制的 Robot')
      this.assertRuntimeControllable('发送 Robot SDK 命令')
      const payload = {
        command_id: options.command_id || nowId('sdk'),
        scene_generation: this.instance.generation,
        type: commandType,
        timeout_seconds: Number(options.timeout_seconds || 10)
      }
      if (commandType === 'joint_trajectory') payload.joint_trajectory = commandPayload
      if (commandType === 'base_trajectory') payload.base_trajectory = commandPayload
      if (commandType === 'gripper_command') payload.gripper_command = commandPayload
      const response = await simulationApi.submitRobotCommand(
        this.projectId,
        this.instance.instance_id,
        this.selectedRobotId,
        payload
      )
      const command = response.command
      this.replaceCommand(command)
      this.record('sdk', `提交 Robot SDK 命令：${commandType}`, command)
      return command
    },
    async refreshCommand(commandId) {
      if (!this.instance) throw new Error('当前没有活动场景')
      this.assertRuntimeControllable('查询 Robot SDK 命令')
      const current = this.commands.find((item) => item.command_id === commandId)
      const robotId = current?.robot_id || this.selectedRobotId
      if (!robotId) throw new Error('无法确定命令所属的 Robot')
      const response = await simulationApi.getRobotCommand(
        this.projectId,
        this.instance.instance_id,
        robotId,
        commandId
      )
      const command = response.command
      this.replaceCommand(command)
      this.record('sdk', `刷新 Robot SDK 命令：${command.status}`, command)
      return command
    },
    async stopCommand(commandId) {
      if (!this.instance) throw new Error('当前没有活动场景')
      this.assertRuntimeControllable('停止 Robot SDK 命令')
      const current = this.commands.find((item) => item.command_id === commandId)
      const robotId = current?.robot_id || this.selectedRobotId
      if (!robotId) throw new Error('无法确定命令所属的 Robot')
      const response = await simulationApi.stopRobotCommand(
        this.projectId,
        this.instance.instance_id,
        robotId,
        commandId
      )
      const command = response.command
      this.replaceCommand(command)
      this.record('sdk', '停止 Robot SDK 命令', command)
      return command
    },
    async holdRobot() {
      if (!this.instance || !this.selectedRobotId) return
      this.assertRuntimeControllable('发送 Robot hold 命令')
      const response = await simulationApi.holdRobot(
        this.projectId,
        this.instance.instance_id,
        this.selectedRobotId,
        this.instance.generation
      )
      this.replaceCommand(response.command)
      this.record('sdk', 'Robot 已进入 hold', response.command)
      return response.command
    },
    async createDocument(name) {
      const response = await simulationApi.createSceneDocument(this.projectId, name)
      this.documents.unshift(response.document)
      this.selected = { type: 'document', value: response.document }
      return response.document
    },
    async createProjectLayoutDraft(reference, payload) {
      if (!reference?.project_scene_id) throw new Error('请选择 Project 公共场景引用')
      const response = await simulationApi.createProjectLayoutDraft(
        this.projectId,
        reference.project_scene_id,
        payload
      )
      this.replaceDocument(response.scene_document)
      this.record(
        'authoring',
        payload.initialization === 'empty_layout'
          ? `已从公共模板创建空白 Layout：${response.scene_document.layout_name}`
          : `已复制官方 Layout：${response.scene_document.layout_name}`,
        response.scene_document
      )
      return response.scene_document
    },
    async saveDocument(document) {
      const response = await simulationApi.saveSceneDocument(
        this.projectId,
        document.id,
        document.revision,
        document
      )
      this.replaceDocument(response.document)
      return response.document
    },
    async applyDocumentOperations(document, operations) {
      if (!document?.id || !Array.isArray(operations) || operations.length === 0) return document
      const response = await simulationApi.applySceneOperations(
        this.projectId,
        document.id,
        document.revision,
        operations
      )
      this.replaceDocument(response.document)
      this.record('authoring', `已应用 ${operations.length} 个场景操作`, operations)
      return response.document
    },
    async validateDocument(documentId) {
      const response = await simulationApi.validateSceneDocument(this.projectId, documentId)
      this.validation = response.validation
      this.record(
        response.validation.valid ? 'validation' : 'problem',
        response.validation.valid ? '场景校验通过' : '场景校验发现问题',
        response.validation
      )
      return response.validation
    },
    async buildDocument(documentId) {
      if (!this.runtimePreference.runtime_profile_id) {
        throw new Error('此 Project 尚未选择 Runtime Profile')
      }
      if (this.runtime.state !== 'ready') await this.ensureRuntime()
      const response = await simulationApi.buildSceneDocument(this.projectId, documentId)
      this.build = response.runtime_bundle
      this.runtimeBuild = response.runtime_result
      await this.refreshScenes()
      this.record('build', '场景构建并注册完成', {
        runtime_bundle: response.runtime_bundle,
        runtime_result: response.runtime_result
      })
      return response
    },
    async refreshSceneResources() {
      const [documentResponse, catalogResponse, projectScenesResponse, preferenceResponse] =
        await Promise.all([
          simulationApi.listSceneDocuments(this.projectId),
          simulationApi.listSceneCatalog(this.projectId),
          simulationApi.listProjectScenes(this.projectId),
          simulationApi.getProjectRuntimePreference(this.projectId)
        ])
      this.documents = documentResponse.documents || []
      this.sceneCatalog = catalogResponse.scenes || projectScenesResponse.catalog_scenes || []
      this.projectScenes = projectScenesResponse.project_scenes || []
      this.runtimePreference = {
        runtime_profile_id: preferenceResponse.runtime_profile_id || '',
        preferred_runtime_installation_id:
          preferenceResponse.preferred_runtime_installation_id || '',
        compatible_runtime_installations: preferenceResponse.compatible_runtime_installations || []
      }
      return {
        documents: this.documents,
        scenes: this.sceneCatalog,
        references: this.projectScenes
      }
    },
    async createLayout(sourceDocument, name) {
      const response = await simulationApi.createDocumentLayout(
        this.projectId,
        sourceDocument.id,
        name
      )
      this.replaceDocument(response.document)
      this.record('authoring', `已创建 Layout：${response.document.layout_name}`, response.document)
      return response.document
    },
    async renameLayout(document, name) {
      const response = await simulationApi.renameDocumentLayout(
        this.projectId,
        document.id,
        document.revision,
        name
      )
      this.replaceDocument(response.document)
      return response.document
    },
    async deleteLayout(document) {
      await simulationApi.deleteDocumentLayout(this.projectId, document.id)
      this.documents = this.documents.filter((item) => item.id !== document.id)
      this.record('authoring', `已删除 Layout 草稿：${document.layout_name}`)
    },
    async importScenePackage(file) {
      const response = await simulationApi.importScenePackage(this.projectId, file)
      for (const document of response.documents || []) this.replaceDocument(document)
      this.record('authoring', 'Scene Package 已导入为 Project 草稿', {
        documents: response.documents
      })
      return response.documents || []
    },
    async exportScenePackage(sceneId) {
      return simulationApi.exportScenePackage(this.projectId, sceneId)
    },
    async publishDocument(document) {
      const response = await simulationApi.publishSceneDocument(
        this.projectId,
        document.id,
        document.revision
      )
      this.replaceDocument(response.document)
      if (response.catalog_scenes) this.sceneCatalog = response.catalog_scenes
      this.record('authoring', `场景已发布：${response.document.name}`, response.document)
      return response.document
    },
    replaceDocument(document) {
      const index = this.documents.findIndex((item) => item.id === document.id)
      if (index === -1) this.documents.unshift(document)
      else this.documents.splice(index, 1, document)
    },
    replaceCommand(command) {
      const index = this.commands.findIndex((item) => item.command_id === command.command_id)
      if (index === -1) this.commands.unshift(command)
      else this.commands.splice(index, 1, command)
    }
  }
})
