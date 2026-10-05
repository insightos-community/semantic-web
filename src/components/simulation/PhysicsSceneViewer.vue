<!--
Copyright 2026 InsightOS
SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

<template>
  <section ref="viewerRoot" class="physics-scene-viewer">
    <header class="viewer-toolbar">
      <div class="viewer-title">
        <span class="sf-status-dot" :data-status="statusTone" />
        Physics Viewer
        <small>{{ statusText }}</small>
        <small v-if="sceneOperation" role="status">{{ operationLabel }}</small>
      </div>
      <div class="viewer-actions">
        <el-select v-model="cameraChoice" size="small" style="width: 150px">
          <el-option label="自由相机" value="free" />
          <el-option
            v-for="camera in viewerScene?.cameras || []"
            :key="camera.camera_id"
            :label="camera.name"
            :value="camera.camera_id"
          />
        </el-select>
        <el-select
          v-if="variants.length > 1"
          v-model="layoutChoice"
          size="small"
          style="width: 150px"
          :disabled="!store.canControl || Boolean(sceneOperation)"
          @change="switchLayout"
        >
          <el-option
            v-for="item in variants"
            :key="item.variant_id"
            :label="item.name"
            :value="item.variant_id"
          />
        </el-select>
        <el-button
          size="small"
          :disabled="!store.canControl || Boolean(sceneOperation)"
          @click="togglePause"
        >
          {{ store.instance?.state === 'paused' ? '继续' : '暂停' }}
        </el-button>
        <el-button
          v-if="debugEnabled"
          size="small"
          :disabled="
            !store.canControl || Boolean(sceneOperation) || store.instance?.state !== 'paused'
          "
          @click="operateScene('step', { steps: 1 })"
        >
          单步
        </el-button>
        <el-button
          size="small"
          :disabled="!store.canControl || Boolean(sceneOperation)"
          :loading="sceneOperation === 'reset'"
          @click="resetScene"
        >
          重置
        </el-button>
        <el-button size="small" :disabled="!viewerScene" @click="toggleFullscreen">全屏</el-button>
        <el-button
          size="small"
          type="danger"
          plain
          :disabled="!store.instance || store.runtimeInterrupted || Boolean(sceneOperation)"
          :loading="sceneOperation === 'stop'"
          @click="stopScene"
        >
          停止场景
        </el-button>
      </div>
    </header>

    <div v-if="!store.instance" class="viewer-empty">
      场景启动后会直接加载 Runtime 导出的三维场景，不再创建图像流会话。
    </div>
    <div v-else ref="canvasHost" class="viewer-host">
      <div v-if="loading" class="viewer-overlay">正在加载场景视觉内容…</div>
      <div v-else-if="store.runtimeInterrupted" class="viewer-overlay viewer-recovery">
        <p>{{ store.recoveryDiagnostic || 'Runtime 已中断，旧场景无法继续确认。' }}</p>
        <el-button type="primary" @click="recoverRuntime"> 清理旧实例并恢复 Runtime </el-button>
      </div>
      <div v-else-if="errorMessage" class="viewer-overlay is-error">{{ errorMessage }}</div>
      <div class="viewer-hint">
        {{
          cameraChoice === 'free'
            ? '左键旋转 · 右键平移 · 滚轮缩放 · 单击选择对象'
            : '固定相机 · 切换到自由相机后可旋转、平移和缩放'
        }}
      </div>
      <div v-if="debugEnabled && viewerScene" class="viewer-stats">
        generation {{ viewerScene.generation }} · pose {{ poseSequence }} ·
        {{ Number(poseSimTime).toFixed(3) }}s · local {{ measuredFps.toFixed(0) }}fps
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import * as simulationApi from '@/api/simulation'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { useSimulationStore } from '@/stores/simulation'
import { useUiStore } from '@/stores/ui'
import { useSpatialSelectionStore } from '@/stores/spatialSelection'
import { createSimulationFrameStream } from '@/utils/simulationFrame'
import {
  applyInitialSceneView,
  attachViewerCamera,
  indexViewerScene,
  loadVisualContent
} from '@/studio/sceneVisuals'

