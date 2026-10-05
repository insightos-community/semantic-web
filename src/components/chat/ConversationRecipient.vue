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
  <el-popover
    v-model:visible="open"
    trigger="click"
    placement="top-start"
    :width="290"
    :teleported="false"
    @show="load"
  >
    <template #reference>
      <button
        class="recipient-trigger"
        type="button"
        :disabled="disabled"
        aria-label="选择接收 Agent"
      >
        <span>@ {{ selectedName }}</span
        ><ArrowDown />
      </button>
    </template>
    <div class="recipient-picker" @keydown.esc.stop="open = false">
      <el-input
        ref="searchInput"
        v-model="query"
        placeholder="搜索 Agent"
        aria-label="搜索 Agent"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="choose(filtered[index])"
      />
      <p v-if="loading">正在读取 Agent…</p>
      <p v-else-if="error">{{ error }} <button type="button" @click="load">重试</button></p>
      <div v-else role="listbox" aria-label="接收 Agent" class="recipient-options">
        <button
          v-for="(agent, i) in filtered"
          :key="agent.id"
          type="button"
          role="option"
          :aria-selected="i === index"
          @mouseenter="index = i"
          @click="choose(agent)"
        >
          <span
            >{{ agentName(agent)
            }}<small>{{ agent.role === 'robot' ? 'Robot Agent' : agent.role }}</small></span
          >
          <small>{{ statusLabel(agent.status) }}</small>
        </button>
        <p v-if="!filtered.length">没有匹配的 Agent</p>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { listSessionAgents } from '@/api/agents'

const props = defineProps({
  modelValue: { type: String, default: 'leader' },
  sessionId: { type: String, default: '' },
  disabled: Boolean
})
const emit = defineEmits(['update:modelValue'])
const open = ref(false)
const query = ref('')
const index = ref(0)
const rows = ref([])
const loading = ref(false)
const error = ref('')
const searchInput = ref(null)
let revision = 0
function agentName(agent) {
  return agent.display_name || agent.robot_id || agent.id
}
function statusLabel(status) {
  return (
    { idle: '空闲', running: '工作中', offline: '离线', starting: '启动中', stopped: '已停止' }[
      status
    ] || ''
  )
}
const selectedName = computed(() => {
  const row = rows.value.find((item) => item.id === props.modelValue)
  return row ? agentName(row) : props.modelValue.replace(/^robot:/u, '')
})
const filtered = computed(() =>
  rows.value.filter((row) =>
    `${agentName(row)} ${row.role}`.toLowerCase().includes(query.value.toLowerCase())
  )
)
watch(query, () => {
  index.value = 0
})
watch(
  () => props.sessionId,
  () => {
    revision += 1
    rows.value = []
    open.value = false
    query.value = ''
    loading.value = false
  }
)
async function load() {
  const version = ++revision
  loading.value = true
  error.value = ''
  try {
    const data = await listSessionAgents(props.sessionId)
    if (version !== revision) return
    rows.value = data?.recipients || []
  } catch (err) {
    if (version === revision) error.value = err.message || 'Agent 目录读取失败'
  } finally {
    if (version === revision) loading.value = false
    await nextTick()
    if (version === revision) searchInput.value?.focus()
  }
}
function move(direction) {
  index.value = Math.max(0, Math.min(filtered.value.length - 1, index.value + direction))
}
function choose(agent) {
  if (!agent) return
  emit('update:modelValue', agent.id)
  open.value = false
  query.value = ''
}
function show() {
  if (!props.disabled) open.value = true
}
defineExpose({ show })
</script>

<style scoped>
.recipient-trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;
  font-size: 12px;
  max-width: 190px;
  padding: 4px;
}
.recipient-trigger span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.recipient-trigger svg {
  width: 12px;
  flex-shrink: 0;
}
.recipient-options {
  max-height: 260px;
  overflow-y: auto;
  margin-top: 8px;
}
.recipient-options button {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--sf-text-primary);
  padding: 8px;
  text-align: left;
  cursor: pointer;
}
.recipient-options button[aria-selected='true'] {
  background: var(--sf-bg-hover);
}
.recipient-options span {
  overflow-wrap: anywhere;
}
.recipient-options small {
  display: block;
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.recipient-picker p {
  font-size: 12px;
  color: var(--sf-text-secondary);
}
</style>
