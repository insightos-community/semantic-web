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
  <article v-if="tool" class="tool-detail">
    <header class="detail-header">
      <div>
        <span class="detail-kicker">TOOL CONTRACT</span>
        <h2>{{ tool.name }}</h2>
        <p>{{ tool.description || '暂无描述' }}</p>
      </div>
      <el-tag :type="tool.health === 'unavailable' ? 'danger' : 'success'" effect="plain">
        {{ tool.health === 'unavailable' ? '服务失联' : '可用' }}
      </el-tag>
    </header>

    <div class="tag-row">
      <el-tag v-for="tag in tool.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
    </div>

    <section class="field-card">
      <div v-for="field in fields" :key="field.label" class="field-row">
        <span class="field-label">{{ field.label }}</span>
        <span class="field-value">{{ field.value }}</span>
      </div>
    </section>

    <section class="schema-card">
      <div class="section-heading">
        <span>参数契约</span>
        <span>JSON Schema</span>
      </div>
      <pre><code>{{ schemaText }}</code></pre>
    </section>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tool: { type: Object, default: null }
})

const fields = computed(() => [
  { label: 'namespace', value: props.tool?.namespace || 'general' },
  { label: 'source', value: props.tool?.sourceTitle || '--' },
  { label: 'model_name', value: props.tool?.model_name || props.tool?.name || '--' },
  { label: 'delivery', value: props.tool?.delivery || 'installed' },
  { label: 'risk', value: props.tool?.risk || 'low' },
  { label: 'health', value: props.tool?.health || 'healthy' },
  { label: 'updated_at', value: formatTime(props.tool?.updated_at) }
])

const schemaText = computed(() => JSON.stringify(props.tool?.schema || {}, null, 2))

function formatTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}
</script>

<style scoped lang="scss">
.tool-detail {
  height: 100%;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 4px 2px 16px;
  border-bottom: 1px solid var(--sf-border-light);

  h2 {
    margin: 4px 0 6px;
    color: var(--sf-text-primary);
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: var(--sf-font-xl);
  }

  p {
    margin: 0;
    color: var(--sf-text-secondary);
    font-size: var(--sf-font-sm);
    line-height: 1.6;
  }
}

.detail-kicker {
  color: var(--sf-brand);
  font-size: 9px;
  font-weight: 520;
  letter-spacing: 0.12em;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 14px 0;
}

.field-card,
.schema-card {
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-lg);
  background: var(--sf-bg-primary);
}

.field-card {
  margin-bottom: 14px;
  padding: var(--sf-space-4);
}

.field-row {
  display: flex;
  gap: var(--sf-space-3);
  padding: 5px 0;
  font-size: var(--sf-font-sm);
}

.field-label {
  width: 110px;
  flex: none;
  color: var(--sf-text-disabled);
  font-family: monospace;
}

.field-value {
  min-width: 0;
  color: var(--sf-text-secondary);
  word-break: break-word;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  padding: 11px 14px;
  border-bottom: 1px solid var(--sf-border-light);
  color: var(--sf-text-primary);
  font-size: var(--sf-font-sm);
  font-weight: 520;

  span:last-child {
    color: var(--sf-text-disabled);
    font-family: monospace;
    font-size: var(--sf-font-xs);
    font-weight: 400;
  }
}

pre {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  color: var(--sf-text-secondary);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: var(--sf-font-xs);
  line-height: 1.65;
}
</style>
