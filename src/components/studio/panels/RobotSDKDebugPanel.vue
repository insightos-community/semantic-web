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
  <section class="sdk-debug-panel">
    <header>
      <div>
        <p class="eyebrow">DEVELOPMENT ONLY</p>
        <h2>Robot SDK Debug</h2>
        <p>
          发送受限的低层轨迹，用于验证 Runtime Backend；正式业务执行仍由 Ability 调用 Robot SDK。
        </p>
      </div>
      <el-tag type="warning" effect="plain">调试功能</el-tag>
    </header>

    <el-alert
      v-if="!isDevelopment"
      type="warning"
      :closable="false"
      title="当前 Project 不是开发模式，Robot SDK Debug 已禁用。"
    />
    <el-alert
      v-else-if="!store.instance"
      type="info"
      :closable="false"
      title="请先启动场景，再选择虚拟 Robot。"
    />
    <el-alert
      v-else-if="store.runtimeInterrupted"
      type="error"
      :closable="false"
      :title="store.recoveryDiagnostic || 'Runtime 已中断，禁止继续发送命令。'"
    />

    <div class="sdk-layout">
      <el-form class="command-form" label-position="top" size="small">
        <el-form-item label="虚拟 Robot">
          <el-select v-model="store.selectedRobotId" :disabled="!canUse" @change="selectRobot">
            <el-option
              v-for="robot in store.robots"
              :key="robot.robot_id"
              :label="`${robot.robot_id} · ${robot.model}`"
              :value="robot.robot_id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="命令类型">
          <el-segmented v-model="commandType" :options="commandOptions" :disabled="!canSend" />
        </el-form-item>

        <template v-if="commandType === 'joint_trajectory'">
          <el-form-item label="关节">
            <el-select v-model="jointName" :disabled="!canSend">
              <el-option v-for="joint in jointNames" :key="joint" :label="joint" :value="joint" />
            </el-select>
          </el-form-item>
          <el-form-item label="目标位置（rad）">
            <el-input-number
              v-model="jointTarget"
              :step="0.01"
              :precision="4"
              :disabled="!canSend"
            />
          </el-form-item>
        </template>

        <template v-else-if="commandType === 'base_trajectory'">
          <div class="number-grid">
            <el-form-item label="X（m）">
              <el-input-number v-model="baseTarget.x" :step="0.05" />
            </el-form-item>
            <el-form-item label="Y（m）">
              <el-input-number v-model="baseTarget.y" :step="0.05" />
            </el-form-item>
            <el-form-item label="Yaw（rad）">
              <el-input-number v-model="baseTarget.yaw" :step="0.1" />
            </el-form-item>
          </div>
        </template>

        <template v-else-if="commandType === 'gripper_command'">
          <el-form-item label="夹爪">
            <el-select v-model="gripperId" :disabled="!canSend">
              <el-option
                v-for="gripper in grippers"
                :key="gripper"
                :label="gripper"
                :value="gripper"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="开度（m）">
            <el-input-number v-model="gripperPosition" :min="0" :max="0.2" :step="0.005" />
          </el-form-item>
          <el-form-item label="最大力（N）">
            <el-input-number v-model="gripperEffort" :min="0" :max="200" :step="5" />
          </el-form-item>
        </template>

        <div class="number-grid compact">
          <el-form-item label="轨迹时长（s）">
            <el-input-number v-model="durationSeconds" :min="0.1" :max="60" :step="0.1" />
          </el-form-item>
          <el-form-item label="命令超时（s）">
            <el-input-number v-model="timeoutSeconds" :min="0.2" :max="300" :step="1" />
          </el-form-item>
        </div>

        <div class="actions">
          <el-button type="primary" :loading="submitting" :disabled="!canSend" @click="submit">
            发送轨迹
          </el-button>
          <el-button type="danger" plain :disabled="!canSend" @click="hold">立即 Hold</el-button>
          <el-button :disabled="!store.selectedRobotId" @click="selectRobot">刷新状态</el-button>
        </div>
      </el-form>

      <aside class="state-panel">
        <h3>Robot State</h3>
        <dl>
          <div>
            <dt>Robot</dt>
            <dd>{{ store.selectedRobotId || '—' }}</dd>
          </div>
          <div>
            <dt>Generation</dt>
            <dd>{{ store.robotState?.generation || '—' }}</dd>
          </div>
          <div>
            <dt>Frame</dt>
            <dd>{{ store.robotState?.base_pose?.frame_id || '—' }}</dd>
          </div>
          <div>
            <dt>关节数</dt>
            <dd>{{ Object.keys(store.robotState?.joints || {}).length }}</dd>
          </div>
        </dl>
        <pre>{{ JSON.stringify(store.robotState || {}, null, 2) }}</pre>
      </aside>
    </div>

    <section class="commands">
      <header>
        <h3>当前会话命令</h3>
        <span>刷新页面后以 Server 状态为准</span>
      </header>
      <el-table :data="store.commands" empty-text="尚未发送命令" size="small">
        <el-table-column prop="command_id" label="Command" min-width="180" />
        <el-table-column prop="type" label="类型" width="150" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button link type="primary" @click="store.refreshCommand(scope.row.command_id)">
              刷新
            </el-button>
            <el-button
              v-if="['accepted', 'running'].includes(scope.row.status)"
              link
              type="danger"
              @click="store.stopCommand(scope.row.command_id)"
            >
              停止
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { commandTypesForRobot } from '@/domain/simulation'
import { useProjectStore } from '@/stores/project'
import { useSimulationStore } from '@/stores/simulation'
import { useUiStore } from '@/stores/ui'

