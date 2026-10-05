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
  <aside class="tools-sidebar" data-testid="studio-tools-sidebar">
    <header class="tool-tabs" role="tablist" aria-label="右侧组件" @keydown="navigateTabs">
      <button
        v-if="hasConversation"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'conversation'"
        @click="activate('conversation')"
      >
        对话
      </button>
      <button
        v-if="layout.inspectorAvailable"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'inspector'"
        @click="activate('inspector')"
      >
        Inspector
      </button>
      <span class="spacer" />
      <button
        class="icon-button"
        type="button"
        aria-label="关闭当前组件"
        title="关闭当前组件"
        @click="closeActive"
      >
        <Close />
      </button>
    </header>
    <div
      v-show="activeTab === 'conversation'"
      :ref="(node) => $emit('conversation-host', node)"
      class="tool-content"
      role="tabpanel"
      aria-label="对话组件"
    />
    <div
      v-if="layout.inspectorAvailable"
      v-show="activeTab === 'inspector'"
      class="tool-content"
      role="tabpanel"
      aria-label="Inspector 组件"
    >
      <StudioContextInspector embedded @close="layout.closeInspector()" />
    </div>
  </aside>
</template>
<script setup>
import { computed } from 'vue'
import { Close } from '@element-plus/icons-vue'
import StudioContextInspector from './StudioContextInspector.vue'
import { useLayoutStore } from '@/stores/layout'
const emit = defineEmits(['conversation-host', 'close-conversation'])
const layout = useLayoutStore()
const hasConversation = computed(
  () => layout.shell.conversationOpen && layout.shell.conversationLocation === 'sidebar'
)
const activeTab = computed(() =>
  (layout.shell.secondaryTab === 'inspector' && layout.inspectorAvailable) || !hasConversation.value
    ? 'inspector'
    : 'conversation'
)
function activate(tab) {
  layout.updateShell({ secondaryTab: tab })
}
function closeActive() {
  if (activeTab.value === 'inspector') layout.closeInspector()
  else emit('close-conversation')
}
function navigateTabs(event) {
  if (
    !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
    event.target.getAttribute('role') !== 'tab'
  )
    return
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')]
  const next =
    (tabs.indexOf(event.target) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  event.preventDefault()
  tabs[next]?.focus()
  tabs[next]?.click()
}
</script>
<style scoped lang="scss">
.tools-sidebar {
  display: flex;
  flex: none;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--sf-border-light);
  background: var(--sf-bg-primary);
}
.tool-tabs {
  display: flex;
  align-items: center;
  height: 38px;
  flex: none;
  padding: 0 8px;
  gap: 4px;
  border-bottom: 1px solid var(--sf-border-light);
}
.tool-tabs button {
  height: 28px;
  border: 0;
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 13px;
  color: var(--sf-text-secondary);
  background: transparent;
  cursor: pointer;
}
.tool-tabs button[aria-selected='true'] {
  background: var(--sf-bg-tertiary);
  color: var(--sf-text-primary);
  font-weight: 600;
}
.tool-tabs button:hover {
  background: var(--sf-bg-hover);
}
.tool-tabs .icon-button {
  width: 28px;
  padding: 5px;
}
.tool-tabs .spacer {
  flex: 1;
}
.tool-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
