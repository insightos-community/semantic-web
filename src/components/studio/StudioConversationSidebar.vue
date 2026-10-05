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
  <section
    ref="host"
    class="conversation-sidebar"
    :class="{ 'is-wide': maximized || location === 'editor' }"
    data-testid="studio-conversation-sidebar"
    @keydown="onKeydown"
  >
    <header class="conversation-heading">
      <h2 v-if="historyVisible">对话历史</h2>
      <button
        v-if="!historyVisible"
        type="button"
        title="返回对话列表"
        aria-label="返回对话列表"
        @click="showHistory"
      >
        <Back />
      </button>
      <button
        v-if="!historyVisible"
        class="conversation-title"
        type="button"
        :title="conversation.current?.title || '新对话'"
        aria-label="选择对话"
        data-conversation-history-trigger
        :aria-expanded="pickerVisible"
        aria-haspopup="dialog"
        @click="openPicker"
      >
        <span>{{ conversation.current?.title || '新对话' }}</span
        ><ArrowDown />
      </button>
      <span v-if="!historyVisible && conversation.currentArchived" class="conversation-state"
        >已归档</span
      >
      <span v-else-if="!historyVisible && activeRun" class="conversation-state">{{
        runLabel
      }}</span>
      <button
        type="button"
        title="选择历史对话"
        aria-label="选择历史对话"
        data-conversation-history-trigger
        :aria-expanded="pickerVisible"
        aria-haspopup="dialog"
        @click="openPicker"
      >
        <Clock />
      </button>
      <button
        type="button"
        title="新建对话"
        aria-label="新建对话"
        :disabled="creating"
        @click="create"
      >
        <EditPen />
      </button>
      <button
        type="button"
        :title="maximized ? '恢复对话窗口' : '最大化对话'"
        :aria-label="maximized ? '恢复对话窗口' : '最大化对话'"
        @click="$emit('maximize')"
      >
        <FullScreen />
      </button>
      <el-dropdown trigger="click" @command="$emit('move', $event)">
        <button type="button" title="移动对话" aria-label="移动对话"><MoreFilled /></button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :command="location === 'sidebar' ? 'editor' : 'sidebar'">
              {{ location === 'sidebar' ? '移至中央工作区' : '移至右侧工具区' }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button
        v-if="location === 'editor' || maximized"
        type="button"
        title="关闭对话"
        aria-label="关闭对话"
        @click="$emit('close')"
      >
        <Close />
      </button>
    </header>

    <ConversationHistoryList
      v-show="historyVisible"
      ref="history"
      :selecting="selecting"
      :selection-error="error"
      @select="select"
    />
    <!-- 组件 Tab 切换和历史列表都不卸载消息与输入区。 -->
    <ConversationPanel v-show="!historyVisible" ref="content" embedded />

    <!-- 历史选择只覆盖当前对话内容，不遮挡场景、导航和其他编辑器。 -->
    <section
      v-if="pickerVisible"
      ref="pickerHost"
      role="dialog"
      aria-label="选择对话"
      class="conversation-history-picker"
    >
      <ConversationHistoryList
        ref="picker"
        :selecting="selecting"
        :selection-error="error"
        @select="select"
      />
      <footer>
        <el-button text @click="closePicker(true)">关闭</el-button>
        <el-button text @click="showHistory">查看全部历史</el-button>
      </footer>
    </section>
  </section>
</template>
<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import {
  ArrowDown,
  Back,
  Clock,
  Close,
  EditPen,
  FullScreen,
  MoreFilled
} from '@element-plus/icons-vue'
import ConversationPanel from './panels/ConversationPanel.vue'
import ConversationHistoryList from './ConversationHistoryList.vue'
import { useConversationStore } from '@/stores/conversation'
import { useChatStore } from '@/stores/chat'
import { useRunsStore } from '@/stores/runs'
import { useUiStore } from '@/stores/ui'

defineProps({ maximized: Boolean, location: { type: String, default: 'sidebar' } })
defineEmits(['close', 'maximize', 'move'])
const conversation = useConversationStore()
const host = ref(null)
const content = ref(null)
const history = ref(null)
let historyScrollTop = 0
function captureViewport() {
  content.value?.captureViewport()
  const list = history.value?.$el.querySelector('.history-list')
  if (list?.clientHeight) historyScrollTop = list.scrollTop
}
function restoreViewport() {
  content.value?.restoreViewport()
  const list = history.value?.$el.querySelector('.history-list')
  if (list?.clientHeight) list.scrollTop = historyScrollTop
}
defineExpose({ captureViewport, restoreViewport })
const chat = useChatStore()
const runs = useRunsStore()
const ui = useUiStore()
const historyVisible = ref(!conversation.currentId)
const pickerVisible = ref(false)
const picker = ref(null)
const pickerHost = ref(null)
let pickerTrigger = null
const creating = ref(false)
const selecting = ref(false)
const error = ref('')
const activeRun = computed(() => runs.activeForConversation(conversation.currentId))
const runLabel = computed(
  () =>
    ({ queued: '排队中', running: '回复中', waiting_input: '等待输入', cancelling: '停止中' })[
      activeRun.value?.status
    ] || ''
)
function openPicker(event) {
  if (pickerVisible.value) {
    closePicker(true)
    return
  }
  pickerTrigger = event.currentTarget
  error.value = ''
  pickerVisible.value = true
  nextTick(() => picker.value?.focus())
}
function closePicker(restoreFocus = false) {
  pickerVisible.value = false
  if (restoreFocus) nextTick(() => pickerTrigger?.focus())
}
function dismissPickerOnOutsideClick(event) {
  if (
    pickerVisible.value &&
    !pickerHost.value?.contains(event.target) &&
    !event.target.closest('[data-conversation-history-trigger]')
  )
    closePicker()
}
function onKeydown(event) {
  if (event.key !== 'Escape' || !pickerVisible.value) return
  event.preventDefault()
  event.stopPropagation()
  closePicker(true)
}
function showHistory() {
  captureViewport()
  pickerVisible.value = false
  historyVisible.value = true
  error.value = ''
  nextTick(restoreViewport)
}
async function select(id) {
  if (selecting.value) return
  const reopeningCurrent = id === conversation.currentId
  captureViewport()
  selecting.value = true
  error.value = ''
  try {
    if (
      (id === conversation.currentId && chat.currentBucket?.loaded) ||
      (await conversation.select(id))
    ) {
      pickerVisible.value = false
      historyVisible.value = false
      if (reopeningCurrent) nextTick(restoreViewport)
    }
  } catch (err) {
    error.value = err.message || '加载对话失败'
  } finally {
    selecting.value = false
  }
}
async function create() {
  if (creating.value) return
  creating.value = true
  try {
    if (await conversation.create()) {
      pickerVisible.value = false
      historyVisible.value = false
    }
  } catch (err) {
    ui.notify({ type: 'error', message: err.message || '创建对话失败' })
  } finally {
    creating.value = false
  }
}
watch(
  () => conversation.currentId,
  (id, previous) => {
    // 资源栏主动选择会话时打开正文；历史列表刷新不改变当前查看位置。
    if (id && id !== previous && !conversation.loading && !selecting.value)
      historyVisible.value = false
  }
)
onMounted(() => document.addEventListener('pointerdown', dismissPickerOnOutsideClick))
onBeforeUnmount(() => document.removeEventListener('pointerdown', dismissPickerOnOutsideClick))
</script>
<style scoped lang="scss">
.conversation-sidebar {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  color: var(--sf-text-primary);
  background: var(--sf-bg-primary);
  font-size: 14px;
}
.conversation-heading {
  display: flex;
  flex: none;
  align-items: center;
  gap: 3px;
  height: 44px;
  padding: 0 10px;
  border-bottom: 1px solid var(--sf-border-light);
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  button {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 5px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--sf-text-secondary);
    cursor: pointer;
    &:hover {
      background: var(--sf-bg-hover);
      color: var(--sf-text-primary);
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
    svg {
      width: 18px;
      height: 18px;
      flex: none;
    }
  }
  .conversation-title {
    flex: 1;
    min-width: 0;
    justify-content: flex-start;
    gap: 5px;
    width: auto;
    font-size: 14px;
    font-weight: 600;
    color: var(--sf-text-primary);
    span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    svg {
      width: 12px;
      height: 12px;
    }
  }
}
.conversation-state {
  font-size: 12px;
  color: var(--sf-text-secondary);
  white-space: nowrap;
}
.conversation-panel {
  flex: 1;
  min-height: 0;
}
.is-wide :deep(.message-stream-inner) {
  max-width: 960px;
}
.is-wide :deep(.prompt-input) {
  width: calc(100% - 24px);
  max-width: 932px;
  align-self: center;
}
.conversation-history-picker {
  position: absolute;
  z-index: 5;
  top: 50px;
  left: 8px;
  right: 8px;
  max-height: min(440px, calc(100% - 62px));
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--sf-border-light);
  border-radius: 12px;
  background: var(--sf-bg-primary);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  footer {
    display: flex;
    flex: none;
    justify-content: space-between;
    padding: 6px 8px;
    border-top: 1px solid var(--sf-border-light);
  }
}
</style>
