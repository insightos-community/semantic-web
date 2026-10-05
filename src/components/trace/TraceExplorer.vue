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
  <section class="trace-explorer" data-testid="trace-explorer">
    <header>
      <div>
        <h2>
          {{ run?.agent_name || run?.agent_id || '调用分析' }} <small>{{ run?.model || '' }}</small>
        </h2>
        <span
          >{{ statusText(run?.status) }} · {{ run ? durationLabel(run) : '按真实记录查看' }}</span
        >
      </div>
      <el-button size="small" :loading="loading" @click="load">刷新记录</el-button>
    </header>
    <p v-if="error" role="alert" class="warning">{{ error }}</p>
    <div v-if="!effectiveTraceId && !runId" class="empty">请选择一个 Agent Run 查看调用记录。</div>
    <template v-else>
      <div class="call-controls">
        <el-input
          v-model="query"
          aria-label="搜索调用"
          class="call-search"
          clearable
          placeholder="搜索模型、工具或错误"
          size="small"
        />
        <el-select
          v-model="kind"
          aria-label="调用类型"
          class="call-kind-select"
          placeholder="全部调用"
          size="small"
          style="width: 128px"
        >
          <el-option label="全部调用" value="" />
          <el-option label="模型" value="model" />
          <el-option label="工具" value="tool" />
          <el-option label="错误" value="error" />
        </el-select>
        <span>{{ calls.length }} 条调用</span>
      </div>
      <div class="calls-layout">
        <nav aria-label="模型与工具调用" class="calls-list">
          <button
            v-for="(call, index) in filtered"
            :key="call.id"
            type="button"
            :class="{ selected: selected?.id === call.id }"
            @click="selectedId = call.id"
          >
            <span class="call-type"
              >{{ call.kind === 'model' ? '模型' : '工具' }} {{ index + 1 }}</span
            >
            <b>{{ call.name }}</b
            ><span>{{ statusText(call.status) }}</span>
            <small
              >{{ time(call.startedAt || call.endedAt) }} ·
              {{ call.duration == null ? '耗时未上报' : formatDuration(call.duration) }}</small
            >
            <p v-if="call.error" class="warning">{{ recordText(call.error) }}</p>
          </button>
          <p v-if="!filtered.length" class="empty">
            {{
              loading
                ? '正在读取调用…'
                : calls.length
                  ? '没有匹配调用'
                  : '尚无模型或工具调用记录；可展开下方原始 Span 查看已有链路。'
            }}
          </p>
          <el-button v-if="hasMore" size="small" :loading="paging" @click="loadMore">
            加载更多调用记录
          </el-button>
          <p v-if="eventError" role="alert" class="warning">{{ eventError }}</p>
        </nav>
        <article v-if="selected" class="call-detail">
          <header>
            <b>{{ selected.name }}</b
            ><span>{{ statusText(selected.status) }}</span>
          </header>
          <section v-if="selected.error">
            <h3>错误</h3>
            <pre class="warning">{{ recordText(selected.error) }}</pre>
          </section>
          <SpanIOViewer
            v-if="selected.span?.has_io"
            :trace-id="effectiveTraceId"
            :span-id="selected.span.id"
          />
          <section v-if="!selected.span?.has_io">
            <h3>{{ selected.kind === 'model' ? '已保存的模型输入' : '调用参数' }}</h3>
            <pre v-if="selected.input !== undefined">{{ recordText(selected.input) }}</pre>
            <p v-else class="missing">此记录未保存输入正文，不以空对象代替。</p>
          </section>
          <section v-if="!selected.span?.has_io">
            <h3>返回结果</h3>
            <pre v-if="selected.output !== undefined">{{ recordText(selected.output) }}</pre>
            <p v-else class="missing">
              {{ selected.status === 'running' ? '等待调用返回' : '此记录未保存返回正文' }}
            </p>
            <p v-if="selected.truncated" class="warning">服务端返回已截断，以上不是完整结果。</p>
          </section>
          <details>
            <summary>时间、标识与原始记录</summary>
            <pre>{{ recordText(selected.span || selected.events) }}</pre>
          </details>
        </article>
      </div>
      <details class="advanced">
        <summary>原始 Span 与计量 · {{ spans.length }} 个 Span</summary>
        <TraceSummary :spans="spans" :metering="metering" /><SpanTree
          :spans="spans"
          :selected-id="rawSpan?.id"
          @select="rawSpan = $event"
        />
        <pre v-if="rawSpan">{{ recordText(rawSpan) }}</pre>
        <SpanIOViewer v-if="rawSpan?.has_io" :trace-id="effectiveTraceId" :span-id="rawSpan.id" />
      </details>
      <details class="advanced">
        <summary>本 Run 的公开消息与标识</summary>
        <code>Run {{ runId || '未关联' }} · Trace {{ effectiveTraceId || '未提供' }}</code>
        <article v-for="event in publicMessages" :key="event.id || event.sequence">
          <h3>{{ event.type === 'message.done' ? '公开回复' : '消息' }}</h3>
          <pre>{{ recordText(event.payload) }}</pre>
        </article>
        <p v-if="!publicMessages.length" class="missing">
          当前已加载记录没有公开消息。已保存的模型输入输出可在对应调用中查看。
        </p>
      </details>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import TraceSummary from './TraceSummary.vue'
