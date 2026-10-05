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
  <section class="robot-skill-debug-panel">
    <header>
      <div>
        <h3>测试 {{ skill.name }}</h3>
        <p>使用已安装版本执行；启动前请确认当前现场和输入。</p>
      </div>
      <DeviceStatus v-if="latestExecution" :status="latestExecution.status" />
    </header>

    <details class="contract-details">
      <summary>执行对象与接口</summary>
      <dl>
        <dt>Robot</dt>
        <dd>{{ robot.display_name || robot.robot_id }}</dd>
        <dt>Input Model</dt>
        <dd>
          {{ skill.input_model || skill.extensions?.runtime?.input_model || '查看 SKILL.md' }}
        </dd>
      </dl>
    </details>

    <section class="skill-input">
      <span class="input-title">
        <span>Skill 输入（{{ skill.version }} 正式契约）</span>
        <el-button
          v-if="hasRecommendedInput"
          size="small"
          text
          :loading="definitionLoading"
          @click="resetRecommendedInput"
        >
          恢复推荐输入
        </el-button>
      </span>
      <el-switch v-model="advanced" active-text="JSON 编辑" />
      <ObjectInput
        v-if="!advanced && parsedInput"
        :model-value="parsedInput"
        @update:model-value="inputJson = JSON.stringify($event, null, 2)"
      />
      <el-input v-else v-model="inputJson" type="textarea" :rows="10" spellcheck="false" />
      <small v-if="!advanced && parsedInput && !Object.keys(parsedInput).length"
        >暂无推荐字段，请切换 JSON 编辑并按 Skill 契约填写输入。</small
      >
    </section>
    <p v-if="hasRecommendedInput" class="input-help">
      推荐输入来自当前已发布的 SKILL.md；后续 Skill 会自行读取实时 Robot
      状态，不需要粘贴上一项执行结果。
    </p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="blockedReason" class="warning">{{ blockedReason }}</p>

    <div class="actions">
      <el-button
        type="primary"
        size="small"
        :disabled="Boolean(blockedReason) || Boolean(activeExecution)"
        :loading="executions.startPending(robot.robot_id)"
        @click="start"
      >
        启动调试
      </el-button>
      <el-button
        v-if="activeExecution"
        type="danger"
        plain
        size="small"
        :loading="executions.stopPending(activeExecution.id)"
        @click="stop"
      >
        安全停止
      </el-button>
      <el-button v-if="latestExecution" size="small" text @click="openExecution">
        查看 Execution
      </el-button>
    </div>

    <section v-if="latestExecution" class="latest">
      <b>最近执行</b>
      <code>{{ latestExecution.id }}</code>
      <span>{{ latestExecution.stage || latestExecution.status }}</span>
      <p
        v-if="latestExecution.error?.code || latestExecution.error?.message"
        class="execution-error"
      >
        <b>{{ latestExecution.error?.code || 'EXECUTION_FAILED' }}</b>
        <span>{{ latestExecution.error?.message || 'Pilot 未提供详细错误' }}</span>
      </p>
    </section>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import * as skillsApi from '@/api/skills'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import ObjectInput from './ObjectInput.vue'
import { runtimeAllowsRobotExecution } from '@/devices/runtimeState'
import { robotSkillDebugTemplate } from '@/robot/skillDebugTemplate'
import { useProjectStore } from '@/stores/project'
import { ACTIVE_ROBOT_EXECUTION_STATUSES, useRobotStore } from '@/stores/robot'
import { useUiStore } from '@/stores/ui'
import { openStudioPanel } from '@/studio/panelService'
import { useExecutionScopeStore } from '@/stores/executionScope'

const props = defineProps({
  robot: { type: Object, required: true },
  skill: { type: Object, required: true }
})
const project = useProjectStore()
const executions = useRobotStore()
const ui = useUiStore()
const inputJson = ref('{}')
const advanced = ref(false)
const parsedInput = computed(() => {
  try {
    const value = JSON.parse(inputJson.value)
    return value && !Array.isArray(value) && typeof value === 'object' ? value : null
  } catch {
    return null
  }
})
const error = ref('')
const skillDetail = ref(null)
const definitionLoading = ref(false)

const recommendedInput = computed(() => robotSkillDebugTemplate(skillDetail.value || props.skill))
const hasRecommendedInput = computed(() => recommendedInput.value !== '{}')

