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
  <section class="scene-editor">
    <header class="editor-toolbar">
      <el-button
        size="small"
        :type="assetDrawerOpen ? 'primary' : ''"
        @click="assetDrawerOpen = !assetDrawerOpen"
      >
        素材
      </el-button>
      <el-button-group>
        <el-button
          size="small"
          :type="mode === 'translate' ? 'primary' : ''"
          @click="setMode('translate')"
        >
          移动
        </el-button>
        <el-button
          size="small"
          :type="mode === 'rotate' ? 'primary' : ''"
          @click="setMode('rotate')"
        >
          旋转
        </el-button>
        <el-button
          size="small"
          :type="mode === 'scale' ? 'primary' : ''"
          :disabled="selectedNode?.kind === 'robot' || selectedLocked"
          @click="setMode('scale')"
        >
          缩放
        </el-button>
      </el-button-group>
      <el-button size="small" :type="snapEnabled ? 'success' : ''" @click="toggleSnapping">
        {{ snapEnabled ? '吸附开启' : '自由变换' }}
      </el-button>
      <el-popover v-if="localDocument" placement="bottom" :width="320" trigger="click">
        <template #reference>
          <el-button size="small">物理设置</el-button>
        </template>
        <div class="physics-settings">
          <strong>场景物理参数</strong>
          <label>
            重力 XYZ（m/s²）
            <div class="number-row">
              <el-input-number
                v-for="(_, index) in 3"
                :key="index"
                v-model="localDocument.physics.gravity_m_s2[index]"
                :step="0.1"
                :disabled="readonly"
                @change="commitHistory"
              />
            </div>
          </label>
          <label>
            物理步长（秒）
            <el-input-number
              v-model="localDocument.physics.timestep_seconds"
              :min="0.0001"
              :max="0.1"
              :step="0.0005"
              :disabled="readonly"
              @change="commitHistory"
            />
          </label>
        </div>
      </el-popover>
      <el-button size="small" :disabled="historyIndex <= 0" @click="undo">撤销</el-button>
      <el-button size="small" :disabled="historyIndex >= history.length - 1" @click="redo">
        重做
      </el-button>
      <el-button size="small" :disabled="!selectedId" @click="groupSelected">分组</el-button>
      <el-button size="small" :disabled="!selectedId" @click="duplicateSelected">复制</el-button>
      <el-button
        size="small"
        type="danger"
        plain
        :disabled="!selectedId || selectedLocked"
        @click="deleteSelected"
      >
        删除
      </el-button>
      <span class="editor-hint">优先显示登记素材；缺少浏览器模型时使用明确的几何占位。</span>
    </header>
    <div class="editor-body">
      <aside v-if="assetDrawerOpen" class="asset-drawer">
        <header>
          <strong>添加素材</strong>
          <button type="button" aria-label="关闭素材栏" @click="assetDrawerOpen = false">×</button>
        </header>
        <el-input v-model="assetSearch" size="small" clearable placeholder="搜索名称或标签" />
        <small v-if="!assetCatalog.length" class="catalog-empty">资产目录尚未加载</small>
        <button
          v-for="asset in filteredPalette"
          :key="asset.catalog_id"
          :draggable="!readonly"
          :disabled="readonly"
          @dragstart="beginDrag(asset)"
        >
          <span :style="{ background: asset.color }" />
          <span class="asset-copy">
            <b>{{ asset.label }}</b>
            <small>{{ asset.node_kind }}{{ asset.preview_placeholder ? ' · 几何占位' : '' }}</small>
          </span>
        </button>
      </aside>
      <div ref="host" class="three-host" @dragover.prevent @drop="dropAsset">
        <div v-if="!document" class="editor-empty">请选择 Project Layout 草稿。</div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { createSceneNode } from '@/domain/simulation'
