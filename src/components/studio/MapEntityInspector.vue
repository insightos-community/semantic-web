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
  <div class="map-entity-inspector">
    <section class="inspector-section">
      <header>
        <div>
          <h3>地图属性</h3>
        </div>
        <el-button v-if="!editing" size="small" @click="startEditing"> 编辑属性 </el-button>
      </header>

      <el-form v-if="draft" class="entity-editor" label-position="top" :class="{ editing }">
        <div class="entity-meta">
          <div class="meta-item meta-id">
            <span>Entity ID</span>
            <el-tooltip :content="entity.id" effect="dark" :show-after="500" placement="top">
              <strong>{{ entity.id }}</strong>
            </el-tooltip>
          </div>
          <div class="meta-item">
            <span>地图版本</span>
            <strong>{{ mapLabel }} · {{ record.snapshot?.generation || '—' }}</strong>
          </div>
          <div class="meta-item">
            <span>更新版本</span>
            <strong>{{ entity.revision || record.snapshot?.revision || '—' }}</strong>
          </div>
          <div class="meta-item">
            <span>坐标系</span>
            <strong>{{ draft.frame_id || '—' }}</strong>
          </div>
          <div class="meta-item">
            <span>来源</span>
            <strong>{{ entity.source || 'user' }}</strong>
          </div>
        </div>

        <div class="form-group">
          <div class="form-group-title">
            <b>基础属性</b>
            <span>用于地图检索、计划引用和状态判断</span>
          </div>
          <el-form-item label="名称" required>
            <el-input
              v-model="draft.name"
              :disabled="!editing"
              placeholder="用于地图、计划和 Interaction 识别"
            />
          </el-form-item>
          <div class="two-columns">
            <el-form-item label="状态">
              <el-select v-model="draft.status" :disabled="!editing">
                <el-option label="有效" value="active" />
                <el-option label="不确定" value="uncertain" />
              </el-select>
            </el-form-item>
            <el-form-item :label="isRegion ? '区域用途' : '物品类别'" required>
              <el-input
                v-if="isRegion"
                v-model="draft.properties.purpose"
                :disabled="!editing"
                placeholder="例如：放置区、禁入区"
              />
              <el-select
                v-else
                v-model="draft.type"
                filterable
                allow-create
                default-first-option
                :disabled="!editing"
                placeholder="选择或输入类别"
              >
                <el-option label="普通物品" value="object" />
                <el-option label="容器" value="container" />
                <el-option label="托盘" value="pallet" />
                <el-option label="设备" value="equipment" />
              </el-select>
            </el-form-item>
          </div>
        </div>

        <div class="form-group">
          <div class="form-group-title">
            <b>位姿</b>
            <span>相对于 {{ draft.frame_id }} 坐标系，四元数顺序为 xyzw</span>
          </div>
          <el-form-item label="位置（米）">
            <div class="axis-grid axis-grid-three">
              <label v-for="axis in axes" :key="'position-' + axis" class="axis-field">
                <span>{{ axis.toUpperCase() }}</span>
                <el-input-number
                  :key="`position-input-${axis}-${editing}`"
                  v-model="draft.pose.position[axis]"
                  :aria-label="`位置 ${axis.toUpperCase()}`"
                  :controls="false"
                  :disabled="!editing"
                  :step="0.1"
                />
              </label>
            </div>
          </el-form-item>
          <el-form-item label="姿态四元数">
            <div class="axis-grid quaternion-grid">
              <label v-for="axis in quaternionAxes" :key="'orientation-' + axis" class="axis-field">
                <span>{{ axis.toUpperCase() }}</span>
                <el-input-number
                  :key="`orientation-input-${axis}-${editing}`"
                  v-model="draft.pose.orientation[axis]"
                  :aria-label="`姿态 ${axis.toUpperCase()}`"
                  :controls="false"
                  :disabled="!editing"
                  :step="0.01"
                  :precision="6"
                />
              </label>
            </div>
            <div class="quaternion-status" :class="{ invalid: !orientationValid }">
              <span>当前模长 {{ orientationNormLabel }}</span>
              <el-button v-if="editing" size="small" text @click="normalizeOrientation">
                归一化
              </el-button>
            </div>
            <small>Framework 要求四元数模长为 1；输入非零姿态后可点击“归一化”。</small>
          </el-form-item>
        </div>

        <div class="form-group">
          <div class="form-group-title">
            <b>外形与语义</b>
            <span>几何范围用于地图显示，标签由用户维护</span>
          </div>
          <el-form-item label="形状">
            <el-select v-if="!isRegion" v-model="draft.geometry.kind" :disabled="!editing">
              <el-option label="长方体" value="box" />
              <el-option label="圆柱体" value="cylinder" />
              <el-option label="平面" value="plane" />
            </el-select>
            <span v-else class="readonly-value">区域（半透明平面）</span>
          </el-form-item>
          <el-form-item label="尺寸（米）">
            <div class="axis-grid axis-grid-three">
              <label v-for="axis in axes" :key="'size-' + axis" class="axis-field">
                <span>{{ axis.toUpperCase() }}</span>
                <el-input-number
                  :key="`size-input-${axis}-${editing}`"
                  v-model="draft.geometry.size[axis]"
                  :aria-label="`尺寸 ${axis.toUpperCase()}`"
                  :controls="false"
                  :disabled="!editing"
                  :min="0.01"
                  :step="0.1"
                />
              </label>
            </div>
          </el-form-item>
          <el-form-item label="标签">
            <el-select
              v-model="draftLabels"
              multiple
              filterable
              allow-create
              default-first-option
              :disabled="!editing"
              placeholder="选择或输入标签"
            />
            <small>标签属于人工维护语义，Task 或外部来源不能静默覆盖。</small>
          </el-form-item>
          <el-form-item label="关联素材与观测">
            <el-select
              v-model="draftEvidence"
              multiple
              filterable
              clearable
              :disabled="!editing"
              placeholder="关联已经登记的 Artifact"
            >
              <el-option
                v-for="artifact in availableArtifacts"
                :key="artifact.id"
                :label="artifactLabel(artifact)"
                :value="artifact.id"
              />
            </el-select>
            <small
              >地图只保存 Artifact/Trace 引用；图片、点云、模型等文件仍由 Artifact 保存。</small
            >
          </el-form-item>
        </div>

        <div class="source-note">
          <span>来源时间</span>
          <strong>{{ formatTime(entity.source_time || entity.observed_at) || '—' }}</strong>
        </div>
        <div v-if="editing" class="edit-actions">
          <el-button @click="cancelEditing">取消</el-button>
          <el-button type="primary" :loading="map.saving" :disabled="!draftValid" @click="save">
            保存属性
          </el-button>
        </div>
      </el-form>
    </section>

    <section v-if="relatedRelations.length" class="inspector-section">
      <header>
        <div>
          <h3>语义关系</h3>
          <span>点击关联对象可切换当前选择。</span>
        </div>
      </header>
      <button
        v-for="item in relatedRelations"
        :key="item.relation.id"
        type="button"
        class="relation-link"
        @click="selectPeer(item.peer)"
      >
        <span>{{ item.label }}</span
        ><ArrowRight />
      </button>
    </section>

    <section class="inspector-section evidence-section">
      <header>
        <div>
          <h3>关联素材与观测</h3>
          <span>模型、点云、实时/历史图像只以稳定引用关联，可供用户查看和 Agent 按 ID 查询。</span>
        </div>
        <el-button size="small" text :loading="artifacts.loading" @click="loadArtifacts">
          <span>刷新</span>
        </el-button>
      </header>
      <div v-if="linkedEvidence.length" class="evidence-list">
        <div v-for="item in linkedEvidence" :key="item.ref" class="evidence-item">
          <span class="evidence-kind">{{ evidenceKind(item.artifact) }}</span>
          <ArtifactCard v-if="item.artifact" :artifact="item.artifact" :deletable="false" />
          <div v-else class="missing-evidence">
            <b>{{ item.ref }}</b>
            <span>引用仍保留，但当前 Artifact 不可用或无权读取。</span>
          </div>
        </div>
      </div>
      <div v-else class="evidence-empty">
        尚未关联素材。先在 Artifact 面板登记文件，再点击“编辑属性”建立引用。
      </div>
    </section>

    <section class="danger-section">
      <div>
        <b>从当前地图版本移除</b>
        <span>历史地图版本仍保留只读记录，关联 Artifact 不会被删除。</span>
      </div>
      <el-button type="danger" plain size="small" :loading="map.saving" @click="remove">
        移除所选
      </el-button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import ArtifactCard from '@/components/artifact/ArtifactCard.vue'
