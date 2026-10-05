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
  <!-- Trace 摘要（R19）：耗时三分解条（推理/工具/等待按 kind 聚合）+
       metering 卡（该 trace 的模型/用量/成本明细，GET /metering/traces/{id}）。 -->
  <div class="trace-summary">
    <div class="breakdown">
      <div class="breakdown-bar">
        <el-tooltip
          v-for="seg in segments"
          :key="seg.key"
          :content="`${seg.label} ${formatDuration(seg.ms)}`"
          effect="dark"
          :show-after="500"
          placement="top"
        >
          <span class="seg" :style="{ width: `${seg.ratio * 100}%`, background: seg.color }" />
        </el-tooltip>
        <span v-if="totalMs === 0" class="seg-empty">无耗时数据</span>
      </div>
      <ul class="breakdown-legend">
        <li v-for="seg in segments" :key="seg.key">
          <span class="dot" :style="{ background: seg.color }" />
          <span class="seg-label">{{ seg.label }}</span>
          <span class="seg-ms">{{ formatDuration(seg.ms) }}</span>
        </li>
        <li class="total">
          <span class="seg-label">合计</span>
          <span class="seg-ms">{{ formatDuration(totalMs) }}</span>
        </li>
      </ul>
    </div>

    <div class="metering-card">
      <div class="card-title">计量（{{ metering.length }} 次模型调用）</div>
      <table v-if="metering.length > 0" class="metering-table">
        <thead>
          <tr>
            <th>模型</th>
            <th>Agent</th>
            <th>用途</th>
            <th class="num">输入</th>
            <th class="num">输出</th>
            <th class="num">成本估算</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(rec, i) in metering" :key="i">
            <td>{{ rec.model || '-' }}</td>
            <td>{{ rec.agent || '-' }}</td>
            <td>{{ rec.purpose || '-' }}</td>
            <td class="num">{{ rec.prompt_tokens }}</td>
            <td class="num">{{ rec.completion_tokens }}</td>
            <td class="num">{{ costText(rec.cost_estimate) }}</td>
          </tr>
          <tr class="sum-row">
            <td colspan="3">合计（{{ totalTokens }} tokens）</td>
            <td class="num">{{ sumOf('prompt_tokens') }}</td>
            <td class="num">{{ sumOf('completion_tokens') }}</td>
            <td class="num">{{ costText(totalCost) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="metering-empty">该链路无计量记录（未挂观测或模型调用未产生用量）</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { aggregateByKind, formatDuration } from './spans'

const props = defineProps({
  spans: { type: Array, default: () => [] },
  metering: { type: Array, default: () => [] }
})

const segments = computed(() => aggregateByKind(props.spans))
const totalMs = computed(() => segments.value.reduce((acc, seg) => acc + seg.ms, 0))

const totalTokens = computed(() =>
  props.metering.reduce((acc, r) => acc + (Number(r.total_tokens) || 0), 0)
)
const totalCost = computed(() =>
  props.metering.reduce((acc, r) => acc + (Number(r.cost_estimate) || 0), 0)
)

function sumOf(field) {
  return props.metering.reduce((acc, r) => acc + (Number(r[field]) || 0), 0)
}

// 成本估算为每 1K tokens 单价换算的小额浮点（mock 端点单价为 0）
function costText(cost) {
  const v = Number(cost) || 0
  return `$${v.toFixed(4)}`
}
</script>

<style scoped lang="scss">
.trace-summary {
  display: flex;
  align-items: flex-start;
  gap: var(--sf-space-4);
  padding: var(--sf-space-3) var(--sf-space-4);
  border-bottom: 1px solid var(--sf-border-light);
}

.breakdown {
  flex: 1;
  min-width: 0;
}

.breakdown-bar {
  display: flex;
  height: 10px;
  overflow: hidden;
  border-radius: var(--sf-radius-sm);
  background: var(--sf-bg-tertiary);
}

.seg {
  display: block;
  height: 100%;
}

.seg-empty {
  align-self: center;
  margin: 0 auto;
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
  line-height: 10px;
}

.breakdown-legend {
  display: flex;
  gap: var(--sf-space-3);
  margin: var(--sf-space-2) 0 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: var(--sf-space-1);
  }

  .total {
    margin-left: auto;
  }
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.seg-label {
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}

.seg-ms {
  color: var(--sf-text-primary);
  font-size: var(--sf-font-xs);
  font-variant-numeric: tabular-nums;
}

.metering-card {
  flex: none;
  width: 420px;
  padding: var(--sf-space-2) var(--sf-space-3);
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-md);
  background: var(--sf-bg-secondary);
}

.card-title {
  margin-bottom: var(--sf-space-1);
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
}

.metering-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--sf-font-xs);

  th,
  td {
    padding: 2px var(--sf-space-1);
    color: var(--sf-text-secondary);
    text-align: left;
    white-space: nowrap;
  }

  td {
    color: var(--sf-text-primary);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .sum-row td {
    border-top: 1px solid var(--sf-border-light);
    color: var(--sf-text-secondary);
  }
}

.metering-empty {
  color: var(--sf-text-disabled);
  font-size: var(--sf-font-xs);
}
</style>
