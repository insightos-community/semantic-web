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
  <div class="robot-executions-panel">
    <aside>
      <header>
        <b>Robot Executions</b><span>{{ robots.executions.length }} 条</span>
      </header>
      <button
        v-for="execution in robots.executions"
        :key="execution.id"
        type="button"
        :class="{ active: execution.id === selected?.id }"
        @click="selectExecution(execution.id)"
      >
        <DeviceStatus :status="execution.status" />
        <span>
          <b>{{ execution.skill_name }}</b>
          <small>{{ execution.robot_id }}</small>
          <small>{{ execution.id }}</small>
        </span>
      </button>
      <div v-if="!robots.executions.length" class="empty">当前 Project 没有 Robot Execution。</div>
    </aside>
    <main><StudioExecutionTimeline :execution="selected" /></main>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
import StudioExecutionTimeline from '@/components/studio/StudioExecutionTimeline.vue'
import { useRobotStore } from '@/stores/robot'
import { openStudioPanel } from '@/studio/panelService'

const props = defineProps({ panelParams: { type: Object, default: () => ({}) } })
const robots = useRobotStore()
const selected = computed(() =>
  props.panelParams.resourceId
    ? robots.byId(props.panelParams.resourceId)
    : robots.selected || robots.executions[0] || null
)

function selectExecution(id) {
  // 从历史记录打开另一个预览，保留页仍绑定原 Execution ID。
  openStudioPanel('runtime', { resourceType: 'robot_execution', resourceId: id })
}

watch(
  () => props.panelParams.resourceId,
  (executionId) => executionId && robots.byId(executionId) && void robots.select(executionId),
  { immediate: true }
)
</script>

<style scoped lang="scss">
.robot-executions-panel {
  display: grid;
  grid-template-columns: 245px minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
}

aside {
  overflow: auto;
  border-right: 1px solid var(--sf-border-light);
  background: var(--sf-bg-tertiary);
}

aside > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 11px;
  border-bottom: 1px solid var(--sf-border-light);

  b {
    font-size: 11px;
  }
  span {
    color: var(--sf-text-disabled);
    font-size: 11px;
  }
}

aside > button {
  display: flex;
  align-items: flex-start;
  width: 100%;
  gap: 9px;
  padding: 11px;
  border: 0;
  border-bottom: 1px solid var(--sf-border-light);
  background: transparent;
  color: var(--sf-text-primary);
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--sf-bg-hover);
  }
  &.active {
    background: var(--sf-bg-secondary);
  }

  > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  b {
    font-size: 11px;
  }
  small {
    overflow: hidden;
    color: var(--sf-text-disabled);
    font-family: ui-monospace, monospace;
    font-size: 10px;
    text-overflow: ellipsis;
  }
}

main {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.empty {
  padding: 25px 12px;
  color: var(--sf-text-disabled);
  font-size: 11px;
  text-align: center;
}
</style>
