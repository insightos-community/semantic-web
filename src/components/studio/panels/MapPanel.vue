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
  <section class="map-panel" data-testid="semantic-map-panel">
    <header>
      <div>
        <span class="eyebrow">SEMANTIC MAP</span>
        <h2>{{ activeLabel }}</h2>
      </div>
      <div class="map-switch">
        <button
          v-for="item in mapKinds"
          :key="item.id"
          type="button"
          :class="{ active: map.activeMapId === item.id }"
          @click="switchMap(item.id)"
        >
          {{ item.label }}
        </button>
      </div>
      <span class="generation">
        地图版本 {{ map.activeSnapshot?.generation || '-' }} · 更新
        {{ map.activeSnapshot?.revision || '-' }}
      </span>
    </header>

    <el-alert v-if="map.error" :title="map.error" type="warning" :closable="false" show-icon />

    <div class="map-toolbar">
      <div class="selection-modes">
        <button
          v-for="item in selectionModes"
          :key="item.id"
          type="button"
          :class="{ active: mode === item.id }"
          @click="mode = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="view-modes">
        <button type="button" :class="{ active: viewMode === '2d' }" @click="setViewMode('2d')">
          2D 顶视
        </button>
        <button type="button" :class="{ active: viewMode === '3d' }" @click="setViewMode('3d')">
          正向 3D
        </button>
      </div>
      <span v-if="map.selectionPurpose" class="selection-purpose">
        正在为 Interaction 选择；地图版本变化后需要重选
      </span>
      <span v-if="placingDraft" class="selection-purpose">请在地图上点击新标注的位置</span>
      <div class="toolbar-spacer" />
      <el-button size="small" type="primary" plain @click="newEntity('entity')">新增物品</el-button>
      <el-button size="small" @click="newEntity('region')">新增区域</el-button>
      <el-button size="small" @click="openRelationEditor">新增关系</el-button>
      <el-dropdown trigger="click" @command="handleMapCommand">
        <el-button size="small" plain>地图版本 ···</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="new-generation">开始新地图版本</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="map-workspace">
      <aside class="map-tree">
        <div class="tree-heading">
          <b>实体与区域</b><span>{{ activeEntities.length }}</span>
        </div>
        <button
          v-for="entity in activeEntities"
          :key="entity.id"
          type="button"
          :data-entity-id="entity.id"
          :class="{ active: selectedEntity?.id === entity.id }"
          @click="selectEntity(entity)"
        >
          <i :data-kind="entity.geometry?.kind" />
          <span
            ><b>{{ entity.name || entity.id }}</b
            ><small>{{ entity.type }} · {{ entity.status }}</small></span
          >
        </button>
        <div v-if="!activeEntities.length" class="empty">当前地图版本没有实体</div>
        <div class="tree-heading relation-heading">
          <b>关系</b><span>{{ map.relations.length }}</span>
        </div>
        <button
          v-for="relation in map.relations"
          :key="relation.id"
          type="button"
          class="relation-row"
          @click="editRelation(relation)"
        >
          <span>{{ entityName(relation.subject_id) }}</span>
          <b>{{ relation.predicate }}</b>
          <span>{{ entityName(relation.object_id) }}</span>
        </button>
      </aside>

      <main class="viewport">
        <div
          ref="canvasHost"
          class="three-host"
          @pointerdown="beginCanvasPointer"
          @pointerup="endCanvasPointer"
          @pointercancel="cancelCanvasPointer"
        />
        <el-tooltip
          content="将相机和焦点恢复到地图原点"
          effect="dark"
          :show-after="500"
          placement="left"
        >
          <button class="reset-view" type="button" @click="resetView">回到原点</button>
        </el-tooltip>
        <div class="orientation-ruler" aria-label="地图方向尺">
          <span class="axis-y">+Y / 北</span>
          <span class="axis-x">+X / 东</span>
          <i />
          <small>Z ↑</small>
        </div>
        <div v-if="map.loading" class="viewport-state">正在加载地图…</div>
        <div class="viewport-hint">
          {{ modeHint }}
        </div>
      </main>
    </div>

    <el-dialog
      v-model="showEntityEditor"
      :title="entityEditorTitle"
      width="520px"
      destroy-on-close
      @closed="onEntityEditorClosed"
    >
      <el-alert title="所有坐标和尺寸均使用米。" type="info" :closable="false" show-icon />
      <el-form v-if="editingEntity" class="entity-form" label-position="top">
        <el-form-item label="名称" required>
          <el-input v-model="editingEntity.name" placeholder="例如：待搬运纸箱、放置区域 A" />
          <small>用于列表、计划和 Interaction 中识别这个对象。</small>
        </el-form-item>
        <el-form-item :label="entityKind === 'region' ? '区域用途' : '物品类别'" required>
          <el-select
            v-if="entityKind === 'entity'"
            v-model="editingEntity.type"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入类别"
          >
            <el-option label="普通物品" value="object" />
            <el-option label="容器" value="container" />
            <el-option label="托盘" value="pallet" />
            <el-option label="设备" value="equipment" />
          </el-select>
          <el-input
            v-else
            v-model="editingEntity.properties.purpose"
            placeholder="例如：拣选区、放置区、禁入区"
          />
          <small>这是可被地图查询和计划引用的语义分类，不是引擎对象 ID。</small>
        </el-form-item>
        <el-form-item label="位置" required>
          <div class="position-row">
            <el-input-number v-model="editingEntity.pose.position.x" :step="0.1" />
            <el-input-number v-model="editingEntity.pose.position.y" :step="0.1" />
            <el-input-number v-model="editingEntity.pose.position.z" :step="0.1" />
            <el-button @click="choosePositionOnMap">在地图点选</el-button>
          </div>
          <small
            >X / Y / Z，相对于 {{ editingEntity.frame_id }} 坐标系；也可以返回地图点击位置。</small
          >
        </el-form-item>
        <el-form-item label="外形与尺寸" required>
          <el-select v-if="entityKind === 'entity'" v-model="editingEntity.geometry.kind">
            <el-option label="长方体" value="box" />
            <el-option label="圆柱体" value="cylinder" />
            <el-option label="平面" value="plane" />
          </el-select>
          <span v-else class="fixed-kind">区域（半透明平面）</span>
          <div class="size-row">
            <label v-for="axis in ['x', 'y', 'z']" :key="'size-' + axis">
              <span>{{ axis === 'x' ? '宽 X' : axis === 'y' ? '深 Y' : '高 Z' }}</span>
              <el-input-number
                v-model="editingEntity.geometry.size[axis]"
                :min="0.01"
                :step="0.1"
              />
            </label>
          </div>
          <small>创建后会按这里的形状、尺寸和位置显示在 2D/3D 地图中。</small>
        </el-form-item>
        <el-form-item label="标签（可选）">
          <el-input v-model="editingLabels" placeholder="多个标签用逗号分隔，例如 qa, fragile" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeEntityEditor">取消</el-button>
        <el-button
          type="primary"
          :loading="map.saving"
          :disabled="!entityValid"
          @click="saveEntity"
        >
          {{ editingEntity?.id ? '保存修改' : '创建并显示在地图' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showRelationEditor"
      :title="editingRelationId ? '编辑人工关系' : '新增人工关系'"
      width="420px"
    >
      <el-form label-position="top">
        <el-form-item label="主体">
          <el-select v-model="relationDraft.subject_id">
            <el-option
              v-for="entity in activeEntities"
              :key="entity.id"
              :label="entity.name || entity.id"
              :value="entity.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="关系">
          <el-input
            v-model="relationDraft.predicate"
            placeholder="例如 on / inside / adjacent_to"
          />
        </el-form-item>
        <el-form-item label="目标">
          <el-select v-model="relationDraft.object_id">
            <el-option
              v-for="entity in activeEntities"
              :key="entity.id"
              :label="entity.name || entity.id"
              :value="entity.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="editingRelationId" type="danger" plain @click="removeRelation">
          移除关系
        </el-button>
        <el-button @click="closeRelationEditor">取消</el-button>
        <el-button type="primary" :disabled="!relationValid" @click="saveRelation">
          保存关系
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import * as simulationApi from '@/api/simulation'
import { useLayoutStore } from '@/stores/layout'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useSimulationStore } from '@/stores/simulation'
import { useSpatialSelectionStore } from '@/stores/spatialSelection'
import { useUiStore } from '@/stores/ui'
import { mapGroundPointToWorld, worldPositionToMapScene } from '@/studio/mapCoordinates'
import { createRenderLoop, disposeThreeLifecycle } from '@/studio/threeLifecycle'
import { applyMapNavigationPreset } from '@/studio/mapNavigation'
import {
  applyInitialSceneView,
  indexViewerScene,
  loadVisualContent,
  mapSourceReferenceMatrix
} from '@/studio/sceneVisuals'
import {
  fitVisualToDescriptor,
  loadVisualAsset,
  resolveVisualDescriptor
} from '@/studio/visualAssets'

const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const map = useSemanticMapStore()
const simulation = useSimulationStore()
const spatialSelection = useSpatialSelectionStore()
const layout = useLayoutStore()
const ui = useUiStore()
const canvasHost = ref(null)
const mode = ref(props.panelParams.viewMode === 'select' ? 'entity' : 'inspect')
const viewMode = ref('2d')
const editingEntity = ref(null)
const showEntityEditor = ref(false)
const entityKind = ref('entity')
const placingDraft = ref(false)
const showRelationEditor = ref(false)
const relationDraft = reactive({ subject_id: '', predicate: '', object_id: '' })
const editingRelationId = ref('')
const editingLabels = ref('')
let three = null
let scene = null
let camera = null
let renderer = null
let MapControls = null
let controls = null
let raycaster = null
let pointer = null
let ground = null
let selectionOutline = null
let hasManualNavigation = false
let renderLoop = null
let resizeObserver = null
let canvasPointerStart = null
const entityObjects = new Map()
let runtimeVisualRoot = null
let visualLoadEpoch = 0

const jsonCopy = (value) => JSON.parse(JSON.stringify(value))

const mapKinds = [
  { id: 'simulation_map', label: 'Simulation Map' },
  { id: 'real_map', label: 'Real Map' }
]
const selectionModes = [
  { id: 'inspect', label: '查看' },
  { id: 'entity', label: '选实体' },
  { id: 'point', label: '选点' },
  { id: 'region', label: '选区域' }
]
const activeLabel = computed(
  () => mapKinds.find((item) => item.id === map.activeMapId)?.label || map.activeMapId
)
const activeEntities = computed(() => map.entities.filter((item) => item.status !== 'removed'))
const selectedEntity = computed(() =>
  ['entity', 'region'].includes(map.selection?.kind)
    ? map.entityById(map.selection.entity_id)
    : null
)
const relationValid = computed(
  () =>
    relationDraft.subject_id &&
    relationDraft.object_id &&
    relationDraft.predicate.trim() &&
    relationDraft.subject_id !== relationDraft.object_id
)
const entityEditorTitle = computed(() => {
  if (editingEntity.value?.id) return entityKind.value === 'region' ? '编辑区域' : '编辑物品'
  return entityKind.value === 'region' ? '新增区域' : '新增物品'
})
const entityValid = computed(() => {
  const value = editingEntity.value
  if (!value?.name?.trim()) return false
  if (entityKind.value === 'region' && !value.properties?.purpose?.trim()) return false
  if (entityKind.value === 'entity' && !value.type?.trim()) return false
  return ['x', 'y', 'z'].every(
    (axis) =>
      Number.isFinite(Number(value.pose?.position?.[axis])) &&
      Number(value.geometry?.size?.[axis]) > 0
  )
})
const modeHint = computed(
  () =>
    ({
      inspect:
        viewMode.value === '3d'
          ? '拖拽平移 · Ctrl+拖拽或右键拖拽旋转 · 滚轮缩放 · 点击物品后在 Inspector 查看详情'
          : '拖拽平移 · 滚轮缩放 · 点击物品后在右侧 Inspector 查看详情',
      entity: '拖动调整视角；单击实体或左侧列表进行选择',
      point: '拖动调整视角；单击地面选择一个点',
      region: '拖动调整视角；单击一个已保存的区域进行选择'
    })[mode.value]
)

function entityName(entityId) {
  return map.entityById(entityId)?.name || entityId
}
async function switchMap(mapId) {
  try {
    await map.switchMap(mapId)
    layout.select({ resourceType: 'semantic_map', resourceId: mapId, title: activeLabel.value })
    await nextTick()
    rebuildScene()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message })
  }
}
async function selectEntity(entity) {
  const kind = entity.geometry?.kind === 'region' ? 'region' : 'entity'
  map.select({ kind, entity_id: entity.id })
  layout.select({ resourceType: 'map_entity', resourceId: entity.id, title: entity.name })
  layout.revealInspector()
  if (map.activeMapId !== 'simulation_map' || !simulation.instance) {
    return
  }
  try {
    await spatialSelection.fromMap(
      simulation.projectId,
      simulation.instance.instance_id,
      simulation.instance.generation,
      entity.id
    )
  } catch (error) {
    simulation.record('problem', 'Semantic Map 联动 Viewer 失败', error.message)
  }
}
function emptyEntity(kind = 'entity') {
  return {
    id: '',
    name: '',
    type: kind === 'region' ? 'region' : 'object',
    status: 'active',
    frame_id: map.activeSnapshot?.frame_id || 'world',
    pose: {
      position: { x: 0, y: 0, z: 0.2 },
      orientation: { x: 0, y: 0, z: 0, w: 1 }
    },
    geometry: {
      kind: kind === 'region' ? 'region' : 'box',
      size: kind === 'region' ? { x: 1.2, y: 1.2, z: 0.03 } : { x: 0.4, y: 0.4, z: 0.4 }
    },
    properties: { purpose: '' }
  }
}
function newEntity(kind) {
  entityKind.value = kind
  editingEntity.value = emptyEntity(kind)
  editingLabels.value = ''
  showEntityEditor.value = true
}
function closeEntityEditor() {
  placingDraft.value = false
  showEntityEditor.value = false
}
function onEntityEditorClosed() {
  if (!placingDraft.value) editingEntity.value = null
}
function choosePositionOnMap() {
  if (!editingEntity.value) return
  placingDraft.value = true
  mode.value = 'point'
  showEntityEditor.value = false
  ui.notify({ type: 'info', message: '请在地图上点击物品或区域的中心位置' })
}
async function saveEntity() {
  if (!entityValid.value) return
  const entity = jsonCopy(editingEntity.value)
  entity.properties ||= {}
  entity.properties.labels = editingLabels.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!entity.id) entity.id = 'entity-user-' + Date.now()
  try {
    await map.submitUpdate([{ op: 'upsert_entity', entity }])
    placingDraft.value = false
    showEntityEditor.value = false
    selectEntity(map.entityById(entity.id) || entity)
  } catch (error) {
    ui.notify({ type: 'error', message: map.error || error.message })
  }
}
function closeRelationEditor() {
  showRelationEditor.value = false
  editingRelationId.value = ''
  Object.assign(relationDraft, { subject_id: '', predicate: '', object_id: '' })
}
function openRelationEditor() {
  editingRelationId.value = ''
  Object.assign(relationDraft, { subject_id: '', predicate: '', object_id: '' })
  showRelationEditor.value = true
}
function editRelation(relation) {
  editingRelationId.value = relation.id
  Object.assign(relationDraft, {
    subject_id: relation.subject_id,
    predicate: relation.predicate,
    object_id: relation.object_id
  })
  showRelationEditor.value = true
}
async function saveRelation() {
  try {
    await map.submitUpdate([
      {
        op: 'upsert_relation',
        relation: {
          id: editingRelationId.value || 'relation-user-' + Date.now(),
          ...relationDraft,
          source: 'user'
        }
      }
    ])
    closeRelationEditor()
  } catch (error) {
    ui.notify({ type: 'error', message: map.error || error.message })
  }
}
async function removeRelation() {
  if (!editingRelationId.value) return
  try {
    await map.submitUpdate([{ op: 'remove_relation', relation_id: editingRelationId.value }])
    closeRelationEditor()
  } catch (error) {
    ui.notify({ type: 'error', message: map.error || error.message })
  }
}
async function resetGeneration() {
  try {
    const { value } = await ElMessageBox.prompt(
      '仅在场景 reset、整体换场或坐标原点变化时使用。当前地图版本会保留为只读历史，已有计划和地图选择将失效。请输入原因继续。',
      '开始新地图版本',
      {
        type: 'warning',
        inputPlaceholder: '例如：仿真场景 reset 并重新生成坐标原点',
        confirmButtonText: '开始新版本',
        cancelButtonText: '取消',
        inputValidator: (input) => Boolean(String(input || '').trim()) || '请填写版本变化原因'
      }
    )
    await map.newGeneration(value)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ui.notify({ type: 'error', message: error.message || '创建地图版本失败' })
    }
  }
}
function handleMapCommand(command) {
  if (command === 'new-generation') resetGeneration()
}

