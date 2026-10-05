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
  <section class="execution-history">
    <aside>
      <header>
        <h2>执行历史</h2>
        <span>{{ executions.length }}</span>
      </header>
      <button
        v-for="execution in executions"
        :key="execution.id"
        type="button"
        :class="{ active: execution.id === selected?.id }"
        @click="select(execution)"
      >
        <DeviceStatus :status="execution.status" />
        <span>
          <b>{{ execution.skill_name }}</b>
          <small>{{ execution.id }}</small>
          <small>{{ execution.stage_label || execution.stage || '尚无阶段摘要' }}</small>
          <small>{{ formatTime(execution.created_at || execution.started_at) }}</small>
        </span>
      </button>
      <p v-if="!executions.length">当前 Robot 没有执行历史。</p>
    </aside>
    <main>
      <DeviceExecutionTimeline :execution="selected" />
    </main>
  </section>
</template>

<script setup>
import { computed, watch } from 'vue'
import DeviceExecutionTimeline from '@/components/device/DeviceExecutionTimeline.vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import { useRobotStore } from '@/stores/robot'

const props = defineProps({ executions: { type: Array, default: () => [] } })
const robots = useRobotStore()
const selected = computed(
  () =>
    props.executions.find((item) => item.id === robots.selectedExecutionId) ||
    props.executions[0] ||
    null
)

watch(
  () => props.executions.map((item) => item.id).join('|'),
  () => {
    if (selected.value && selected.value.id !== robots.selectedExecutionId)
      void select(selected.value)
  },
  { immediate: true }
)

async function select(execution) {
  await robots.select(execution.id)
}

const formatTime = (value) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '—'
</script>

<style scoped lang="scss">
.execution-history {
  display: grid;
  height: 100%;
  min-height: 0;
  grid-template-columns: 260px minmax(0, 1fr);
}
aside {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid var(--sf-border-light);
  background: var(--sf-bg-secondary);
}
aside header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px;
  border-bottom: 1px solid var(--sf-border-light);
}
aside h2 {
  margin: 0;
  font-size: var(--sf-font-md);
}
aside header span {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
aside button {
  display: grid;
  align-items: flex-start;
  width: 100%;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 8px;
  padding: 12px;
  border: 0;
  border-bottom: 1px solid var(--sf-border-light);
  background: transparent;
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;
}
aside button:hover {
  background: var(--sf-bg-hover);
}
aside button.active {
  background: var(--sf-brand-soft);
}
aside button > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
aside b,
aside small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
aside b {
  font-size: var(--sf-font-xs);
}
aside small {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
aside p {
  padding: 28px 14px;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  text-align: center;
}
main {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
@media (max-width: 900px) {
  .execution-history {
    grid-template-columns: 1fr;
  }
  aside {
    max-height: 220px;
    border-right: 0;
    border-bottom: 1px solid var(--sf-border-light);
  }
}
</style>