import SpanTree from './SpanTree.vue'
import SpanIOViewer from './SpanIOViewer.vue'
import { formatDuration } from './spans'
import { mergeRunEvents, traceCallRows } from './records'
import { durationLabel } from '@/robot/executionRecords'
import { useRunsStore } from '@/stores/runs'
import { getRun, getRunEvents } from '@/api/runs'
import { getSpans, getTraceMetering } from '@/api/traces'
const props = defineProps({
  traceId: { type: String, default: '' },
  runId: { type: String, default: '' }
})
const runs = useRunsStore()
const run = ref(null),
  spans = ref([]),
  metering = ref([]),
  events = ref([])
const loading = ref(false),
  paging = ref(false),
  error = ref(''),
  eventError = ref(''),
  hasMore = ref(false),
  cursor = ref(0)
const query = ref(''),
  kind = ref(''),
  selectedId = ref(''),
  rawSpan = ref(null)
let generation = 0
const runId = computed(
  () => props.runId || runs.items.find((item) => item.trace_id === props.traceId)?.id || ''
)
const effectiveTraceId = computed(() => props.traceId || run.value?.trace_id || '')
const calls = computed(() => traceCallRows(spans.value, events.value, runId.value))
const filtered = computed(() =>
  calls.value.filter(
    (call) =>
      (!kind.value || (kind.value === 'error' ? Boolean(call.error) : call.kind === kind.value)) &&
      (!query.value || recordText(call).toLowerCase().includes(query.value.toLowerCase()))
  )
)
const selected = computed(
  () =>
    filtered.value.find((call) => call.id === selectedId.value) ||
    filtered.value.find((call) => call.error) ||
    filtered.value[0] ||
    null
)
const publicMessages = computed(() =>
  events.value.filter((event) => ['message.done', 'message.error'].includes(event.type))
)
const recordText = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))
const time = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
    : '时间未上报'
const statusText = (value) =>
  ({
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    waiting_input: '等待输入',
    queued: '排队中',
    cancelling: '停止中'
  })[value] ||
  value ||
  '状态未上报'