async function initThree() {
  if (!canvasHost.value) return
  ;[three, { MapControls }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/MapControls.js')
  ])
  scene = new three.Scene()
  scene.background = new three.Color(0xf6f7fb)
  setViewMode(viewMode.value)
  renderer = new three.WebGLRenderer({ antialias: true })
  renderer.outputColorSpace = three.SRGBColorSpace
  renderer.toneMapping = three.ACESFilmicToneMapping
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  canvasHost.value.appendChild(renderer.domElement)
  configureControls()
  raycaster = new three.Raycaster()
  pointer = new three.Vector2()
  ground = new three.Mesh(
    new three.PlaneGeometry(30, 30),
    new three.MeshBasicMaterial({ visible: false, side: three.DoubleSide })
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  scene.add(new three.GridHelper(20, 20, 0x9aa6bd, 0xd9ddea))
  const axes = new three.AxesHelper(1.2)
  axes.position.set(0, 0.025, 0)
  scene.add(axes)
  const ambient = new three.HemisphereLight(0xffffff, 0x667085, 1.05)
  scene.add(ambient)
  const directional = new three.DirectionalLight(0xffffff, 1.35)
  directional.position.set(4, 8, 5)
  scene.add(directional)
  resizeThree()
  rebuildScene()
  renderLoop = createRenderLoop(() => {
    controls?.update()
    renderer?.render(scene, camera)
  })
  renderLoop.start()
  resizeObserver = new ResizeObserver(resizeThree)
  resizeObserver.observe(canvasHost.value)
}
function defaultMapTarget(mode = viewMode.value) {
  return mode === '2d' ? new three.Vector3(0, 0, 0) : new three.Vector3(0, 0.8, 0)
}
hasManualNavigation = false

