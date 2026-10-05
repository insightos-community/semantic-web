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
  <div class="simulation-sidebar">
    <section v-if="!store.hasRuntimeProfile" class="empty-state">
      <Cpu />
      <b>此 Project 未启用仿真</b>
      <span>请在 Explorer 的“Project资源”中选择 Runtime Profile，或先加入一个场景。</span>
    </section>

    <template v-else>
      <section class="runtime-card">
        <header>
          <span class="sf-status-dot" :data-status="runtimeTone" />
          <div>
            <b>{{ runtimeTitle }}</b>
            <small>{{ runtimeSubtitle }}</small>
          </div>
          <el-tag size="small">
            {{ runtimeStateLabel(store.runtime.state) }}
          </el-tag>
        </header>
        <p v-if="runtimeDiagnostic">{{ runtimeDiagnostic }}</p>
        <el-button
          v-if="store.runtime.state !== 'ready'"
          size="small"
          :loading="store.loading"
          @click="ensureRuntime"
        >
          重新检查
        </el-button>
      </section>

      <section class="sidebar-section">
        <h3>当前场景实例</h3>
        <button v-if="store.instance" class="nav-row" type="button" @click="selectInstance">
          <VideoPlay />
          <span>
            <b>{{ activeScene?.name || store.instance.scene_key || store.instance.layout }}</b>
            <small>
              {{ store.instance.layout || store.instance.variant_id }} · g{{
                store.instance.generation
              }}
              · {{ runtimeStateLabel(store.instanceDisplayState) }}
            </small>
          </span>
          <ArrowRight />
        </button>
        <div v-else class="empty-note">没有运行中的场景。从 Project 场景详情页启动。</div>
        <div v-if="store.instance" class="instance-actions">
          <el-button size="small" type="primary" @click="openViewer">Physics Viewer</el-button>
          <el-button v-if="store.sensors.length" size="small" @click="openSensors">
            Sensor Viewer
          </el-button>
          <el-button size="small" :disabled="!store.canControl" @click="syncMap">
            同步地图
          </el-button>
        </div>
      </section>

      <section v-if="store.robots.length" class="sidebar-section">
        <h3>Virtual Robots</h3>
        <button
          v-for="robot in store.robots"
          :key="robot.robot_id"
          class="nav-row"
          type="button"
          @click="selectRobot(robot)"
        >
          <Cpu />
          <span
            ><b>{{ robot.robot_id }}</b
            ><small>{{ robot.model }} · {{ robot.kind }}</small></span
          >
          <ArrowRight />
        </button>
      </section>

      <section v-if="store.sensors.length" class="sidebar-section">
        <h3>Sensors</h3>
        <button
          v-for="sensor in store.sensors"
          :key="sensor.sensor_id"
          class="nav-row"
          type="button"
          @click="selectSensor(sensor)"
        >
          <Camera />
          <span
            ><b>{{ sensor.sensor_id }}</b
            ><small>{{ sensor.kind }} · {{ sensor.encoding }}</small></span
          >
          <ArrowRight />
        </button>
      </section>

      <section class="sidebar-section">
        <h3>最近运行记录</h3>
        <div v-for="event in store.events.slice(0, 6)" :key="event.id" class="event-row">
          <span>{{ event.message }}</span>
          <small>{{ formatTime(event.at) }}</small>
        </div>
        <div v-if="!store.events.length" class="empty-note">尚无仿真运行记录</div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ArrowRight, Camera, Cpu, VideoPlay } from '@element-plus/icons-vue'
import { useLayoutStore } from '@/stores/layout'
import { useSemanticMapStore } from '@/stores/semanticMap'
import { useSimulationStore } from '@/stores/simulation'
import { useUiStore } from '@/stores/ui'
import { openStudioPanel } from '@/studio/panelService'