import {
  applySceneNodeMaterial,
  adaptVisualToSemanticZUp,
  fitVisualToDescriptor,
  loadVisualAsset,
  visualDescriptorForCatalogEntry
} from '@/studio/visualAssets'

const props = defineProps({
  document: { type: Object, default: null },
  assetCatalog: { type: Array, default: () => [] },
  selectedNodeId: { type: String, default: '' },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['change', 'select'])
const host = ref(null)
const localDocument = ref(null)
const selectedId = ref('')
const mode = ref('translate')
const snapEnabled = ref(true)
const history = ref([])
const historyIndex = ref(-1)
const draggedAsset = ref(null)
const assetDrawerOpen = ref(false)
const assetSearch = ref('')
const objectById = new Map()
const three = shallowRef(null)
let renderer
let scene
let camera
let orbit
let transform
let resizeObserver
let animationFrame

const primitivePalette = [
  {
    catalog_id: 'group',
    label: 'Group',
    node_kind: 'group',
    color: '#667085',
    preview_size: [0.3, 0.3, 0.3],
    default_properties: {}
  },
  {
    catalog_id: 'region',
    label: 'Region',
    node_kind: 'region',
    color: '#42a77b',
    preview_size: [1.4, 1.4, 0.05],
    default_properties: {
      model: 'target',
      category: 'region',
      size: [1.4, 1.4, 0.05],
      static: true,
      interactive: true,
      material: { rgba: [0.25, 0.75, 0.55, 0.38] },
      collision: { enabled: false }
    }
  },
  {
    catalog_id: 'camera',
    label: 'Camera',
    node_kind: 'camera',
    color: '#9f6ce0',
    preview_size: [0.35, 0.22, 0.25],
    default_properties: { sensor_kind: 'rgb', width: 640, height: 480, fps: 15, fovy: 50 }
  },
  {
    catalog_id: 'light',
    label: 'Light',
    node_kind: 'light',
    color: '#f2d36b',
    preview_size: [0.2, 0.2, 0.2],
    default_properties: {
      direction: [0, 0, -1],
      diffuse: [0.8, 0.8, 0.8],
      specular: [0.2, 0.2, 0.2],
      castshadow: true,
      active: true
    }
  }
]
const allowedAssetTags = computed(() => localDocument.value?.authoring?.allowed_asset_tags || [])
const lockedNodeIds = computed(() => new Set(localDocument.value?.authoring?.locked_nodes || []))
const selectedNode = computed(() => findNode(selectedId.value))
const selectedLocked = computed(() => lockedNodeIds.value.has(selectedId.value))
const catalogPalette = computed(() =>
  props.assetCatalog
    .filter(
      (entry) =>
        !allowedAssetTags.value.length ||
        (entry.tags || []).some((tag) => allowedAssetTags.value.includes(tag))
    )
    .map((entry) => ({
      ...entry,
      color: entry.preview?.color || '#667085',
      preview_size: entry.preview?.size || [0.5, 0.5, 0.5],
      preview_placeholder: Boolean(entry.preview?.placeholder)
    }))
)
const palette = computed(() => [...catalogPalette.value, ...primitivePalette])
const filteredPalette = computed(() => {
  const query = assetSearch.value.trim().toLowerCase()
  if (!query) return palette.value
  return palette.value.filter((item) =>
    [item.label, item.node_kind, ...(item.tags || [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  )
})

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)))
const allNodes = () => [
  ...(localDocument.value?.nodes || []),
  ...(localDocument.value?.regions || [])
]
const findNode = (id) => allNodes().find((node) => node.id === id)
const addNode = (node) => {
  const collection = node.kind === 'region' ? 'regions' : 'nodes'
  localDocument.value[collection].push(node)
}

onMounted(async () => {
  const THREE = await import('three')
  const [{ OrbitControls }, { TransformControls }] = await Promise.all([
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/controls/TransformControls.js')
  ])
  three.value = THREE
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x171c25)
  camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000)
  camera.position.set(4.5, -5.5, 3.8)
  camera.up.set(0, 0, 1)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  host.value.appendChild(renderer.domElement)
  orbit = new OrbitControls(camera, renderer.domElement)
  orbit.target.set(0, 0, 0.6)
  orbit.update()
  transform = new TransformControls(camera, renderer.domElement)
  transform.setMode(mode.value)
  applyTransformSnapping()
  transform.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value
    if (!event.value) updateSelectedTransform()
  })
  // 拖动过程持续应用地面、工作区和 Robot 自由度限制；历史只在
  // dragging-changed=false 时提交一次，避免一次拖拽生成数百条 undo。
  transform.addEventListener('objectChange', constrainSelectedObject)
  scene.add(transform.getHelper())
  scene.add(new THREE.GridHelper(20, 40, 0x566077, 0x303847).rotateX(Math.PI / 2))
  scene.add(new THREE.HemisphereLight(0xffffff, 0x263044, 2))
  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(3, -4, 8)
  scene.add(sun)
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host.value)
  rebuildScene()
  renderLoop()
})

