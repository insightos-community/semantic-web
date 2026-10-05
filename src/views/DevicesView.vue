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
  <div class="devices-page" data-testid="devices-page">
    <header class="page-header">
      <div>
        <span class="eyebrow">DEVICE CENTER</span>
        <h1>设备中心</h1>
        <p>通过 Semantic Server 查看全部 Pilot、Robot 和正在执行的 Robot Skill。</p>
      </div>
      <div class="header-actions">
        <PilotEnrollmentDialog />
        <div class="connection-card">
          <DeviceStatus :status="devices.connectionStatus" />
          <span>{{ devices.onlineCount }}/{{ devices.robots.length }} 个 Pilot 在线</span>
          <el-button
            text
            size="small"
            :loading="devices.snapshotStatus === 'loading'"
            @click="reload"
          >
            刷新
          </el-button>
        </div>
      </div>
    </header>

    <section class="metrics">
      <div>
        <span>Robot</span><b>{{ devices.robots.length }}</b
        ><small>Server 已登记</small>
      </div>
      <div>
        <span>在线 Pilot</span><b>{{ devices.onlineCount }}</b
        ><small>含 degraded</small>
      </div>
      <div>
        <span>活动或待处置</span><b>{{ devices.busyCount }}</b
        ><small>运行、停止或状态未知</small>
      </div>
      <div>
        <span>Robot Runtime 可执行</span><b>{{ devices.executableRuntimeCount }}</b
        ><small>{{ devices.runtimeAttentionCount }} 个需要处理</small>
      </div>
      <div>
        <span>状态游标</span><b>#{{ devices.lastEventSequence }}</b
        ><small>Snapshot + 增量事件</small>
      </div>
    </section>

    <section class="toolbar" aria-label="设备筛选">
      <el-input v-model="query" clearable placeholder="搜索 Robot 名称、ID 或 Pilot" />
      <el-select v-model="status" aria-label="Robot 状态" placeholder="全部状态">
        <el-option label="全部状态" value="all" />
        <el-option label="运行或停止中" value="active" />
        <el-option label="空闲" value="idle" />
        <el-option label="离线" value="offline" />
        <el-option label="状态未知" value="interrupted" />
      </el-select>
      <el-select v-model="environment" aria-label="运行环境" placeholder="全部环境">
        <el-option label="全部环境" value="all" />
        <el-option label="仿真" value="simulation" />
        <el-option label="真机" value="real" />
      </el-select>
      <el-select v-model="project" aria-label="Project 占用" placeholder="全部 Project">
        <el-option label="全部 Project" value="all" />
        <el-option label="未分配" value="unassigned" />
        <el-option v-for="item in projectOptions" :key="item" :label="item" :value="item" />
      </el-select>
      <span>{{ filtered.length }} 台</span>
    </section>

    <div v-if="devices.snapshotStatus === 'loading'" class="page-state">正在读取设备 Snapshot…</div>
    <div v-else-if="devices.snapshotStatus === 'error'" class="page-state error">
      {{ devices.error }}<el-button size="small" @click="reload">重试</el-button>
    </div>
    <section v-else class="device-table">
      <header>
        <span>Robot</span><span>连接</span><span>运行状态</span><span>Robot Runtime</span
        ><span>Project / Task</span><span>当前执行</span><span>能力</span><span />
      </header>
      <button
        v-for="robot in filtered"
        :key="robot.robot_id"
        type="button"
        :data-testid="`device-row-${robot.robot_id}`"
        @click="open(robot)"
      >
        <span class="robot-cell">
          <i :data-environment="robot.environment"><Cpu /></i>
          <span
            ><b>{{ robot.display_name }}</b
            ><small>{{ robot.robot_id }} · {{ robot.model }} / {{ robot.backend }}</small></span
          >
        </span>
        <span class="stack"
          ><DeviceStatus :status="robot.pilot.status" /><small>{{
            robot.pilot.instance_id
          }}</small></span
        >
        <span class="stack"
          ><DeviceStatus :status="robot.status" /><small>{{ heartbeat(robot) }}</small></span
        >
        <RobotRuntimeStatus
          compact
          :robot-id="robot.robot_id"
          :runtime="devices.runtimeForRobot(robot.robot_id)"
        />
        <span class="stack"
          ><b>{{ robot.project_id || '未分配' }}</b
          ><small>{{ robot.task_id || '—' }}</small></span
        >
        <span class="stack execution-cell">
          <b>{{ robot.current_stage || '没有活动执行' }}</b>
          <small v-if="Number.isFinite(robot.progress)"
            >{{ Math.round(robot.progress * 100) }}%</small
          >
          <small v-else-if="robot.current_execution_id">按阶段展示进度</small>
          <small v-else>—</small>
        </span>
        <span class="stack"
          ><b
            >{{ robot.ability_framework.healthy_instances || 0 }}/{{
              robot.ability_framework.total_instances || 0
            }}</b
          ><small>Ability 健康</small></span
        >
        <ArrowRight />
      </button>
      <div v-if="!filtered.length" class="page-state">没有符合筛选条件的设备。</div>
    </section>
    <p v-if="devices.stale" class="stale-banner">
      设备连接已中断或事件存在缺口，当前状态可能过期，正在等待重新对账。
    </p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Cpu } from '@element-plus/icons-vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import PilotEnrollmentDialog from '@/components/device/PilotEnrollmentDialog.vue'
import RobotRuntimeStatus from '@/components/device/RobotRuntimeStatus.vue'
import { createDeviceSubscription } from '@/devices/subscription'
import { useAbilityStore } from '@/stores/ability'
import { useArtifactSyncStore } from '@/stores/artifactSync'
import { useDeviceStore } from '@/stores/device'
import { useRobotStore } from '@/stores/robot'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const devices = useDeviceStore()
const robots = useRobotStore()
const abilities = useAbilityStore()
const artifacts = useArtifactSyncStore()
const ui = useUiStore()
const query = ref('')
const status = ref('all')
const environment = ref('all')
const project = ref('all')
let subscription = null
let reconciling = false