import { useArtifactsStore } from '@/stores/artifacts'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useUiStore } from '@/stores/ui'

const props = defineProps({ record: { type: Object, required: true } })
const axes = ['x', 'y', 'z']
const quaternionAxes = ['x', 'y', 'z', 'w']
const map = useSemanticMapStore()
const artifacts = useArtifactsStore()
const layout = useLayoutStore()
const project = useProjectStore()
const ui = useUiStore()
const editing = ref(false)
const draft = ref(null)
const draftLabels = ref([])
const draftEvidence = ref([])

const copy = (value) => JSON.parse(JSON.stringify(value))
const entity = computed(() => map.entityById(props.record.entity.id) || props.record.entity)
const isRegion = computed(() => entity.value.geometry?.kind === 'region')
const mapLabel = computed(() => (props.record.mapId === 'real_map' ? '真实地图' : '仿真地图'))
const evidenceRefs = computed(() =>
  normalizedRefs(entity.value.evidence || entity.value.evidence_refs)
)
const availableArtifacts = computed(() =>
  artifacts.items.filter((item) => {
    const ownerProject = item.project_id || item.metadata?.project_id
    return !ownerProject || ownerProject === project.currentProjectId
  })
)
const linkedEvidence = computed(() =>
  evidenceRefs.value.map((reference) => ({
    ref: reference,
    artifact: artifacts.items.find((item) => item.id === reference) || null
  }))
)
const relatedRelations = computed(() =>
  map.relations
    .filter(
      (relation) =>
        relation.subject_id === entity.value.id || relation.object_id === entity.value.id
    )
    .map((relation) => {
      const outbound = relation.subject_id === entity.value.id
      const peerId = outbound ? relation.object_id : relation.subject_id
      const peer = map.entityById(peerId)
      return {
        relation,
        peer,
        label: outbound
          ? `${relation.predicate} · ${peer?.name || peerId}`
          : `${peer?.name || peerId} · ${relation.predicate}`
      }
    })
)
const orientationNorm = computed(() => {
  const orientation = draft.value?.pose?.orientation
  if (!orientation) return Number.NaN
  const values = quaternionAxes.map((axis) => Number(orientation[axis]))
  if (values.some((value) => !Number.isFinite(value))) return Number.NaN
  return Math.hypot(...values)
})
const orientationValid = computed(
  () => Number.isFinite(orientationNorm.value) && Math.abs(orientationNorm.value - 1) <= 0.001
)
const orientationNormLabel = computed(() =>
  Number.isFinite(orientationNorm.value) ? orientationNorm.value.toFixed(4) : '无效'
)
const draftValid = computed(() => {
  const value = draft.value
  if (!value?.name?.trim()) return false
  if (isRegion.value && !value.properties?.purpose?.trim()) return false
  if (!isRegion.value && !value.type?.trim()) return false
  return (
    orientationValid.value &&
    axes.every(
      (axis) =>
        Number.isFinite(Number(value.pose?.position?.[axis])) &&
        Number(value.geometry?.size?.[axis]) > 0
    )
  )
})