function renderLoop() {
  animationFrame = requestAnimationFrame(renderLoop)
  renderer?.render(scene, camera)
}

function resize() {
  if (!renderer || !host.value) return
  const { clientWidth, clientHeight } = host.value
  renderer.setSize(clientWidth, clientHeight, false)
  camera.aspect = Math.max(clientWidth, 1) / Math.max(clientHeight, 1)
  camera.updateProjectionMatrix()
}

function disposeObjects() {
  transform?.detach()
  for (const object of objectById.values()) {
    object.parent?.remove(object)
    object.traverse((child) => {
      child.geometry?.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) material?.dispose()
    })
  }
  objectById.clear()
}

function updateVisualDiagnostics() {
  if (!host.value) return
  const objects = [...objectById.values()]
  host.value.dataset.visualAssetsLoaded = String(
    objects.filter((object) => object.userData.visualFallback === false).length
  )
}

function rebuildScene() {
  if (!scene || !three.value) return
  disposeObjects()
  for (const node of allNodes()) {
    const object = createObject(node)
    objectById.set(node.id, object)
  }
  for (const node of allNodes()) {
    const object = objectById.get(node.id)
    const parent = node.parent_id ? objectById.get(node.parent_id) : null
    // 节点姿态是相对父节点的局部姿态。缺失父节点时先放到根层并交给校验器报错，
    // 不能因为引用错误让节点直接从编辑器里消失。
    ;(parent || scene).add(object)
  }
  updateVisualDiagnostics()
  if (selectedId.value) selectNode(selectedId.value)
}

function styleForNode(node) {
  return (
    palette.value.find((item) => item.asset?.id === node.asset_id) ||
    palette.value.find((item) => item.node_kind === node.kind) ||
    primitivePalette[0]
  )
}

function createObject(node) {
  const THREE = three.value
  const style = styleForNode(node)
  const size = node.properties?.size || style.preview_size
  const geometry =
    node.kind === 'light'
      ? new THREE.SphereGeometry(size[0], 18, 12)
      : new THREE.BoxGeometry(...size)
  const rgba =
    node.properties?.material?.rgba || node.properties?.rgba || node.properties?.color_rgba
  const material = new THREE.MeshStandardMaterial({
    color: rgba ? new THREE.Color(rgba[0], rgba[1], rgba[2]) : style.color,
    transparent: node.kind === 'region' || Number(rgba?.[3] ?? 1) < 1,
    opacity: Number(rgba?.[3] ?? (node.kind === 'region' ? 0.38 : 1))
  })
  const object = new THREE.Mesh(geometry, material)
  object.name = node.name
  object.userData.nodeId = node.id
  object.userData.previewSize = [...size]
  object.userData.visualFallback = true
  const descriptor = visualDescriptorForCatalogEntry(style)
  void loadVisualAsset(descriptor, 'editor')
    .then((visual) => {
      if (!visual || objectById.get(node.id) !== object) return
      adaptVisualToSemanticZUp(visual)
      applySceneNodeMaterial(visual, node)
      fitVisualToDescriptor(THREE, visual, descriptor, size, {
        upAxis: 'z',
        targetSize: size,
        // SceneDocument 位姿已经表示对象中心；贴地只在创建/拖放约束中执行。
        placeAtAnchor: false
      })
      object.add(visual)
      material.visible = false
      object.userData.visualFallback = false
      updateVisualDiagnostics()
    })
    .catch(() => {
      object.userData.visualFallback = true
      updateVisualDiagnostics()
    })
  const value = node.transform || {}
  object.position.fromArray(value.position || [0, 0, 0])
  const q = value.quaternion_xyzw || [0, 0, 0, 1]
  object.quaternion.set(q[0], q[1], q[2], q[3])
  object.scale.fromArray(value.scale || [1, 1, 1])
  return object
}

