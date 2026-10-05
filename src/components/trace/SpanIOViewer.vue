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
  <section class="span-io" aria-label="模型输入输出">
    <p v-if="loading">正在加载模型输入输出…</p>
    <p v-else-if="error" role="alert">
      {{ error }} <el-button size="small" @click="load">重试</el-button>
    </p>
    <template v-else-if="record">
      <details open>
        <summary>模型输入{{ record.input_truncated ? '（已截断）' : '' }}</summary>
        <pre>{{ record.input }}</pre>
      </details>
      <details open>
        <summary>模型输出{{ record.output_truncated ? '（已截断）' : '' }}</summary>
        <pre>{{ record.output }}</pre>
      </details>
    </template>
  </section>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { getSpanIO } from '@/api/traces'
const props = defineProps({
  traceId: { type: String, required: true },
  spanId: { type: [String, Number], required: true }
})
const loading = ref(false),
  error = ref(''),
  record = ref(null)
let generation = 0
async function load() {
  const token = ++generation
  record.value = null
  error.value = ''
  loading.value = false
  if (!props.traceId || !props.spanId) return
  loading.value = true
  try {
    const result = await getSpanIO(props.traceId, props.spanId)
    if (token === generation) record.value = result
  } catch (reason) {
    if (token === generation) error.value = reason.message || '输入输出加载失败'
  } finally {
    if (token === generation) loading.value = false
  }
}
watch(() => [props.traceId, props.spanId], load, { immediate: true })
onBeforeUnmount(() => generation++)
</script>
<style scoped>
.span-io {
  min-width: 0;
  font-size: 12px;
}
summary {
  cursor: pointer;
  margin-top: 12px;
}
pre {
  max-height: 360px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--sf-bg-secondary);
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  line-height: 1.5;
}
</style>