watch(
  () => entity.value.id,
  () => {
    editing.value = false
    syncDraft()
  },
  { immediate: true }
)
watch(
  () => entity.value.revision,
  () => {
    if (!editing.value) syncDraft()
  }
)

function normalizedRefs(value) {
  if (!Array.isArray(value)) return value ? [String(value)] : []
  return [
    ...new Set(
      value
        .map((item) => item?.id || item)
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  ]
}

function syncDraft() {
  const value = copy(entity.value)
  value.properties ||= {}
  value.pose ||= {}
  value.pose.position ||= { x: 0, y: 0, z: 0 }
  value.pose.orientation ||= { x: 0, y: 0, z: 0, w: 1 }
  value.geometry ||= { kind: 'box', size: { x: 0.4, y: 0.4, z: 0.4 } }
  value.geometry.size ||= { x: 0.4, y: 0.4, z: 0.4 }
  draft.value = value
  draftLabels.value = normalizedRefs(value.properties.labels)
  draftEvidence.value = evidenceRefs.value.slice()
}

function startEditing() {
  syncDraft()
  editing.value = true
  if (!artifacts.items.length) loadArtifacts()
}

function cancelEditing() {
  editing.value = false
  syncDraft()
}

function normalizeOrientation() {
  const orientation = draft.value?.pose?.orientation
  const norm = orientationNorm.value
  if (!orientation || !Number.isFinite(norm) || norm < 0.000001) {
    ui.notify({ type: 'warning', message: '姿态四元数不能全为 0，请先输入一个非零姿态' })
    return
  }
  quaternionAxes.forEach((axis) => {
    orientation[axis] = Number((Number(orientation[axis]) / norm).toFixed(6))
  })
}

async function save() {
  if (!draftValid.value) return
  const value = copy(draft.value)
  value.properties.labels = normalizedRefs(draftLabels.value)
  value.evidence = normalizedRefs(draftEvidence.value)
  try {
    const snapshot = await map.submitUpdate([{ op: 'upsert_entity', entity: value }])
    const saved = snapshot.entities.find((item) => item.id === value.id) || value
    layout.select({ resourceType: 'map_entity', resourceId: saved.id, title: saved.name })
    cancelEditing()
  } catch (error) {
    ui.notify({ type: 'error', message: map.error || error.message || '地图属性保存失败' })
  }
}

async function remove() {
  try {
    await ElMessageBox.confirm(
      '从当前地图版本移除这个对象？历史版本与关联素材仍会保留。',
      '移除地图对象',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' }
    )
    await map.submitUpdate([{ op: 'remove_entity', entity_id: entity.value.id }])
    map.clearSelection()
    layout.select({
      resourceType: 'semantic_map',
      resourceId: map.activeMapId,
      title: mapLabel.value
    })
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ui.notify({ type: 'error', message: map.error || error.message || '地图对象移除失败' })
    }
  }
}