async function readEvents(id, token, afterSequence = 0) {
  try {
    const response = await getRunEvents(id, { afterSequence })
    if (token !== generation) return
    events.value = mergeRunEvents(events.value, response.events, id)
    const next = Number(response.next_sequence || afterSequence)
    hasMore.value = response.has_more === true && next > afterSequence
    cursor.value = next
    eventError.value =
      response.has_more && next <= afterSequence
        ? '调用记录分页游标未前进，已保留当前记录。请刷新重试。'
        : ''
  } catch (reason) {
    if (token === generation) eventError.value = `调用参数与结果读取失败：${reason.message}`
  }
}
async function load() {
  const token = ++generation
  loading.value = true
  error.value = ''
  eventError.value = ''
  paging.value = false
  run.value = null
  spans.value = []
  events.value = []
  metering.value = []
  rawSpan.value = null
  cursor.value = 0
  hasMore.value = false
  try {
    if (runId.value) {
      const response = await getRun(runId.value)
      if (token !== generation) return
      run.value = response.run || null
      if (props.traceId && run.value?.trace_id && props.traceId !== run.value.trace_id)
        throw new Error('Run 与 Trace 不匹配，未合并其他运行记录')
    }
    const id = effectiveTraceId.value
    await Promise.all([
      ...(id
        ? [
            getSpans(id).then((response) => {
              if (token === generation)
                spans.value = (response.spans || []).map((span) => ({
                  ...span,
                  id: span.id || span.span_id
                }))
            }),
            getTraceMetering(id)
              .then((response) => {
                if (token === generation) metering.value = response.records || []
              })
              .catch(() => {})
          ]
        : []),
      ...(runId.value ? [readEvents(runId.value, token)] : [])
    ])
  } catch (reason) {
    if (token === generation) error.value = `调用分析读取失败：${reason.message}`
  } finally {
    if (token === generation) loading.value = false
  }
}
async function loadMore() {
  if (paging.value || !hasMore.value) return
  const token = generation
  paging.value = true
  await readEvents(runId.value, token, cursor.value)
  if (token === generation) paging.value = false
}
watch(() => [props.traceId, runId.value], load, { immediate: true })
onBeforeUnmount(() => generation++)
</script>

<style scoped>
.trace-explorer {
  height: 100%;
  overflow: auto;
  min-width: 0;
  padding: 12px;
  container-type: inline-size;
}
.trace-explorer > header,
.call-detail > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
h2 {
  margin: 0;
  font-size: 16px;
}
h2 small {
  font-size: 11px;
  font-weight: 400;
  color: var(--sf-text-secondary);
}
header span,
.missing,
.empty {
  color: var(--sf-text-secondary);
  font-size: 12px;
}
.call-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  font-size: 11px;
}
.call-search {
  flex: 1;
  min-width: 0;
  :deep(.el-input__wrapper) {
    height: 32px;
    min-height: 32px;
    border-radius: 5px;
    font-size: 12px;
  }
}
.call-kind-select {
  flex: none;
  :deep(.el-select__wrapper) {
    height: 32px;
    min-height: 32px;
    border-radius: 5px;
    font-size: 12px;
  }
}
.calls-layout {
  display: grid;
  grid-template-columns: minmax(200px, 40%) minmax(0, 1fr);
  gap: 12px;
}
.calls-list {
  min-width: 0;
  max-height: 580px;
  overflow: auto;
}
.calls-list button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  text-align: left;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 6px;
  font-size: 11px;
}
.calls-list button.selected {
  border-color: var(--sf-brand);
  background: var(--sf-brand-soft);
}
.calls-list b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.calls-list small,
.calls-list p {
  grid-column: 2/-1;
  margin: 0;
  color: var(--sf-text-secondary);
  overflow-wrap: anywhere;
}
.call-type {
  color: var(--sf-brand);
  font-size: 10px;
}
.call-detail {
  min-width: 0;
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  padding: 12px;
}
h3 {
  font-size: 12px;
  margin: 10px 0 6px;
}
pre {
  max-height: 360px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--sf-bg-secondary);
  border-radius: 6px;
  margin: 6px 0;
  padding: 8px;
  font-size: 11px;
  line-height: 1.5;
}
.warning {
  color: var(--sf-warning);
  font-size: 12px;
  overflow-wrap: anywhere;
}
summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--sf-text-secondary);
}
.advanced {
  margin-top: 14px;
  border-top: 1px solid var(--sf-border-light);
  padding-top: 12px;
}
.advanced code {
  overflow-wrap: anywhere;
  font-size: 10px;
}
@container (max-width: 640px) {
  .calls-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .calls-list {
    max-height: 230px;
  }
  .trace-explorer :deep(.trace-summary) {
    flex-wrap: wrap;
  }
}
</style>