function setViewMode(nextMode) {
  viewMode.value = nextMode
  hasManualNavigation = false
  if (!three) return
  if (nextMode === '2d') {
    camera = new three.OrthographicCamera(-6, 6, 6, -6, 0.1, 100)
    camera.position.set(0, 12, 0.001)
    camera.up.set(0, 0, -1)
  } else {
    camera = new three.PerspectiveCamera(48, 1, 0.1, 100)
    // 默认从一个水平基准方向观察，不再用俯视斜角干扰左右和朝向判断。
    // 用户仍可平移、旋转和缩放。
    camera.position.set(0, 1.6, 8)
    camera.up.set(0, 1, 0)
  }
  requestAnimationFrame(() => fitViewToEntities(true))
  camera.lookAt(defaultMapTarget(nextMode))
  configureControls()
  resizeThree()
}
function configureControls() {
  if (!MapControls || !renderer || !camera) return
  controls?.dispose()
  controls = new MapControls(camera, renderer.domElement)
  controls.addEventListener('start', () => {
    hasManualNavigation = true
  })
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  // MapControls 的地图语义与 2D 保持一致：左键平移，Ctrl/Meta/Shift+左键
  // 或右键旋转；2D 关闭旋转时让右键也平移。
  applyMapNavigationPreset(controls, three, viewMode.value)
  controls.minDistance = 1
  controls.maxDistance = 45
  controls.minZoom = 0.25
  controls.maxZoom = 8
  controls.target.copy(defaultMapTarget())
  controls.update()
  controls.saveState()
}
function resetView() {
  if (!camera || !controls) return
  hasManualNavigation = false
  if (!fitViewToEntities(true)) {
    controls.reset()
    controls.target.copy(defaultMapTarget())
    controls.update()
  }
}
function fitViewToEntities(force = false) {
  if (!three || !camera || !controls || (!force && hasManualNavigation)) return false
  if (applyInitialSceneView(three, runtimeVisualRoot, camera, controls)) {
    controls.saveState()
    return true
  }
  const bounds = new three.Box3()
  let hasContent = false
  for (const object of entityObjects.values()) {
    if (!object?.visible) continue
    object.updateWorldMatrix(true, true)
    const objectBounds = new three.Box3().setFromObject(object)
    if (objectBounds.isEmpty()) continue
    bounds.union(objectBounds)
    hasContent = true
  }
  if (!hasContent || bounds.isEmpty()) return false
  const center = bounds.getCenter(new three.Vector3())
  const size = bounds.getSize(new three.Vector3())
  controls.target.copy(center)
  if (camera.isOrthographicCamera) {
    const span = Math.max(size.x, size.z, 1) * 0.65
    const aspect = Math.max(
      0.1,
      (canvasHost.value?.clientWidth || 1) / (canvasHost.value?.clientHeight || 1)
    )
    camera.left = -span * aspect
    camera.right = span * aspect
    camera.top = span
    camera.bottom = -span
    camera.position.set(center.x, center.y + Math.max(size.y, 1) * 3, center.z + 0.001)
    camera.up.set(0, 0, -1)
  } else {
    const verticalFov = three.MathUtils.degToRad(camera.fov)
    const aspect = Math.max(0.1, camera.aspect || 1)
    const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2))
    const distanceForWidth = size.x / (2 * Math.tan(verticalFov / 2) * aspect)
    const distance = Math.max(distanceForHeight, distanceForWidth, 1) * 1.3 + size.z / 2
    // Three.js +Z 对应 Semantic/MuJoCo -Y，从场景正面水平观察。
    camera.position.set(center.x, center.y, center.z + distance)
    camera.up.set(0, 1, 0)
    camera.near = Math.max(0.01, distance / 1000)
    camera.far = Math.max(100, distance * 10)
  }
  camera.lookAt(center)
  camera.updateProjectionMatrix()
  controls.update()
  controls.saveState()
  return true
}
function resizeThree() {
  if (!renderer || !camera || !canvasHost.value) return
  const width = Math.max(1, canvasHost.value.clientWidth)
  const height = Math.max(1, canvasHost.value.clientHeight)
  renderer.setSize(width, height, false)
  const aspect = width / height
  if (camera.isOrthographicCamera) {
    camera.left = -6 * aspect
    camera.right = 6 * aspect
    camera.top = 6
    camera.bottom = -6
  } else {
    camera.aspect = aspect
  }
  camera.updateProjectionMatrix()
}
function geometryFor(entity) {
  const size = entity.geometry?.size || { x: 0.4, y: 0.4, z: 0.4 }
  if (entity.geometry?.kind === 'cylinder') {
    return new three.CylinderGeometry(size.x / 2, size.x / 2, size.z, 24)
  }
  if (entity.geometry?.kind === 'plane' || entity.geometry?.kind === 'region') {
    return new three.BoxGeometry(size.x, Math.max(size.z, 0.02), size.y)
  }
  return new three.BoxGeometry(size.x, size.z, size.y)
}
function toThreePosition(position = {}) {
  return new three.Vector3(...worldPositionToMapScene(position))
}
function toThreeQuaternion(orientation = {}) {
  const source = new three.Quaternion(
    Number(orientation.x || 0),
    Number(orientation.y || 0),
    Number(orientation.z || 0),
    Number(orientation.w ?? 1)
  ).normalize()
  const basis = new three.Quaternion().setFromAxisAngle(new three.Vector3(1, 0, 0), -Math.PI / 2)
  return basis.clone().multiply(source).multiply(basis.clone().invert())
}
function updateVisualDiagnostics() {
  if (!canvasHost.value) return
  const objects = [...entityObjects.values()]
  canvasHost.value.dataset.visualAssetsLoaded = String(
    objects.filter((object) => object.userData.visualFallback === false).length
  )
}
function clearSelectionOutline() {
  if (canvasHost.value) delete canvasHost.value.dataset.selectedEntityId
  if (!selectionOutline || !scene) return
  scene.remove(selectionOutline)
  selectionOutline.geometry?.dispose()
  selectionOutline.material?.dispose()
  selectionOutline = null
}
function updateSelectionOutline() {
  clearSelectionOutline()
  const entityId = selectedEntity.value?.id || spatialSelection.entityId
  const object = entityId ? entityObjects.get(entityId) : null
  if (!object || !scene || !three) return
  object.updateWorldMatrix(true, true)
  selectionOutline = new three.BoxHelper(object, 0xffa928)
  selectionOutline.material.depthTest = false
  selectionOutline.material.transparent = true
  selectionOutline.material.opacity = 0.96
  selectionOutline.renderOrder = 1000
  scene.add(selectionOutline)
  if (canvasHost.value) canvasHost.value.dataset.selectedEntityId = entityId
}
function rebuildScene() {
  if (!scene || !three) return
  const epoch = ++visualLoadEpoch
  clearSelectionOutline()
  if (runtimeVisualRoot) {
    scene.remove(runtimeVisualRoot)
    runtimeVisualRoot = null
    entityObjects.clear()
  } else {
    for (const object of entityObjects.values()) {
      scene.remove(object)
      object.traverse((child) => {
        // 视觉 GLB 的几何缓存在多个视图间共享，只释放本视图独有的占位根几何。
        // 克隆材质则属于当前实例，仍应及时释放。
        if (child === object) child.geometry?.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) material?.dispose()
      })
    }
    entityObjects.clear()
  }
  for (const entity of activeEntities.value) {
    const color = entity.geometry?.kind === 'region' ? 0x6f7ee8 : 0x3d6bd9
    const mesh = new three.Mesh(
      geometryFor(entity),
      new three.MeshStandardMaterial({
        color,
        transparent: entity.geometry?.kind === 'region',
        opacity: entity.geometry?.kind === 'region' ? 0.35 : 1
      })
    )
    const position = entity.pose?.position || {}
    mesh.position.copy(toThreePosition(position))
    mesh.quaternion.copy(toThreeQuaternion(entity.pose?.orientation))
    mesh.userData.entityId = entity.id
    mesh.userData.visualFallback = true
    scene.add(mesh)
    entityObjects.set(entity.id, mesh)
    const fallback = simulation.assetCatalog.find(
      (entry) =>
        entry.catalog_id === entity.type ||
        entry.asset?.metadata?.model === entity.type ||
        entry.asset?.metadata?.category === entity.type
    )
    const descriptor = resolveVisualDescriptor(
      simulation.assetCatalog,
      entity.visual_ref || entity.properties?.visual_ref,
      fallback
    )
    const size = entity.geometry?.size || { x: 0.4, y: 0.4, z: 0.4 }
    void loadVisualAsset(descriptor, 'map')
      .then((visual) => {
        if (!visual || entityObjects.get(entity.id) !== mesh) return
        fitVisualToDescriptor(three, visual, descriptor, [size.x, size.y, size.z], {
          targetSize: [size.x, size.y, size.z],
          // 地图 Entity 位姿来自 Runtime 中心位姿，不能再次按底面偏移。
          placeAtAnchor: false,
          centerAtOrigin: Boolean(entity.bounds?.size)
        })
        mesh.add(visual)
        mesh.material.visible = false
        visual.updateWorldMatrix(true, true)
        mesh.userData.visualFallback = false
        updateVisualDiagnostics()
        updateSelectionOutline()
      })
      .catch(() => {
        // Runtime 离线或视觉制品缺失时保留明确占位，不产生未处理 Promise。
        mesh.material.visible = true
        mesh.userData.visualFallback = true
        updateVisualDiagnostics()
      })
  }
  updateSelectionOutline()
  requestAnimationFrame(() => fitViewToEntities(false))
  void loadRuntimeSceneVisual(epoch)
}
function sourceIdForEntity(entity) {
  return String(entity.properties?.source_id || '')
}