function selectPeer(peer) {
  if (!peer) return
  map.select({
    kind: peer.geometry?.kind === 'region' ? 'region' : 'entity',
    entity_id: peer.id
  })
  layout.select({ resourceType: 'map_entity', resourceId: peer.id, title: peer.name })
}

function loadArtifacts() {
  artifacts.load().catch((error) => {
    ui.notify({ type: 'warning', message: error.message || 'Artifact 列表加载失败' })
  })
}

function artifactLabel(artifact) {
  return `${artifact.summary || artifact.id} · ${artifact.media_type || '文件'}`
}

function evidenceKind(artifact) {
  if (!artifact) return '不可用引用'
  const mediaType = String(artifact.media_type || '').toLowerCase()
  const path = String(artifact.metadata?.workspace_path || artifact.summary || '').toLowerCase()
  const live = artifact.metadata?.observation === 'live' || artifact.metadata?.live === true
  if (live && (mediaType.startsWith('image/') || mediaType.startsWith('video/'))) return '实时图像'
  if (mediaType.startsWith('image/') || mediaType.startsWith('video/')) return '历史图像/视频'
  if (mediaType.includes('point') || /\.(pcd|ply|las|laz)$/u.test(path)) return '点云'
  if (mediaType.includes('model') || /\.(glb|gltf|obj|stl|dae|usd|usdz)$/u.test(path))
    return '模型文件'
  return '证据文件'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false })
}

onMounted(() => {
  if (evidenceRefs.value.length && !artifacts.items.length) loadArtifacts()
})
</script>