const installation = computed(() =>
  (props.robot.installed_skills || []).find(
    (item) => item.name === props.skill.name && item.version === props.skill.version
  )
)
const latestExecution = computed(
  () =>
    executions
      .forRobot(props.robot.robot_id)
      .filter(
        (item) => item.skill_name === props.skill.name && item.skill_version === props.skill.version
      )
      .sort((left, right) =>
        String(right.created_at || right.updated_at || '').localeCompare(
          String(left.created_at || left.updated_at || '')
        )
      )[0] || null
)
const currentExecution = computed(() => executions.currentForRobot(props.robot))
const activeExecution = computed(() => {
  const execution = currentExecution.value
  if (!execution) return null
  // 当前执行只能来自 Server 的 current_execution_id。interrupted 历史仍保留
  // 排障价值，但不能因为它恰好是同一 Skill 的最近记录就永久锁死下一次调试。
  return ACTIVE_ROBOT_EXECUTION_STATUSES.has(execution.status) || execution.status === 'interrupted'
    ? execution
    : null
})
const runtimeExecutable = computed(
  () => !props.robot.runtime_instance || runtimeAllowsRobotExecution(props.robot.runtime_instance)
)
const blockedReason = computed(() => {
  if (activeExecution.value?.status === 'waiting_agent') {
    const reason = activeExecution.value.error?.message || activeExecution.value.reason
    return reason
      ? `当前执行正在等待 Agent 决策：${reason}。人工调试不会自动代替 Agent 选择恢复策略，请先安全停止，或回到对应 Workflow 继续处理。`
      : '当前执行正在等待 Agent 决策。人工调试不会自动代替 Agent 选择恢复策略，请先安全停止，或回到对应 Workflow 继续处理。'
  }
  if (!project.currentProjectId) return '当前没有打开 Project。'
  if (props.robot.pilot?.status !== 'online') return 'Pilot 当前离线，不能下发或停止 Robot Skill。'
  if (!runtimeExecutable.value) return 'Robot Runtime 尚未确认可执行。'
  if (
    !installation.value ||
    installation.value.status !== 'installed' ||
    !installation.value.enabled
  )
    return '该 Robot 尚未安装并启用此 Skill。'
  if (props.robot.status !== 'idle') return 'Robot 当前不为空闲，不能启动新的物理执行。'
  return ''
})

watch(
  () => `${props.robot.robot_id}:${props.skill.name}@${props.skill.version}`,
  async (selectionKey) => {
    skillDetail.value = null
    inputJson.value = robotSkillDebugTemplate(props.skill)
    error.value = ''
    definitionLoading.value = true
    try {
      const response = await skillsApi.getRobotSkill(props.skill.name, props.skill.version)
      if (`${props.robot.robot_id}:${props.skill.name}@${props.skill.version}` !== selectionKey)
        return
      skillDetail.value = response?.skill || null
      inputJson.value = robotSkillDebugTemplate(skillDetail.value || props.skill)
    } catch (reason) {
      if (`${props.robot.robot_id}:${props.skill.name}@${props.skill.version}` !== selectionKey)
        return
      // 详情不可用时仍允许高级用户手工输入；接口错误由原有技能详情页负责展示，
      // 调试入口不再用一份硬编码模板掩盖 Registry 与 Server 的契约问题。
      error.value = reason.message || 'Robot Skill 正式输入模板加载失败'
    } finally {
      if (`${props.robot.robot_id}:${props.skill.name}@${props.skill.version}` === selectionKey)
        definitionLoading.value = false
    }
  },
  { immediate: true }
)

function resetRecommendedInput() {
  inputJson.value = recommendedInput.value
  error.value = ''
}

function requestKey() {
  if (globalThis.crypto?.randomUUID) return `manual-skill:${globalThis.crypto.randomUUID()}`
  return `manual-skill:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

async function start() {
  try {
    error.value = ''
    const input = JSON.parse(inputJson.value || '{}')
    if (!input || Array.isArray(input) || typeof input !== 'object')
      throw new Error('Skill 输入必须是 JSON 对象')
    const execution = await executions.startSkillDebug(
      project.currentProjectId,
      props.robot.robot_id,
      props.skill,
      input,
      requestKey()
    )
    if (!execution) return
    ui.notify({ type: 'success', message: 'Robot Skill 已进入正式执行链，等待 Pilot 回报' })
    openExecution()
  } catch (reason) {
    error.value = reason.message || 'Robot Skill 调试启动失败'
    ui.notify({ type: 'error', message: error.value })
  }
}

async function stop() {
  try {
    await executions.stop(activeExecution.value)
    ui.notify({ type: 'info', message: '已请求安全停止，界面将等待真实停止证据' })
  } catch (reason) {
    ui.notify({ type: 'error', message: reason.message || 'Robot Skill 停止失败' })
  }
}

function openExecution() {
  if (!latestExecution.value) return
  useExecutionScopeStore().inspectExecution(latestExecution.value.id)
  openStudioPanel('activity')
}
</script>

<style scoped lang="scss">
.robot-skill-debug-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--sf-border-light);
}
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
h3 {
  margin: 0;
  font-size: var(--sf-font-sm);
}
header p,
.warning,
.error {
  margin: 4px 0 0;
  font-size: var(--sf-font-xs);
  line-height: 1.5;
}
header p {
  color: var(--sf-text-secondary);
}
dl {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 6px 8px;
  margin: 12px 0;
  font-size: var(--sf-font-xs);
}
dt {
  color: var(--sf-text-disabled);
}
dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.skill-input {
  display: grid;
  gap: 6px;
  font-size: var(--sf-font-xs);
}
.input-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.input-help {
  margin: 6px 0 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  line-height: 1.5;
}
:deep(textarea) {
  font-family: ui-monospace, monospace;
  font-size: 10px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}
.warning {
  color: var(--sf-warning);
}
.error {
  color: var(--sf-danger);
}
.execution-error {
  display: grid;
  gap: 3px;
  margin: 4px 0 0;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--sf-danger) 28%, transparent);
  color: var(--sf-danger);
  overflow-wrap: anywhere;
}
.execution-error b {
  font-family: ui-monospace, monospace;
  font-size: 10px;
}
.latest {
  display: grid;
  gap: 5px;
  margin-top: 12px;
  padding: 9px;
  border-radius: 8px;
  background: var(--sf-bg-tertiary);
  font-size: var(--sf-font-xs);
}
.latest code {
  overflow-wrap: anywhere;
  color: var(--sf-text-secondary);
}
</style>