function disposeFallbackObject(object) {
  scene.remove(object)
  object.traverse((child) => {
    if (child === object) child.geometry?.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) material?.dispose()
  })
}

function semanticPoseMatrix(entity) {
  const position = entity.pose?.position || {}
  const orientation = entity.pose?.orientation || {}
  return new three.Matrix4().compose(
    new three.Vector3(Number(position.x || 0), Number(position.y || 0), Number(position.z || 0)),
    new three.Quaternion(
      Number(orientation.x || 0),
      Number(orientation.y || 0),
      Number(orientation.z || 0),
      Number(orientation.w ?? 1)
    ).normalize(),
    new three.Vector3(1, 1, 1)
  )
}

/**
 * 活动仿真地图直接复用 Physics Viewer 的完整场景 GLB。
 *
 * GLB 的 semantic-z-up-root 是唯一坐标转换点；Entity Group 位于该根节点下，
 * 所以这里使用 Runtime 原始 xyz/xyzw 计算位姿增量，禁止再次交换 Y/Z。
 * 这样 Map 与 Physics Viewer 的左右、朝向、Mesh 和材质完全来自同一制品。
 */
async function loadRuntimeSceneVisual(epoch) {
  const instance = simulation.instance
  if (map.activeMapId !== 'simulation_map' || !instance || simulation.runtimeInterrupted) {
    return
  }
  try {
    const response = await simulationApi.getViewerScene(simulation.projectId, instance.instance_id)
    const descriptor = response.viewer_scene
    if (
      epoch !== visualLoadEpoch ||
      Number(descriptor.generation) !== Number(instance.generation)
    ) {
      return
    }
    const loaded = await loadVisualContent(descriptor.content_url, descriptor.scene_revision)
    if (epoch !== visualLoadEpoch) return
    const coordinateRoot = loaded.getObjectByName('semantic-z-up-root')
    if (!coordinateRoot) throw new Error('场景 GLB 缺少统一 semantic-z-up-root')
    const visualIndex = indexViewerScene(loaded, descriptor.dynamic_node_order)
    const entitiesBySource = new Map(
      activeEntities.value
        .map((entity) => [sourceIdForEntity(entity), entity])
        .filter(([sourceId]) => sourceId)
    )
    if (!entitiesBySource.size) return

    scene.add(loaded)
    runtimeVisualRoot = loaded
    coordinateRoot.updateMatrixWorld(true)

    for (const [sourceId, entity] of entitiesBySource) {
      const sourceNodes = visualIndex.bySource.get(sourceId) || []
      if (!sourceNodes.length) continue

      const referenceMatrix = mapSourceReferenceMatrix(three, sourceNodes, entity)
      const group = new three.Group()
      group.name = `map-source-${sourceId}`
      group.userData.entityId = entity.id
      group.userData.sourceId = sourceId
      group.userData.visualFallback = false
      coordinateRoot.add(group)
      for (const node of sourceNodes) group.attach(node)

      // 导出器中的 body 节点保存场景加载时的世界位姿。对整组应用
      // target * inverse(reference)，既保留 Robot Link 相对姿态，也让地图
      // 检查点决定对象根位姿，避免 Robot 基座被二次旋转。
      group.matrix.copy(semanticPoseMatrix(entity)).multiply(referenceMatrix.invert())
      group.matrix.decompose(group.position, group.quaternion, group.scale)
      group.matrixAutoUpdate = true

      const fallback = entityObjects.get(entity.id)
      if (fallback) disposeFallbackObject(fallback)
      entityObjects.set(entity.id, group)
    }

    requestAnimationFrame(() => fitViewToEntities(false))
    updateVisualDiagnostics()
    updateSelectionOutline()
  } catch (error) {
    if (epoch === visualLoadEpoch) {
      simulation.record('problem', '加载地图共享场景视觉失败', error.message)
    }
  }
}
function pointOnGround(event) {
  if (!renderer || !camera || !raycaster || !pointer) return null
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  return raycaster.intersectObject(ground)[0]?.point || null
}
function pickFromCanvas(event) {
  if (!renderer || !camera) return
  if (placingDraft.value) {
    const point = pointOnGround(event)
    if (!point || !editingEntity.value) return
    const worldPoint = mapGroundPointToWorld(point)
    editingEntity.value.pose.position.x = Number(worldPoint.x.toFixed(3))
    editingEntity.value.pose.position.y = Number(worldPoint.y.toFixed(3))
    placingDraft.value = false
    mode.value = 'inspect'
    showEntityEditor.value = true
    return
  }
  if (mode.value === 'point') {
    const point = pointOnGround(event)
    if (!point) return
    map.select({
      kind: 'point',
      frame_id: map.activeSnapshot.frame_id,
      position: Object.values(mapGroundPointToWorld(point))
    })
    return
  }
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  // 真实 GLB 会作为实体根 Mesh 的多层子节点挂载。Three.js 的射线检测默认不
  // 递归，且命中的通常是 GLB 子 Mesh；因此必须递归拾取并向父节点回溯公共
  // entityId。这里绝不能依赖 glTF node/mesh 名称，它们只是视觉资产内部标识。
  const hit = raycaster.intersectObjects([...entityObjects.values()], true)[0]
  let selectedObject = hit?.object || null
  while (selectedObject && !selectedObject.userData?.entityId) {
    selectedObject = selectedObject.parent
  }
  const entity = selectedObject && map.entityById(selectedObject.userData.entityId)
  if (entity && (mode.value !== 'region' || entity.geometry?.kind === 'region')) {
    selectEntity(entity)
  }
}
function beginCanvasPointer(event) {
  if (event.button !== 0) {
    canvasPointerStart = null
    return
  }
  canvasPointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
}
function endCanvasPointer(event) {
  const start = canvasPointerStart
  canvasPointerStart = null
  if (!start || start.pointerId !== event.pointerId || event.button !== 0) return
  const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
  // MapControls 也消费 pointer 事件；只有没有发生拖动时才把它解释为地图选择。
  if (distance <= 4) pickFromCanvas(event)
}
function cancelCanvasPointer() {
  canvasPointerStart = null
}
function disposeThree() {
  ++visualLoadEpoch
  controls?.dispose()
  controls = null
  if (runtimeVisualRoot) {
    scene?.remove(runtimeVisualRoot)
    runtimeVisualRoot = null
    entityObjects.clear()
  } else {
    for (const object of entityObjects.values()) disposeFallbackObject(object)
    entityObjects.clear()
  }
  // 共享 GLB 已从 scene 移除，通用销毁器不会误释放 Physics Viewer/Editor
  // 仍在使用的 geometry、texture 和 material 缓存。
  disposeThreeLifecycle({ renderLoop, resizeObserver, scene, renderer })
  renderLoop = null
  resizeObserver = null
  ground = null
  raycaster = null
  pointer = null
  renderer = null
  scene = null
  camera = null
  MapControls = null
  three = null
}

