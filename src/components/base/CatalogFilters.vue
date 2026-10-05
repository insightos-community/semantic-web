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
  <div class="catalog-filters">
    <el-input
      :model-value="search"
      :prefix-icon="Search"
      clearable
      placeholder="搜索名称、描述或标签"
      aria-label="搜索目录"
      @update:model-value="$emit('update:search', $event)"
    />
    <el-select
      :model-value="category"
      class="category-select"
      aria-label="选择分类"
      @update:model-value="$emit('update:category', $event)"
    >
      <el-option label="全部分类" value="all" />
      <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
    </el-select>
    <div v-if="tags.length" class="tag-filters" aria-label="标签筛选">
      <button
        v-for="tag in tags"
        :key="tag"
        type="button"
        class="tag-filter"
        :class="{ 'is-active': selectedTags.includes(tag) }"
        :aria-pressed="selectedTags.includes(tag)"
        @click="toggleTag(tag)"
      >
        {{ tag }}
      </button>
      <button
        v-if="selectedTags.length"
        type="button"
        class="clear-tags"
        @click="$emit('update:selectedTags', [])"
      >
        清除
      </button>
    </div>
  </div>
</template>

<script setup>
import { Search } from '@element-plus/icons-vue'

const props = defineProps({
  search: { type: String, default: '' },
  categories: { type: Array, default: () => [] },
  category: { type: String, default: 'all' },
  tags: { type: Array, default: () => [] },
  selectedTags: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:search', 'update:category', 'update:selectedTags'])

function toggleTag(tag) {
  const next = props.selectedTags.includes(tag)
    ? props.selectedTags.filter((item) => item !== tag)
    : [...props.selectedTags, tag]
  emit('update:selectedTags', next)
}
</script>

<style scoped lang="scss">
.catalog-filters {
  display: grid;
  gap: 8px;
}

.category-select {
  width: 100%;
}

.tag-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 78px;
  overflow-y: auto;
}

.tag-filter,
.clear-tags {
  padding: 3px 7px;
  border: 1px solid var(--sf-border-light);
  border-radius: 999px;
  background: var(--sf-bg-primary);
  color: var(--sf-text-secondary);
  font-size: 10px;
  line-height: 1.4;
  cursor: pointer;

  &:hover {
    border-color: var(--sf-brand);
    color: var(--sf-text-primary);
  }
}

.tag-filter.is-active {
  border-color: var(--sf-brand);
  background: color-mix(in srgb, var(--sf-brand) 14%, transparent);
  color: var(--sf-brand);
}

.clear-tags {
  border-style: dashed;
  color: var(--sf-text-disabled);
}
</style>