<style scoped lang="scss">
.map-entity-inspector {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}
.inspector-section,
.danger-section {
  padding: 12px;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-primary);
}
.inspector-section > header,
.danger-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 9px;
}
.inspector-section header div,
.danger-section div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.inspector-section h3,
.danger-section b {
  margin: 0;
  color: var(--sf-text-primary);
  font-size: 12px;
  font-weight: 380;
}
.inspector-section header span,
.danger-section span,
.entity-editor small,
.evidence-empty,
.missing-evidence span {
  color: var(--sf-text-disabled);
  font-size: 11px;
  line-height: 1.5;
}
.entity-meta {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  margin-bottom: 12px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-border-light);
}
.meta-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 7px 8px;
  background: var(--sf-bg-tertiary);
}
.meta-id {
  grid-column: 1 / -1;
}
.meta-item span {
  color: var(--sf-text-disabled);
  font-size: 10px;
  line-height: 1.2;
}
.meta-item strong {
  overflow: hidden;
  color: var(--sf-text-secondary);
  font-size: 11px;
  font-weight: 380;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entity-editor {
  margin-top: 12px;
}
.form-group {
  padding: 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: color-mix(in srgb, var(--sf-bg-secondary) 52%, transparent);
}
.form-group + .form-group {
  margin-top: 9px;
}
.form-group-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 7px;
  margin-bottom: 9px;
}
.form-group-title b {
  flex: 0 0 auto;
  color: var(--sf-text-primary);
  font-size: 11px;
  font-weight: 380;
}
.form-group-title span {
  overflow: hidden;
  color: var(--sf-text-disabled);
  font-size: 10px;
  line-height: 1.3;
  text-align: right;
  text-overflow: ellipsis;
}
.entity-editor :deep(.el-form-item) {
  margin-bottom: 9px;
}
.entity-editor :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}
.entity-editor :deep(.el-form-item__label) {
  height: auto;
  margin-bottom: 4px;
  padding: 0;
  color: var(--sf-text-secondary);
  font-size: 11px;
  font-weight: 380;
  line-height: 1.35;
}
.entity-editor :deep(.el-input__wrapper),
.entity-editor :deep(.el-select__wrapper) {
  min-height: 30px;
  padding: 0 9px;
}
.entity-editor :deep(.el-input__inner),
.entity-editor :deep(.el-select__selected-item),
.entity-editor :deep(.el-input-number .el-input__inner) {
  font-size: 11px;
}
.entity-editor :deep(.el-input.is-disabled .el-input__wrapper),
.entity-editor :deep(.el-select .el-select__wrapper.is-disabled),
.entity-editor :deep(.el-input-number.is-disabled .el-input__wrapper) {
  background: var(--sf-bg-tertiary);
}
.entity-editor :deep(.el-input.is-disabled .el-input__inner),
.entity-editor :deep(.el-select .el-select__wrapper.is-disabled),
.entity-editor :deep(.el-input-number.is-disabled .el-input__inner) {
  color: var(--sf-text-secondary);
  -webkit-text-fill-color: var(--sf-text-secondary);
}
.two-columns,
.axis-grid {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.axis-grid-three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.quaternion-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}
.axis-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.axis-field > span {
  color: var(--sf-text-disabled);
  font-size: 10px;
  font-weight: 380;
  line-height: 1;
  text-align: center;
}
.axis-field :deep(.el-input-number) {
  width: 100%;
}
.axis-field :deep(.el-input__wrapper) {
  padding: 0 5px;
}
.axis-field :deep(.el-input__inner) {
  padding: 0;
  text-align: center;
}
.quaternion-status {
  display: flex;
  align-items: center;
  min-height: 23px;
  justify-content: space-between;
  gap: 7px;
  margin-top: 4px;
  color: var(--sf-text-disabled);
  font-size: 10px;
}
.quaternion-status.invalid {
  color: var(--sf-warning);
}
.quaternion-status :deep(.el-button) {
  height: 22px;
  padding: 0 5px;
  font-size: 10px;
}
.readonly-value {
  display: block;
  margin-bottom: 8px;
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  margin-top: 10px;
}
.source-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 2px 0;
  color: var(--sf-text-disabled);
  font-size: 10px;
}
.source-note strong {
  color: var(--sf-text-secondary);
  font-size: 11px;
  font-weight: 380;
}
.relation-link {
  display: flex;
  align-items: center;
  width: 100%;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-secondary);
  cursor: pointer;
  font-size: 11px;
  text-align: left;
}
.relation-link:hover {
  color: var(--sf-brand);
}
.relation-link svg {
  width: 13px;
}
.evidence-section > header {
  margin-bottom: 10px;
}
.evidence-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.evidence-item {
  min-width: 0;
}
.evidence-kind {
  display: inline-flex;
  margin-bottom: 3px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--sf-brand-soft);
  color: var(--sf-brand);
  font-size: 10px;
}
.evidence-item :deep(.artifact-resource-card) {
  grid-template-columns: 36px minmax(0, 1fr) auto;
  padding: 5px 0;
}
.evidence-item :deep(.artifact-preview),
.evidence-item :deep(.artifact-file-mark) {
  width: 36px;
  height: 36px;
}
.missing-evidence {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  border: 1px dashed var(--sf-border-light);
  border-radius: 6px;
}
.missing-evidence b {
  overflow: hidden;
  color: var(--sf-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
}
.danger-section {
  align-items: center;
}
</style>
