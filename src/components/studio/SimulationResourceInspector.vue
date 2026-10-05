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
  <div class="simulation-inspector">
    <section v-if="editorContext" class="scene-tree-section">
      <header>
        <h3>场景树</h3>
        <span>{{ editorContext.nodes.length }} 个节点</span>
      </header>
      <div class="scene-tree">
        <button
          v-for="node in editorContext.nodes"
          :key="node.id"
          type="button"
          :class="{ active: node.id === editorContext.selected_id }"
          @click="selectEditorNode(node)"
        >
          <span>{{ node.name || node.id }}</span>
          <small>
            {{ node.kind }}
            <el-tooltip content="模板锁定" effect="dark" :show-after="500" placement="top">
              <Lock v-if="editorContext.locked_node_ids.includes(node.id)" />
            </el-tooltip>
          </small>
        </button>
      </div>
    </section>
    <section
      v-if="record"
      :class="{ 'simulation-object-section': selectedType === 'simulation_object' }"
    >
      <h3>{{ editorContext ? '选中对象属性' : heading }}</h3>
      <p v-if="selectedType === 'simulation_object'" class="section-hint">
        位姿单位：米；四元数顺序：xyzw。
      </p>
      <dl :class="{ 'object-property-grid': selectedType === 'simulation_object' }">
        <div v-for="item in properties" :key="item.label" class="property-field">
          <dt>{{ item.label }}</dt>
          <el-tooltip :content="item.value || '—'" effect="dark" :show-after="500" placement="top">
            <dd>{{ item.value || '—' }}</dd>
          </el-tooltip>
        </div>
      </dl>
    </section>
    <CameraWall
      v-if="selectedType === 'simulation_sensor' && ['rgb', 'depth'].includes(record?.kind)"
      :sensor-ids="[record.sensor_id]"
      compact
    />
    <div class="actions">
      <el-button
        v-if="selectedType === 'scene_instance'"
        size="small"
        type="primary"
        @click="open('physics-viewer', record.instance_id)"
      >
        Physics Viewer
      </el-button>
      <el-button
        v-if="selectedType === 'simulation_sensor'"
        size="small"
        @click="open('sensor-viewer', store.instance?.instance_id)"
      >
        多传感器视图
      </el-button>
      <el-button
        v-if="selectedType === 'virtual_robot' && debugEnabled"
        size="small"
        @click="open('robot-sdk-debug', record.robot_id)"
      >
        Robot SDK Debug
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { Lock } from '@element-plus/icons-vue'
import { computed } from 'vue'
import CameraWall from '@/components/simulation/CameraWall.vue'
import { useLayoutStore } from '@/stores/layout'
import { useProjectStore } from '@/stores/project'
import { useSimulationStore } from '@/stores/simulation'
import { openStudioPanel } from '@/studio/panelService'

const layout = useLayoutStore()
const project = useProjectStore()
const store = useSimulationStore()
const editorContext = computed(() =>
  ['scene_document', 'scene-editor', 'scene_editor_node'].includes(selectedType.value)
    ? store.editorContext
    : null
)
const selectedType = computed(() => layout.selectedResource?.resourceType || '')
const record = computed(() => {
  if (selectedType.value === 'scene_instance') return store.instance
  if (selectedType.value === 'virtual_robot') return store.selectedRobot
  if (selectedType.value === 'simulation_sensor') {
    return store.sensors.find((item) => item.sensor_id === layout.selectedResource?.resourceId)
  }
  if (editorContext.value) {
    return (
      editorContext.value.nodes.find((node) => node.id === editorContext.value.selected_id) || {
        id: editorContext.value.document_id,
        kind: 'scene_document'
      }
    )
  }
  if (selectedType.value === 'runtime_installation') {
    return store.compatibleRuntimeInstallations.find(
      (item) => item.installation_id === layout.selectedResource?.resourceId
    )
  }
  return store.selected?.value || null
})
const heading = computed(
  () =>
    ({
      scene_instance: 'Scene Instance',
      simulation_object: '场景对象',
      virtual_robot: 'Virtual Robot',
      simulation_sensor: 'Sensor / Camera',
      scene_editor_node: 'Scene Editor 节点',
      runtime_installation: 'Runtime Installation'
    })[selectedType.value] || '仿真资源'
)
const debugEnabled = computed(
  () =>
    project.currentProject?.mode === 'development' &&
    store.runtime?.capabilities?.robot_commands !== false
)
const properties = computed(() => {
  const value = record.value || {}
  if (selectedType.value === 'simulation_object') return simulationObjectProperties(value)
  const keys =
    {
      scene_instance: ['instance_id', 'scene_key', 'layout', 'generation', 'state', 'sim_time'],
      virtual_robot: ['robot_id', 'model', 'kind', 'coordinate_frame', 'sdk_package'],
      simulation_sensor: ['sensor_id', 'kind', 'encoding', 'frame_id', 'width', 'height'],
      scene_editor_node: ['id', 'name', 'kind', 'parent_id'],
      scene_document: ['id', 'name', 'kind', 'parent_id', 'transform', 'properties'],
      'scene-editor': ['id', 'name', 'kind', 'parent_id', 'transform', 'properties'],
      runtime_installation: [
        'installation_id',
        'profile_id',
        'engine',
        'loader',
        'launch_mode',
        'status',
        'diagnostic'
      ]
    }[selectedType.value] || Object.keys(value).slice(0, 8)
  return keys.map((key) => ({ label: key, value: format(value[key]) }))
})
function format(value) {
  return value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
}

