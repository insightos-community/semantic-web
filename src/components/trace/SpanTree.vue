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
  <!-- span 树（R19）：parent_id 组树压平为缩进行，名称 + kind 徽标 + 耗时条。
       点击行向父级emit select（TraceView 右栏展示该 span 详情）。 -->
  <div class="span-tree">
    <EmptyState v-if="rows.length === 0" description="该链路暂无跨度数据" />
    <div
      v-for="{ span, depth } in rows"
      :key="span.id"
      class="span-row"
      :class="{ active: span.id === selectedId }"
      @click="$emit('select', span)"
    >
      <span class="span-indent" :style="{ width: `${depth * 16}px` }" />
      <el-tag size="small" effect="plain" class="kind-tag" :type="kindTagType(span.kind)">
        {{ span.kind || 'unknown' }}
      </el-tag>
      <el-tooltip :content="span.name" effect="dark" :show-after="500" placement="top">
        <span class="span-name">{{ span.name }}</span>
      </el-tooltip>
      <span class="span-bar">
        <span
          class="span-bar-fill"
          :style="{ width: `${barWidth(span)}%`, background: barColor(span.kind) }"
        />
      </span>
      <span class="span-ms">{{ formatDuration(span.duration_ms) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import EmptyState from '@/components/base/EmptyState.vue'
import { flattenSpans, formatDuration } from './spans'

const props = defineProps({
  spans: { type: Array, default: () => [] },
  selectedId: { type: [Number, String], default: null }
})

defineEmits(['select'])

const rows = computed(() => flattenSpans(props.spans))

const maxMs = computed(() =>
  rows.value.reduce((acc, { span }) => Math.max(acc, Number(span.duration_ms) || 0), 0)
)

// 耗时条相对本链路最长跨度归一
function barWidth(span) {
  const ms = Number(span.duration_ms) || 0
  if (maxMs.value <= 0 || ms <= 0) return 0
  return Math.max(2, Math.round((ms / maxMs.value) * 100))
}

// 与三分解条同一配色约定（spans.js BREAKDOWN_SEGMENTS）
function barColor(kind) {
  if (kind === 'ChatModel') return 'var(--sf-channel-dialogue)'
  if (kind === 'Tool') return 'var(--sf-channel-artifact)'
  return 'var(--sf-channel-trace)'
}

function kindTagType(kind) {
  if (kind === 'ChatModel') return 'primary'
  if (kind === 'Tool') return 'warning'
  return 'info'
}
</script>

<style scoped lang="scss">
.span-tree {
  overflow-y: auto;
  padding: var(--sf-space-2);
}

.span-row {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  padding: var(--sf-space-1) var(--sf-space-2);
  border-radius: var(--sf-radius-sm);
  cursor: pointer;

  &:hover {
    background: var(--sf-bg-hover);
  }

  &.active {
    background: var(--sf-bg-tertiary);
  }
}

.span-indent {
  flex: none;
}

.kind-tag {
  flex: none;
  min-width: 76px;
  text-align: center;
}

.span-name {
  overflow: hidden;
  color: var(--sf-text-primary);
  font-size: var(--sf-font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.span-bar {
  flex: 1;
  min-width: 40px;
  height: 8px;
  overflow: hidden;
  border-radius: var(--sf-radius-sm);
  background: var(--sf-bg-tertiary);
}

.span-bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--sf-radius-sm);
}

.span-ms {
  flex: none;
  width: 64px;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