const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const project = useProjectStore()
const store = useSimulationStore()
const ui = useUiStore()
const commandType = ref('joint_trajectory')
const jointName = ref('')
const jointTarget = ref(0)
const gripperId = ref('')
const gripperPosition = ref(0.02)
const gripperEffort = ref(20)
const durationSeconds = ref(1)
const timeoutSeconds = ref(10)
const submitting = ref(false)
const baseTarget = reactive({ x: 0, y: 0, yaw: 0 })

const isDevelopment = computed(() => project.currentProject?.mode === 'development')
const canUse = computed(() => isDevelopment.value && Boolean(store.instance))
const availableTypes = computed(() => commandTypesForRobot(store.selectedRobot))
const commandOptions = computed(() =>
  availableTypes.value.map((value) => ({
    value,
    label: { joint_trajectory: '关节', base_trajectory: '底盘', gripper_command: '夹爪' }[value]
  }))
)
const canSend = computed(
  () => canUse.value && store.canControl && availableTypes.value.includes(commandType.value)
)
const jointNames = computed(() => store.selectedRobot?.joint_names || [])
const grippers = computed(() => store.selectedRobot?.grippers || [])

function syncTargets() {
  if (jointNames.value.length && !jointNames.value.includes(jointName.value)) {
    jointName.value = jointNames.value[0]
  }
  if (jointName.value) {
    jointTarget.value = Number(store.robotState?.joints?.[jointName.value]?.position || 0)
  }
  if (grippers.value.length && !grippers.value.includes(gripperId.value)) {
    gripperId.value = grippers.value[0]
  }
  const position = store.robotState?.base_pose?.position || [0, 0, 0]
  baseTarget.x = Number(position[0] || 0)
  baseTarget.y = Number(position[1] || 0)
}

async function selectRobot() {
  if (!store.selectedRobotId) return
  try {
    await store.refreshSelectedRobot()
    syncTargets()
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot 状态读取失败' })
  }
}

function commandPayload() {
  if (commandType.value === 'joint_trajectory') {
    const current = Object.fromEntries(
      jointNames.value.map((name) => [
        name,
        Number(store.robotState?.joints?.[name]?.position || 0)
      ])
    )
    const target = { ...current, [jointName.value]: Number(jointTarget.value) }
    return {
      resources: ['joints'],
      frame_id: store.selectedRobot?.coordinate_frame || 'base_link',
      points: [
        { positions: current, time_from_start_seconds: 0 },
        { positions: target, time_from_start_seconds: Number(durationSeconds.value) }
      ]
    }
  }
  if (commandType.value === 'base_trajectory') {
    const position = store.robotState?.base_pose?.position || [0, 0, 0]
    return {
      frame_id: store.robotState?.base_pose?.frame_id || 'world',
      points: [
        {
          positions: { x: Number(position[0] || 0), y: Number(position[1] || 0), yaw: 0 },
          time_from_start_seconds: 0
        },
        {
          positions: { x: baseTarget.x, y: baseTarget.y, yaw: baseTarget.yaw },
          time_from_start_seconds: Number(durationSeconds.value)
        }
      ]
    }
  }
  return {
    gripper_id: gripperId.value,
    position: Number(gripperPosition.value),
    max_effort: Number(gripperEffort.value)
  }
}

async function submit() {
  if (!canSend.value) return
  submitting.value = true
  try {
    await store.submitCommand(commandType.value, commandPayload(), {
      timeout_seconds: timeoutSeconds.value
    })
    ui.notify({ type: 'success', message: '调试命令已提交' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || '调试命令提交失败' })
  } finally {
    submitting.value = false
  }
}

async function hold() {
  try {
    await store.holdRobot()
    ui.notify({ type: 'success', message: 'Robot 已进入 hold' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Robot hold 失败' })
  }
}

watch(availableTypes, (types) => {
  if (!types.includes(commandType.value)) commandType.value = types[0] || ''
})
watch(() => store.robotState, syncTargets, { deep: true })

onMounted(async () => {
  const requestedRobot = props.panelParams.resourceId
  if (requestedRobot && store.robots.some((robot) => robot.robot_id === requestedRobot)) {
    store.selectedRobotId = requestedRobot
  } else if (!store.selectedRobotId) {
    store.selectedRobotId = store.robots[0]?.robot_id || ''
  }
  await selectRobot()
})
</script>

<style scoped lang="scss">
.sdk-debug-panel {
  height: 100%;
  padding: 20px;
  overflow: auto;
  color: var(--sf-text-primary);
  background: var(--sf-bg-secondary);

  > header,
  .commands > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  h2,
  h3,
  p {
    margin: 0 0 7px;
  }

  header p:not(.eyebrow),
  .commands header span {
    color: var(--sf-text-muted);
    font-size: 12px;
  }
}

.sdk-layout {
  display: grid;
  grid-template-columns: minmax(360px, 0.85fr) minmax(360px, 1.15fr);
  gap: 16px;
  margin-top: 16px;
}

.command-form,
.state-panel,
.commands {
  padding: 16px;
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
  background: var(--sf-bg-primary);
}

.number-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  &.compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.state-panel {
  min-width: 0;

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  dl div {
    display: grid;
    gap: 3px;
  }

  dt {
    color: var(--sf-text-muted);
    font-size: 11px;
  }

  dd {
    margin: 0;
  }

  pre {
    max-height: 300px;
    padding: 10px;
    overflow: auto;
    border-radius: 6px;
    background: var(--sf-bg-tertiary);
    font-size: 11px;
  }
}

.commands {
  margin-top: 16px;
}

@media (max-width: 900px) {
  .sdk-layout {
    grid-template-columns: 1fr;
  }
}
</style>
