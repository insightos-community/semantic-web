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
  <div class="empty-state">
    <el-icon v-if="icon" class="empty-icon"><component :is="icon" /></el-icon>
    <p class="empty-text">{{ description }}</p>
    <div v-if="$slots.default" class="empty-action">
      <slot />
    </div>
  </div>
</template>

<script setup>
// 通用空态占位：图标 + 描述 + 可选操作区（slot）。
defineProps({
  description: { type: String, default: '暂无数据' },
  icon: { type: [Object, Function], default: null }
})
</script>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sf-space-2);
  padding: var(--sf-space-8) var(--sf-space-4);
  color: var(--sf-text-disabled);
}

.empty-icon {
  font-size: 32px;
}

.empty-text {
  margin: 0;
  font-size: var(--sf-font-sm);
}

.empty-action {
  margin-top: var(--sf-space-2);
}
</style>