const store = useSimulationStore()
const ui = useUiStore()
const sceneOperation = ref('')
const operationLabel = computed(
  () =>
    ({
      reset: '正在重置场景…',
      stop: '正在停止场景…',
      pause: '正在暂停…',
      resume: '正在恢复…',
      step: '正在单步运行…'
    })[sceneOperation.value] || ''
)
const layout = useLayoutStore()
const project = useProjectStore()
const session = useSessionStore()
const spatialSelection = useSpatialSelectionStore()
const viewerRoot = ref(null)
const canvasHost = ref(null)
// A descriptor is replaced only when the scene identity changes. Its node
// ordering does not need deep reactive proxies on the pose-stream hot path.
const viewerScene = shallowRef(null)
const loading = ref(false)
const errorMessage = ref('')
const streamStatus = ref('offline')
const cameraChoice = ref('free')
const layoutChoice = ref('')
const poseSequence = ref(0)
const poseSimTime = ref(0)
const measuredFps = ref(0)

let THREE
let OrbitControls
let scene
let renderer
let freeCamera
let controls
let resizeObserver
let animationFrame = 0
let lastFpsAt = 0
let lastHudAt = 0
let renderedFrames = 0
let renderDirty = true
let visualRoot
let sceneIndex = { dynamic: new Map(), bySource: new Map() }
let poseStream
let selectionBox
let selectedNodes = []
let raycaster
let pointer
let pointerStart
let backgroundTexture
let environmentTarget
let headlight
let cameraDirection
let loadEpoch = 0
const fixedCameras = new Map()

function markRenderDirty() {
  renderDirty = true
}

const debugEnabled = computed(() => project.currentProject?.mode === 'development')
const activeVersion = computed(() =>
  store.activeCatalogScene?.versions?.find((item) => item.version === store.sceneVersion)
)
const variants = computed(() => activeVersion.value?.variants || [])
const statusTone = computed(() =>
  store.runtimeInterrupted
    ? 'danger'
    : streamStatus.value === 'online'
      ? 'success'
      : errorMessage.value
        ? 'danger'
        : 'warning'
)
const statusText = computed(() => {
  if (store.runtimeInterrupted) return 'Runtime 中断'
  if (errorMessage.value) return '加载失败'
  return { offline: '离线', connecting: '连接中', online: '本地渲染', reconnecting: '重连中' }[
    streamStatus.value
  ]
})

watch(
  () => store.variantId,
  (value) => {
    layoutChoice.value = value || store.instance?.layout || ''
  },
  { immediate: true }
)