function axisValue(value, axis, index) {
  if (Array.isArray(value)) return value[index]
  return value?.[axis]
}

function formatNumber(value, digits = 4) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(digits) : '—'
}

function yesNo(value) {
  if (value === undefined || value === null) return '—'
  return value ? '是' : '否'
}

function simulationObjectProperties(value) {
  const pose = value.pose || {}
  const position = pose.position || {}
  const orientation = pose.quaternion_xyzw || pose.orientation || {}
  const extent = value.extent || {}
  const state = value.state || {}
  const visual = value.visual_ref || value.visual || {}
  return [
    { label: '来源 ID', value: format(value.source_id) },
    { label: '名称', value: format(value.name) },
    { label: '类别', value: format(value.category) },
    { label: '坐标系', value: format(pose.frame_id || value.coordinate_frame || 'world') },
    { label: '位置 X', value: formatNumber(axisValue(position, 'x', 0)) },
    { label: '位置 Y', value: formatNumber(axisValue(position, 'y', 1)) },
    { label: '位置 Z', value: formatNumber(axisValue(position, 'z', 2)) },
    { label: '姿态 X', value: formatNumber(axisValue(orientation, 'x', 0), 6) },
    { label: '姿态 Y', value: formatNumber(axisValue(orientation, 'y', 1), 6) },
    { label: '姿态 Z', value: formatNumber(axisValue(orientation, 'z', 2), 6) },
    { label: '姿态 W', value: formatNumber(axisValue(orientation, 'w', 3), 6) },
    { label: '范围 X', value: formatNumber(axisValue(extent, 'x', 0)) },
    { label: '范围 Y', value: formatNumber(axisValue(extent, 'y', 1)) },
    { label: '范围 Z', value: formatNumber(axisValue(extent, 'z', 2)) },
    { label: '可交互', value: yesNo(state.interactive) },
    { label: '静态对象', value: yesNo(state.static) },
    { label: '接触中', value: yesNo(state.in_contact) },
    { label: '被持有', value: yesNo(state.holding || state.held) },
    {
      label: '视觉素材',
      value: visual.visual_id ? `${visual.visual_id}@${visual.version || 'latest'}` : '使用类别占位'
    }
  ]
}

function open(type, resourceId) {
  openStudioPanel(type, { resourceId })
}

function selectEditorNode(node) {
  store.selectEditorContextNode(node.id)
  layout.select({
    resourceType: 'scene_editor_node',
    resourceId: node.id,
    title: node.name || node.id
  })
}
</script>

<style scoped>
.simulation-inspector h3 {
  margin: 4px 0 14px;
}
.scene-tree-section {
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--sf-border-light);
}
.scene-tree-section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.scene-tree-section > header span {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.scene-tree {
  display: grid;
  max-height: min(42vh, 420px);
  gap: 3px;
  overflow: auto;
}
.scene-tree button {
  display: flex;
  align-items: center;
  min-width: 0;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  text-align: left;
  cursor: pointer;
}
.scene-tree button:hover {
  background: var(--sf-bg-hover);
  color: var(--sf-text-primary);
}
.scene-tree button.active {
  border-color: var(--sf-accent);
  background: color-mix(in srgb, var(--sf-accent) 14%, transparent);
  color: var(--sf-text-primary);
}
.scene-tree button > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scene-tree small {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--sf-text-disabled);
}
.scene-tree small svg {
  width: 12px;
  height: 12px;
}
.section-hint {
  margin: -7px 0 12px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  line-height: 1.5;
}
.simulation-inspector dl {
  display: grid;
  gap: 7px;
  margin: 0;
}
.property-field {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(82px, 0.8fr) 1.5fr;
  gap: 8px;
}
.simulation-inspector dt {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.simulation-inspector dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 11px;
}
.object-property-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.object-property-grid .property-field {
  display: block;
  padding: 9px 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  background: var(--sf-bg-tertiary);
}
.object-property-grid .property-field:first-child,
.object-property-grid .property-field:last-child {
  grid-column: 1 / -1;
}
.object-property-grid dt {
  margin-bottom: 5px;
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.object-property-grid dd {
  min-height: 18px;
  color: var(--sf-text-primary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.simulation-inspector :deep(.camera-wall.compact) {
  display: block;
  margin-top: 16px;
}
.simulation-inspector :deep(.camera-wall.compact .camera-tile) {
  min-height: 150px;
}
.inspector-object-controls {
  margin-top: 16px;
}
.actions {
  display: flex;
  gap: 6px;
  margin-top: 16px;
  flex-wrap: wrap;
}
</style>
