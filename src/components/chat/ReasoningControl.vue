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
  <span class="reasoning-control">
    <el-popover placement="top-start" trigger="click" :width="300">
      <template #reference>
        <button class="reasoning-trigger" type="button" :disabled="disabled">
          {{
            compact ? '推理 · ' + effortLabel : '推理 ' + effortLabel + ' · 思考 ' + visibilityLabel
          }}
        </button>
      </template>
      <div class="reasoning-config">
        <label>
          <span>本轮推理深度</span>
          <el-select v-model="reasoningEffort" size="small">
            <el-option label="自动" value="auto" />
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
            <el-option label="跟随 Agent" value="inherit" />
          </el-select>
        </label>
        <label>
          <span>思考过程</span>
          <el-select v-model="reasoningVisibility" size="small">
            <el-option label="自动" value="auto" />
            <el-option label="显示" value="show" />
            <el-option label="隐藏" value="hide" />
            <el-option label="跟随 Agent" value="inherit" />
          </el-select>
        </label>
        <p class="reasoning-help">
          推理深度不影响请求超时；超时可在设置的 timeout_seconds 中调整。
        </p>
      </div>
    </el-popover>
  </span>
</template>
<script setup>
import { computed } from 'vue'
defineProps({
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})
const reasoningEffort = defineModel('effort', { type: String, default: 'auto' })
const reasoningVisibility = defineModel('visibility', { type: String, default: 'auto' })
const effortLabel = computed(
  () =>
    ({ auto: '自动', low: '低', medium: '中', high: '高', inherit: '跟随 Agent' })[
      reasoningEffort.value
    ] || '自动'
)
const visibilityLabel = computed(
  () =>
    ({ auto: '自动', show: '显示', hide: '隐藏', inherit: '跟随 Agent' })[
      reasoningVisibility.value
    ] || '自动'
)
</script>
<style scoped lang="scss">
.reasoning-control {
  display: inline-flex;
  min-width: 0;
}
.reasoning-trigger {
  padding: 4px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.reasoning-trigger:hover {
  background: var(--sf-bg-hover);
  color: var(--sf-text-primary);
}
.reasoning-trigger:disabled {
  cursor: default;
  opacity: 0.55;
}
.reasoning-config {
  display: grid;
  gap: 12px;
}
.reasoning-help {
  margin: 0;
  color: var(--sf-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.reasoning-config label {
  display: grid;
  grid-template-columns: 94px 1fr;
  align-items: center;
  gap: 8px;
  color: var(--sf-text-secondary);
  font-size: 13px;
}
</style>
