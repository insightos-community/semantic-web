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
  <div
    class="studio-tab"
    :class="{ 'is-preview': tabMode === 'preview' }"
    @dblclick.stop="keepOpen"
    @auxclick="closeWithMiddleButton"
  >
    <el-tooltip
      v-if="tabMode === 'pinned'"
      content="已置顶"
      effect="dark"
      :show-after="500"
      placement="bottom"
    >
      <span class="pin-marker">◆</span>
    </el-tooltip>
    <el-tooltip
      v-if="dirty"
      content="有未保存修改"
      effect="dark"
      :show-after="500"
      placement="bottom"
    >
      <i class="dirty-dot" />
    </el-tooltip>
    <el-tooltip :content="title" effect="dark" :show-after="500" placement="bottom">
      <span>{{ title }}</span>
    </el-tooltip>
    <el-tooltip v-if="!permanent" content="关闭" effect="dark" :show-after="500" placement="bottom">
      <button type="button" aria-label="关闭标签" @click.stop="close">
        <Close />
      </button>
    </el-tooltip>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { panelGuardRevision, panelIsDirty, requestPanelClose } from '@/studio/panelLifecycle'

const props = defineProps({ params: { type: Object, default: () => ({}) } })
const context = computed(() => props.params || {})
const tabMode = ref(context.value.params?.tabMode || 'kept')
let parameterListener = null
watch(
  () => context.value.api,
  (api) => {
    parameterListener?.dispose()
    tabMode.value = context.value.params?.tabMode || 'kept'
    parameterListener = api?.onDidParametersChange((params) => {
      tabMode.value = params.tabMode || 'kept'
    })
  },
  { immediate: true }
)
onBeforeUnmount(() => parameterListener?.dispose())
const panelId = computed(() => context.value.api?.id || '')
const permanent = computed(() => context.value.params?.panelType === 'scene-workspace')
const title = computed(
  () => context.value.api?.title || context.value.params?.panelType || 'Editor'
)
const dirty = computed(() => {
  // revision 用来让 Map 中的 guard 变化进入 Vue 响应链。
  void panelGuardRevision.value
  return panelIsDirty(panelId.value)
})

function close() {
  if (permanent.value) return
  if (panelId.value) void requestPanelClose([panelId.value], { reason: 'tab-close' })
}

function keepOpen() {
  if (tabMode.value === 'preview') context.value.api?.updateParameters({ tabMode: 'kept' })
}

function closeWithMiddleButton(event) {
  if (event.button !== 1) return
  event.preventDefault()
  close()
}
</script>

<style scoped>
.studio-tab {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  min-width: 0;
  gap: 6px;
  padding-left: 8px;
}
.studio-tab > span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.studio-tab.is-preview > span {
  font-style: italic;
}
.studio-tab > .pin-marker {
  flex: none;
  font-size: 9px;
  color: var(--sf-brand);
}
.studio-tab button {
  display: grid;
  width: 24px;
  height: 24px;
  padding: 5px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  opacity: 0.7;
  place-items: center;
}
.studio-tab button:hover {
  background: var(--sf-bg-hover);
  opacity: 1;
}
.dirty-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: var(--sf-warning);
}
</style>
