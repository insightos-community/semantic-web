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
  <article class="task-waiting-card">
    <i class="sf-status-dot" data-status="warning" />
    <el-tooltip :content="view.reason" effect="dark" :show-after="500" placement="top">
      <div class="waiting-copy">
        <b>{{ view.title }}</b>
        <span>{{ view.activity }}</span>
      </div>
    </el-tooltip>
    <div v-if="view.actions?.length" class="waiting-actions">
      <el-button
        v-for="action in view.actions"
        :key="action.id"
        :type="action.kind === 'default' ? undefined : action.kind"
        :plain="action.kind === 'danger'"
        size="small"
        @click="$emit('action', action.id)"
      >
        {{ action.label }}
      </el-button>
    </div>
  </article>
</template>

<script setup>
defineProps({ view: { type: Object, required: true } })
defineEmits(['action'])
</script>

<style scoped lang="scss">
.task-waiting-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--sf-warning) 35%, var(--sf-border-light));
  border-radius: 8px;
  background: color-mix(in srgb, var(--sf-warning) 7%, var(--sf-bg-secondary));
}

.waiting-copy {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  b {
    flex: none;
    color: var(--sf-text-primary);
    font-size: 12px;
  }

  span {
    overflow: hidden;
    color: var(--sf-text-disabled);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.waiting-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

@media (max-width: 900px) {
  .task-waiting-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .waiting-actions {
    grid-column: 2;
    justify-content: flex-start;
  }
}
</style>
