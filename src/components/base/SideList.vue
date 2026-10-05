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
  <aside class="sf-side-list" :class="{ 'is-collapsed': collapsed }" :style="asideStyle">
    <template v-if="!collapsed">
      <header class="side-list-header">
        <span class="side-list-title"><slot name="title" /></span>
        <span class="side-list-actions"><slot name="actions" /></span>
        <el-tooltip content="收起列表" effect="dark" :show-after="500" placement="bottom">
          <button
            v-if="collapsible"
            type="button"
            class="side-list-toggle"
            aria-label="收起列表"
            @click="collapsed = true"
          >
            <el-icon><Fold /></el-icon>
          </button>
        </el-tooltip>
      </header>
      <div v-if="$slots.search" class="side-list-search">
        <slot name="search" />
      </div>
      <div class="side-list-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="side-list-footer">
        <slot name="footer" />
      </footer>
    </template>
    <el-tooltip v-else content="展开列表" effect="dark" :show-after="500" placement="right">
      <button
        type="button"
        class="side-list-toggle expand-rail"
        aria-label="展开列表"
        @click="collapsed = false"
      >
        <el-icon><Expand /></el-icon>
      </button>
    </el-tooltip>
  </aside>
</template>

<script setup>
// 页内二级侧栏统一容器（AppShell v2）：标题 slot + 主操作 slot + 搜索 slot
// + 列表 slot + 底部 slot。宽度默认取 --sf-sidelist-width（240px），可用
// width prop 覆盖；collapsible 时标题行给出收起按钮，收起后变 32px 竖轨。
// 折叠状态为组件内本地状态（不持久化；如需记忆布局偏好后续接入 ui store）。
// 纯容器不感知业务：列表数据、选中态、请求逻辑都在使用方。
import { computed, ref } from 'vue'
import { Expand, Fold } from '@element-plus/icons-vue'

const props = defineProps({
  width: { type: String, default: '' }, // 例 '280px'；缺省用 --sf-sidelist-width
  collapsible: { type: Boolean, default: true }
})

const collapsed = ref(false)

const asideStyle = computed(() => {
  if (collapsed.value) return {}
  return { width: props.width || 'var(--sf-sidelist-width)' }
})
</script>

<style scoped lang="scss">
.sf-side-list {
  display: flex;
  flex-direction: column;
  flex: none;
  background: var(--sf-bg-secondary);
  border: 1px solid var(--sf-border-light);
  border-radius: var(--sf-radius-l);
  box-shadow: var(--sf-shadow-sm);
  overflow: hidden;

  &.is-collapsed {
    width: 32px;
    align-items: center;
    padding-top: var(--sf-space-2);
  }
}

.side-list-header {
  display: flex;
  align-items: center;
  gap: var(--sf-space-2);
  height: 58px;
  padding: 0 var(--sf-space-3);
  border-bottom: 1px solid var(--sf-border-light);
}

.side-list-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sf-font-md);
  font-weight: 520;
  color: var(--sf-text-primary);
}

.side-list-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--sf-space-1);
  flex: none;
}

.side-list-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  padding: 0;
  border: none;
  border-radius: var(--sf-radius-s);
  background: transparent;
  color: var(--sf-text-secondary);
  cursor: pointer;

  &:hover {
    background: var(--sf-bg-hover);
    color: var(--sf-text-primary);
  }
}

.side-list-search {
  padding: var(--sf-space-2) var(--sf-space-3);
  border-bottom: 1px solid var(--sf-border-light);
}

.side-list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.side-list-footer {
  padding: var(--sf-space-2) var(--sf-space-3);
  border-top: 1px solid var(--sf-border-light);
}
</style>
