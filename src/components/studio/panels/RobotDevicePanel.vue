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
  <section class="robot-device-panel" data-testid="robot-device-panel">
    <header v-if="robot" class="device-heading">
      <div class="identity">
        <i><Cpu /></i>
        <div>
          <span>{{ robot.environment === 'simulation' ? 'SIMULATION ROBOT' : 'REAL ROBOT' }}</span>
          <h2>{{ robot.display_name || robot.robot_id }}</h2>
          <p>{{ robot.robot_id }} · {{ robot.model }} / {{ robot.backend }}</p>
        </div>
      </div>
      <div class="status-list">
        <DeviceStatus :status="robot.status" />
        <DeviceStatus :status="robot.pilot?.status" />
        <DeviceStatus :status="runtime?.status || 'not_reported'" />
        <el-button size="small" :loading="loading" @click="loadDevice">刷新</el-button>
        <el-button v-if="currentExecution || history.length" size="small" @click="openExecution">
          执行记录
        </el-button>
      </div>
    </header>

    <div v-if="!robot" class="empty">Robot 不存在或设备 Snapshot 尚未完成。</div>
    <template v-else>
      <nav class="device-tabs" role="tablist" aria-label="Project Robot 功能">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === item.id"
          :class="{ active: activeTab === item.id }"
          @click="activeTab = item.id"
        >
          <component :is="item.icon" />
          <span>{{ item.label }}</span>
          <em v-if="item.count">{{ item.count }}</em>
        </button>
      </nav>

      <main class="device-content">
        <DeviceOverviewPanel
          v-if="activeTab === 'overview'"
          :robot="robot"
          :runtime="runtime"
          :current-execution="currentExecution"
          :project-id="project.currentProjectId"
          @open-execution="openExecution"
        />
        <DeviceConfigurationPanel
          v-else-if="activeTab === 'configuration'"
          :robot="robot"
          :runtime="runtime"
        />
        <DeviceDebugPanel
          v-else
          :robot="robot"
          :initial-tab="panelParams.debugTab"
          :ability-id="panelParams.abilityId"
          :skill-key="panelParams.skillKey"
        />
      </main>
    </template>
  </section>
</template>

<script setup>
import { computed, markRaw, ref, watch } from 'vue'
import { Collection, Cpu, Monitor, Setting } from '@element-plus/icons-vue'
import DeviceConfigurationPanel from '@/components/device/DeviceConfigurationPanel.vue'
import DeviceDebugPanel from '@/components/device/DeviceDebugPanel.vue'
import DeviceOverviewPanel from '@/components/device/DeviceOverviewPanel.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { useDeviceStore } from '@/stores/device'
import { useProjectStore } from '@/stores/project'
import { useRobotStore } from '@/stores/robot'
import { useAbilityStore } from '@/stores/ability'
import { useExecutionScopeStore } from '@/stores/executionScope'
import { useUiStore } from '@/stores/ui'
import { openStudioPanel } from '@/studio/panelService'

const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const devices = useDeviceStore()
const project = useProjectStore()
const robots = useRobotStore()
const abilities = useAbilityStore()
const scope = useExecutionScopeStore()
const ui = useUiStore()
const loading = ref(false)
const activeTab = ref('overview')
watch(
  () => props.panelParams.viewMode,
  (mode) => {
    if (mode === 'skills') activeTab.value = 'debug'
    else if (['overview', 'configuration', 'debug'].includes(mode)) activeTab.value = mode
  },
  { immediate: true }
)

const robotId = computed(() => String(props.panelParams.resourceId || ''))
const robot = computed(() => devices.byId(robotId.value))
const runtime = computed(() => devices.runtimeForRobot(robotId.value))
const history = computed(() => robots.forRobot(robotId.value))
const currentExecution = computed(() => robots.currentForRobot(robot.value))
const tabs = computed(() => [
  { id: 'overview', label: '概览', icon: markRaw(Monitor) },
  { id: 'configuration', label: '配置', icon: markRaw(Setting) },
  { id: 'debug', label: '技能与基础调试', icon: markRaw(Collection) }
])

function openExecution() {
  const execution = currentExecution.value || history.value[0]
  if (!execution) return
  scope.inspectExecution(execution.id)
  openStudioPanel('activity')
}
async function loadDevice() {
  const id = robotId.value
  if (!id) return
  loading.value = true
  try {
    const detail = await devices.loadDevice(id)
    if (id !== robotId.value) return
    // 设备详情是 Server 级历史，而 Project Studio 只能吸收当前 Project 的记录；
    // 否则打开同一台 Robot 会把其他 Project 的 Execution 混入当前时间线。
    const scopedExecutions = (detail?.executions || []).filter(
      (execution) => !project.currentProjectId || execution.project_id === project.currentProjectId
    )
    robots.mergeExecutions(scopedExecutions)
    if (detail?.device) abilities.hydrateRobot(id, detail.device.abilities || [])
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '设备读取失败' })
  } finally {
    if (id === robotId.value) loading.value = false
  }
}
watch(robotId, loadDevice, { immediate: true })
</script>

<style scoped lang="scss">
.robot-device-panel {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--sf-bg-primary);
}
.device-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 14px 20px;
  border-bottom: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);
  flex-wrap: wrap;
  gap: 10px;
}
.identity,
.status-list,
.identity > div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.identity {
  min-width: 0;
}
.identity p {
  overflow-wrap: anywhere;
}
.status-list {
  flex-wrap: wrap;
}
.identity > div {
  align-items: flex-start;
  flex-direction: column;
  gap: 2px;
}
.identity > i {
  display: grid;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: var(--sf-brand-soft);
  color: var(--sf-brand);
  place-items: center;
}
.identity > i svg {
  width: 19px;
}
.identity span {
  color: var(--sf-role-robot);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.1em;
}
.identity h2 {
  margin: 0;
  font-size: 18px;
}
.identity p {
  margin: 0;
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.device-tabs {
  display: flex;
  flex: none;
  padding: 0 16px;
  border-bottom: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);
}
.device-tabs button {
  display: flex;
  align-items: center;
  height: 42px;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
}
.device-tabs button.active {
  border-color: var(--sf-brand);
  color: var(--sf-brand);
}
.device-tabs svg {
  width: 14px;
}
.device-tabs em {
  padding: 1px 5px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  font-size: 11px;
  font-style: normal;
}
.device-content {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.overview {
  max-width: 1120px;
  margin: 0 auto;
  padding: 22px;
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.overview-grid article {
  display: flex;
  min-width: 0;
  gap: 6px;
  padding: 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  flex-direction: column;
}
.overview-grid span,
.overview-grid small {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.overview-grid b {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.boundary-note {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  padding: 13px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
}
.boundary-note svg {
  width: 17px;
  color: var(--sf-brand);
}
.boundary-note b {
  font-size: 11px;
}
.boundary-note p {
  margin: 4px 0 0;
  color: var(--sf-text-secondary);
  font-size: 11px;
  line-height: 1.6;
}
.history {
  max-width: 1120px;
  margin: 0 auto;
  padding: 20px;
}
.history button {
  display: grid;
  align-items: center;
  width: 100%;
  grid-template-columns: 90px minmax(0, 1fr) minmax(0, 1fr) 18px;
  gap: 12px;
  padding: 12px;
  border: 0;
  border-bottom: 1px solid var(--sf-border-light);
  background: transparent;
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
}
.history button > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.history small {
  overflow: hidden;
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
}
.empty {
  padding: 48px;
  color: var(--sf-text-disabled);
  text-align: center;
}
@media (max-width: 1000px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