function selectNode(id) {
  selectedId.value = id
  const object = objectById.get(id)
  if (object && !props.readonly && !lockedNodeIds.value.has(id)) transform?.attach(object)
  else transform?.detach()
  const node = findNode(id)
  emit('select', node || null)
}

function updateSelectedTransform() {
  if (props.readonly) return
  const object = objectById.get(selectedId.value)
  const node = findNode(selectedId.value)
  if (!object || !node) return
  constrainSelectedObject()
  node.transform = {
    position: object.position.toArray(),
    quaternion_xyzw: [
      object.quaternion.x,
      object.quaternion.y,
      object.quaternion.z,
      object.quaternion.w
    ],
    scale: object.scale.toArray()
  }
  commitHistory()
}

function setMode(value) {
  if (selectedLocked.value) return
  if (selectedNode.value?.kind === 'robot' && value === 'scale') return
  mode.value = value
  transform?.setMode(value)
}

function applyTransformSnapping() {
  if (!transform) return
  // Three.js 旋转吸附使用弧度；换算集中在编辑器边界，SceneDocument 仍保存 xyzw。
  transform.setTranslationSnap(snapEnabled.value ? 0.05 : null)
  transform.setRotationSnap(snapEnabled.value ? Math.PI / 12 : null)
  transform.setScaleSnap(snapEnabled.value ? 0.1 : null)
}

function groundZ() {
  const ground = localDocument.value?.authoring?.ground_plane
  return Number(ground?.z ?? ground?.height ?? 0)
}

function constrainSelectedObject() {
  const object = objectById.get(selectedId.value)
  const node = findNode(selectedId.value)
  if (!object || !node || lockedNodeIds.value.has(node.id)) return

  const bounds = localDocument.value?.authoring?.workspace_bounds || {}
  const minimum = bounds.min || bounds.minimum || []
  const maximum = bounds.max || bounds.maximum || []
  if (Number.isFinite(Number(minimum[0])))
    object.position.x = Math.max(object.position.x, Number(minimum[0]))
  if (Number.isFinite(Number(minimum[1])))
    object.position.y = Math.max(object.position.y, Number(minimum[1]))
  if (Number.isFinite(Number(maximum[0])))
    object.position.x = Math.min(object.position.x, Number(maximum[0]))
  if (Number.isFinite(Number(maximum[1])))
    object.position.y = Math.min(object.position.y, Number(maximum[1]))

  if (node.kind === 'robot') {
    const current = node.transform || {}
    const initialScale = current.scale || [1, 1, 1]
    object.scale.set(...initialScale)
    const euler = new three.value.Euler().setFromQuaternion(object.quaternion, 'XYZ')
    object.quaternion.setFromEuler(new three.value.Euler(0, 0, euler.z, 'XYZ'))
    object.position.z = Math.max(groundZ(), Number(current.position?.[2] ?? groundZ()))
    return
  }

  if (['object', 'region'].includes(node.kind)) {
    const size = object.userData.previewSize || [0.5, 0.5, 0.5]
    const halfHeight = Math.abs(Number(size[2] || 0) * Number(object.scale.z || 1)) / 2
    object.position.z = Math.max(object.position.z, groundZ() + halfHeight)
  }
}

