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
  <!-- tool.result 的折叠展示。当前实时事件提供工具名与结果；参数、开始时间和
       细粒度耗时仍以 Trace 为准，组件对这些字段保持向前兼容。 -->
  <div class="tool-call" :class="`is-${call.status || 'done'}`">
    <button type="button" class="tool-head" @click="expanded = !expanded">
      <el-icon class="tool-icon" :class="{ 'is-loading': call.status === 'running' }">
        <Loading v-if="call.status === 'running'" />
        <CircleCheckFilled v-else-if="call.status === 'done'" />
        <CircleCloseFilled v-else-if="call.status === 'error'" />
        <Tools v-else />
      </el-icon>
      <span class="tool-name">{{ call.name || 'tool' }}</span>
      <span v-if="durationText" class="tool-duration">{{ durationText }}</span>
      <span class="tool-status">{{ statusText }}</span>
      <el-icon class="tool-arrow" :class="{ expanded }"><ArrowDown /></el-icon>
    </button>
    <div v-if="expanded" class="tool-body">
      <div v-if="call.truncated" class="tool-truncated">
        实时结果已截断；完整大结果请通过 Trace 或产物引用查看。
      </div>
      <div v-if="call.summary" class="tool-summary">{{ call.summary }}</div>
      <template v-if="paramsText">
        <div class="tool-label">参数</div>
        <pre class="tool-pre">{{ paramsText }}</pre>
      </template>
      <template v-if="resultText">
        <div class="tool-label">结果</div>
        <pre class="tool-pre">{{ resultText }}</pre>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  ArrowDown,
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
  Tools
} from '@element-plus/icons-vue'

// call 契约（对齐 14-frontend-api §4.3 预留形态）：
// { name, status: 'running'|'done'|'error', durationMs?, summary?, params?, result? }
const props = defineProps({
  call: { type: Object, required: true }
})

const expanded = ref(false)

const STATUS_TEXT = { running: '执行中', done: '完成', error: '失败' }
const statusText = computed(() => STATUS_TEXT[props.call.status] || '完成')

const durationText = computed(() => {
  const ms = props.call.durationMs
  if (typeof ms !== 'number' || ms < 0) return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
})

function pretty(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

const paramsText = computed(() => pretty(props.call.params))
const resultText = computed(() => pretty(props.call.result))
</script>

<style scoped lang="scss">
.tool-call {
  margin: var(--sf-space-1) 0;
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-md);
  background: color-mix(in srgb, var(--sf-bg-secondary) 88%, transparent);
  overflow: hidden;
}

.tool-head {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  width: 100%;
  padding: 7px 9px;
  border: none;
  background: transparent;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
  cursor: pointer;

  &:hover {
    background: var(--sf-bg-hover);
  }
}

.tool-icon {
  color: var(--sf-channel-trace);

  &.is-loading {
    animation: tool-spin 1s linear infinite;
  }

  .is-done & {
    color: var(--sf-success);
  }

  .is-error & {
    color: var(--sf-danger);
  }
}

@keyframes tool-spin {
  to {
    transform: rotate(360deg);
  }
}

.tool-name {
  color: var(--sf-text-primary);
  font-family: 'SFMono-Regular', Consolas, Menlo, monospace;
  font-size: var(--sf-font-xs);
}

.tool-duration,
.tool-status {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.tool-arrow {
  margin-left: auto;
  transition: transform 0.15s ease;

  &.expanded {
    transform: rotate(180deg);
  }
}

.tool-body {
  padding: var(--sf-space-2) var(--sf-space-3);
  border-top: 1px solid var(--sf-border-light);
}

.tool-summary {
  margin-bottom: var(--sf-space-2);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-sm);
}

.tool-truncated {
  margin-bottom: var(--sf-space-2);
  padding: 7px 9px;
  border-left: 2px solid var(--sf-warning);
  background: color-mix(in srgb, var(--sf-warning) 7%, transparent);
  color: var(--sf-warning);
  font-size: var(--sf-font-xs);
}

.tool-label {
  margin: var(--sf-space-2) 0 var(--sf-space-1);
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}

.tool-pre {
  margin: 0;
  padding: var(--sf-space-2);
  border-radius: var(--sf-radius-sm);
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 260px;
  overflow-y: auto;
}
</style>
