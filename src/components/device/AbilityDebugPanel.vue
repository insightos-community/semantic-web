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
  <section class="ability-debug-panel">
    <header>
      <div>
        <h3>测试能力</h3>
      </div>
      <DeviceStatus v-if="currentDebug" :status="currentDebug.status" />
    </header>
    <template v-if="ability.debug_tasks?.length">
      <el-select v-model="taskName" size="small" placeholder="选择 Task">
        <el-option
          v-for="task in ability.debug_tasks"
          :key="task.name"
          :label="task.name"
          :value="task.name"
        />
      </el-select>
      <details v-if="selectedTask" class="contract-details">
        <summary>接口信息</summary>
        <dl>
          <dt>Input Model</dt>
          <dd>{{ selectedTask.input_model || 'Manifest 未声明' }}</dd>
          <dt>返回值</dt>
          <dd>{{ returnLabel }}</dd>
          <dt>Task Type</dt>
          <dd>{{ selectedTask.task_type ?? '—' }}</dd>
        </dl>
      </details>
      <div class="input-mode">
        <el-switch :model-value="advanced" active-text="JSON 编辑" @change="changeInputMode" />
      </div>
      <div v-if="!advanced" class="parameter-form">
        <label v-for="field in selectedTask?.input_fields || []" :key="field.name">
          <span
            >{{ field.name }} <small>{{ field.required ? '必填' : '可选' }}</small></span
          >
          <el-select
            v-if="field.type === 'boolean'"
            v-model="fieldValues[field.name]"
            clearable
            placeholder="选择"
            ><el-option label="是" value="true" /><el-option label="否" value="false"
          /></el-select>
          <el-input
            v-else
            v-model="fieldValues[field.name]"
            :type="
              ['string', 'enum', 'number', 'integer'].includes(field.type) ? 'text' : 'textarea'
            "
            :rows="3"
            :placeholder="field.type"
            :aria-label="field.name"
          />
          <small>{{ field.description }}</small>
        </label>
        <p v-if="!selectedTask?.input_fields?.length" class="empty">此接口无需参数</p>
      </div>
      <label v-else>
        <span>Task 输入（JSON 对象）</span>
        <el-input v-model="debugJson" type="textarea" :rows="7" />
      </label>
      <p v-if="debugError" class="error">{{ debugError }}</p>
      <div class="actions">
        <el-button
          type="primary"
          size="small"
          :disabled="robot.status !== 'idle' || !runtimeExecutable || Boolean(activeDebug)"
          :loading="abilities.isOperating(`start:${robot.robot_id}:${ability.instance_id}`)"
          @click="startDebug"
        >
          启动调试
        </el-button>
        <el-button
          v-if="activeDebug"
          type="danger"
          plain
          size="small"
          :loading="abilities.isOperating(`stop:${activeDebug.id}`)"
          @click="stopDebug"
        >
          请求停止
        </el-button>
      </div>
      <p v-if="robot.status !== 'idle' || !runtimeExecutable" class="warning">
        {{
          !runtimeExecutable
            ? 'Robot Runtime 尚未确认可执行。'
            : 'Robot 正在执行任务或状态不可确认。'
        }}
      </p>
    </template>
    <p v-else class="empty">该实例没有声明可调试业务 Task。</p>
    <section v-if="currentDebug" class="result">
      <h4>最近调试执行</h4>
      <code>{{ currentDebug.id }}</code>
      <ConfigurationTree v-if="currentDebug.result" :values="currentDebug.result" />
      <p v-if="currentDebug.error" class="error">
        {{ currentDebug.error.message || currentDebug.error.code }}
      </p>
      <p v-for="item in currentDebug.feedback || []" :key="item.sequence">
        <b>#{{ item.sequence }} · {{ item.phase }}</b
        >{{ item.message }}
      </p>
    </section>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { parseDebugFields } from '@/devices/debugInput'
import ConfigurationTree from './ConfigurationTree.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { runtimeAllowsRobotExecution } from '@/devices/runtimeState'
import { useAbilityStore } from '@/stores/ability'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  robot: { type: Object, required: true },
  ability: { type: Object, required: true }
})
const abilities = useAbilityStore()
const ui = useUiStore()
const taskName = ref('')
const debugJson = ref('{}')
const debugError = ref('')
const advanced = ref(false)
const fieldValues = ref({})
const selectedTask = computed(
  () => props.ability.debug_tasks?.find((item) => item.name === taskName.value) || null
)
const currentDebug = computed(
  () =>
    abilities
      .debugForRobot(props.robot.robot_id)
      .filter((item) => item.ability_instance_id === props.ability.instance_id)
      .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')))[0] ||
    null
)
const activeDebug = computed(() =>
  ['starting', 'accepted', 'running', 'stopping'].includes(currentDebug.value?.status)
    ? currentDebug.value
    : null
)
const runtimeExecutable = computed(
  () => !props.robot.runtime_instance || runtimeAllowsRobotExecution(props.robot.runtime_instance)
)
const returnLabel = computed(
  () =>
    selectedTask.value?.returns
      ?.map((item) => `${item.name || 'result'}: ${item.type || 'object'}`)
      .join('、') || 'Manifest 未声明'
)

