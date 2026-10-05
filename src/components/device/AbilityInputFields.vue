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
  <div class="ability-input-fields">
    <div v-if="fields.length" class="field-list">
      <article v-for="field in fields" :key="field.name">
        <header>
          <code>{{ field.name }}</code>
          <span>{{ field.type || 'any' }}</span>
          <b :class="{ optional: !field.required }">{{ field.required ? '必填' : '可选' }}</b>
        </header>
        <p>{{ field.description || 'Manifest 未提供参数说明' }}</p>
      </article>
    </div>
    <p v-else-if="declared" class="empty">
      此 Task 不需要业务参数；Robot ID 与调用 ID 由 Pilot 注入。
    </p>
    <p v-else class="empty warning">当前 Ability Manifest 尚未上报参数说明。</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ fields: { type: Array, default: null } })
const fields = computed(() => props.fields || [])
const declared = computed(() => Array.isArray(props.fields))
</script>

<style scoped lang="scss">
.field-list {
  display: grid;
  gap: 7px;
  margin-top: 8px;
}
article {
  padding: 9px 10px;
  border: 1px solid var(--sf-border-light);
  border-radius: 7px;
  background: var(--sf-bg-tertiary);
}
article header {
  display: flex;
  align-items: center;
  gap: 8px;
}
article code {
  color: var(--sf-accent);
  font-size: var(--sf-font-sm);
}
article span {
  color: var(--sf-text-secondary);
  font-family: ui-monospace, monospace;
  font-size: var(--sf-font-xs);
}
article b {
  margin-left: auto;
  color: var(--sf-danger);
  font-size: var(--sf-font-xs);
}
article b.optional {
  color: var(--sf-text-disabled);
}
article p,
.empty {
  margin: 5px 0 0;
  color: var(--sf-text-secondary);
  font-size: var(--sf-font-xs);
  line-height: 1.55;
}
.empty.warning {
  color: var(--sf-warning);
}
</style>
