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
  <div v-if="!hasValue" class="property-value is-empty">—</div>
  <div v-else-if="!expanded" class="property-value is-short" :title="text">{{ text || '—' }}</div>
  <details v-else class="property-value is-long">
    <summary>
      <span>{{ summary }}</span>
      <button type="button" @click.stop="copy">复制</button>
    </summary>
    <pre>{{ display.text }}</pre>
    <small v-if="display.truncated">正文超过 32KB，已截断</small>
  </details>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  displayPropertyText,
  formatPropertyText,
  shouldExpandProperty,
  summarizeProperty
} from '@/studio/inspectorProperty'

const props = defineProps({
  value: { type: [String, Number, Boolean, Object, Array], default: null }
})

const hasValue = computed(
  () => props.value !== null && props.value !== undefined && props.value !== ''
)
const expanded = computed(() => shouldExpandProperty(props.value))
const text = computed(() => formatPropertyText(props.value))
const summary = computed(() => summarizeProperty(props.value))
const display = computed(() => displayPropertyText(props.value))

async function copy() {
  try {
    await navigator.clipboard.writeText(display.value.text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.warning('复制失败')
  }
}
</script>

<style scoped lang="scss">
.property-value {
  min-width: 0;
  color: var(--sf-text-primary);
  text-align: right;
}

.is-empty,
.is-short {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-long {
  text-align: left;

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    color: var(--sf-text-secondary);
    font-size: 11px;

    button {
      flex: none;
      border: 0;
      background: transparent;
      color: var(--sf-brand);
      cursor: pointer;
    }
  }

  pre {
    max-height: 220px;
    margin: 6px 0 0;
    overflow: auto;
    padding: 8px;
    border-radius: 6px;
    background: var(--sf-bg-secondary);
    color: var(--sf-text-primary);
    font-size: 10px;
    line-height: 1.45;
    text-align: left;
    white-space: pre-wrap;
    word-break: break-word;
  }

  small {
    display: block;
    margin-top: 4px;
    color: var(--sf-text-disabled);
    font-size: 10px;
  }
}
</style>
