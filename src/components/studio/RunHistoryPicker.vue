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
  <el-popover v-model:visible="open" trigger="click" placement="top-start" :width="420">
    <template #reference>
      <button type="button" class="history-trigger" aria-label="查看运行历史">
        <span>运行记录</span><ArrowDown />
      </button>
    </template>
    <section class="run-history-picker">
      <el-input v-model="search" placeholder="搜索运行记录" clearable aria-label="搜索运行记录" />
      <nav aria-label="运行记录分类">
        <button
          v-for="tab in categories"
          :key="tab.id"
          type="button"
          :class="{ active: category === tab.id }"
          @click="category = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
      <div class="history-list">
        <button
          v-for="item in filtered"
          :key="`${item.kind}:${item.id}`"
          type="button"
          :title="item.label"
          @click="choose(item)"
        >
          <span>{{ item.title || item.label }}</span
          ><small
            ><DeviceStatus :status="item.status" /> ·
            {{
              item.time ? new Date(item.time).toLocaleString('zh-CN', { hour12: false }) : ''
            }}</small
          >
        </button>
        <p v-if="!filtered.length">暂无匹配记录</p>
      </div>
    </section>
  </el-popover>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import DeviceStatus from '@/components/device/DeviceStatus.vue'
const props = defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['select'])
const open = ref(false)
const search = ref('')
const category = ref('workflow')
const categories = [
  { id: 'workflow', label: '流程' },
  { id: 'execution', label: '独立执行' },
  { id: 'run', label: '对话请求' }
]
const filtered = computed(() =>
  props.items
    .filter(
      (item) =>
        item.kind === category.value &&
        `${item.label} ${item.id}`.toLowerCase().includes(search.value.toLowerCase())
    )
    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
)
function choose(item) {
  emit('select', `${item.kind}:${item.id}`)
  open.value = false
}
</script>
<style scoped>
.history-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--sf-border-light);
  border-radius: 6px;
  background: var(--sf-bg-secondary);
  color: var(--sf-text-primary);
  padding: 6px 10px;
  cursor: pointer;
}
svg {
  width: 12px;
  height: 12px;
}
.run-history-picker nav {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
nav button {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-secondary);
  padding: 6px 10px;
  cursor: pointer;
}
nav button.active {
  color: var(--sf-brand);
  background: var(--sf-bg-hover);
}
.history-list {
  max-height: 320px;
  overflow: auto;
}
.history-list button {
  display: grid;
  gap: 5px;
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sf-text-primary);
  padding: 10px;
  text-align: left;
  cursor: pointer;
}
.history-list button:hover {
  background: var(--sf-bg-hover);
}
.history-list span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
small,
p {
  color: var(--sf-text-secondary);
  font-size: 11px;
}
</style>