function dropWorldPosition(event, previewSize, kind) {
  const defaults = {
    camera: groundZ() + 1.5,
    light: groundZ() + 3,
    group: groundZ()
  }
  const height =
    kind === 'region' ? Number(previewSize[2] || 0.05) / 2 : Number(previewSize[2] || 0.5) / 2
  const z = defaults[kind] ?? groundZ() + height
  if (!three.value || !camera || !host.value || !event) return [0, 0, z]
  const rect = host.value.getBoundingClientRect()
  const pointer = new three.value.Vector2(
    ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1
  )
  const raycaster = new three.value.Raycaster()
  raycaster.setFromCamera(pointer, camera)
  const point = new three.value.Vector3()
  const plane = new three.value.Plane(new three.value.Vector3(0, 0, 1), -groundZ())
  return raycaster.ray.intersectPlane(plane, point) ? [point.x, point.y, z] : [0, 0, z]
}

function toggleSnapping() {
  snapEnabled.value = !snapEnabled.value
  applyTransformSnapping()
}

function beginDrag(asset) {
  if (!props.readonly) draggedAsset.value = asset
}

function dropAsset(event) {
  if (props.readonly || !localDocument.value || !draggedAsset.value) return
  const catalogItem = draggedAsset.value
  const kind = catalogItem.node_kind
  const previewSize = catalogItem.preview_size
  const id = `${kind}-${Date.now().toString(36)}`
  localDocument.value.assets ||= []
  localDocument.value.nodes ||= []
  localDocument.value.regions ||= []
  if (
    catalogItem.asset &&
    !localDocument.value.assets.some((asset) => asset.id === catalogItem.asset.id)
  ) {
    localDocument.value.assets.push(clone(catalogItem.asset))
  }
  const properties = clone(catalogItem.default_properties || {})
  if (kind === 'robot') properties.robot_id = id
  addNode(
    createSceneNode({
      id,
      name: `${catalogItem.label} ${allNodes().length + 1}`,
      kind,
      assetId: catalogItem.asset?.id,
      transform: {
        position: dropWorldPosition(event, previewSize, kind),
        quaternion_xyzw: [0, 0, 0, 1],
        scale: [1, 1, 1]
      },
      properties
    })
  )
  draggedAsset.value = null
  commitHistory()
  nextTick(() => {
    rebuildScene()
    selectNode(id)
  })
}

function commitHistory() {
  const next = clone(localDocument.value)
  history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(next)
  historyIndex.value = history.value.length - 1
  emit('change', clone(next))
}

function collectDescendantIds(id, result = new Set()) {
  result.add(id)
  for (const node of allNodes()) {
    if (node.parent_id === id && !result.has(node.id)) collectDescendantIds(node.id, result)
  }
  return result
}

function deleteSelected() {
  if (props.readonly || selectedLocked.value || !localDocument.value || !selectedId.value) return
  const removed = collectDescendantIds(selectedId.value)
  localDocument.value.nodes = localDocument.value.nodes.filter((node) => !removed.has(node.id))
  localDocument.value.regions = localDocument.value.regions.filter((node) => !removed.has(node.id))
  selectedId.value = ''
  emit('select', null)
  commitHistory()
  nextTick(rebuildScene)
}