const projectOptions = computed(() => [
  ...new Set(devices.robots.map((item) => item.project_id).filter(Boolean))
])
const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return devices.robots.filter((robot) => {
    if (
      needle &&
      ![robot.display_name, robot.robot_id, robot.pilot?.instance_id]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle))
    )
      return false
    if (environment.value !== 'all' && robot.environment !== environment.value) return false
    if (project.value === 'unassigned' && robot.project_id) return false
    if (!['all', 'unassigned'].includes(project.value) && robot.project_id !== project.value)
      return false
    if (status.value === 'active' && !['busy', 'stopping'].includes(robot.status)) return false
    if (!['all', 'active'].includes(status.value) && robot.status !== status.value) return false
    return true
  })
})

function hydrateRelated(snapshot) {
  robots.hydrate('', snapshot.executions || [])
  artifacts.hydrateExecutions(snapshot.executions || [])
  for (const robot of snapshot.robots || [])
    abilities.hydrateRobot(robot.robot_id, robot.abilities || [])
}

async function reload() {
  if (reconciling) return
  reconciling = true
  subscription?.stop()
  try {
    const snapshot = await devices.loadSnapshot()
    hydrateRelated(snapshot)
    subscription = createDeviceSubscription({
      afterSequence: devices.lastEventSequence,
      onGap: reload
    }).start()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '设备状态加载失败' })
  } finally {
    reconciling = false
  }
}

const open = (robot) => router.push(`/devices/${encodeURIComponent(robot.robot_id)}`)
const heartbeat = (robot) =>
  robot.pilot?.last_heartbeat_at
    ? `心跳 ${new Date(robot.pilot.last_heartbeat_at).toLocaleTimeString('zh-CN', { hour12: false })}`
    : '无心跳'

onMounted(reload)
onBeforeUnmount(() => subscription?.stop())
</script>

<style scoped lang="scss">
.devices-page {
  height: 100%;
  overflow: auto;
  padding: 28px clamp(20px, 4vw, 56px) 42px;
  background: var(--sf-bg-primary);
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  max-width: 1480px;
  margin: 0 auto;
}
.eyebrow {
  color: var(--sf-role-robot);
  font-size: 11px;
  font-weight: 380;
  letter-spacing: 0.12em;
}
h1 {
  margin: 5px 0 4px;
  font-size: 25px;
}
.page-header p {
  margin: 0;
  color: var(--sf-text-secondary);
  font-size: 12px;
}
.connection-card {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 12px;
  border: 0;
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  font-size: 11px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  max-width: 1480px;
  gap: 10px;
  margin: 22px auto 14px;
}
.metrics div {
  display: flex;
  padding: 14px;
  border: 0;
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  flex-direction: column;
  gap: 4px;
  box-shadow: var(--sf-shadow-sm);
}
.metrics span,
.metrics small {
  color: var(--sf-text-disabled);
  font-size: 11px;
}
.metrics b {
  font-size: 19px;
}
.toolbar {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(220px, 1fr) 170px 140px 180px auto;
  max-width: 1480px;
  gap: 8px;
  margin: 0 auto 12px;
}
.toolbar > span {
  color: var(--sf-text-disabled);
  font-size: 11px;
  text-align: right;
}
.device-table {
  max-width: 1480px;
  margin: auto;
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  background: var(--sf-bg-secondary);
  box-shadow: var(--sf-shadow-sm);
}
.device-table > header,
.device-table > button {
  display: grid;
  align-items: center;
  grid-template-columns: 1.45fr 0.75fr 0.75fr 1.1fr 0.9fr 1.1fr 0.6fr 20px;
  gap: 12px;
  min-height: 78px;
  padding: 0 16px;
  border: 0;
  border-bottom: 1px solid var(--sf-border-light);
  background: transparent;
  color: var(--sf-text-primary);
  text-align: left;
}
.device-table > header {
  min-height: 36px;
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-disabled);
  font-size: 11px;
  font-weight: 520;
}
.device-table > button {
  width: 100%;
  cursor: pointer;
}
.device-table > button:hover {
  background: var(--sf-bg-hover);
}
.robot-cell {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}
.robot-cell > i {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 8px;
  background: var(--sf-brand-soft);
  color: var(--sf-brand);
  place-items: center;
}
.robot-cell > i[data-environment='simulation'] {
  background: color-mix(in srgb, var(--sf-role-map) 13%, transparent);
  color: var(--sf-role-map);
}
.robot-cell svg {
  width: 17px;
}
.robot-cell > span,
.stack {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.robot-cell b,
.stack b {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.robot-cell small,
.stack small {
  overflow: hidden;
  color: var(--sf-text-disabled);
  font-family: ui-monospace, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page-state {
  max-width: 1480px;
  margin: 20px auto;
  padding: 48px;
  color: var(--sf-text-disabled);
  text-align: center;
}
.page-state.error {
  color: var(--sf-danger);
}
.stale-banner {
  position: fixed;
  right: 22px;
  bottom: 18px;
  max-width: 430px;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--sf-warning) 35%, transparent);
  border-radius: 8px;
  background: var(--sf-bg-secondary);
  color: var(--sf-warning);
  font-size: 11px;
  box-shadow: var(--sf-shadow-md);
}
@media (max-width: 1100px) {
  .metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .device-table {
    overflow-x: auto;
  }
  .device-table > header,
  .device-table > button {
    min-width: 1050px;
  }
  .toolbar {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
