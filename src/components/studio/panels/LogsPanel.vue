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
  <section class="logs-panel">
    <header>
      <button v-if="sourceTab" type="button" @click="returnToSource">返回来源</button>
      <b>运行日志</b><span>{{ rows.length }} 组 / {{ events.length }} 条原始记录</span>
      <select v-model="detail" aria-label="日志显示内容">
        <option value="key">关键信息</option>
        <option value="all">全部详细记录</option>
      </select>
      <select v-model="source" aria-label="日志来源">
        <option value="all">全部来源</option>
        <option value="execution">Execution</option>
        <option value="trace">模型 / 工具 Trace</option>
      </select>
      <select v-model="level" aria-label="日志级别">
        <option value="all">全部级别</option>
        <option value="info">Info</option>
        <option value="warning">Warning</option>
        <option value="error">Error</option>
      </select>
      <input v-model="search" type="search" aria-label="搜索日志全文" placeholder="搜索日志全文" />
    </header>
    <p v-if="!rows.length" class="empty">所选运行没有符合条件的记录。</p>
    <details
      v-for="row in visibleRows"
      :key="row.id"
      :open="row.ids.includes(scope.logEventId)"
      class="log-row"
      :data-level="row.level"
      :data-log-id="row.id"
    >
      <summary>
        <time>{{ formatTime(row.at) }}</time
        ><span>{{ row.level }}</span
        ><span>{{ row.source }}</span
        ><b
          >{{ row.message }}<small v-if="row.count > 1"> · 重复 {{ row.count }} 次</small>
          <small v-if="row.stage || row.action" class="summary-context"
            >{{ row.stage ? `阶段 ${row.stage}` : ''
            }}{{ row.action ? ` · 动作 ${row.action}` : '' }}</small
          >
          <small v-if="row.input" class="summary-context">输入 {{ row.input }}</small
          ><small v-if="row.output" class="summary-context">输出 {{ row.output }}</small>
        </b>
      </summary>
      <div class="log-context">
        <span v-if="row.stage">阶段 {{ row.stage }}</span
        ><span v-if="row.action">动作 {{ row.action }}</span
        ><span v-if="row.input">输入 {{ row.input }}</span
        ><span v-if="row.output">输出 {{ row.output }}</span>
      </div>
      <div class="log-detail">
        <button type="button" @click="copy(row)">复制全文</button
        ><span v-if="copiedId === row.id">已复制</span>
        <button v-if="row.executionId" type="button" @click="locateRecord(row, 'logs')">
          定位阶段
        </button>
        <pre>{{ recordText(row.originals.length === 1 ? row.originals[0] : row.originals) }}</pre>
      </div>
    </details>
    <div class="load-row">
      <button v-if="visibleCount < rows.length" type="button" @click="visibleCount += 100">
        显示更多（{{ rows.length - visibleCount }}）
      </button>
      <button
        v-for="execution in pendingPages"
        :key="execution.id"
        type="button"
        :disabled="robots.detailLoading(execution.id)"
        @click="robots.loadMoreEvents(execution.id)"
      >
        加载更多日志 · {{ execution.skill_name }}
      </button>
      <span
        v-for="execution in executions.filter((item) => robots.eventPages[item.id]?.error)"
        :key="`error:${execution.id}`"
        role="alert"
        >{{ robots.eventPages[execution.id].error }}</span
      >
    </div>
    <p
      v-for="run in runs.filter((item) => robots.traceErrors[item.id])"
      :key="run.id"
      class="read-error"
      role="alert"
    >
      {{ run.id }}：{{ robots.traceErrors[run.id] }}
    </p>
    <p class="range-note">
      范围：所选运行的持久 Execution 事件及关联 Run 的 Trace。展开记录可查看完整原文。
    </p>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useExecutionEvidence } from '@/studio/executionEvidence'
import { useRobotStore } from '@/stores/robot'
import { useUiStore } from '@/stores/ui'
import { recordText, isKeyLog, groupLogRows } from '@/robot/executionRecords'

const {
  scope,
  selection,
  events,
  executions,
  runs,
  pendingPages,
  sourceTab,
  locateRecord,
  returnToSource
} = useExecutionEvidence()
const robots = useRobotStore()
const ui = useUiStore()
const source = ref('all')
const level = ref('all')
const search = ref('')
const visibleCount = ref(100)
const copiedId = ref('')
const detail = ref('key')
const rows = computed(() =>
  groupLogRows(
    events.value.filter(
      (row) =>
        (detail.value === 'all' || search.value || row.id === scope.logEventId || isKeyLog(row)) &&
        (source.value === 'all' || row.source === source.value) &&
        (level.value === 'all' || row.level === level.value) &&
        (!search.value ||
          recordText(row.details).toLowerCase().includes(search.value.toLowerCase()))
    )
  )
)
const visibleRows = computed(() => rows.value.slice(0, visibleCount.value))
watch(
  () => [selection.value?.id, source.value, level.value, search.value, detail.value],
  () => {
    visibleCount.value = 100
  }
)
watch(
  () => scope.logEventId,
  async (id) => {
    if (!id) return
    source.value = 'all'
    level.value = 'all'
    search.value = ''
    await nextTick()
    const index = rows.value.findIndex((row) => row.ids.includes(id))
    visibleCount.value = Math.max(visibleCount.value, index + 1)
    await nextTick()
    Array.from(document.querySelectorAll('[data-log-id]'))
      .find((node) => node.dataset.logId === rows.value[index]?.id)
      ?.scrollIntoView?.({ block: 'nearest' })
  },
  { immediate: true }
)
const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : '—'
async function copy(row) {
  try {
    await navigator.clipboard.writeText(
      recordText(row.originals.length === 1 ? row.originals[0] : row.originals)
    )
    copiedId.value = row.id
  } catch (error) {
    ui.notify({ type: 'warning', message: error.message || '复制失败，可从展开记录中选择全文' })
  }
}
</script>

<style scoped>
.logs-panel {
  height: 100%;
  overflow: auto;
  background: var(--sf-bg-secondary);
}
header,
.load-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 11px;
}
header {
  border-bottom: 1px solid var(--sf-border-light);
}
header span {
  margin-right: auto;
}
select,
input,
button {
  padding: 4px 6px;
  border: 1px solid var(--sf-border-light);
  border-radius: 4px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  font-size: 11px;
}
.log-row {
  border-bottom: 1px solid var(--sf-border-light);
  font-size: 11px;
}
summary {
  display: grid;
  grid-template-columns: 76px 55px 70px minmax(0, 1fr);
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
}
summary b {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.summary-context {
  display: block;
  font-weight: 400;
  color: var(--sf-text-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.log-row[data-level='error'] summary {
  color: var(--sf-danger);
}
.log-row[data-level='warning'] summary {
  color: var(--sf-warning);
}
.log-detail {
  padding: 6px 12px;
}
.log-context {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  padding: 0 12px 7px;
  color: var(--sf-text-secondary);
}
.log-context span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 100%;
}
.log-row:not([open]) .log-context {
  display: none;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    11px/1.5 ui-monospace,
    monospace;
}
.empty,
.range-note,
.read-error {
  margin: 10px 12px;
  color: var(--sf-text-secondary);
  font-size: 11px;
}
.read-error {
  color: var(--sf-danger);
}
</style>