function duplicateSelected() {
  const source = props.readonly ? null : findNode(selectedId.value)
  if (!source) return
  const node = clone(source)
  node.id = `${source.kind}-${Date.now().toString(36)}`
  node.name = `${source.name} Copy`
  node.transform.position = [
    Number(node.transform.position?.[0] || 0) + 0.2,
    Number(node.transform.position?.[1] || 0) + 0.2,
    Number(node.transform.position?.[2] || 0)
  ]
  if (node.kind === 'robot') {
    node.properties = { ...node.properties, robot_id: node.id }
  }
  addNode(node)
  commitHistory()
  nextTick(() => {
    rebuildScene()
    selectNode(node.id)
  })
}

function groupSelected() {
  const source = props.readonly ? null : findNode(selectedId.value)
  if (!source) return
  const group = createSceneNode({
    id: `group-${Date.now().toString(36)}`,
    kind: 'group',
    name: `${source.name} Group`,
    parentId: source.parent_id
  })
  source.parent_id = group.id
  addNode(group)
  commitHistory()
  nextTick(() => {
    rebuildScene()
    selectNode(group.id)
  })
}

function restoreHistory(index) {
  const value = history.value[index]
  if (!value) return
  historyIndex.value = index
  localDocument.value = clone(value)
  emit('change', clone(value))
  nextTick(rebuildScene)
}

function undo() {
  if (props.readonly) return
  restoreHistory(historyIndex.value - 1)
}

function redo() {
  if (props.readonly) return
  restoreHistory(historyIndex.value + 1)
}

watch(
  () => [props.document?.id || '', Number(props.document?.revision || 0)],
  () => {
    const next = clone(props.document)
    const previousSelection = selectedId.value
    if (next) {
      next.assets ||= []
      next.nodes ||= []
      next.regions ||= []
      next.physics ||= {}
      next.physics.gravity_m_s2 ||= [0, 0, -9.81]
      next.physics.timestep_seconds ||= 0.002
    }
    localDocument.value = next
    selectedId.value = previousSelection && findNode(previousSelection) ? previousSelection : ''
    history.value = next ? [clone(next)] : []
    historyIndex.value = next ? 0 : -1
    nextTick(rebuildScene)
  },
  { immediate: true }
)

watch(
  () => props.selectedNodeId,
  (nodeId) => {
    if (!nodeId || nodeId === selectedId.value || !findNode(nodeId)) return
    selectNode(nodeId)
  }
)

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  disposeObjects()
  orbit?.dispose()
  transform?.dispose()
  renderer?.dispose()
  renderer?.domElement?.remove()
})
</script>

<style scoped lang="scss">
.scene-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 6px 9px;
  border-bottom: 1px solid var(--sf-border-light);
}

.editor-hint {
  margin-left: auto;
  color: var(--sf-text-disabled);
  font-size: 11px;
}

.physics-settings {
  display: grid;
  gap: 10px;
  color: var(--sf-text-secondary);
}

.physics-settings label {
  display: grid;
  gap: 5px;
  font-size: 12px;
}

.physics-settings :deep(.el-input-number) {
  width: 100%;
}

.editor-body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.asset-drawer {
  position: absolute;
  inset: 10px auto 10px 10px;
  z-index: 4;
  display: flex;
  width: 260px;
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--sf-border);
  border-radius: 8px;
  overflow: auto;
  background: color-mix(in srgb, var(--sf-bg-secondary) 96%, transparent);
  box-shadow: var(--sf-shadow-lg);
  flex-direction: column;
}

.asset-drawer > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.asset-drawer > header button {
  border: 0;
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  font-size: 18px;
}

.asset-drawer > button {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 42px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  text-align: left;
  cursor: grab;
}

.asset-drawer > button:hover {
  border-color: var(--sf-border);
  background: var(--sf-bg-hover);
  color: var(--sf-text-primary);
}

.asset-drawer > button > span:first-child {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 4px;
}

.asset-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.asset-copy small,
.catalog-empty {
  color: var(--sf-text-disabled);
  font-size: 10px;
}

.three-host {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #171c25;
}

.three-host :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.editor-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  z-index: 1;
  color: #9aa6b9;
  pointer-events: none;
}
</style>
