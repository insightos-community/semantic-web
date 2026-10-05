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
  <div class="device-detail" data-testid="device-detail">
    <header class="detail-header">
      <button type="button" class="back" @click="router.push('/devices')">
        <ArrowLeft />设备中心
      </button>
      <div v-if="robot" class="identity">
        <i><Cpu /></i>
        <div>
          <span class="eyebrow">{{
            robot.environment === 'simulation' ? 'SIMULATION ROBOT' : 'REAL ROBOT'
          }}</span>
          <h1>{{ robot.display_name }}</h1>
          <p>{{ robot.robot_id }} · {{ robot.model }} / {{ robot.backend }}</p>
        </div>
      </div>
      <div v-if="robot" class="header-status">
        <DeviceStatus :status="robot.status" /><DeviceStatus :status="robot.pilot.status" />
        <DeviceStatus :status="runtime?.status || 'not_reported'" />
        <el-button size="small" :loading="loading" @click="reload">刷新</el-button>
      </div>
    </header>

    <div v-if="loading" class="page-state">正在读取设备状态…</div>
    <div v-else-if="!robot" class="page-state error">{{ devices.error || '设备不存在' }}</div>
    <template v-else>
      <nav class="detail-tabs" role="tablist" aria-label="设备详情">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" />{{ tab.label }}
          <span v-if="tab.count">{{ tab.count }}</span>
        </button>
      </nav>

      <main class="detail-content">
        <DeviceOverviewPanel
          v-if="activeTab === 'overview'"
          :robot="robot"
          :runtime="runtime"
          :current-execution="currentExecution"
          @open-execution="openExecution(currentExecution)"
        />
        <DeviceConfigurationPanel
          v-else-if="activeTab === 'configuration'"
          :robot="robot"
          :runtime="runtime"
        />
        <DeviceDebugPanel v-else :robot="robot" />
        <section v-if="activeTab === 'overview'" class="device-records">
          <label
            >执行记录
            <el-select
              :model-value="''"
              aria-label="查看设备执行记录"
              class="records-select"
              placeholder="在所属 Project 底部查看"
              size="small"
              @change="(id) => openExecution(history.find((item) => item.id === id))"
            >
              <el-option
                v-for="item in history"
                :key="item.id"
                :label="`${item.skill_name || item.id} · ${item.status} · ${item.created_at}`"
                :value="item.id"
              />
            </el-select>
          </label>
          <details>
            <summary>传感与证据</summary>
            <DeviceArtifactsPanel :robot="robot" />
          </details>
        </section>
      </main>
    </template>
  </div>
</template>

<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Collection, Cpu, Monitor, Setting } from '@element-plus/icons-vue'
import DeviceArtifactsPanel from '@/components/device/DeviceArtifactsPanel.vue'
import DeviceConfigurationPanel from '@/components/device/DeviceConfigurationPanel.vue'
import DeviceDebugPanel from '@/components/device/DeviceDebugPanel.vue'
import DeviceOverviewPanel from '@/components/device/DeviceOverviewPanel.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { createDeviceSubscription } from '@/devices/subscription'
import { useAbilityStore } from '@/stores/ability'
import { useArtifactSyncStore } from '@/stores/artifactSync'
import { useDeviceStore } from '@/stores/device'
import { useRobotStore } from '@/stores/robot'
import { useUiStore } from '@/stores/ui'
import { useExecutionScopeStore } from '@/stores/executionScope'

const route = useRoute()
const router = useRouter()
const devices = useDeviceStore()
const robots = useRobotStore()
const abilities = useAbilityStore()
const artifacts = useArtifactSyncStore()
const ui = useUiStore()
const activeTab = ref(
  ['configuration', 'debug'].includes(route.query.tab) ? route.query.tab : 'overview'
)
const loading = ref(true)
let subscription = null
let reconciling = false

const robotId = computed(() => String(route.params.robotId || ''))
const robot = computed(() => devices.byId(robotId.value))
const runtime = computed(() => devices.runtimeForRobot(robotId.value))
const history = computed(() => robots.forRobot(robotId.value))
const currentExecution = computed(() => robots.currentForRobot(robot.value))
const tabs = computed(() => [
  { id: 'overview', label: '概览', icon: markRaw(Monitor) },
  { id: 'configuration', label: '配置', icon: markRaw(Setting) },
  { id: 'debug', label: '技能与基础调试', icon: markRaw(Collection) }
])
async function openExecution(execution) {
  if (!execution?.project_id) {
    ui.notify({ type: 'info', message: '该记录未提供所属 Project，不能猜测执行范围' })
    return
  }
  useExecutionScopeStore().inspectExecution(execution.id)
  await router.push({
    path: `/projects/${encodeURIComponent(execution.project_id)}/studio`,
    query: { panel: 'activity', execution_id: execution.id }
  })
}

function hydrate(snapshot) {
  robots.hydrate('', snapshot.executions || [])
  artifacts.hydrateExecutions(snapshot.executions || [])
  for (const item of snapshot.robots || [])
    abilities.hydrateRobot(item.robot_id, item.abilities || [])
}

async function reload() {
  if (reconciling) return
  reconciling = true
  subscription?.stop()
  try {
    const snapshot = await devices.loadSnapshot()
    hydrate(snapshot)
    const detail = await devices.loadDevice(robotId.value)
    robots.mergeExecutions(detail?.executions || [])
    artifacts.mergeExecutions(detail?.executions || [])
    if (detail?.device) abilities.hydrateRobot(robotId.value, detail.device.abilities || [])
    const executionId = detail?.device?.current_execution_id
    if (executionId) {
      const selected = await robots.select(executionId)
      if (selected) artifacts.mergeExecutions([selected])
    }
    subscription = createDeviceSubscription({
      afterSequence: devices.lastEventSequence,
      onGap: reload
    }).start()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '设备详情加载失败' })
  } finally {
    loading.value = false
    reconciling = false
  }
}