function absoluteWebSocketURL(value) {
  if (/^wss?:\/\//.test(value)) return value
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${value.startsWith('/') ? value : `/${value}`}`
}

function configureVisualEnvironment() {
  const backgroundCanvas = document.createElement('canvas')
  backgroundCanvas.width = 4
  backgroundCanvas.height = 256
  const backgroundContext = backgroundCanvas.getContext('2d')
  const backgroundGradient = backgroundContext.createLinearGradient(0, 0, 0, 256)
  backgroundGradient.addColorStop(0, '#182435')
  backgroundGradient.addColorStop(0.45, '#22364f')
  backgroundGradient.addColorStop(0.8, '#304b67')
  backgroundGradient.addColorStop(1, '#45627f')
  backgroundContext.fillStyle = backgroundGradient
  backgroundContext.fillRect(0, 0, 4, 256)
  backgroundTexture = new THREE.CanvasTexture(backgroundCanvas)
  backgroundTexture.colorSpace = THREE.SRGBColorSpace
  scene.background = backgroundTexture

  const environmentCanvas = document.createElement('canvas')
  environmentCanvas.width = 256
  environmentCanvas.height = 256
  const environmentContext = environmentCanvas.getContext('2d')
  const environmentGradient = environmentContext.createLinearGradient(0, 0, 0, 256)
  environmentGradient.addColorStop(0, '#607891')
  environmentGradient.addColorStop(0.55, '#36506b')
  environmentGradient.addColorStop(1, '#182435')
  environmentContext.fillStyle = environmentGradient
  environmentContext.fillRect(0, 0, 256, 256)
  const environmentTexture = new THREE.CanvasTexture(environmentCanvas)
  environmentTexture.mapping = THREE.EquirectangularReflectionMapping
  environmentTexture.colorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  environmentTarget = pmrem.fromEquirectangular(environmentTexture)
  scene.environment = environmentTarget.texture
  environmentTexture.dispose()
  pmrem.dispose()
}

async function initializeThree() {
  if (renderer || !canvasHost.value) return
  ;[THREE, { OrbitControls }] = await Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js')
  ])
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x101722)
  freeCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 500)
  freeCamera.position.set(4.5, 3.2, 5.5)
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = 1
  configureVisualEnvironment()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.domElement.className = 'physics-canvas'
  canvasHost.value.prepend(renderer.domElement)
  controls = new OrbitControls(freeCamera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.8, 0)
  controls.minDistance = 0.15
  controls.maxDistance = 100
  controls.screenSpacePanning = true
  raycaster = new THREE.Raycaster()
  pointer = new THREE.Vector2()
  scene.add(new THREE.AmbientLight(0x55555c, 0.28))
  const key = new THREE.DirectionalLight(0xffffff, 1)
  key.position.set(5, 9, 4)
  scene.add(key)
  headlight = new THREE.DirectionalLight(0xffffff, 0.52)
  headlight.target = new THREE.Object3D()
  cameraDirection = new THREE.Vector3()
  scene.add(headlight)
  scene.add(headlight.target)
  renderer.domElement.addEventListener('pointerdown', beginPointer)
  renderer.domElement.addEventListener('pointerup', endPointer)
  renderer.domElement.addEventListener('pointercancel', cancelPointer)
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvasHost.value)
  resize()
  lastFpsAt = performance.now()
  renderFrame(lastFpsAt)
}

function resize() {
  if (!renderer || !canvasHost.value) return
  const width = canvasHost.value.clientWidth
  const height = canvasHost.value.clientHeight
  if (!width || !height) return
  const size = renderer.getSize(new THREE.Vector2())
  if (size.x === width && size.y === height) return
  renderer.setSize(width, height, false)
  freeCamera.aspect = width / height
  freeCamera.updateProjectionMatrix()
  for (const camera of fixedCameras.values()) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  markRenderDirty()
  // setSize clears the drawing buffer. Paint within this ResizeObserver callback,
  // before the browser composites, rather than waiting for a throttled pose frame.
  drawScene()
}

function renderFrame(now) {
  animationFrame = requestAnimationFrame(renderFrame)
  controls.enabled = cameraChoice.value === 'free'
  const cameraChanged = controls.enabled ? controls.update() : false
  // 仅在收到新位姿或相机发生变化时渲染。位姿流已由 Runtime 限频，
  // 不再叠加 33.3ms 门限：它与浏览器 60Hz 刷新相位交错时，会把
  // 本可显示的新帧推迟到第三次刷新，造成额外的 20fps 阶梯。
  if (!renderDirty && !cameraChanged) return
  drawScene()
  if (selectionBox && selectedNodes.length) {
    selectionBox.box.makeEmpty()
    for (const node of selectedNodes) selectionBox.box.expandByObject(node)
  }
  renderDirty = false
  renderedFrames += 1
  if (now - lastFpsAt >= 1000) {
    measuredFps.value = (renderedFrames * 1000) / (now - lastFpsAt)
    renderedFrames = 0
    lastFpsAt = now
  }
}

function drawScene() {
  const activeCamera =
    cameraChoice.value === 'free' ? freeCamera : fixedCameras.get(cameraChoice.value)
  if (activeCamera) {
    activeCamera.getWorldDirection(cameraDirection)
    // 动态相机的 position 属于连杆局部坐标，照明必须跟随相机世界坐标。
    activeCamera.getWorldPosition(headlight.position)
    headlight.target.position.copy(headlight.position).addScaledVector(cameraDirection, 10)
    headlight.target.updateMatrixWorld()
    renderer.render(scene, activeCamera)
  }
}

function fitFreeCamera() {
  if (applyInitialSceneView(THREE, visualRoot, freeCamera, controls)) {
    markRenderDirty()
    return
  }
  const preferred = fixedCameras.get(viewerScene.value?.default_camera_id)
  if (preferred) {
    // 室内场景优先从 Runtime 提供的工作视角进入自由观察；整栋房屋的
    // 包围盒只适合全景，不能把机器人操作区缩成一个点。旧场景维持原取景。
    preferred.getWorldPosition(freeCamera.position)
    preferred.getWorldDirection(cameraDirection)
    controls.target.copy(freeCamera.position).addScaledVector(cameraDirection, 2)
    controls.update()
    markRenderDirty()
    return
  }
  // 地面可以是数百米，不能参与自动取景；否则真实对象会缩成画面中的一个点。
  const bounds = new THREE.Box3()
  for (const nodes of sceneIndex.bySource.values()) {
    for (const node of nodes) bounds.expandByObject(node)
  }
  if (bounds.isEmpty() && visualRoot) bounds.setFromObject(visualRoot)
  if (bounds.isEmpty()) return
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z)
  const verticalFov = THREE.MathUtils.degToRad(freeCamera.fov)
  const distance = Math.max((maxDimension / (2 * Math.tan(verticalFov / 2))) * 1.45, 2)
  const direction = new THREE.Vector3(1, 0.55, 1).normalize()
  controls.target.copy(center)
  freeCamera.position.copy(center).addScaledVector(direction, distance)
  freeCamera.near = Math.max(distance / 1000, 0.01)
  freeCamera.far = Math.max(distance * 100, 100)
  freeCamera.updateProjectionMatrix()
  controls.update()
  markRenderDirty()
}

function buildFixedCameras(descriptors) {
  for (const camera of fixedCameras.values()) camera.parent?.remove(camera)
  fixedCameras.clear()
  for (const descriptor of descriptors || []) {
    const camera = new THREE.PerspectiveCamera(Number(descriptor.fovy || 45), 1, 0.01, 500)
    attachViewerCamera(THREE, camera, descriptor, sceneIndex.dynamic, scene)
    fixedCameras.set(descriptor.camera_id, camera)
  }
  if (cameraChoice.value !== 'free' && !fixedCameras.has(cameraChoice.value)) {
    cameraChoice.value = 'free'
  }
  resize()
  markRenderDirty()
}

async function loadCurrentScene() {
  const instance = store.instance
  const epoch = ++loadEpoch
  errorMessage.value = ''
  poseSequence.value = 0
  if (!instance) {
    stopPoseStream()
    removeVisualRoot()
    viewerScene.value = null
    loading.value = false
    return
  }
  // Runtime 失联时，Framework 返回的 instance 只是最后一次已知状态。此时继续
  // 请求 viewer-scene 只会重复访问已经退出的进程，并把真正的恢复入口淹没在
  // connection refused 中。保留已加载的本地 GLB 供用户查看，但立即停止位姿流。
  if (store.runtimeInterrupted) {
    stopPoseStream()
    errorMessage.value = store.recoveryDiagnostic || 'Runtime 已中断，请先清理旧场景再重新启动'
    loading.value = false
    return
  }
  stopPoseStream()
  removeVisualRoot()
  viewerScene.value = null
  loading.value = true
  try {
    await nextTick()
    await initializeThree()
    const response = await simulationApi.getViewerScene(store.projectId, instance.instance_id)
    const descriptor = response.viewer_scene
    if (epoch !== loadEpoch) return
    if (Number(descriptor.generation) !== Number(instance.generation)) {
      throw new Error('Viewer Scene generation 与当前场景不一致')
    }
    const loaded = await loadVisualContent(descriptor.content_url, descriptor.scene_revision)
    if (epoch !== loadEpoch) return
    visualRoot = loaded
    scene.add(visualRoot)
    sceneIndex = indexViewerScene(visualRoot, descriptor.dynamic_node_order)
    viewerScene.value = descriptor
    // 视场角属于当前场景的初始视图，不把上个 Runtime 的取景配置带入新场景。
    freeCamera.fov = 45
    buildFixedCameras(descriptor.cameras)
    if (descriptor.default_camera_id && fixedCameras.has(descriptor.default_camera_id)) {
      cameraChoice.value = descriptor.default_camera_id
    }
    fitFreeCamera()
    updateSelection()
    markRenderDirty()
    startPoseStream(descriptor)
  } catch (error) {
    const interrupted = await store.reconcileRuntimeFailure(error)
    if (epoch === loadEpoch) {
      errorMessage.value = interrupted
        ? store.recoveryDiagnostic || 'Runtime 已中断，请先清理旧场景再重新启动'
        : error.message
      if (interrupted) stopPoseStream()
    }
  } finally {
    if (epoch === loadEpoch) loading.value = false
  }
}

function startPoseStream(descriptor) {
  stopPoseStream()
  poseStream = createSimulationFrameStream({
    url: absoluteWebSocketURL(descriptor.pose_stream_url),
    token: session.token,
    onStatus: (value) => (streamStatus.value = value),
    onError: (error) => {
      errorMessage.value = error.message
    },
    onFrame: applyPoseFrame
  })
  poseStream.connect()
}

function applyPoseFrame({ metadata, payload }) {
  if (!viewerScene.value) return
  if (
    metadata.stream !== 'scene_pose' ||
    Number(metadata.generation) !== Number(viewerScene.value.generation) ||
    metadata.scene_revision !== viewerScene.value.scene_revision
  ) {
    return
  }
  const nodeCount = Number(metadata.node_count)
  if (
    payload.byteLength !== nodeCount * 7 * 4 ||
    nodeCount !== viewerScene.value.dynamic_node_order.length
  ) {
    errorMessage.value = 'Scene Pose payload 与 Viewer Scene 节点顺序不一致'
    return
  }
  const view = new DataView(payload)
  viewerScene.value.dynamic_node_order.forEach((nodeId, index) => {
    const node = sceneIndex.dynamic.get(nodeId)
    if (!node) return
    const offset = index * 28
    node.position.set(
      view.getFloat32(offset, true),
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true)
    )
    node.quaternion.set(
      view.getFloat32(offset + 12, true),
      view.getFloat32(offset + 16, true),
      view.getFloat32(offset + 20, true),
      view.getFloat32(offset + 24, true)
    )
  })
  // Geometry still consumes every pose. Only the diagnostic text is sampled,
  // avoiding a Vue toolbar render for each incoming 30 Hz frame.
  const now = performance.now()
  if (now - lastHudAt >= 250) {
    poseSequence.value = Number(metadata.sequence)
    poseSimTime.value = Number(metadata.sim_time)
    lastHudAt = now
  }
  markRenderDirty()
}

function stopPoseStream() {
  poseStream?.close()
  poseStream = null
  streamStatus.value = 'offline'
}

function removeVisualRoot() {
  if (selectionBox) {
    scene?.remove(selectionBox)
    selectionBox.geometry?.dispose()
    selectionBox.material?.dispose()
    selectionBox = null
  }
  selectedNodes = []
  if (visualRoot) scene?.remove(visualRoot)
  visualRoot = null
  sceneIndex = { dynamic: new Map(), bySource: new Map() }
  markRenderDirty()
}

function beginPointer(event) {
  if (event.button !== 0) {
    pointerStart = null
    return
  }
  pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
}

function cancelPointer() {
  pointerStart = null
}

function endPointer(event) {
  const start = pointerStart
  pointerStart = null
  if (!start || start.pointerId !== event.pointerId || event.button !== 0) return
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return
  pickObject(event)
}

function pickObject(event) {
  if (!renderer || !visualRoot) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  )
  const activeCamera =
    cameraChoice.value === 'free' ? freeCamera : fixedCameras.get(cameraChoice.value)
  if (!activeCamera) return
  raycaster.setFromCamera(pointer, activeCamera)
  const hit = raycaster.intersectObject(visualRoot, true)[0]
  let node = hit?.object || null
  while (node && !node.userData?.source_id) node = node.parent
  selectSource(node?.userData?.source_id || '')
}

function selectSource(sourceId) {
  spatialSelection.ensureGeneration(store.projectId, store.instance?.generation)
  if (!sourceId) {
    spatialSelection.clear()
    store.selected = null
    layout.select(null)
    updateSelection()
    markRenderDirty()
    return
  }
  const object = store.sceneSnapshot?.objects?.find((item) => item.source_id === sourceId)
  const robot = store.robots.find((item) => item.robot_id === sourceId)
  if (object) {
    store.selected = { type: 'object', value: object }
    layout.select({
      resourceType: 'simulation_object',
      resourceId: sourceId,
      title: object.name || sourceId
    })
  } else if (robot) {
    store.selectedRobotId = robot.robot_id
    store.selected = { type: 'robot', value: robot }
    layout.select({
      resourceType: 'virtual_robot',
      resourceId: sourceId,
      title: robot.name || robot.robot_id
    })
  } else {
    layout.select(null)
  }
  if (object || robot) layout.revealInspector()
  void spatialSelection
    .fromViewer(store.projectId, store.instance.instance_id, store.instance.generation, sourceId)
    .then((sourceLink) => {
      if (!canvasHost.value || spatialSelection.sourceId !== sourceId) return
      if (sourceLink?.entity_id) canvasHost.value.dataset.selectedEntityId = sourceLink.entity_id
      else delete canvasHost.value.dataset.selectedEntityId
    })
  updateSelection(sourceId)
  markRenderDirty()
}

function updateSelection(explicitSourceId = '') {
  if (!scene || !THREE) return
  if (canvasHost.value) delete canvasHost.value.dataset.selectedSourceId
  selectedNodes = []
  if (selectionBox) {
    scene.remove(selectionBox)
    selectionBox.geometry?.dispose()
    selectionBox.material?.dispose()
    selectionBox = null
  }
  const sourceId = explicitSourceId || spatialSelection.sourceId
  const nodes = sceneIndex.bySource.get(sourceId)
  if (!nodes?.length) return
  selectedNodes = nodes
  if (canvasHost.value) canvasHost.value.dataset.selectedSourceId = sourceId
  const bounds = new THREE.Box3()
  for (const node of selectedNodes) bounds.expandByObject(node)
  if (bounds.isEmpty()) return
  selectionBox = new THREE.Box3Helper(bounds, 0x8b5cf6)
  selectionBox.userData.staticBounds = true
  scene.add(selectionBox)
  markRenderDirty()
}

async function recoverRuntime() {
  await ElMessageBox.confirm(
    '恢复会放弃无法确认的旧 generation、回收本地进程并重新启动 Runtime；历史 Robot 命令不会重放。',
    '恢复仿真 Runtime',
    {
      type: 'warning',
      confirmButtonText: '清理并恢复'
    }
  )
  await store.recoverInterruptedRuntime()
  errorMessage.value = ''
}

async function togglePause() {
  await operateScene(store.instance?.state === 'paused' ? 'resume' : 'pause')
}

async function operateScene(operation, payload) {
  if (sceneOperation.value) return false
  sceneOperation.value = operation
  try {
    await store.operate(operation, payload)
    if (operation === 'reset') {
      spatialSelection.clear()
      await loadCurrentScene()
      ui.notify({ type: 'success', message: '场景已重置，可开始下一轮' })
    } else if (operation === 'stop') ui.notify({ type: 'success', message: '场景已停止' })
    return true
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '场景操作失败' })
    return false
  } finally {
    sceneOperation.value = ''
  }
}

async function resetScene() {
  try {
    await ElMessageBox.confirm(
      '重置会使 generation 增加并清除当前空间选择，是否继续？',
      '重置场景',
      {
        confirmButtonText: '重置',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }
  await operateScene('reset')
}

async function stopScene() {
  try {
    await ElMessageBox.confirm(
      '停止场景会让 Robot 进入 hold 并关闭数据流，是否继续？',
      '停止场景',
      {
        confirmButtonText: '停止',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }
  await operateScene('stop')
}

async function switchLayout(value) {
  await ElMessageBox.confirm('切换 Layout 会停止当前实例并创建新实例，是否继续？', '切换 Layout')
  spatialSelection.clear()
  await store.switchVariant(value)
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) await viewerRoot.value?.requestFullscreen()
  else await document.exitFullscreen()
}

function dispose() {
  ++loadEpoch
  stopPoseStream()
  removeVisualRoot()
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  resizeObserver = null
  controls?.dispose()
  renderer?.domElement.removeEventListener('pointerdown', beginPointer)
  renderer?.domElement.removeEventListener('pointerup', endPointer)
  renderer?.domElement.removeEventListener('pointercancel', cancelPointer)
  backgroundTexture?.dispose()
  environmentTarget?.dispose()
  backgroundTexture = null
  environmentTarget = null
  headlight = null
  cameraDirection = null
  renderer?.dispose()
  fixedCameras.clear()
  renderer = null
  scene = null
  THREE = null
}

watch(
  [
    () => store.instance?.instance_id || '',
    () => store.instance?.generation || 0,
    () => store.runtimeInterrupted
  ],
  () => void loadCurrentScene()
)
watch(cameraChoice, markRenderDirty)
watch([() => spatialSelection.sourceId, () => spatialSelection.generation], () => updateSelection())
onMounted(() => void loadCurrentScene())
onBeforeUnmount(dispose)
</script>

<style scoped>
.physics-scene-viewer {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: #070b11;
  color: #e7edf8;
}
.viewer-toolbar {
  z-index: 2;
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  background: #111925;
}
.viewer-title,
.viewer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.viewer-title small {
  color: #91a0b8;
}
.viewer-host {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.viewer-host :deep(.physics-canvas) {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
.viewer-empty,
.viewer-overlay {
  display: grid;
  min-height: 220px;
  flex: 1;
  place-items: center;
  color: #91a0b8;
}
.viewer-overlay {
  position: absolute;
  z-index: 3;
  inset: 0;
  min-height: 0;
  background: rgba(7, 11, 17, 0.72);
}
.viewer-overlay.is-error {
  color: #fb7185;
}
.viewer-recovery {
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: center;
}
.viewer-recovery p {
  max-width: 560px;
}
.viewer-hint,
.viewer-stats {
  position: absolute;
  z-index: 2;
  left: 14px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(7, 11, 17, 0.72);
  color: #cbd5e1;
  pointer-events: none;
}
.viewer-hint {
  top: 12px;
}
.viewer-stats {
  bottom: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