const store = useSimulationStore()
const semanticMap = useSemanticMapStore()
const layout = useLayoutStore()
const ui = useUiStore()
const activeScene = computed(() => {
  const id = store.instance?.catalog_scene_id
  return id ? store.catalogById(id) : null
})
const runtimeTone = computed(() => {
  if (store.runtimeInterrupted || store.runtime.state === 'failed') return 'danger'
  if (store.runtime.state === 'ready') return 'success'
  return 'warning'
})
const preferredInstallation = computed(() =>
  store.compatibleRuntimeInstallations.find(
    (item) => item.installation_id === store.runtimePreference.preferred_runtime_installation_id
  )
)
const runtimeTitle = computed(
  () =>
    preferredInstallation.value?.name ||
    store.runtimePreference.runtime_profile_id ||
    'Runtime 启动时选择'
)
const runtimeSubtitle = computed(() => {
  if (store.runtime?.runtime_installation_id) {
    return `当前：${store.runtime.runtime_installation_id}`
  }
  if (preferredInstallation.value) {
    return `偏好：${preferredInstallation.value.installation_id}`
  }
  return `${store.compatibleRuntimeInstallations.length} 个兼容安装 · 启动场景时选择`
})
const runtimeDiagnostic = computed(
  () => store.recoveryDiagnostic || preferredInstallation.value?.diagnostic || ''
)

function runtimeStateLabel(state) {
  return (
    {
      offline: '离线',
      unknown: '未知',
      starting: '启动中',
      ready: '在线',
      running: '运行中',
      paused: '已暂停',
      resetting: '重置中',
      stopping: '停止中',
      stopped: '已停止',
      failed: '失败',
      interrupted: '已中断'
    }[state] ||
    state ||
    '未启动'
  )
}

async function ensureRuntime() {
  try {
    await store.ensureRuntime()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Runtime 启动失败' })
  }
}

function select(value, resourceType, resourceId, title) {
  store.selected = value
  layout.select({ resourceType, resourceId, title })
  layout.revealInspector()
}

function selectInstance() {
  select(
    { type: 'instance', value: store.instance },
    'scene_instance',
    store.instance.instance_id,
    'Scene Instance'
  )
}

async function selectRobot(robot) {
  store.selectedRobotId = robot.robot_id
  await store.refreshSelectedRobot()
  select({ type: 'robot', value: robot }, 'virtual_robot', robot.robot_id, robot.robot_id)
}

function selectSensor(sensor) {
  select({ type: 'sensor', value: sensor }, 'simulation_sensor', sensor.sensor_id, sensor.sensor_id)
}

function openViewer() {
  // Viewer 画面留在中央 Dock；场景对象调试属于当前 Scene Instance 的属性，
  // 因此同步选中实例并打开统一 Inspector，避免调试卡片遮挡物理画面。
  selectInstance()
  openStudioPanel('physics-viewer', {
    resourceId: store.instance?.instance_id,
    inspectorResourceType: 'scene_instance',
    inspectorResourceId: store.instance?.instance_id,
    inspectorTitle: 'Scene Instance'
  })
}

function openSensors() {
  openStudioPanel('sensor-viewer', { resourceId: store.instance?.instance_id })
}

async function syncMap() {
  try {
    await store.syncSemanticMap()
    // Runtime 快照已经由 Framework 确定性写入 simulation_map；这里必须立即
    // 重读 Map Store。否则 Studio 仍保留 Project 打开时的旧空快照，Source
    // Link 虽已存在，Viewer 与 Map 的双向选择却找不到对应 Entity。
    await semanticMap.load('simulation_map')
    ui.notify({ type: 'success', message: 'Semantic Map 已同步到当前场景检查点' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Semantic Map 同步失败' })
  }
}

function formatTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.simulation-sidebar {
  padding: 12px;
}
.runtime-card {
  padding: 12px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
}
.runtime-card header,
.nav-row,
.event-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.runtime-card header div,
.nav-row span {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.runtime-card small,
.nav-row small,
.event-row small,
.empty-note,
.runtime-card p {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.sidebar-section {
  margin-top: 18px;
}
.sidebar-section h3 {
  margin: 0 4px 8px;
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.nav-row {
  width: 100%;
  min-height: 42px;
  padding: 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  text-align: left;
  cursor: pointer;
}
.nav-row:hover {
  background: var(--sf-bg-hover);
  color: var(--sf-text-primary);
}
.nav-row > svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}
.nav-row > svg:last-child {
  width: 13px;
  height: 13px;
  flex-basis: 13px;
}
.nav-row b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.instance-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.event-row {
  justify-content: space-between;
  padding: 6px 4px;
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.empty-state {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-direction: column;
  padding: 26px 10px;
  text-align: center;
}
.empty-state > svg {
  width: 28px;
  height: 28px;
}
.empty-state span {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
</style>