watch(
  () => props.ability.instance_id,
  () => {
    taskName.value = props.ability.debug_tasks?.[0]?.name || ''
    debugJson.value = '{}'
    debugError.value = ''
  },
  { immediate: true }
)
watch(taskName, () => {
  fieldValues.value = {}
  debugJson.value = '{}'
  debugError.value = ''
})
function changeInputMode(value) {
  debugError.value = ''
  if (value) {
    try {
      debugJson.value = JSON.stringify(
        parseDebugFields(
          (selectedTask.value?.input_fields || []).map((field) => ({ ...field, required: false })),
          fieldValues.value
        ),
        null,
        2
      )
    } catch (error) {
      debugError.value = error.message
      return
    }
  } else {
    try {
      const input = JSON.parse(debugJson.value)
      if (!input || Array.isArray(input) || typeof input !== 'object')
        throw new Error('object required')
      const names = new Set((selectedTask.value?.input_fields || []).map((field) => field.name))
      if (Object.keys(input).some((name) => !names.has(name))) {
        debugError.value = '输入包含表单未声明的字段，请保留 JSON 编辑以免丢失参数'
        return
      }
      fieldValues.value = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [
          key,
          typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
        ])
      )
    } catch {
      debugError.value = 'JSON 格式有误，请先修正'
      return
    }
  }
  advanced.value = value
}

async function startDebug() {
  try {
    debugError.value = ''
    const input = advanced.value
      ? JSON.parse(debugJson.value || '{}')
      : parseDebugFields(selectedTask.value?.input_fields, fieldValues.value)
    if (!input || Array.isArray(input) || typeof input !== 'object')
      throw new Error('Task 输入必须是 JSON 对象')
    await abilities.startDebug(
      props.robot.robot_id,
      props.ability.instance_id,
      taskName.value,
      input
    )
  } catch (error) {
    debugError.value = error.message || 'Ability 调试启动失败'
    ui.notify({ type: 'error', message: debugError.value })
  }
}
async function stopDebug() {
  try {
    await abilities.stopDebug(props.robot.robot_id, activeDebug.value.id)
    ui.notify({ type: 'info', message: '停止请求已送达 Pilot，等待 Ability 返回停止结果' })
  } catch (error) {
    ui.notify({ type: 'error', message: error.message || 'Ability 调试停止失败' })
  }
}
</script>

<style scoped lang="scss">
.ability-debug-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--sf-border-light);
}
.parameter-form {
  display: grid;
  gap: 16px;
  margin: 16px 0;
}
.parameter-form label {
  padding: 12px;
  background: var(--sf-bg-secondary);
  border: 1px solid var(--sf-border-light);
  border-radius: 8px;
}
.parameter-form label > span {
  font-weight: 600;
  color: var(--sf-text-primary);
}
.parameter-form small {
  color: var(--sf-text-secondary);
  font-weight: normal;
}
.input-mode {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.contract-details {
  margin-top: 12px;
  font-size: 12px;
}
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
h3,
h4 {
  margin: 0;
  font-size: var(--sf-font-sm);
}
header p {
  margin: 4px 0 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  line-height: 1.5;
}
.el-select {
  width: 100%;
  margin-top: 10px;
}
dl {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 6px 8px;
  margin: 10px 0;
  font-size: var(--sf-font-xs);
}
dt {
  color: var(--sf-text-disabled);
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}
.actions {
  display: flex;
  gap: 7px;
  margin-top: 10px;
}
.error {
  color: var(--sf-danger);
}
.warning {
  color: var(--sf-warning);
}
.empty {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.result {
  margin-top: 12px;
  padding: 10px;
  border-radius: 7px;
  background: var(--sf-bg-tertiary);
}
.result code {
  display: block;
  margin: 5px 0;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
.result p {
  display: grid;
  gap: 3px;
  margin: 6px 0;
  font-size: var(--sf-font-xs);
}
.result b {
  color: var(--sf-text-secondary);
}
</style>