onMounted(reload)
onBeforeUnmount(() => subscription?.stop())
</script>

<style scoped lang="scss">
.device-detail {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--sf-bg-primary);
}
.detail-header {
  display: grid;
  align-items: center;
  grid-template-columns: 150px 1fr auto;
  flex: none;
  gap: 20px;
  padding: 15px 24px;
  border-bottom: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);
}
.back {
  display: flex;
  align-items: center;
  width: fit-content;
  gap: 7px;
  border: 0;
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  font-size: var(--sf-font-sm);
}
.back svg {
  width: 14px;
}
.identity {
  display: flex;
  align-items: center;
  gap: 12px;
}
.identity > i {
  display: grid;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--sf-brand-soft);
  color: var(--sf-brand);
  place-items: center;
}
.identity svg {
  width: 20px;
}
.identity h1 {
  margin: 2px 0;
  font-size: var(--sf-font-display);
}
.identity p {
  margin: 0;
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
}
.eyebrow {
  color: var(--sf-role-robot);
  font-size: var(--sf-font-xs);
  font-weight: 380;
  letter-spacing: 0.11em;
}
.header-status {
  display: flex;
  flex-wrap: wrap;
  gap: 13px;
}
.device-records {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 20px 20px;
  font-size: 12px;
}
.device-records label {
  display: flex;
  gap: 10px;
  align-items: center;
}
.device-records .records-select {
  max-width: 80%;
  flex: 1;
  min-width: 0;
  :deep(.el-select__wrapper) {
    height: 32px;
    min-height: 32px;
    border-radius: 6px;
    font-size: 12px;
  }
}
.device-records details {
  margin-top: 14px;
}
.device-records summary {
  cursor: pointer;
}
.detail-tabs {
  display: flex;
  height: 43px;
  flex: none;
  gap: 2px;
  padding: 5px 24px 0;
  border-bottom: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);
}
.detail-tabs button {
  display: flex;
  align-items: center;
  position: relative;
  gap: 7px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  font-size: var(--sf-font-sm);
}
.detail-tabs button svg {
  width: 14px;
}
.detail-tabs button span {
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.detail-tabs button.active {
  color: var(--sf-brand);
  font-weight: 520;
}
.detail-tabs button.active::after {
  position: absolute;
  right: 9px;
  bottom: 0;
  left: 9px;
  height: 2px;
  border-radius: 4px;
  background: var(--sf-brand);
  content: '';
}
.detail-content {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.overview,
.history-panel {
  max-width: 1180px;
  margin: auto;
  padding: 24px 28px 36px;
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.overview-grid article {
  display: flex;
  min-width: 0;
  padding: 14px;
  border: 0;
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  flex-direction: column;
  gap: 6px;
}
.overview-grid article > span,
.overview-grid small {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.overview-grid b {
  overflow: hidden;
  font-size: var(--sf-font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.runtime-card {
  margin-top: 14px;
}
.current-card {
  margin-top: 14px;
  padding: 18px;
  border: 0;
  border-radius: 12px;
  background: var(--sf-bg-secondary);
}
.current-card > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.current-card h2 {
  margin: 3px 0 0;
  font-size: var(--sf-font-display);
}
.current-card > p {
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
}
.current-body {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  margin: 15px 0;
  overflow: hidden;
  border-radius: 8px;
  background: var(--sf-border-light);
}
.current-body div {
  display: flex;
  padding: 11px;
  background: var(--sf-bg-tertiary);
  flex-direction: column;
  gap: 4px;
}
.current-body span {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.current-body b {
  overflow: hidden;
  font-size: var(--sf-font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.boundary-note {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--sf-info) 25%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--sf-info) 6%, var(--sf-bg-secondary));
}
.boundary-note svg {
  width: 17px;
  flex: none;
  color: var(--sf-info);
}
.boundary-note p {
  margin: 4px 0 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  line-height: 1.5;
}
.history-panel > header h2 {
  margin: 0;
  font-size: var(--sf-font-display);
}
.history-panel > header p {
  margin: 5px 0 16px;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
}
.history-panel > button {
  display: grid;
  align-items: center;
  grid-template-columns: 100px 1.3fr 1fr 150px 20px;
  width: 100%;
  gap: 12px;
  min-height: 55px;
  padding: 0 14px;
  border: 1px solid var(--sf-border-light);
  border-bottom: 0;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
}
.history-panel > button:first-of-type {
  border-radius: 8px 9px 0 0;
}
.history-panel > button:last-of-type {
  border-bottom: 1px solid var(--sf-border-light);
  border-radius: 0 0 9px 9px;
}
.history-panel > button:hover {
  background: var(--sf-bg-hover);
}
.history-panel > button > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  font-size: var(--sf-font-xs);
}
.history-panel small {
  overflow: hidden;
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
  text-overflow: ellipsis;
}
.page-state {
  padding: 60px;
  color: var(--sf-text-disabled);
  text-align: center;
}
.page-state.error {
  color: var(--sf-danger);
}
@media (max-width: 900px) {
  .overview-grid,
  .current-body {
    grid-template-columns: repeat(2, 1fr);
  }
  .detail-tabs {
    overflow-x: auto;
  }
}
</style>