watch(
  () => [
    map.activeMapId,
    map.activeSnapshot?.generation,
    map.activeSnapshot?.revision,
    simulation.instance?.instance_id,
    simulation.instance?.generation,
    simulation.runtimeInterrupted
  ],
  () => rebuildScene()
)
// 选择同步由 SpatialSelectionStore 唯一负责；这里仅刷新 Three.js 轮廓，
// 不能再次调用 map.select，否则会把同一选择写成新对象并造成递归更新。
watch(
  () => [selectedEntity.value?.id || '', spatialSelection.entityId || ''],
  () => updateSelectionOutline()
)
onMounted(async () => {
  if (!map.activeSnapshot) {
    try {
      await map.load()
    } catch (error) {
      ui.notify({ type: 'error', message: error.message })
    }
  }
  try {
    await initThree()
  } catch (error) {
    ui.notify({ type: 'error', message: '3D 地图初始化失败：' + error.message })
  }
})
onBeforeUnmount(() => {
  clearSelectionOutline()
  disposeThree()
})
</script>

<style scoped lang="scss">
.map-panel {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: var(--sf-bg-primary);
  color: var(--sf-text-primary);
}
.map-panel > header {
  display: flex;
  align-items: center;
  min-height: 66px;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--sf-border-light);
}
.map-panel h2 {
  margin: 2px 0 0;
  font-size: 16px;
}
.eyebrow {
  color: var(--sf-brand);
  font-size: 10px;
  font-weight: 380;
  letter-spacing: 0.09em;
}
.map-switch,
.selection-modes,
.view-modes {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
}
.view-modes {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
}
.map-switch button,
.selection-modes button,
.view-modes button {
  min-height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  font-size: 11px;
  cursor: pointer;
}
.map-switch button.active,
.selection-modes button.active,
.view-modes button.active {
  background: var(--sf-bg-secondary);
  color: var(--sf-brand);
  box-shadow: var(--sf-shadow-sm);
}
.generation {
  margin-left: auto;
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.map-toolbar {
  display: flex;
  align-items: center;
  min-height: 46px;
  flex-wrap: wrap;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--sf-border-light);
}
.toolbar-spacer {
  flex: 1;
}
.selection-purpose {
  color: var(--sf-warning);
  font-size: 11px;
}
.map-workspace {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 230px minmax(320px, 1fr);
}
.map-tree {
  padding: 10px;
  overflow: auto;
  background: var(--sf-bg-secondary);
}
.map-tree {
  border-right: 1px solid var(--sf-border-light);
}
.tree-heading {
  display: flex;
  justify-content: space-between;
  padding: 7px 5px;
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.map-tree > button {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 9px;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
}
.map-tree > button:hover,
.map-tree > button.active {
  background: var(--sf-bg-hover);
  box-shadow: inset 3px 0 var(--sf-brand);
}
.map-tree > button i {
  width: 12px;
  height: 12px;
  border: 2px solid var(--sf-brand);
  border-radius: 4px;
}
.map-tree > button i[data-kind='cylinder'] {
  border-radius: 50%;
}
.map-tree > button i[data-kind='region'] {
  border-style: dashed;
}
.map-tree > button span {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.map-tree small {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.relation-heading {
  margin-top: 12px;
  border-top: 1px solid var(--sf-border-light);
}
.relation-row {
  display: grid;
  width: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  grid-template-columns: 1fr auto 1fr;
  gap: 5px;
  padding: 6px;
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.relation-row b {
  color: var(--sf-brand);
}
.viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
}
.three-host {
  position: absolute;
  inset: 0;
  cursor: crosshair;
}
.viewport-state {
  display: grid;
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--sf-bg-primary) 82%, transparent);
  place-items: center;
  color: var(--sf-text-secondary);
}
.viewport-hint {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 6px 9px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--sf-bg-secondary) 88%, transparent);
  color: var(--sf-text-secondary);
  font-size: 11px;
  box-shadow: var(--sf-shadow-sm);
}
.reset-view {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 7px 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  background: color-mix(in srgb, var(--sf-bg-secondary) 92%, transparent);
  color: var(--sf-text-secondary);
  cursor: pointer;
  font-size: 11px;
  box-shadow: var(--sf-shadow-sm);
}
.reset-view:hover {
  border-color: var(--sf-brand);
  color: var(--sf-brand);
}
.orientation-ruler {
  position: absolute;
  right: 14px;
  bottom: 48px;
  width: 72px;
  height: 72px;
  border: 1px solid var(--sf-border-light);
  border-radius: 50%;
  background: color-mix(in srgb, var(--sf-bg-secondary) 88%, transparent);
  color: var(--sf-text-secondary);
  font-size: 10px;
  pointer-events: none;
  box-shadow: var(--sf-shadow-sm);
}
.orientation-ruler::before,
.orientation-ruler::after {
  position: absolute;
  background: var(--sf-border-light);
  content: '';
}
.orientation-ruler::before {
  top: 9px;
  bottom: 9px;
  left: 35px;
  width: 1px;
}
.orientation-ruler::after {
  top: 35px;
  right: 9px;
  left: 9px;
  height: 1px;
}
.orientation-ruler .axis-y,
.orientation-ruler .axis-x,
.orientation-ruler small,
.orientation-ruler i {
  position: absolute;
}
.orientation-ruler .axis-y {
  top: 4px;
  left: 20px;
}
.orientation-ruler .axis-x {
  top: 31px;
  right: 2px;
}
.orientation-ruler small {
  right: 23px;
  bottom: 4px;
  color: var(--sf-brand);
}
.orientation-ruler i {
  top: 32px;
  left: 32px;
  z-index: 1;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sf-brand);
}
.empty {
  padding: 22px 8px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  text-align: center;
}
.entity-form {
  margin-top: 16px;
}
.entity-form :deep(.el-form-item) {
  margin-bottom: 16px;
}
.entity-form :deep(.el-form-item__content) {
  gap: 7px;
}
.entity-form :deep(.el-form-item__content > small) {
  display: block;
  width: 100%;
  color: var(--sf-text-disabled);
  font-size: 11px;
  line-height: 1.45;
}
.entity-form :deep(.el-select) {
  width: 100%;
}
.position-row,
.size-row {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.position-row {
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
}
.position-row :deep(.el-input-number),
.size-row :deep(.el-input-number) {
  width: 100%;
}
.size-row label {
  display: grid;
  gap: 4px;
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.fixed-kind {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  padding: 0 10px;
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-secondary);
  font-size: 11px;
}
@media (max-width: 980px) {
  .map-workspace {
    grid-template-columns: 190px 1fr;
  }
}
</style>
