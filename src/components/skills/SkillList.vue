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
  <div class="skill-list">
    <div v-for="group in groups" :key="group.category" class="skill-group">
      <div class="group-title">{{ group.category }}</div>
      <el-tooltip
        v-for="sk in group.items"
        :key="sk.catalog_id || sk.name"
        :content="sk.description"
        :disabled="!sk.description"
        effect="dark"
        :show-after="500"
        placement="right"
      >
        <button
          type="button"
          class="skill-item"
          :class="{ 'is-active': (sk.catalog_id || sk.name) === (activeId || activeName) }"
          @click="$emit('select', sk.catalog_id || sk.name)"
        >
          <span class="skill-name">
            {{ sk.name }}
            <em v-if="sk.skill_kind === 'robot'">Robot</em>
          </span>
          <span class="skill-desc">{{ sk.description }}</span>
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
// 技能清单（左栏）：category 分组 + 名称/描述摘要 + 选中高亮。
// 只渲染不发请求；分组数据来自 skills store 的 groups getter（与单测同源）。
defineProps({
  groups: { type: Array, default: () => [] }, // [{category, items:[{name, description}]}]
  activeName: { type: String, default: '' },
  activeId: { type: String, default: '' }
})

defineEmits(['select'])
</script>

<style scoped lang="scss">
.skill-list {
  display: flex;
  flex-direction: column;
  padding: var(--sf-space-2);
  overflow-y: auto;
}

.group-title {
  padding: var(--sf-space-2) var(--sf-space-3) var(--sf-space-1);
  font-size: var(--sf-font-xs);
  color: var(--sf-text-disabled);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.skill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--sf-space-2) var(--sf-space-3);
  border: none;
  border-radius: var(--sf-radius-md);
  background: transparent;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--sf-bg-tertiary);
  }

  &.is-active {
    background: var(--sf-bg-tertiary);

    .skill-name {
      color: var(--sf-brand);
    }
  }
}

.skill-name {
  font-size: var(--sf-font-md);
  font-weight: 520;
  color: var(--sf-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-name em {
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 8px;
  background: var(--sf-brand-soft);
  color: var(--sf-brand);
  font-size: 8px;
  font-style: normal;
}

.skill-desc {
  font-size: var(--sf-font-sm);
  color: var(--sf-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
